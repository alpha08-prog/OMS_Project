/**
 * Notification controller — backed by Catalyst Data Store via custom REST client.
 *
 * In-app bell only (no email / SMS / push). Each row represents one
 * notification delivered to one recipient. Multi-recipient events fan out
 * into N rows server-side (e.g. critical news -> one row per user).
 *
 * Schema (must exist in the Catalyst console):
 *   recipientId   varchar  — search indexed
 *   type          varchar  — TASK_ASSIGNED | TOUR_DECIDED | NEWS_CRITICAL
 *   title         varchar
 *   body          text
 *   link          varchar  — deep link path (e.g. /staff/tasks)
 *   referenceId   varchar
 *   referenceType varchar
 *   isRead        boolean  — default false
 */
import { Response } from 'express';
import {
  insertRow,
  getRow,
  updateRow,
  executeZCQL,
  zcqlEscapeValue,
  zcqlAnyOf,
  // zcqlSafeLimit is deliberately absent: it clamps SILENTLY, which is the
  // failure mode this module was suffering from. Use assertZcqlLimit and
  // compute a legal page size instead.
  assertZcqlLimit,
  countRows,
  ZCQL_MAX_LIMIT,
  CatalystRow,
} from '../lib/catalyst-client';
import {
  decodeCursor,
  encodeCursor,
  keysetOrderBy,
  keysetPredicate,
} from '../lib/keyset';
import { parseKeysetQuery } from '../utils/keyset-query';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendServerError,
} from '../utils/response';
import { getUserIdAliases } from '../lib/catalyst-user-lookup';
import type { AuthenticatedRequest } from '../types';

const NOTIFICATION_TABLE = 'Notification';

/**
 * The bell dropdown sends no `limit` and has always been served 50 rows, so
 * that stays this module's default rather than inheriting the shared keyset
 * default of 25 — quietly shrinking the dropdown would be its own regression.
 * Callers that DO send `limit` get the shared parsing (1-100).
 */
const DEFAULT_NOTIFICATION_LIMIT = 50;

export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_RESOLVED'
  | 'TASK_FORWARDED'
  | 'GRIEVANCE_FORWARDED'
  | 'TOUR_DECIDED'
  | 'NEWS_CRITICAL'
  | 'GRIEVANCE_REJECTED'
  | 'TEMPLE_VISIT_LETTER_GENERATED';

function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return Boolean(v);
}

function shape(row: CatalystRow) {
  return {
    id: String(row.ROWID),
    recipientId: row.recipientId ?? null,
    type: row.type,
    title: row.title,
    body: row.body ?? '',
    link: row.link ?? null,
    referenceId: row.referenceId ?? null,
    referenceType: row.referenceType ?? null,
    isRead: parseBool(row.isRead),
    createdAt: row.CREATEDTIME ?? null,
  };
}

/**
 * Catalyst varchar columns max out at 255 chars. Title/link/referenceId/
 * referenceType are all varchar(255) on the Notification table, so trim
 * any user-derived strings (task titles, news headlines) before insert.
 */
const VARCHAR_MAX = 255;
function clip(v: string | null | undefined, max = VARCHAR_MAX): string | null {
  if (v == null) return null;
  const s = String(v);
  return s.length <= max ? s : s.slice(0, max);
}

/**
 * Server-side helper. Insert one notification row.
 * Errors are swallowed and logged so a notification failure never breaks
 * the parent operation (task creation, tour decision, etc.).
 */
export async function emitNotification(input: {
  recipientId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  referenceId?: string;
  referenceType?: string;
}): Promise<void> {
  try {
    await insertRow(NOTIFICATION_TABLE, {
      recipientId: clip(input.recipientId),
      type: clip(input.type),
      title: clip(input.title),
      // body is `text` (no varchar cap) but trim to a sane upper bound
      // so a notification doesn't carry a full essay.
      body: clip(input.body ?? '', 1000) ?? '',
      link: clip(input.link),
      referenceId: clip(input.referenceId),
      referenceType: clip(input.referenceType, 50),
      isRead: false,
    });
  } catch (err) {
    console.error('[notification] emit failed:', err);
  }
}

/** Fan-out helper: one notification per recipient. */
export async function emitNotifications(
  recipientIds: string[],
  base: Omit<Parameters<typeof emitNotification>[0], 'recipientId'>
): Promise<void> {
  await Promise.all(
    recipientIds.map((id) => emitNotification({ ...base, recipientId: id }))
  );
}

/**
 * GET /api/notifications?unread=true
 *
 * Cursor-paged (keyset). Query params:
 *   limit   1-100, default 50
 *   cursor  opaque; omit for the first page
 *   sort    'newest' (default) | 'oldest'
 *   unread  'true' to restrict to unread
 *
 * Previously this was a hard-coded 50-row query with no cursor, so notification
 * 51 was unreachable by any request — the row existed, counted toward the
 * badge, and could never be opened or read. The response `data` is still the
 * plain array the bell dropdown renders; paging lives entirely in `meta`.
 */
export async function listMyNotifications(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const unreadOnly = String(req.query?.unread ?? '').toLowerCase() === 'true';
    // Match all identity aliases (ROWID + legacy UUID) — notifications may
    // have been addressed to either form of the same user.
    const me = await getUserIdAliases(req.user.id);

    // Filter clauses are built separately from ORDER/LIMIT so the page query
    // and the COUNT derive from the SAME predicate — a total that disagrees
    // with the rows on screen is its own bug.
    const filterClauses: string[] = [zcqlAnyOf('recipientId', me)];
    if (unreadOnly) filterClauses.push(`isRead = 'false'`);
    const filterWhere = ` WHERE ${filterClauses.join(' AND ')}`;

    const { limit: parsedLimit, cursor: cursorRaw, sort } = parseKeysetQuery(req.query);
    // Fall back to this module's 50 whenever `limit` is absent OR unusable
    // (`?limit=` / `?limit=abc`). Testing for `undefined` alone let those forms
    // through to parseKeysetQuery's shared default of 25, silently shrinking
    // the dropdown — the exact regression DEFAULT_NOTIFICATION_LIMIT exists to
    // prevent.
    const rawLimit = String(req.query?.limit ?? '').trim();
    const limit = /^\d+$/.test(rawLimit) ? parsedLimit : DEFAULT_NOTIFICATION_LIMIT;
    const cursor = decodeCursor(cursorRaw);

    // Condition budget: getUserIdAliases returns at most 2 aliases (2) + the
    // unread flag (1) + the keyset seek predicate (3) = 6, comfortably under
    // the hard ZCQL ceiling of 10.
    const pageClauses = [...filterClauses];
    if (cursor) pageClauses.push(keysetPredicate('CREATEDTIME', cursor, sort));

    const [fetched, total] = await Promise.all([
      // keysetOrderBy carries the ROWID tiebreaker. Without it, notifications
      // written in the same second tie and rows duplicate/vanish across a page
      // boundary — and fan-out writes produce same-second ties by design.
      executeZCQL<CatalystRow>(
        `SELECT * FROM ${NOTIFICATION_TABLE} WHERE ${pageClauses.join(' AND ')} ` +
          `${keysetOrderBy('CREATEDTIME', sort)} LIMIT ${assertZcqlLimit(limit + 1)}`
      ),
      // Only page 1 pays for the count; later pages reuse what the client has.
      // Deliberately NOT cached: the bell re-polls this every 30s, and a total
      // that outlives the rows it describes is the kind of lie this pass exists
      // to remove.
      cursor ? Promise.resolve(null) : countRows(NOTIFICATION_TABLE, filterWhere),
    ]);

    const hasMore = fetched.length > limit;
    const rows = hasMore ? fetched.slice(0, limit) : fetched;
    const last = rows[rows.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ t: String(last.CREATEDTIME), r: String(last.ROWID) })
        : null;

    sendSuccess(res, rows.map(shape), 'Notifications retrieved', 200, {
      limit,
      count: rows.length,
      hasMore,
      nextCursor,
      sort,
      // `total` appears ONLY when it is a real count — never derived from the
      // page contents.
      ...(total !== null
        ? { total, totalKnown: true, totalPages: Math.ceil(total / limit) }
        : { totalKnown: false }),
    });
  } catch (error) {
    // Likely cause: Notification table not yet created in Catalyst console.
    // Surface as empty list so the bell renders cleanly.
    console.error('[notification] list failed:', error);
    sendSuccess(res, [], 'Notifications retrieved', 200, {
      count: 0,
      hasMore: false,
      nextCursor: null,
      totalKnown: false,
    });
  }
}

/** GET /api/notifications/unread-count — number for the bell badge. */
export async function getUnreadCount(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const me = await getUserIdAliases(req.user.id);
    const where = ` WHERE ${zcqlAnyOf('recipientId', me)} AND isRead = 'false'`;

    // Ask the datastore for the number instead of shipping every unread row to
    // Node just to read `.length` off it. The old SELECT had no LIMIT, so ZCQL's
    // implicit cap truncated the result and the badge under-reported for anyone
    // past that cap — while still transferring the whole result set to get there.
    const counted = await countRows(NOTIFICATION_TABLE, where);
    if (counted !== null) {
      sendSuccess(res, { count: counted }, 'Unread count retrieved');
      return;
    }

    // countRows returns null when COUNT is unavailable on this deployment
    // (it never throws). Fall back to the previous row-counting behaviour, but
    // select ROWID only and state the cap explicitly rather than inheriting
    // whatever ZCQL's implicit one happens to be.
    const rows = await executeZCQL<CatalystRow>(
      `SELECT ROWID FROM ${NOTIFICATION_TABLE}${where} ` +
        `ORDER BY ROWID DESC LIMIT ${assertZcqlLimit(ZCQL_MAX_LIMIT)}`
    );
    sendSuccess(res, { count: rows.length }, 'Unread count retrieved');
  } catch (error) {
    // Same defensive fallback as listMyNotifications.
    console.error('[notification] count failed:', error);
    sendSuccess(res, { count: 0 }, 'Unread count retrieved');
  }
}

/** PATCH /api/notifications/:id/read */
export async function markRead(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const { id } = req.params;
    const row = await getRow(NOTIFICATION_TABLE, id);
    if (!row) {
      sendNotFound(res, 'Notification not found');
      return;
    }
    const me = await getUserIdAliases(req.user.id);
    if (!me.includes(String(row.recipientId))) {
      sendError(res, 'Forbidden', 403);
      return;
    }
    const updated = await updateRow(NOTIFICATION_TABLE, {
      ROWID: row.ROWID,
      isRead: true,
    } as any);
    sendSuccess(res, shape(updated), 'Notification marked read');
  } catch (error) {
    sendServerError(res, 'Failed to mark notification read', error);
  }
}

/**
 * POST /api/notifications/read-all — mark all of mine read.
 *
 * Loops until the backlog is drained. The previous version issued ONE unbounded
 * SELECT, which ZCQL truncates at its implicit cap, so a user holding more
 * unread rows than that cap kept a lit badge no matter how many times they
 * pressed "Mark all read" — the overflow was never selected, so it was never
 * updated. Each pass takes a ZCQL-legal page, and because the pass flips those
 * rows to read, the `isRead = 'false'` predicate itself shrinks — the next pass
 * sees only what is left, with no OFFSET to drift.
 */
export async function markAllRead(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const me = await getUserIdAliases(req.user.id);
    const where = ` WHERE ${zcqlAnyOf('recipientId', me)} AND isRead = 'false'`;

    // Three independent bounds, because this endpoint writes one row per unread
    // notification and the client gives up at 30s (see api.ts timeout):
    //   PAGE        — rows selected per pass, well under the ZCQL LIMIT ceiling
    //   WRITE_CONC  — concurrent PATCHes; 299 at once exhausts the keep-alive
    //                 agent's socket pool and makes every other in-flight
    //                 request on this process queue behind it
    //   DEADLINE_MS — wall clock, kept under the client timeout so a large
    //                 backlog returns an honest partial result instead of a
    //                 socket hangup that marks nothing and reports nothing
    const PAGE = 100;
    const WRITE_CONC = 10;
    const DEADLINE_MS = 20_000;
    const startedAt = Date.now();

    let updated = 0;
    let remaining = true;

    while (remaining && Date.now() - startedAt < DEADLINE_MS) {
      // ROWID only: the row bodies were never read, so fetching `*` was pure
      // transfer cost on a request that already has to write every one of them.
      const rows = await executeZCQL<CatalystRow>(
        `SELECT ROWID FROM ${NOTIFICATION_TABLE}${where} ` +
          `ORDER BY ROWID ASC LIMIT ${assertZcqlLimit(PAGE)}`
      );
      if (rows.length === 0) {
        remaining = false;
        break;
      }

      // Bounded fan-out. allSettled keeps the original "one bad row doesn't
      // sink the batch" semantics while letting us see how many actually flipped.
      let succeeded = 0;
      for (let i = 0; i < rows.length; i += WRITE_CONC) {
        const slice = rows.slice(i, i + WRITE_CONC);
        const results = await Promise.allSettled(
          slice.map((r) =>
            updateRow(NOTIFICATION_TABLE, { ROWID: r.ROWID, isRead: true } as any)
          )
        );
        for (const result of results) {
          if (result.status === 'fulfilled') succeeded++;
          else console.error('[notification] mark-read row failed:', result.reason);
        }
      }
      updated += succeeded;

      // Nothing flipped, so the next SELECT would return the identical set.
      // Stop rather than spinning on the same failures until the deadline.
      if (succeeded === 0) {
        remaining = false;
        break;
      }
      // A short page means that was the tail of the backlog.
      if (rows.length < PAGE) remaining = false;
    }

    if (remaining) {
      console.warn(
        `[notification] mark-all-read stopped at its ${DEADLINE_MS}ms budget for user ` +
          `${req.user.id}; ${updated} marked, more still unread — the client can call again.`
      );
    }

    // `updated` counts rows that actually flipped, not rows we attempted —
    // reporting attempts made a partly-failed sweep look like a clean one.
    // `remaining` lets the caller know a second sweep is worthwhile rather than
    // leaving a lit badge with no explanation.
    sendSuccess(
      res,
      { updated, remaining },
      remaining
        ? 'Marked a batch as read; some notifications remain'
        : 'All notifications marked read'
    );
  } catch (error) {
    sendServerError(res, 'Failed to mark all read', error);
  }
}
