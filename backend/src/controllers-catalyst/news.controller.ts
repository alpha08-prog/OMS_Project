/**
 * News Intelligence controller — backed by Catalyst Data Store via custom REST client.
 *
 * Mirrors backend/src/controllers/news.controller.ts (the Prisma version).
 *
 * Catalyst-specific notes:
 *   - 2 enums (NewsCategory, NewsPriority) stored as TEXT, validated here.
 *   - Catalyst column `newsPriority` ↔ frontend `priority` (priority is a
 *     reserved word in Catalyst, same as we did for Task).
 *   - No data isolation by createdById — News is office-wide intelligence,
 *     anyone authenticated can see all entries (matches Prisma behavior).
 */
import { Response } from 'express';
import {
  insertRow,
  listAllRows,
  getRow,
  updateRow,
  deleteRow,
  CatalystRow,
} from '../lib/catalyst-client';
import prisma from '../lib/prisma';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendServerError,
} from '../utils/response';
import { parsePagination, calculatePaginationMeta } from '../utils/pagination';
import type { AuthenticatedRequest, NewsFilters } from '../types';

const NEWS_TABLE = 'News';

const VALID_CATEGORIES = new Set([
  'DEVELOPMENT_WORK',
  'CONSPIRACY_FAKE_NEWS',
  'LEADER_ACTIVITY',
  'PARTY_ACTIVITY',
  'OPPOSITION',
  'OTHER',
]);
const VALID_PRIORITIES = new Set(['NORMAL', 'HIGH', 'CRITICAL']);

/** Reshape a Catalyst News row → JSON the frontend expects (priority, not newsPriority). */
function shapeNews(
  row: CatalystRow,
  createdBy?: { id: string; name: string; email: string } | null
) {
  return {
    id: String(row.ROWID),
    headline: row.headline,
    category: row.category,
    priority: row.newsPriority ?? 'NORMAL', // Catalyst → frontend mapping
    mediaSource: row.mediaSource,
    region: row.region,
    description: row.description ?? null,
    imageUrl: row.imageUrl ?? null,
    createdAt: row.CREATEDTIME,
    updatedAt: row.MODIFIEDTIME,
    createdById: row.createdById,
    createdBy: createdBy ?? null,
  };
}

async function lookupUsers(
  ids: Iterable<string>
): Promise<Map<string, { id: string; name: string; email: string }>> {
  const map = new Map<string, { id: string; name: string; email: string }>();
  const list = Array.from(ids).filter(Boolean);
  if (list.length === 0) return map;
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: list } },
      select: { id: true, name: true, email: true },
    });
    for (const u of users) map.set(u.id, u);
  } catch {
    /* ignore */
  }
  return map;
}

async function hydrate(rows: CatalystRow[]): Promise<any[]> {
  const safe = rows.filter((r): r is CatalystRow => Boolean(r));
  if (safe.length === 0) return [];
  const ids = new Set<string>();
  for (const r of safe) if (r.createdById) ids.add(String(r.createdById));
  const users = await lookupUsers(ids);
  return safe.map((r) =>
    shapeNews(r, users.get(String(r.createdById)) ?? null)
  );
}

/** Priority sort weight — CRITICAL > HIGH > NORMAL. */
function priorityWeight(p: unknown): number {
  if (p === 'CRITICAL') return 2;
  if (p === 'HIGH') return 1;
  return 0;
}

// ── Endpoints ─────────────────────────────────────────────────────────────

/** POST /api/news */
export async function createNews(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const { headline, category, priority, mediaSource, region, description, imageUrl } =
      req.body;

    if (!VALID_CATEGORIES.has(category)) {
      sendError(res, `Invalid category: ${category}`);
      return;
    }
    const prio = (priority || 'NORMAL').toString().toUpperCase();
    if (!VALID_PRIORITIES.has(prio)) {
      sendError(res, `Invalid priority: ${priority}`);
      return;
    }

    const row = await insertRow(NEWS_TABLE, {
      headline,
      category,
      newsPriority: prio, // frontend `priority` → Catalyst `newsPriority`
      mediaSource,
      region,
      description: description?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
      createdById: req.user.id,
    });

    const [shaped] = await hydrate([row]);
    sendSuccess(res, shaped, 'News intelligence created successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to create news intelligence', error);
  }
}

/** GET /api/news */
export async function getNews(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );
    const filters = req.query as NewsFilters;

    let rows = await listAllRows(NEWS_TABLE);

    if (filters.priority) {
      rows = rows.filter((r) => r.newsPriority === filters.priority);
    }
    if (filters.category) {
      rows = rows.filter((r) => r.category === filters.category);
    }
    if (filters.region) {
      const q = String(filters.region).toLowerCase();
      rows = rows.filter((r) => (r.region || '').toLowerCase().includes(q));
    }
    if (filters.search) {
      const q = String(filters.search).toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.headline || '').toLowerCase().includes(q) ||
          (r.description || '').toLowerCase().includes(q) ||
          (r.mediaSource || '').toLowerCase().includes(q)
      );
    }

    rows.sort((a, b) => {
      // Priority desc, then createdAt desc — matches Prisma behavior
      const pa = priorityWeight(a.newsPriority);
      const pb = priorityWeight(b.newsPriority);
      if (pa !== pb) return pb - pa;
      const ta = a.CREATEDTIME ? new Date(a.CREATEDTIME).getTime() : 0;
      const tb = b.CREATEDTIME ? new Date(b.CREATEDTIME).getTime() : 0;
      return tb - ta;
    });

    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    const data = await hydrate(paged);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, data, 'News retrieved successfully', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get news', error);
  }
}

/** GET /api/news/:id */
export async function getNewsById(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const row = await getRow(NEWS_TABLE, id);
    if (!row) {
      sendNotFound(res, 'News not found');
      return;
    }
    const [shaped] = await hydrate([row]);
    sendSuccess(res, shaped, 'News retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get news', error);
  }
}

/** PUT /api/news/:id */
export async function updateNews(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const body = { ...req.body };
    delete body.id;
    delete body.createdById;
    delete body.createdAt;
    delete body.updatedAt;
    delete body.ROWID;
    delete body.CREATEDTIME;
    delete body.MODIFIEDTIME;
    delete body.CREATORID;

    const updateData: Record<string, unknown> = { ROWID: id };

    const allowed = ['headline', 'mediaSource', 'region', 'description', 'imageUrl'];
    for (const k of allowed) {
      if (body[k] !== undefined) updateData[k] = body[k];
    }
    if (body.category !== undefined) {
      if (!VALID_CATEGORIES.has(body.category)) {
        sendError(res, `Invalid category: ${body.category}`);
        return;
      }
      updateData.category = body.category;
    }
    if (body.priority !== undefined) {
      const prio = String(body.priority).toUpperCase();
      if (!VALID_PRIORITIES.has(prio)) {
        sendError(res, `Invalid priority: ${body.priority}`);
        return;
      }
      updateData.newsPriority = prio; // map to Catalyst column
    }

    const updated = await updateRow(NEWS_TABLE, updateData as any);
    const [shaped] = await hydrate([updated]);
    sendSuccess(res, shaped, 'News updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update news', error);
  }
}

/** DELETE /api/news/:id */
export async function deleteNews(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    await deleteRow(NEWS_TABLE, id);
    sendSuccess(res, null, 'News deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete news', error);
  }
}

/** GET /api/news/alerts/critical — top 10 CRITICAL by createdAt desc. */
export async function getCriticalAlerts(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const rows = await listAllRows(NEWS_TABLE);
    const matched = rows
      .filter((r) => r.newsPriority === 'CRITICAL')
      .sort((a, b) => {
        const ta = a.CREATEDTIME ? new Date(a.CREATEDTIME).getTime() : 0;
        const tb = b.CREATEDTIME ? new Date(b.CREATEDTIME).getTime() : 0;
        return tb - ta;
      })
      .slice(0, 10);

    const data = await hydrate(matched);
    sendSuccess(res, data, 'Critical alerts retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get critical alerts', error);
  }
}
