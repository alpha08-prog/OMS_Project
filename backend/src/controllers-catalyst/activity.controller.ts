/**
 * Activity Log controller — a global "who did what, when" feed.
 *
 * Derived at READ TIME from the existing CREATEDTIME / MODIFIEDTIME +
 * createdById / lastEditedById fields across all module tables (no dedicated
 * audit table). Because it reads the live rows, it shows the CREATED event and
 * the LATEST edit per record — not a full per-edit history. Admin-only.
 */
import { Response } from 'express';
import { listAllRows, CatalystRow } from '../lib/catalyst-client';
import { lookupUsers } from '../lib/catalyst-user-lookup';
import { sendSuccess, sendServerError } from '../utils/response';
import { parsePagination, calculatePaginationMeta } from '../utils/pagination';
import { cacheSWR } from '../lib/cache';
import type { AuthenticatedRequest } from '../types';

type Source = {
  table: string;
  entity: string;
  label: (r: CatalystRow) => string;
  createdByField: string;
};

// Each module table + how to label a row + which column holds the "creator".
const SOURCES: Source[] = [
  {
    table: 'Grievance',
    entity: 'Grievance',
    createdByField: 'createdById',
    label: (r) =>
      `${r.petitionerName ?? ''}${r.grievanceType ? ` (${r.grievanceType})` : ''}`.trim(),
  },
  { table: 'Visitor', entity: 'Visitor', createdByField: 'createdById', label: (r) => String(r.name ?? '') },
  {
    table: 'TrainRequest',
    entity: 'Train Request',
    createdByField: 'createdById',
    label: (r) => `PNR ${r.pnrNumber ?? ''}${r.passengerName ? ` — ${r.passengerName}` : ''}`.trim(),
  },
  { table: 'TourProgram', entity: 'Tour Program', createdByField: 'createdById', label: (r) => String(r.eventName ?? '') },
  // The News column is `headline` (see news.controller: insert/search/update all
  // use it). `title`/`newsTitle` exist on no News row, so every news event fell
  // through to the `#<rowid>` fallback and the feed showed a bare row id where
  // the headline belongs. Keep the old names as a trailing fallback in case an
  // older row carries one.
  {
    table: 'News',
    entity: 'News',
    createdByField: 'createdById',
    label: (r) => String(r.headline ?? r.title ?? r.newsTitle ?? ''),
  },
  { table: 'Birthday', entity: 'Birthday', createdByField: 'createdById', label: (r) => String(r.name ?? '') },
  { table: 'Meeting', entity: 'Meeting', createdByField: 'createdById', label: (r) => String(r.title ?? '') },
  { table: 'Task', entity: 'Task', createdByField: 'assignedById', label: (r) => String(r.title ?? '') },
];

type ActivityEvent = {
  entity: string;
  entityId: string;
  label: string;
  action: 'CREATED' | 'EDITED';
  at: string | null;
  byId: string | null;
};

type ActivityFeed = {
  events: ActivityEvent[];
  /** Tables that errored — the feed is missing their events. */
  unavailable: string[];
};

/** Scan every source table and emit CREATED + (latest) EDITED events. */
async function buildActivity(): Promise<ActivityFeed> {
  const unavailable: string[] = [];
  const perTable = await Promise.all(
    SOURCES.map(async (src) => {
      let rows: CatalystRow[] = [];
      try {
        rows = await listAllRows(src.table);
      } catch (err) {
        // A table that was never provisioned is expected (a module can ship
        // before its Catalyst table exists) and stays quiet — that was the
        // original intent of this catch. Anything else (auth, timeout, 5xx)
        // means a whole module just vanished from an AUDIT feed with no trace,
        // so say so loudly and record it: the response then admits it is
        // partial instead of presenting a hole as history.
        const status = (err as { statusCode?: number } | null)?.statusCode;
        const msg = err instanceof Error ? err.message : String(err);
        const tableMissing =
          status === 404 ||
          /Unkown Table|No such Table|table .*(not found|does not exist)/i.test(msg);
        if (!tableMissing) {
          unavailable.push(src.entity);
          console.warn(`[activity] ${src.table} could not be read — feed is partial:`, msg);
        }
        return [] as ActivityEvent[];
      }
      const out: ActivityEvent[] = [];
      for (const r of rows) {
        const id = String(r.ROWID);
        const label = src.label(r) || `#${id}`;
        out.push({
          entity: src.entity,
          entityId: id,
          label,
          action: 'CREATED',
          at: r.CREATEDTIME ? String(r.CREATEDTIME) : null,
          byId: r[src.createdByField] ? String(r[src.createdByField]) : null,
        });
        // An EDITED event only when the row was actually modified after creation.
        const editedAt = r.lastEditedAt
          ? String(r.lastEditedAt)
          : r.MODIFIEDTIME && r.MODIFIEDTIME !== r.CREATEDTIME
            ? String(r.MODIFIEDTIME)
            : null;
        if (editedAt) {
          out.push({
            entity: src.entity,
            entityId: id,
            label,
            action: 'EDITED',
            at: editedAt,
            byId: r.lastEditedById ? String(r.lastEditedById) : null,
          });
        }
      }
      return out;
    })
  );

  const events = perTable.flat();
  const stamp = (v: string | null): number => {
    if (!v) return 0;
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  events.sort((a, b) => {
    const ta = stamp(a.at);
    const tb = stamp(b.at);
    if (tb !== ta) return tb - ta; // newest first
    // Ties need a TOTAL order, for the same reason a ZCQL sort needs a ROWID
    // tiebreaker: the page is a slice of this array, and rows created in the
    // same second (or carrying no timestamp at all) would otherwise sit in
    // whatever order the parallel table reads happened to return. When the SWR
    // cache refreshes between page 1 and page 2, that order changes and rows
    // duplicate across pages while others are never shown.
    if (a.entity !== b.entity) return a.entity < b.entity ? -1 : 1;
    // Catalyst ROWIDs exceed Number's safe integer range, so compare as strings
    // — they are fixed-width digits, where lexical order IS numeric order.
    if (a.entityId !== b.entityId) return a.entityId < b.entityId ? 1 : -1;
    if (a.action !== b.action) return a.action === 'EDITED' ? -1 : 1;
    return 0;
  });
  return { events, unavailable };
}

/**
 * GET /api/activity — global who-did-what-when feed.
 * Query: page, limit, entity (filter), action (CREATED|EDITED), search.
 */
export async function getActivityLog(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );
    const { entity, action, search } = req.query as Record<string, string>;

    // SWR: fresh 60s, served-stale up to 5 min while a refresh runs in the
    // background — a full multi-table scan is too heavy to run per request.
    const { events, unavailable } = await cacheSWR('activity_log', 60, 300, buildActivity);

    let filtered = events;
    if (entity) filtered = filtered.filter((e) => e.entity.toLowerCase() === entity.toLowerCase());
    if (action) filtered = filtered.filter((e) => e.action === action.toUpperCase());
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (e) => e.label.toLowerCase().includes(q) || e.entity.toLowerCase().includes(q)
      );
    }

    const total = filtered.length;
    const paged = filtered.slice(skip, skip + limit);

    // Resolve actor names in one batch for the current page.
    const ids = new Set<string>();
    for (const e of paged) if (e.byId) ids.add(e.byId);
    let users = new Map<string, { id: string; name: string; email: string }>();
    try {
      users = await lookupUsers(ids);
    } catch {
      /* leave actor names null */
    }

    const rows = paged.map((e) => ({
      entity: e.entity,
      entityId: e.entityId,
      label: e.label,
      action: e.action,
      at: e.at,
      byId: e.byId,
      by: e.byId ? users.get(e.byId)?.name ?? null : null,
    }));

    // `total` here is a REAL count, not the `skip + rows.length + hasMore`
    // fabrication: the feed is materialised in full (and cached) before it is
    // filtered, so `filtered.length` is exactly how many rows this endpoint can
    // serve for this query. countRows() has nothing to count against — the feed
    // is a merge of eight tables where one row yields up to two events and every
    // filter is applied in JS. What was missing is the rest of an honest meta:
    // how many rows are in THIS page, and whether another page exists.
    sendSuccess(
      res,
      rows,
      unavailable.length > 0
        ? `Activity log retrieved (partial — could not read: ${unavailable.join(', ')})`
        : 'Activity log retrieved',
      200,
      {
        ...calculatePaginationMeta(total, page, limit),
        totalKnown: true,
        count: rows.length,
        hasMore: skip + rows.length < total,
      }
    );
  } catch (error) {
    sendServerError(res, 'Failed to get activity log', error);
  }
}
