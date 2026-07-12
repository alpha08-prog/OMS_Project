
/**
 * Visitor controller — backed by Catalyst Data Store via the custom REST client.
 *
 * Bypasses zcatalyst-sdk-node entirely (it has bugs in local-dev mode).
 * Uses our thin client at lib/catalyst-client.ts instead.
 *
 * Role-based access:
 *   - STAFF:  only see/edit rows where createdById === their user id
 *   - ADMIN:  see/edit everything
 */
import { Response } from 'express';
import {
  insertRowTolerant,
  listAllRows,
  getRow,
  updateRowTolerant,
  deleteRow,
  toCatalystDate,
  nowCatalystIST,
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
import { parsePagination, calculatePaginationMeta } from '../utils/pagination';
import { lookupUsers, getUserIdAliases } from '../lib/catalyst-user-lookup';
import { useZCQL } from '../config/feature-flags';
import type { AuthenticatedRequest, VisitorFilters } from '../types';

const VISITOR_TABLE = 'Visitor';

/**
 * Catalyst returns boolean columns as the strings "true"/"false" rather than
 * actual booleans. Coerce to a real boolean.
 */
function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  if (typeof v === 'number') return v !== 0;
  return Boolean(v);
}

/** Reshape a Catalyst row into the JSON shape the frontend expects. */
function shapeVisitor(
  row: CatalystRow,
  creator?: { id: string; name: string; email: string } | null,
  lastEditedBy?: { id: string; name: string; email: string } | null
) {
  return {
    id: String(row.ROWID),
    name: row.name,
    designation: row.designation,
    phone: row.phone,
    dob: row.dob ?? null,
    purpose: row.purpose,
    referencedBy: row.referencedBy,
    constituency: row.constituency ?? null,
    wardVillage: row.wardVillage ?? null,
    // Whether this person is a serving official — drives the "Official" mark on
    // their birthday (View Birthdays + dashboard). Defaults false for legacy
    // rows / before the Catalyst column exists.
    isOfficial: parseBool(row.isOfficial),
    visitDate: row.visitDate,
    createdById: row.createdById ?? null,
    createdAt: row.CREATEDTIME,
    updatedAt: row.MODIFIEDTIME,
    createdBy: creator ?? null,
    // Edit audit — who last edited this visitor and when (security trail).
    lastEditedById: row.lastEditedById ?? null,
    lastEditedAt: row.lastEditedAt ?? null,
    lastEditedBy: lastEditedBy ?? null,
  };
}

/**
 * Best-effort lookup of creator + last-editor user info. Resolved via
 * lookupUsers, which queries the AppUser table and handles both Catalyst
 * ROWIDs and legacy UUID ids (createdById / lastEditedById can be either
 * form). If AppUser is unreachable, createdBy / lastEditedBy stay null.
 */
async function attachCreators(rows: CatalystRow[]): Promise<any[]> {
  // Guard against undefined entries — some Catalyst endpoints return shapes
  // we don't fully control.
  const safe = rows.filter((r): r is CatalystRow => Boolean(r));
  if (safe.length === 0) return [];

  const ids = new Set<string>();
  for (const r of safe) {
    if (r.createdById) ids.add(String(r.createdById));
    if (r.lastEditedById) ids.add(String(r.lastEditedById));
  }

  let byId = new Map<string, { id: string; name: string; email: string }>();
  if (ids.size > 0) {
    try {
      byId = await lookupUsers(ids);
    } catch {
      // AppUser unreachable — leave creator/editor null.
    }
  }

  return safe.map((r) =>
    shapeVisitor(
      r,
      (r.createdById && byId.get(String(r.createdById))) || null,
      (r.lastEditedById && byId.get(String(r.lastEditedById))) || null
    )
  );
}

/**
 * POST /api/visitors
 */
export async function createVisitor(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const { name, designation, phone, dob, purpose, referencedBy, visitDate, constituency, wardVillage, isOfficial } = req.body;

    const payload: Record<string, unknown> = {
      name,
      designation,
      phone,
      dob: toCatalystDate(dob),
      purpose,
      referencedBy,
      // Serving-official flag. Stored as a real boolean; the tolerant insert
      // below drops it if the Catalyst column hasn't been added yet.
      isOfficial: Boolean(isOfficial),
      visitDate: toCatalystDate(visitDate) || nowCatalystIST(),
      createdById: req.user.id,
    };
    if (constituency) payload.constituency = constituency;
    if (wardVillage) payload.wardVillage = wardVillage;

    // insertRowTolerant retries without `isOfficial` if Catalyst rejects the
    // write (column missing) so logging a visitor never fails on the new flag.
    const row = await insertRowTolerant(VISITOR_TABLE, payload, ['isOfficial']);

    const [shaped] = await attachCreators([row]);
    sendSuccess(res, shaped, 'Visitor logged successfully', 201);
  } catch (error) {
    // Surface the underlying Catalyst reason (e.g. a missing/invalid column)
    // instead of a generic message — same pattern as createGrievance.
    const msg =
      error instanceof Error && error.message
        ? `Failed to log visitor: ${error.message}`
        : 'Failed to log visitor';
    sendServerError(res, msg, error);
  }
}

/**
 * Build a ZCQL WHERE clause + ORDER BY for the visitor list. Returns the
 * full query so the caller can also append LIMIT/OFFSET.
 */
function buildVisitorZCQL(
  staffIds: string[] | null,
  filters: VisitorFilters
): string {
  const conditions: string[] = [];

  // STAFF scoping — match ALL identity aliases (ROWID + legacy UUID), since
  // rows written in different eras carry different forms of the same user.
  if (staffIds && staffIds.length > 0) {
    conditions.push(zcqlAnyOf('createdById', staffIds));
  }

  if (filters.search) {
    const q = zcqlEscapeValue(String(filters.search));
    conditions.push(
      `(name LIKE '%${q}%' OR designation LIKE '%${q}%' OR purpose LIKE '%${q}%')`
    );
  }

  if (filters.startDate) {
    const start = toCatalystDate(filters.startDate as unknown as string);
    if (start) conditions.push(`visitDate >= '${start}'`);
  }
  if (filters.endDate) {
    const end = toCatalystDate(filters.endDate as unknown as string);
    if (end) conditions.push(`visitDate <= '${end}'`);
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  return `SELECT * FROM ${VISITOR_TABLE}${where} ORDER BY visitDate DESC`;
}

/**
 * GET /api/visitors
 *
 * Two execution paths controlled by the USE_ZCQL master flag:
 *   - true:  push filters down to Catalyst via ZCQL (scales with table size)
 *   - false (default): list everything and filter in JS (safe fallback while
 *     ZCQL behavior in this project is being validated)
 */
export async function getVisitors(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );
    const filters = req.query as VisitorFilters;
    // STAFF see only their own rows — resolved to the full identity-alias set
    // (Catalyst ROWID + legacy UUID) so pre-migration rows still match.
    const staffIds =
      req.user?.role === 'STAFF' ? await getUserIdAliases(req.user.id) : null;
    if (useZCQL()) {
      const baseQuery = buildVisitorZCQL(staffIds, filters);
      // Catalyst ZCQL caps LIMIT at 300. zcqlSafeLimit clamps user-requested
      // limit to 299 so we have room for the +1 hasMore probe.
      const safeLimit = zcqlSafeLimit(limit);
      const pagedQuery = `${baseQuery} LIMIT ${safeLimit + 1} OFFSET ${skip}`;
      const fetched = await executeZCQL<CatalystRow>(pagedQuery);
      const hasMore = fetched.length > safeLimit;
      const pageRows = hasMore ? fetched.slice(0, safeLimit) : fetched;
      const visitors = await attachCreators(pageRows);
      const total = skip + pageRows.length + (hasMore ? 1 : 0);
      const meta = calculatePaginationMeta(total, page, safeLimit);
      sendSuccess(res, visitors, 'Visitors retrieved successfully', 200, meta);
      return;
    }

    // ── Fallback path: list everything, filter in JS ────────────────────
    let rows = await listAllRows(VISITOR_TABLE, 1000);

    // STAFF data isolation
    if (staffIds) {
      const idSet = new Set(staffIds);
      rows = rows.filter((r) => idSet.has(String(r.createdById)));
    }

    // Search filter (name | designation | purpose)
    if (filters.search) {
      const q = String(filters.search).toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.name || '').toLowerCase().includes(q) ||
          (r.designation || '').toLowerCase().includes(q) ||
          (r.purpose || '').toLowerCase().includes(q)
      );
    }

    // Date range filter
    if (filters.startDate) {
      const start = new Date(filters.startDate as unknown as string).getTime();
      rows = rows.filter(
        (r) => r.visitDate && new Date(r.visitDate).getTime() >= start
      );
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate as unknown as string).getTime();
      rows = rows.filter(
        (r) => r.visitDate && new Date(r.visitDate).getTime() <= end
      );
    }

    rows.sort((a, b) => {
      const ta = a.visitDate ? new Date(a.visitDate).getTime() : 0;
      const tb = b.visitDate ? new Date(b.visitDate).getTime() : 0;
      return tb - ta;
    });

    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    const visitors = await attachCreators(paged);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, visitors, 'Visitors retrieved successfully', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get visitors', error);
  }
}

/**
 * GET /api/visitors/:id
 */
export async function getVisitorById(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const row = await getRow(VISITOR_TABLE, id);
    if (!row) {
      sendNotFound(res, 'Visitor not found');
      return;
    }

    if (req.user?.role === 'STAFF') {
      const aliases = await getUserIdAliases(req.user.id);
      if (!aliases.includes(String(row.createdById))) {
        sendError(res, 'Forbidden', 403);
        return;
      }
    }

    const [shaped] = await attachCreators([row]);
    sendSuccess(res, shaped, 'Visitor retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get visitor', error);
  }
}

/**
 * PUT /api/visitors/:id
 */
export async function updateVisitor(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { name, designation, phone, dob, purpose, referencedBy, visitDate, constituency, wardVillage, isOfficial } = req.body;

    // Corrections: staff may only edit visitors they logged (matched against
    // all identity aliases). Admins can edit any.
    if (req.user?.role === 'STAFF') {
      const existing = await getRow(VISITOR_TABLE, id);
      if (!existing) {
        sendNotFound(res, 'Visitor not found');
        return;
      }
      const aliases = await getUserIdAliases(req.user.id);
      if (!aliases.includes(String(existing.createdById))) {
        sendError(res, 'You can only edit visitors you logged', 403);
        return;
      }
    }

    const updateData: Record<string, unknown> = { ROWID: id };
    if (name !== undefined) updateData.name = name;
    if (designation !== undefined) updateData.designation = designation;
    if (phone !== undefined) updateData.phone = phone;
    if (dob !== undefined) updateData.dob = toCatalystDate(dob);
    if (purpose !== undefined) updateData.purpose = purpose;
    if (referencedBy !== undefined) updateData.referencedBy = referencedBy;
    if (visitDate !== undefined) updateData.visitDate = toCatalystDate(visitDate);
    if (constituency !== undefined) updateData.constituency = constituency;
    if (wardVillage !== undefined) updateData.wardVillage = wardVillage;
    if (isOfficial !== undefined) updateData.isOfficial = Boolean(isOfficial);

    // Edit audit — stamp who edited and when. Never let the client override it.
    if (req.user) {
      updateData.lastEditedById = req.user.id;
      updateData.lastEditedAt = nowCatalystIST();
    }

    // updateRowTolerant tolerates a Catalyst schema that doesn't have the audit
    // / isOfficial columns yet — it retries without them if Catalyst rejects.
    const updated = await updateRowTolerant(VISITOR_TABLE, updateData as any, [
      'lastEditedById',
      'lastEditedAt',
      'isOfficial',
    ]);
    const [shaped] = await attachCreators([updated]);
    sendSuccess(res, shaped, 'Visitor updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update visitor', error);
  }
}

/**
 * DELETE /api/visitors/:id
 */
export async function deleteVisitor(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    await deleteRow(VISITOR_TABLE, id);
    sendSuccess(res, null, 'Visitor deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete visitor', error);
  }
}

/**
 * GET /api/visitors/birthdays/today
 */
export async function getTodayBirthdays(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    const rows = await listAllRows(VISITOR_TABLE, 1000);
    const matches = rows.filter((r) => {
      if (!r.dob) return false;
      const d = new Date(r.dob);
      return d.getMonth() + 1 === month && d.getDate() === day;
    });

    const visitors = await attachCreators(matches);
    sendSuccess(res, visitors, "Today's birthdays retrieved successfully");
  } catch (error) {
    sendServerError(res, 'Failed to get birthdays', error);
  }
}

/**
 * GET /api/visitors/date/:date
 */
export async function getVisitorsByDate(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { date } = req.params;
    const target = new Date(date);
    const next = new Date(target);
    next.setDate(next.getDate() + 1);

    const rows = await listAllRows(VISITOR_TABLE, 1000);
    const startMs = target.getTime();
    const endMs = next.getTime();
    const matches = rows
      .filter((r) => {
        if (!r.visitDate) return false;
        const t = new Date(r.visitDate).getTime();
        return t >= startMs && t < endMs;
      })
      .sort(
        (a, b) =>
          new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()
      );

    const visitors = await attachCreators(matches);
    sendSuccess(res, visitors, 'Visitors retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get visitors', error);
  }
}
