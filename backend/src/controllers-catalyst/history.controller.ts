/**
 * History controller — Catalyst-backed.
 *
 * Reads from Catalyst Data Store (Grievance / TrainRequest / TourProgram)
 * via ZCQL when on, listAllRows fallback otherwise. User joins use the
 * cached AppUser table.
 */
import { Response } from 'express';
import {
  listAllRows,
  executeZCQL,
  zcqlEscapeValue,
  zcqlSafeLimit,
  toCatalystDate,
  CatalystRow,
} from '../lib/catalyst-client';
import { useZCQL } from '../config/feature-flags';
import { cacheSWR } from '../lib/cache';
import { getCachedTableList } from '../lib/catalyst-user-lookup';
import { sendSuccess, sendServerError } from '../utils/response';
import { parsePagination, calculatePaginationMeta } from '../utils/pagination';
import type { AuthenticatedRequest } from '../types';

const GRIEVANCE_TABLE = 'Grievance';
const TRAIN_TABLE = 'TrainRequest';
const TOUR_TABLE = 'TourProgram';

type HistoryItem = {
  id: string;
  type: 'GRIEVANCE' | 'TRAIN_REQUEST' | 'TOUR_PROGRAM';
  action: string;
  title: string;
  description: string;
  actionBy: { id: string; name: string; email: string } | null;
  actionAt: string | Date;
  status: string;
  details: Record<string, any>;
};

function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return Boolean(v);
}

/** Resolve user metadata from a Map<id, user> (built once per request). */
function userFor(
  map: Map<string, { id: string; name: string; email: string }>,
  id: unknown
): { id: string; name: string; email: string } | null {
  if (!id) return null;
  return map.get(String(id)) ?? null;
}

/** Build a single users-by-id lookup from the cached AppUser table. */
async function buildUserMap(
  ids: Iterable<string>
): Promise<Map<string, { id: string; name: string; email: string }>> {
  const map = new Map<string, { id: string; name: string; email: string }>();
  const wanted = new Set(Array.from(ids).filter(Boolean).map(String));
  if (wanted.size === 0) return map;
  try {
    const users = await getCachedTableList('AppUser');
    for (const u of users) {
      const rowId = String(u.ROWID);
      const legacyId = u.legacyId ? String(u.legacyId) : null;
      const shape = { id: rowId, name: String(u.name), email: String(u.email) };
      if (wanted.has(rowId)) map.set(rowId, shape);
      if (legacyId && wanted.has(legacyId)) {
        map.set(legacyId, { ...shape, id: legacyId });
      }
    }
  } catch {
    /* ignore — return whatever's resolved so far */
  }
  return map;
}

/**
 * GET /api/history
 *
 * Returns a unified, paginated history of admin actions across grievances,
 * train requests, and tour programs.
 */
export async function getAdminHistory(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );
    const { type, action, startDate, endDate, search } = req.query as Record<string, string>;
    // Free-text search (matches title, description, status, and the detail
    // fields — including a grievance's reference number e.g. GRV-2026-0001).
    // When present we must scan the FULL dataset, so the ZCQL fast-path (which
    // only fetches enough rows for the current page) is bypassed below.
    const searchTerm = (search ?? '').trim().toLowerCase();
    const wantsSearch = searchTerm.length > 0;

    const grievanceActions = ['VERIFIED', 'RESOLVED', 'REJECTED', 'IN_PROGRESS'];
    const trainActions = ['APPROVED', 'REJECTED', 'REGRET', 'ACCEPTED', 'RESOLVED'];
    const tourActions = ['ACCEPTED', 'REGRET'];

    const startCat = startDate ? toCatalystDate(startDate) : null;
    const endCat = endDate ? toCatalystDate(endDate) : null;

    const shouldFetchGrievances =
      (!type || type === 'GRIEVANCE') &&
      (!action || grievanceActions.includes(action));
    const shouldFetchTrainRequests =
      (!type || type === 'TRAIN_REQUEST') &&
      (!action || trainActions.includes(action));
    const shouldFetchTourPrograms =
      (!type || type === 'TOUR_PROGRAM') &&
      (!action || tourActions.includes(action));

    const items: HistoryItem[] = [];

    // Fetch all three tables concurrently so total wait ≈ slowest call,
    // not sum of all three (was sequential awaits).
    const [grievances, trainRequests, tours] = await Promise.all([
      (async (): Promise<CatalystRow[]> => {
        if (!shouldFetchGrievances) return [];
        if (useZCQL() && !wantsSearch) {
          const conditions: string[] = [];
          if (action === 'RESOLVED') conditions.push(`status = 'RESOLVED'`);
          else if (action === 'REJECTED') conditions.push(`status = 'REJECTED'`);
          else if (action === 'VERIFIED') conditions.push(`isVerified = true`);
          else if (action === 'IN_PROGRESS') conditions.push(`status = 'IN_PROGRESS'`);
          // No `else` -- when no action filter is set, return ALL grievances
          // (including OPEN ones) so the listing matches the summary card count.

          if (startCat) conditions.push(`MODIFIEDTIME >= '${startCat}'`);
          if (endCat) conditions.push(`MODIFIEDTIME <= '${endCat}'`);

          const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
          const safeLimit = zcqlSafeLimit(limit + skip + 50);
          return executeZCQL<CatalystRow>(
            `SELECT * FROM ${GRIEVANCE_TABLE}${where} ORDER BY MODIFIEDTIME DESC LIMIT ${safeLimit}`
          );
        }
        const all = await listAllRows(GRIEVANCE_TABLE);
        let filtered = all.filter((g) => {
          if (action === 'RESOLVED') return g.status === 'RESOLVED';
          if (action === 'REJECTED') return g.status === 'REJECTED';
          if (action === 'VERIFIED') return parseBool(g.isVerified);
          if (action === 'IN_PROGRESS') return g.status === 'IN_PROGRESS';
          // No filter -> include everything (matches the ZCQL branch above).
          return true;
        });
        if (startCat || endCat) {
          filtered = filtered.filter((g) => {
            const t = g.MODIFIEDTIME ? new Date(g.MODIFIEDTIME).getTime() : 0;
            if (startCat && t < new Date(startCat).getTime()) return false;
            if (endCat && t > new Date(endCat).getTime()) return false;
            return true;
          });
        }
        return filtered;
      })(),

      (async (): Promise<CatalystRow[]> => {
        if (!shouldFetchTrainRequests) return [];
        if (useZCQL() && !wantsSearch) {
          const conditions: string[] = [];
          if (action === 'APPROVED' || action === 'ACCEPTED') {
            conditions.push(`status = 'APPROVED'`);
          } else if (action === 'REJECTED' || action === 'REGRET') {
            conditions.push(`status = 'REJECTED'`);
          } else if (action === 'RESOLVED') {
            conditions.push(`status = 'RESOLVED'`);
          } else {
            conditions.push(
              `(status = 'APPROVED' OR status = 'REJECTED' OR status = 'RESOLVED')`
            );
          }
          if (startCat) conditions.push(`MODIFIEDTIME >= '${startCat}'`);
          if (endCat) conditions.push(`MODIFIEDTIME <= '${endCat}'`);

          const where = ` WHERE ${conditions.join(' AND ')}`;
          const safeLimit = zcqlSafeLimit(limit + skip + 50);
          return executeZCQL<CatalystRow>(
            `SELECT * FROM ${TRAIN_TABLE}${where} ORDER BY MODIFIEDTIME DESC LIMIT ${safeLimit}`
          );
        }
        const all = await listAllRows(TRAIN_TABLE);
        const decided = new Set(['APPROVED', 'REJECTED', 'RESOLVED']);
        let filtered = all.filter((t) => {
          if (action === 'APPROVED' || action === 'ACCEPTED') return t.status === 'APPROVED';
          if (action === 'REJECTED' || action === 'REGRET') return t.status === 'REJECTED';
          if (action === 'RESOLVED') return t.status === 'RESOLVED';
          return decided.has(String(t.status));
        });
        if (startCat || endCat) {
          filtered = filtered.filter((t) => {
            const ts = t.MODIFIEDTIME ? new Date(t.MODIFIEDTIME).getTime() : 0;
            if (startCat && ts < new Date(startCat).getTime()) return false;
            if (endCat && ts > new Date(endCat).getTime()) return false;
            return true;
          });
        }
        return filtered;
      })(),

      (async (): Promise<CatalystRow[]> => {
        if (!shouldFetchTourPrograms) return [];
        if (useZCQL() && !wantsSearch) {
          const conditions: string[] = [];
          if (action === 'ACCEPTED') conditions.push(`decision = 'ACCEPTED'`);
          else if (action === 'REGRET') conditions.push(`decision = 'REGRET'`);
          else conditions.push(`(decision = 'ACCEPTED' OR decision = 'REGRET')`);
          if (startCat) conditions.push(`MODIFIEDTIME >= '${startCat}'`);
          if (endCat) conditions.push(`MODIFIEDTIME <= '${endCat}'`);

          const where = ` WHERE ${conditions.join(' AND ')}`;
          const safeLimit = zcqlSafeLimit(limit + skip + 50);
          return executeZCQL<CatalystRow>(
            `SELECT * FROM ${TOUR_TABLE}${where} ORDER BY MODIFIEDTIME DESC LIMIT ${safeLimit}`
          );
        }
        const all = await listAllRows(TOUR_TABLE);
        let filtered = all.filter((tp) => {
          if (action === 'ACCEPTED') return tp.decision === 'ACCEPTED';
          if (action === 'REGRET') return tp.decision === 'REGRET';
          return tp.decision === 'ACCEPTED' || tp.decision === 'REGRET';
        });
        if (startCat || endCat) {
          filtered = filtered.filter((tp) => {
            const ts = tp.MODIFIEDTIME ? new Date(tp.MODIFIEDTIME).getTime() : 0;
            if (startCat && ts < new Date(startCat).getTime()) return false;
            if (endCat && ts > new Date(endCat).getTime()) return false;
            return true;
          });
        }
        return filtered;
      })(),
    ]);

    // ── User join: collect all ids referenced, fetch once from cache ──────
    const userIds = new Set<string>();
    for (const g of grievances) {
      if (g.verifiedById) userIds.add(String(g.verifiedById));
      if (g.createdById) userIds.add(String(g.createdById));
    }
    for (const t of trainRequests) {
      if (t.approvedById) userIds.add(String(t.approvedById));
      if (t.createdById) userIds.add(String(t.createdById));
    }
    for (const tp of tours) {
      if (tp.createdById) userIds.add(String(tp.createdById));
    }
    const userMap = await buildUserMap(userIds);

    // ── Shape into unified HistoryItem ────────────────────────────────────
    for (const g of grievances) {
      let actionLabel = 'Verified';
      if (g.status === 'RESOLVED') actionLabel = 'Resolved';
      else if (g.status === 'REJECTED') actionLabel = 'Rejected';
      else if (g.status === 'IN_PROGRESS') actionLabel = 'In Progress';
      else if (parseBool(g.isVerified)) actionLabel = 'Verified';

      const actionAt = g.verifiedAt || g.MODIFIEDTIME || g.CREATEDTIME;
      const refNo = g.grievanceNumber
        ? String(g.grievanceNumber)
        : `GRV-${String(g.ROWID)}`;

      items.push({
        id: String(g.ROWID),
        type: 'GRIEVANCE',
        action: actionLabel,
        // Reference number in the title so Action History search finds it by id.
        title: `Grievance ${refNo} - ${String(g.grievanceType ?? '').replace(/_/g, ' ')}`,
        description: `${g.petitionerName ?? ''} • ${g.constituency ?? ''}`,
        actionBy: userFor(userMap, g.verifiedById),
        actionAt,
        status: String(g.status ?? ''),
        details: {
          referenceNo: refNo,
          petitionerName: g.petitionerName,
          mobileNumber: g.mobileNumber,
          constituency: g.constituency,
          grievanceType: g.grievanceType,
          monetaryValue: g.monetaryValue,
          createdBy: userFor(userMap, g.createdById),
          verifiedAt: g.verifiedAt,
          updatedAt: g.MODIFIEDTIME,
        },
      });
    }

    for (const t of trainRequests) {
      let label = 'Accepted';
      if (t.status === 'REJECTED') label = 'Regret';
      else if (t.status === 'RESOLVED') label = 'Resolved';

      items.push({
        id: String(t.ROWID),
        type: 'TRAIN_REQUEST',
        action: label,
        title: `Train EQ - ${t.trainName || t.trainNumber || 'N/A'}`,
        description: `${t.passengerName ?? ''} • PNR: ${t.pnrNumber ?? ''}`,
        actionBy: userFor(userMap, t.approvedById),
        actionAt: t.approvedAt || t.MODIFIEDTIME,
        status: String(t.status ?? ''),
        details: {
          passengerName: t.passengerName,
          pnrNumber: t.pnrNumber,
          contactNumber: t.contactNumber,
          trainName: t.trainName,
          trainNumber: t.trainNumber,
          dateOfJourney: t.dateOfJourney,
          fromStation: t.fromStation,
          toStation: t.toStation,
          journeyClass: t.journeyClass,
          rejectionReason: t.rejectionReason,
          createdBy: userFor(userMap, t.createdById),
        },
      });
    }

    for (const tp of tours) {
      items.push({
        id: String(tp.ROWID),
        type: 'TOUR_PROGRAM',
        action: tp.decision === 'ACCEPTED' ? 'Accepted' : 'Regret',
        title: `Tour - ${tp.eventName ?? ''}`,
        description: `${tp.organizer ?? ''} • ${tp.venue ?? ''}`,
        actionBy: null,
        actionAt: tp.MODIFIEDTIME ?? tp.CREATEDTIME ?? new Date().toISOString(),
        status: String(tp.decision ?? ''),
        details: {
          eventName: tp.eventName,
          organizer: tp.organizer,
          organizerPhone: tp.organizerPhone,
          organizerEmail: tp.organizerEmail,
          dateTime: tp.dateTime,
          venue: tp.venue,
          venueLink: tp.venueLink,
          decisionNote: tp.decisionNote,
          createdBy: userFor(userMap, tp.createdById),
        },
      });
    }

    items.sort(
      (a, b) => new Date(b.actionAt).getTime() - new Date(a.actionAt).getTime()
    );

    // Apply free-text search across the shaped items (so the grievance
    // reference number, petitioner, PNR, organiser, etc. are all searchable)
    // BEFORE paginating, so a match on any page surfaces correctly.
    const matched = wantsSearch
      ? items.filter((it) => {
          const haystack = [
            it.title,
            it.description,
            it.action,
            it.status,
            JSON.stringify(it.details ?? {}),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(searchTerm);
        })
      : items;

    const total = matched.length;
    const paginated = matched.slice(skip, skip + limit);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, paginated, 'History retrieved successfully', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get history', error);
  }
}

/**
 * GET /api/history/stats — dashboard counts.
 *
 * Catalyst ZCQL COUNT() / GROUP BY are unreliable across environments, so
 * we can't push the aggregation down to the DB. The fallback is fetching
 * every row and counting in JS — which is O(n) per request.
 *
 * Mitigation: stale-while-revalidate cache. After the first hit pays the
 * cost, every subsequent hit within 10 min gets cached data instantly; a
 * background refresh kicks in after 2 min so the data stays fresh without
 * making anyone wait.
 */
export async function getHistoryStats(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const stats = await cacheSWR('history_stats', 120, 600, async () => {
      const [grievances, trainRequests, tours] = await Promise.all([
        listAllRows(GRIEVANCE_TABLE),
        listAllRows(TRAIN_TABLE),
        listAllRows(TOUR_TABLE),
      ]);

      let resolvedG = 0,
        rejectedG = 0,
        verifiedG = 0,
        inProgressG = 0;
      for (const g of grievances) {
        if (g.status === 'RESOLVED') resolvedG++;
        if (g.status === 'REJECTED') rejectedG++;
        if (parseBool(g.isVerified)) verifiedG++;
        if (g.status === 'IN_PROGRESS') inProgressG++;
      }

      let approvedT = 0,
        rejectedT = 0,
        resolvedT = 0;
      for (const t of trainRequests) {
        if (t.status === 'APPROVED') approvedT++;
        if (t.status === 'REJECTED') rejectedT++;
        if (t.status === 'RESOLVED') resolvedT++;
      }

      let acceptedTours = 0,
        regretTours = 0;
      for (const tp of tours) {
        if (tp.decision === 'ACCEPTED') acceptedTours++;
        if (tp.decision === 'REGRET') regretTours++;
      }

      return {
        grievances: {
          resolved: resolvedG,
          rejected: rejectedG,
          verified: verifiedG,
          inProgress: inProgressG,
          total: resolvedG + rejectedG + verifiedG + inProgressG,
        },
        trainRequests: {
          approved: approvedT,
          rejected: rejectedT,
          resolved: resolvedT,
          total: approvedT + rejectedT + resolvedT,
        },
        tourPrograms: {
          accepted: acceptedTours,
          regret: regretTours,
          total: acceptedTours + regretTours,
        },
        totalActions:
          resolvedG +
          rejectedG +
          approvedT +
          rejectedT +
          resolvedT +
          acceptedTours +
          regretTours,
      };
    });

    sendSuccess(res, stats, 'History stats retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get history stats', error);
  }
}
