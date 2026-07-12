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
  zcqlSafeLimit,
  CatalystRow,
} from '../lib/catalyst-client';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendServerError,
} from '../utils/response';
import { getUserIdAliases } from '../lib/catalyst-user-lookup';
import type { AuthenticatedRequest } from '../types';

const NOTIFICATION_TABLE = 'Notification';

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

/** GET /api/notifications?unread=true */
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
    const conditions: string[] = [zcqlAnyOf('recipientId', me)];
    if (unreadOnly) conditions.push(`isRead = 'false'`);
    const where = ` WHERE ${conditions.join(' AND ')}`;
    const safeLimit = zcqlSafeLimit(50);
    const query =
      `SELECT * FROM ${NOTIFICATION_TABLE}${where} ` +
      `ORDER BY CREATEDTIME DESC LIMIT ${safeLimit}`;
    const rows = await executeZCQL<CatalystRow>(query);
    sendSuccess(res, rows.map(shape), 'Notifications retrieved');
  } catch (error) {
    // Likely cause: Notification table not yet created in Catalyst console.
    // Surface as empty list so the bell renders cleanly.
    console.error('[notification] list failed:', error);
    sendSuccess(res, [], 'Notifications retrieved');
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
    const query =
      `SELECT * FROM ${NOTIFICATION_TABLE} ` +
      `WHERE ${zcqlAnyOf('recipientId', me)} AND isRead = 'false'`;
    const rows = await executeZCQL<CatalystRow>(query);
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

/** POST /api/notifications/read-all — mark all of mine read. */
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
    const query =
      `SELECT * FROM ${NOTIFICATION_TABLE} ` +
      `WHERE ${zcqlAnyOf('recipientId', me)} AND isRead = 'false'`;
    const rows = await executeZCQL<CatalystRow>(query);
    await Promise.all(
      rows.map((r) =>
        updateRow(NOTIFICATION_TABLE, { ROWID: r.ROWID, isRead: true } as any).catch(
          (e) => console.error('[notification] mark-read row failed:', e)
        )
      )
    );
    sendSuccess(res, { updated: rows.length }, 'All notifications marked read');
  } catch (error) {
    sendServerError(res, 'Failed to mark all read', error);
  }
}
