/**
 * Birthday controller — backed by Catalyst Data Store via custom REST client.
 *
 * Mirrors backend/src/controllers/birthday.controller.ts (the Prisma version).
 *
 * Catalyst-specific notes:
 *   - No enums on this model.
 *   - Month/day filters (today's birthdays, upcoming, month filter) are done in
 *     JS instead of EXTRACT() since ZCQL/Catalyst doesn't support it.
 *   - Duplicate-name check is done case-insensitive in JS too.
 *   - No data isolation — birthdays are office-wide.
 */
import { Response } from 'express';
import {
  insertRow,
  listAllRows,
  getRow,
  updateRow,
  deleteRow,
  toCatalystDate,
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
import type { AuthenticatedRequest } from '../types';

const BIRTHDAY_TABLE = 'Birthday';

/** Reshape a Catalyst Birthday row → JSON the frontend expects. */
function shapeBirthday(
  row: CatalystRow,
  createdBy?: { id: string; name: string; email: string } | null
) {
  return {
    id: String(row.ROWID),
    name: row.name,
    phone: row.phone ?? null,
    dob: row.dob,
    relation: row.relation,
    notes: row.notes ?? null,
    designation: row.designation ?? null,
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
    shapeBirthday(r, users.get(String(r.createdById)) ?? null)
  );
}

// ── Endpoints ─────────────────────────────────────────────────────────────

/** POST /api/birthdays */
export async function createBirthday(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const { name, phone, dob, relation, notes, designation } = req.body;

    // Duplicate check (case-insensitive name match) — done in JS.
    const all = await listAllRows(BIRTHDAY_TABLE);
    const lower = String(name).trim().toLowerCase();
    if (all.some((r) => (r.name || '').toString().toLowerCase() === lower)) {
      sendError(res, `A birthday entry for "${name}" already exists`, 409);
      return;
    }

    const row = await insertRow(BIRTHDAY_TABLE, {
      name,
      phone: phone?.trim() || null,
      dob: toCatalystDate(dob),
      relation,
      notes: notes?.trim() || null,
      designation: designation?.trim() || null,
      createdById: req.user.id,
    });

    const [shaped] = await hydrate([row]);
    sendSuccess(res, shaped, 'Birthday entry created successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to create birthday entry', error);
  }
}

/** GET /api/birthdays — list with search/relation/month filters. */
export async function getBirthdays(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );
    const { search, relation, month } = req.query as Record<string, string>;

    let rows = await listAllRows(BIRTHDAY_TABLE);

    if (search) {
      const q = String(search).toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.name || '').toLowerCase().includes(q) ||
          (r.phone || '').includes(q)
      );
    }
    if (relation) {
      rows = rows.filter((r) => r.relation === relation);
    }
    if (month) {
      const m = parseInt(String(month), 10);
      if (!isNaN(m) && m >= 1 && m <= 12) {
        rows = rows.filter((r) => {
          if (!r.dob) return false;
          return new Date(r.dob).getMonth() + 1 === m;
        });
        // When filtering by month, sort by day-of-month asc (matches Prisma)
        rows.sort((a, b) => {
          const da = a.dob ? new Date(a.dob).getDate() : 99;
          const db = b.dob ? new Date(b.dob).getDate() : 99;
          return da - db;
        });
      }
    } else {
      // Default sort: dob ascending (matches Prisma)
      rows.sort((a, b) => {
        const ta = a.dob ? new Date(a.dob).getTime() : 0;
        const tb = b.dob ? new Date(b.dob).getTime() : 0;
        return ta - tb;
      });
    }

    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    const data = await hydrate(paged);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, data, 'Birthdays retrieved successfully', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get birthdays', error);
  }
}

/** GET /api/birthdays/today */
export async function getTodayBirthdays(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    const rows = await listAllRows(BIRTHDAY_TABLE);
    const matched = rows
      .filter((r) => {
        if (!r.dob) return false;
        const d = new Date(r.dob);
        return d.getMonth() + 1 === month && d.getDate() === day;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const data = await hydrate(matched);
    sendSuccess(res, data, "Today's birthdays retrieved successfully");
  } catch (error) {
    sendServerError(res, 'Failed to get birthdays', error);
  }
}

/** GET /api/birthdays/upcoming — next 7 days, capped at 10. */
export async function getUpcomingBirthdays(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const today = new Date();
    const todayMD = today.getMonth() * 100 + today.getDate(); // sortable composite
    // Build 7 day-of-year keys we want (looping over month boundary)
    const wanted = new Set<number>();
    for (let i = 0; i <= 7; i++) {
      const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      wanted.add(d.getMonth() * 100 + d.getDate());
    }

    const rows = await listAllRows(BIRTHDAY_TABLE);
    const matched = rows.filter((r) => {
      if (!r.dob) return false;
      const d = new Date(r.dob);
      return wanted.has(d.getMonth() * 100 + d.getDate());
    });

    // Sort by days-until-birthday ascending
    function daysUntil(b: CatalystRow): number {
      if (!b.dob) return 999;
      const d = new Date(b.dob);
      const md = d.getMonth() * 100 + d.getDate();
      // wraparound: if md < todayMD, add 12*100 + 31 ish to push to next year
      return md >= todayMD ? md - todayMD : md + 1300 - todayMD;
    }
    matched.sort((a, b) => daysUntil(a) - daysUntil(b));

    const data = await hydrate(matched.slice(0, 10));
    sendSuccess(res, data, 'Upcoming birthdays retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get upcoming birthdays', error);
  }
}

/** GET /api/birthdays/:id */
export async function getBirthdayById(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const row = await getRow(BIRTHDAY_TABLE, id);
    if (!row) {
      sendNotFound(res, 'Birthday entry not found');
      return;
    }
    const [shaped] = await hydrate([row]);
    sendSuccess(res, shaped, 'Birthday entry retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get birthday entry', error);
  }
}

/** PUT /api/birthdays/:id */
export async function updateBirthday(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { name, phone, dob, relation, notes, designation } = req.body;

    const existing = await getRow(BIRTHDAY_TABLE, id);
    if (!existing) {
      sendNotFound(res, 'Birthday entry not found');
      return;
    }

    const updateData: Record<string, unknown> = { ROWID: id };
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (dob !== undefined) updateData.dob = toCatalystDate(dob);
    if (relation !== undefined) updateData.relation = relation;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (designation !== undefined)
      updateData.designation = designation?.trim() || null;

    const updated = await updateRow(BIRTHDAY_TABLE, updateData as any);
    const [shaped] = await hydrate([updated]);
    sendSuccess(res, shaped, 'Birthday entry updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update birthday entry', error);
  }
}

/** DELETE /api/birthdays/:id */
export async function deleteBirthday(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const existing = await getRow(BIRTHDAY_TABLE, id);
    if (!existing) {
      sendNotFound(res, 'Birthday entry not found');
      return;
    }
    await deleteRow(BIRTHDAY_TABLE, id);
    sendSuccess(res, null, 'Birthday entry deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete birthday entry', error);
  }
}

/** Used by stats controller — count today's birthdays. */
export async function getTodayBirthdayCount(): Promise<number> {
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  try {
    const rows = await listAllRows(BIRTHDAY_TABLE);
    return rows.filter((r) => {
      if (!r.dob) return false;
      const d = new Date(r.dob);
      return d.getMonth() + 1 === month && d.getDate() === day;
    }).length;
  } catch {
    return 0;
  }
}
