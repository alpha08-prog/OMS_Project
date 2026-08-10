/**
 * History controller — Catalyst-backed.
 *
 * Reads from Catalyst Data Store (Grievance / TrainRequest / TourProgram)
 * via ZCQL when on, listAllRows fallback otherwise. User joins use the
 * cached AppUser table.
 *
 * Paging on the ZCQL path is a K-WAY MERGE (see mergedHistoryWindow): each of
 * the three sources carries its own keyset cursor and is refilled only when it
 * drains, so a page at any depth is exact and costs only (skip + limit) rows.
 * It supersedes the old fixed-window approach, which fetched
 * min(limit+skip+50, 299) rows from EACH table and sliced the merge — correct
 * only while that window covered the whole prefix, and silently incomplete
 * past roughly page 20.
 *
 * The merge orders by (MODIFIEDTIME, ROWID), NOT by the displayed `actionAt`.
 * actionAt is `verifiedAt || MODIFIEDTIME`, and verifiedAt/approvedAt are
 * written by this app while MODIFIEDTIME comes from Catalyst in the project
 * timezone — measured 5h30m apart on real rows. Ordering by actionAt therefore
 * interleaved two timezones and misplaced verified entries by 5.5 hours; it is
 * also unqueryable (nullable, no COALESCE in ZCQL), so it could never have been
 * a pagination key.
 */
import { Response } from 'express';
import {
  listAllRows,
  executeZCQL,
  // zcqlSafeLimit is deliberately NOT imported: it clamps silently, which is
  // how deep pages here under-fetched without anyone seeing an error.
  assertZcqlLimit,
  countRows,
  dateRangeClauses,
  ZCQL_MAX_LIMIT,
  CatalystRow,
} from '../lib/catalyst-client';
import {
  keysetPredicate,
  keysetOrderBy,
  type ListCursor,
} from '../lib/keyset';
import { useZCQL } from '../config/feature-flags';
import { cacheSWR } from '../lib/cache';
import { getCachedTableList } from '../lib/catalyst-user-lookup';
import { sendSuccess, sendServerError } from '../utils/response';
// calculatePaginationMeta is gone: it takes `total` as a REQUIRED argument,
// which is what pushed this controller into measuring the fetched pool and
// calling it a total. `total` is optional in the meta now, so "unknown" is
// representable and the lie is not.
import { parsePagination } from '../utils/pagination';
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
  /**
   * The key the ZCQL merge paginates on (MODIFIEDTIME). Kept internal — it is
   * stripped before the response — so the scan path can sort by the SAME key
   * the merge does. Sorting the two paths differently made them disagree about
   * which rows land on a page boundary.
   */
  _sortAt?: string;
};

function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return Boolean(v);
}

function whereSql(clauses: string[]): string {
  return clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
}

/**
 * The MODIFIEDTIME date filter, in both forms this controller needs, from ONE
 * source of truth.
 *
 * Two things were wrong with the old `toCatalystDate(endDate)` bound. It is a
 * MIDNIGHT timestamp, and it was applied with `<=`, so every row that happened
 * ON the end date was excluded — "what happened today" returned nothing. And it
 * was hand-applied in six places (three ZCQL branches + three listAllRows
 * fallbacks), so fixing one would have left the others disagreeing.
 *
 * dateRangeClauses gives the correct HALF-OPEN upper bound (`< next-day
 * midnight`), which is also immune to CREATEDTIME/MODIFIEDTIME carrying
 * milliseconds after a colon. The JS predicate is derived from the very
 * literals those clauses contain, so the fast path and the fallback cannot
 * drift apart when USE_ZCQL eventually flips.
 */
function historyDateFilter(
  startDate?: string,
  endDate?: string
): { clauses: string[]; active: boolean; matches: (value: unknown) => boolean } {
  const clauses = dateRangeClauses('MODIFIEDTIME', startDate, endDate);

  let startMs: number | null = null;
  let endMs: number | null = null; // EXCLUSIVE
  for (const clause of clauses) {
    const literal = clause.match(/'([^']+)'/)?.[1];
    if (!literal) continue;
    const ms = new Date(literal).getTime();
    if (Number.isNaN(ms)) continue;
    if (clause.includes('>=')) startMs = ms;
    else endMs = ms;
  }

  return {
    clauses,
    active: clauses.length > 0,
    matches(value: unknown): boolean {
      // Missing timestamps keep their previous treatment (epoch), so this stays
      // a bound fix and not a quiet change to which rows survive.
      const t = value ? new Date(String(value)).getTime() : 0;
      if (startMs !== null && t < startMs) return false;
      if (endMs !== null && t >= endMs) return false;
      return true;
    },
  };
}

/**
 * Sort keys for the three-way merge.
 *
 * Sorting on the timestamp alone is not a total order: grievances, train
 * requests and tours are three separate streams whose MODIFIEDTIMEs tie
 * routinely (bulk actions land in the same second). With ties broken
 * arbitrarily, an entry could sit on page 2 of one request and page 3 of the
 * next — appearing twice to the user, or not at all. Type then id gives every
 * request the same order.
 */
const TYPE_RANK: Record<HistoryItem['type'], number> = {
  GRIEVANCE: 0,
  TRAIN_REQUEST: 1,
  TOUR_PROGRAM: 2,
};

function actionAtMs(value: string | Date): number {
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
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
type HistorySourceKey = HistoryItem['type'];

interface HistorySource {
  key: HistorySourceKey;
  table: string;
  clauses: string[];
}

/** Descending compare of two Catalyst ROWIDs (17-digit numeric strings). */
function compareRowIdDesc(a: unknown, b: unknown): number {
  const x = String(a ?? '');
  const y = String(b ?? '');
  if (x.length !== y.length) return y.length - x.length;
  return x < y ? 1 : x > y ? -1 : 0;
}

/**
 * K-WAY MERGE across the history sources, returning EXACTLY the rows in
 * [skip, skip+want) of the combined newest-first stream.
 *
 * Replaces the previous approach, which fetched a fixed window from each of the
 * three tables, merged them in JS and then sliced. That is only correct while
 * the window covers the whole prefix: past roughly page 20 the merged pool
 * simply did not contain the rows the page needed, so entries became
 * unreachable — and because each source was independently capped, WHICH rows
 * went missing depended on how the three streams happened to interleave.
 *
 * Here each source keeps its own keyset cursor and is refilled only when its
 * buffer drains, so the merge can walk arbitrarily deep while reading no more
 * than (skip + want) rows in total. The sort key is (MODIFIEDTIME, ROWID) —
 * chosen deliberately:
 *
 *   - It is a real column, so it can be both ORDER BY'd and seeked on. The
 *     displayed `actionAt` (verifiedAt || MODIFIEDTIME) CANNOT be, because
 *     verifiedAt is nullable and ZCQL has no COALESCE — you cannot paginate a
 *     stream ordered by a key you are unable to query.
 *   - It is written in ONE timezone. `verifiedAt`/`approvedAt` are written by
 *     this app (UTC on a UTC host) while MODIFIEDTIME is the Catalyst project
 *     timezone (IST) — measured 5h30m apart on real rows. Ordering by
 *     `actionAt` therefore interleaved UTC and IST timestamps and misplaced
 *     every verified row by 5.5 hours. Ordering by MODIFIEDTIME fixes that too.
 *   - ROWID breaks ties, so the total order is stable across requests.
 */
async function mergedHistoryWindow(
  sources: HistorySource[],
  skip: number,
  want: number
): Promise<Array<{ key: HistorySourceKey; row: CatalystRow }>> {
  const BATCH = ZCQL_MAX_LIMIT;
  // Backstop only: (skip + want) is bounded by the page contract, so a real
  // request drains far fewer batches than this.
  const MAX_BATCHES_PER_SOURCE = 60;

  const state = sources.map((src) => ({
    src,
    buf: [] as CatalystRow[],
    cursor: null as ListCursor | null,
    done: false,
    batches: 0,
  }));

  const refill = async (st: (typeof state)[number]): Promise<void> => {
    if (st.done || st.buf.length > 0) return;
    if (st.batches >= MAX_BATCHES_PER_SOURCE) {
      st.done = true;
      console.warn(
        `[history] source ${st.src.key} hit its batch ceiling; the feed may be truncated.`
      );
      return;
    }
    const clauses = [...st.src.clauses];
    if (st.cursor) clauses.push(keysetPredicate('MODIFIEDTIME', st.cursor, 'newest'));
    const rows = await executeZCQL<CatalystRow>(
      `SELECT * FROM ${st.src.table}${whereSql(clauses)} ` +
        `${keysetOrderBy('MODIFIEDTIME', 'newest')} LIMIT ${assertZcqlLimit(BATCH)}`
    );
    st.batches += 1;
    st.buf = rows;
    if (rows.length < BATCH) st.done = true;
    if (rows.length > 0) {
      const last = rows[rows.length - 1];
      st.cursor = { t: String(last.MODIFIEDTIME), r: String(last.ROWID) };
    }
  };

  const out: Array<{ key: HistorySourceKey; row: CatalystRow }> = [];
  let skipped = 0;

  while (out.length < want) {
    // Refills are no-ops for sources that still have buffered rows.
    await Promise.all(state.map(refill));

    // Take whichever head is newest across all sources.
    let best = -1;
    for (let i = 0; i < state.length; i++) {
      if (state[i].buf.length === 0) continue;
      if (best === -1) {
        best = i;
        continue;
      }
      const a = state[i].buf[0];
      const b = state[best].buf[0];
      const at = String(a.MODIFIEDTIME ?? '');
      const bt = String(b.MODIFIEDTIME ?? '');
      let cmp = at < bt ? 1 : at > bt ? -1 : 0; // DESC
      if (cmp === 0) cmp = compareRowIdDesc(a.ROWID, b.ROWID);
      if (cmp < 0) best = i;
    }
    if (best === -1) break; // every source exhausted

    const row = state[best].buf.shift() as CatalystRow;
    if (skipped < skip) skipped += 1;
    else out.push({ key: state[best].src.key, row });
  }

  return out;
}

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

    // ONE date filter for all six consumers below (three ZCQL branches, three
    // listAllRows fallbacks) — see historyDateFilter for why the old midnight
    // `<=` bound made the end date disappear.
    const dateFilter = historyDateFilter(startDate, endDate);

    const shouldFetchGrievances =
      (!type || type === 'GRIEVANCE') &&
      (!action || grievanceActions.includes(action));
    const shouldFetchTrainRequests =
      (!type || type === 'TRAIN_REQUEST') &&
      (!action || trainActions.includes(action));
    const shouldFetchTourPrograms =
      (!type || type === 'TOUR_PROGRAM') &&
      (!action || tourActions.includes(action));

    // WHERE clauses are built out here, once, so the page query and the COUNT
    // query below can only ever derive from the SAME predicate. A total that
    // disagrees with the rows on screen is its own bug.
    const grievanceClauses: string[] = [];
    if (action === 'RESOLVED') grievanceClauses.push(`status = 'RESOLVED'`);
    else if (action === 'REJECTED') grievanceClauses.push(`status = 'REJECTED'`);
    // Quoted 'true' — the same form grievance.controller uses against this
    // column. An unquoted `true` here would have been a second, untested
    // spelling of the one predicate, and a wrong ZCQL literal returns zero rows
    // without erroring.
    else if (action === 'VERIFIED') grievanceClauses.push(`isVerified = 'true'`);
    else if (action === 'IN_PROGRESS') grievanceClauses.push(`status = 'IN_PROGRESS'`);
    // No `else` -- when no action filter is set, return ALL grievances
    // (including OPEN ones) so the listing matches the summary card count.
    grievanceClauses.push(...dateFilter.clauses);

    const trainClauses: string[] = [];
    if (action === 'APPROVED' || action === 'ACCEPTED') {
      trainClauses.push(`status = 'APPROVED'`);
    } else if (action === 'REJECTED' || action === 'REGRET') {
      trainClauses.push(`status = 'REJECTED'`);
    } else if (action === 'RESOLVED') {
      trainClauses.push(`status = 'RESOLVED'`);
    } else {
      trainClauses.push(
        `(status = 'APPROVED' OR status = 'REJECTED' OR status = 'RESOLVED')`
      );
    }
    trainClauses.push(...dateFilter.clauses);

    const tourClauses: string[] = [];
    if (action === 'ACCEPTED') tourClauses.push(`decision = 'ACCEPTED'`);
    else if (action === 'REGRET') tourClauses.push(`decision = 'REGRET'`);
    else tourClauses.push(`(decision = 'ACCEPTED' OR decision = 'REGRET')`);
    tourClauses.push(...dateFilter.clauses);

    // No fixed window any more: the ZCQL path uses a k-way merge with a keyset
    // cursor per source (mergedHistoryWindow), so page depth is unbounded and
    // reads only (skip + limit) rows. The old approach fetched
    // min(limit+skip+50, 299) from EACH table and sliced the merge, which meant
    // that past roughly page 20 the pool no longer contained the page's rows.

    // Real dataset total, kicked off HERE so it overlaps the page fetch.
    //
    // The old `total = matched.length` measured the pool we happened to fetch,
    // not the data: on the ZCQL fast path each source is capped at one window,
    // so the page count shrank and mutated as the user paged. Count in the
    // datastore instead, over the SAME predicates the page query uses.
    //
    // Only the ZCQL path needs this. The listAllRows fallback and the search
    // path both read every row, so there `matched.length` IS the whole dataset
    // — and free-text search can't be pushed down anyway (it matches shaped
    // fields like the GRV- reference), which is exactly why that path scans.
    const usedZcqlWindow = useZCQL() && !wantsSearch;
    const countPromise: Promise<number | null> = usedZcqlWindow
      ? cacheSWR(
          // The three shouldFetch flags MUST be in the key. `type` never appears
          // in any WHERE clause — it only decides which sources are summed — so
          // keying on the clauses alone makes type=GRIEVANCE and
          // type=TRAIN_REQUEST (and no type at all) collide on one cache entry
          // and serve each other's total.
          `history:count:${JSON.stringify([
            grievanceClauses,
            trainClauses,
            tourClauses,
            shouldFetchGrievances,
            shouldFetchTrainRequests,
            shouldFetchTourPrograms,
          ])}`,
          30,
          120,
          async (): Promise<number | null> => {
            const counts = await Promise.all([
              // A source we never queried contributes 0, not its whole table.
              shouldFetchGrievances
                ? countRows(GRIEVANCE_TABLE, whereSql(grievanceClauses))
                : 0,
              shouldFetchTrainRequests ? countRows(TRAIN_TABLE, whereSql(trainClauses)) : 0,
              shouldFetchTourPrograms ? countRows(TOUR_TABLE, whereSql(tourClauses)) : 0,
            ]);
            // One unavailable count makes the SUM short by a whole table, which
            // is worse than no number at all — report "unknown" instead.
            if (counts.some((c) => c === null)) return null;
            return (counts as number[]).reduce((a, b) => a + b, 0);
          }
        ).catch((err) => {
          // Degrade to "unknown total", but say so — a bare `() => null` here
          // would turn a broken predicate into a silently missing pager.
          console.warn('[history] total count failed; rendering without a total', err);
          return null;
        })
      : Promise.resolve(null);

    let items: HistoryItem[] = [];

    // On the ZCQL path the page is resolved by a k-way merge BEFORE shaping, so
    // only the rows that actually belong on this page are fetched and hydrated.
    // `mergedWindow` non-null also means the result is already correctly ordered
    // and pre-sliced — the global sort and slice below are skipped.
    let mergedWindow: Array<{ key: HistorySourceKey; row: CatalystRow }> | null = null;
    if (usedZcqlWindow) {
      const sources: HistorySource[] = [];
      if (shouldFetchGrievances)
        sources.push({ key: 'GRIEVANCE', table: GRIEVANCE_TABLE, clauses: grievanceClauses });
      if (shouldFetchTrainRequests)
        sources.push({ key: 'TRAIN_REQUEST', table: TRAIN_TABLE, clauses: trainClauses });
      if (shouldFetchTourPrograms)
        sources.push({ key: 'TOUR_PROGRAM', table: TOUR_TABLE, clauses: tourClauses });
      mergedWindow = await mergedHistoryWindow(sources, skip, limit);
    }

    // Fetch all three tables concurrently so total wait ≈ slowest call,
    // not sum of all three (was sequential awaits).
    const [grievances, trainRequests, tours] = mergedWindow
      ? [
          mergedWindow.filter((x) => x.key === 'GRIEVANCE').map((x) => x.row),
          mergedWindow.filter((x) => x.key === 'TRAIN_REQUEST').map((x) => x.row),
          mergedWindow.filter((x) => x.key === 'TOUR_PROGRAM').map((x) => x.row),
        ]
      : await Promise.all([
      (async (): Promise<CatalystRow[]> => {
        if (!shouldFetchGrievances) return [];
        const all = await listAllRows(GRIEVANCE_TABLE);
        let filtered = all.filter((g) => {
          if (action === 'RESOLVED') return g.status === 'RESOLVED';
          if (action === 'REJECTED') return g.status === 'REJECTED';
          if (action === 'VERIFIED') return parseBool(g.isVerified);
          if (action === 'IN_PROGRESS') return g.status === 'IN_PROGRESS';
          // No filter -> include everything (matches the ZCQL branch above).
          return true;
        });
        if (dateFilter.active) {
          filtered = filtered.filter((g) => dateFilter.matches(g.MODIFIEDTIME));
        }
        return filtered;
      })(),

      (async (): Promise<CatalystRow[]> => {
        if (!shouldFetchTrainRequests) return [];
        const all = await listAllRows(TRAIN_TABLE);
        const decided = new Set(['APPROVED', 'REJECTED', 'RESOLVED']);
        let filtered = all.filter((t) => {
          if (action === 'APPROVED' || action === 'ACCEPTED') return t.status === 'APPROVED';
          if (action === 'REJECTED' || action === 'REGRET') return t.status === 'REJECTED';
          if (action === 'RESOLVED') return t.status === 'RESOLVED';
          return decided.has(String(t.status));
        });
        if (dateFilter.active) {
          filtered = filtered.filter((t) => dateFilter.matches(t.MODIFIEDTIME));
        }
        return filtered;
      })(),

      (async (): Promise<CatalystRow[]> => {
        if (!shouldFetchTourPrograms) return [];
        const all = await listAllRows(TOUR_TABLE);
        let filtered = all.filter((tp) => {
          if (action === 'ACCEPTED') return tp.decision === 'ACCEPTED';
          if (action === 'REGRET') return tp.decision === 'REGRET';
          return tp.decision === 'ACCEPTED' || tp.decision === 'REGRET';
        });
        if (dateFilter.active) {
          filtered = filtered.filter((tp) => dateFilter.matches(tp.MODIFIEDTIME));
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
        _sortAt: String(g.MODIFIEDTIME ?? g.CREATEDTIME ?? ''),
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
        _sortAt: String(t.MODIFIEDTIME ?? t.CREATEDTIME ?? ''),
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
        _sortAt: String(tp.MODIFIEDTIME ?? tp.CREATEDTIME ?? ''),
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

    // Newest first, with a DETERMINISTIC tail. Timestamp alone left ties in
    // whatever order the three streams happened to interleave, so the same
    // entry could land on page 2 of one request and page 3 of the next —
    // shown twice, or skipped entirely.
    if (mergedWindow) {
      // The merge already produced the correct page in the correct order.
      // Re-sorting here by `actionAt` would UNDO it: actionAt is
      // verifiedAt/approvedAt when set, which is written in a different
      // timezone from MODIFIEDTIME (measured 5h30m apart), so it disagrees with
      // the key the pagination is built on. Reorder the shaped items back into
      // merge order instead.
      const byKey = new Map(items.map((i) => [`${i.type}:${i.id}`, i]));
      items = mergedWindow
        .map((x) => byKey.get(`${x.key}:${String(x.row.ROWID)}`))
        .filter((i): i is HistoryItem => Boolean(i));
    } else {
      // Sort on MODIFIEDTIME — the SAME key mergedHistoryWindow paginates on.
      // Sorting by actionAt here instead made the two execution paths return
      // different rows at page boundaries (verified: one row differed on
      // /history?type=GRIEVANCE), because actionAt is verifiedAt/approvedAt
      // when set and those are written in a different timezone.
      items.sort((a, b) => {
        const at = a._sortAt ?? '';
        const bt = b._sortAt ?? '';
        if (at !== bt) return at < bt ? 1 : -1; // DESC, lexicographic
        const byType = TYPE_RANK[a.type] - TYPE_RANK[b.type];
        if (byType !== 0) return byType;
        return b.id.localeCompare(a.id);
      });
    }

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

    // The merge path is already the exact page; only the scan path slices.
    const pageItems = mergedWindow ? matched : matched.slice(skip, skip + limit);
    // `_sortAt` is an internal pagination key, not part of the API contract.
    const paginated = pageItems.map(({ _sortAt, ...rest }) => rest);

    // `matched.length` is only a real total when the whole dataset was read.
    // On the ZCQL window path it is a pool measurement, so use the counted
    // total there — and when the count is unavailable, say so rather than
    // publishing a number the pager will believe.
    const countedTotal = await countPromise;
    const total = usedZcqlWindow ? countedTotal : matched.length;

    const meta = {
      page,
      limit,
      count: paginated.length,
      ...(total !== null
        ? { total, totalKnown: true, totalPages: Math.ceil(total / limit) }
        : { totalKnown: false }),
    };
    sendSuccess(res, paginated, 'History retrieved successfully', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get history', error);
  }
}

/**
 * GET /api/history/stats — dashboard counts.
 *
 * This reads every row and tallies in JS, which is O(n) per refresh. It used
 * to claim that was forced on it because "Catalyst ZCQL COUNT() / GROUP BY are
 * unreliable across environments" — that is measurably false. Plain ZCQL
 * COUNT(ROWID) and GROUP BY both work against this datastore (see countRows /
 * groupCount); it is the OLAP endpoint that is unavailable, which is most
 * likely what the original claim actually hit. So the full scan here is a
 * leftover, not a constraint: these tallies are `groupCount(table, column)`
 * calls waiting to happen.
 *
 * Until then, the cost is contained by a stale-while-revalidate cache: after
 * the first hit pays it, every hit within 10 min is instant, and a background
 * refresh after 2 min keeps it fresh without making anyone wait.
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
