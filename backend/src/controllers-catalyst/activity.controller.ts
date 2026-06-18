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
  { table: 'News', entity: 'News', createdByField: 'createdById', label: (r) => String(r.title ?? r.newsTitle ?? '') },
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

/** Scan every source table and emit CREATED + (latest) EDITED events. */
async function buildActivity(): Promise<ActivityEvent[]> {
  const perTable = await Promise.all(
    SOURCES.map(async (src) => {
      let rows: CatalystRow[] = [];
      try {
        rows = await listAllRows(src.table);
      } catch {
        return [] as ActivityEvent[]; // table may not exist yet — skip
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
  events.sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0;
    const tb = b.at ? new Date(b.at).getTime() : 0;
    return tb - ta; // newest first
  });
  return events;
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
    const events = await cacheSWR('activity_log', 60, 300, buildActivity);

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

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, rows, 'Activity log retrieved', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get activity log', error);
  }
}
