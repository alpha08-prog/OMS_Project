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
  executeZCQL,
  zcqlEscapeValue,
  CatalystRow,
} from '../lib/catalyst-client';
import { getCachedTableList } from '../lib/catalyst-user-lookup';
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
    constituency: row.constituency ?? null,
    wardVillage: row.wardVillage ?? null,
    createdAt: row.CREATEDTIME,
    updatedAt: row.MODIFIEDTIME,
    createdById: row.createdById,
    createdBy: createdBy ?? null,
  };
}

/** Look up users from cached Catalyst AppUser. Best-effort. */
async function lookupUsers(
  ids: Iterable<string>
): Promise<Map<string, { id: string; name: string; email: string }>> {
  const map = new Map<string, { id: string; name: string; email: string }>();
  const list = Array.from(ids).filter(Boolean);
  if (list.length === 0) return map;
  try {
    const users = await getCachedTableList('AppUser');
    const wanted = new Set(list.map(String));
    for (const u of users) {
      const rowId = String(u.ROWID);
      const legacyId = u.legacyId ? String(u.legacyId) : null;
      if (wanted.has(rowId)) {
        map.set(rowId, { id: rowId, name: String(u.name), email: String(u.email) });
      } else if (legacyId && wanted.has(legacyId)) {
        map.set(legacyId, { id: legacyId, name: String(u.name), email: String(u.email) });
      }
    }
  } catch {
    /* Catalyst unreachable — return empty map */
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
    const { name, phone, dob, relation, notes, designation, constituency, wardVillage } = req.body;

    // Duplicate check via targeted ZCQL — O(1) regardless of table size.
    // Catalyst text equality is case-insensitive, but we still re-check in JS
    // after fetch so the contract is explicit and not dependent on Catalyst's
    // collation defaults.
    const trimmedName = String(name).trim();
    const lower = trimmedName.toLowerCase();
    const existing = await executeZCQL<CatalystRow>(
      `SELECT * FROM ${BIRTHDAY_TABLE} WHERE name = '${zcqlEscapeValue(trimmedName)}' LIMIT 20`
    );
    if (existing.some((r) => String(r.name ?? '').trim().toLowerCase() === lower)) {
      sendError(res, `A birthday entry for "${name}" already exists`, 409);
      return;
    }

    const payload: Record<string, unknown> = {
      name,
      phone: phone?.trim() || null,
      dob: toCatalystDate(dob),
      relation,
      notes: notes?.trim() || null,
      designation: designation?.trim() || null,
      createdById: req.user.id,
    };
    if (constituency?.trim()) payload.constituency = constituency.trim();
    if (wardVillage?.trim()) payload.wardVillage = wardVillage.trim();

    const row = await insertRow(BIRTHDAY_TABLE, payload);

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
    const { search, relation, month, startDate, endDate } = req.query as Record<string, string>;

    let rows = await listAllRows(BIRTHDAY_TABLE);

    if (startDate) {
      const start = new Date(startDate).getTime();
      rows = rows.filter(
        (r) => r.CREATEDTIME && new Date(r.CREATEDTIME).getTime() >= start
      );
    }
    if (endDate) {
      const end = new Date(endDate).getTime();
      rows = rows.filter(
        (r) => r.CREATEDTIME && new Date(r.CREATEDTIME).getTime() <= end
      );
    }

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
    const { name, phone, dob, relation, notes, designation, constituency, wardVillage } = req.body;

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
    if (constituency !== undefined)
      updateData.constituency = constituency?.trim() || null;
    if (wardVillage !== undefined)
      updateData.wardVillage = wardVillage?.trim() || null;

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
