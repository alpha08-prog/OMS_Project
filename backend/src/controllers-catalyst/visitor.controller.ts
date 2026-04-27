
/**
 * Visitor controller — backed by Catalyst Data Store via the custom REST client.
 *
 * Mirrors backend/src/controllers/visitor.controller.ts (the Prisma version) so
 * the route layer can dispatch to either implementation via feature flag.
 *
 * Bypasses zcatalyst-sdk-node entirely (it has bugs in local-dev mode).
 * Uses our thin client at lib/catalyst-client.ts instead.
 *
 * Role-based access mirrors the Prisma controller:
 *   - STAFF:  only see/edit rows where createdById === their user id
 *   - ADMIN:  see/edit everything
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
import { getCachedTableList } from '../lib/catalyst-user-lookup';
import { useZCQL } from '../config/feature-flags';
import type { AuthenticatedRequest, VisitorFilters } from '../types';

const VISITOR_TABLE = 'Visitor';
const USER_TABLE = 'User';

/** Reshape a Catalyst row into the same JSON the Prisma controller returns. */
function shapeVisitor(
  row: CatalystRow,
  creator?: { id: string; name: string; email: string } | null
) {
  return {
    id: String(row.ROWID),
    name: row.name,
    designation: row.designation,
    phone: row.phone,
    dob: row.dob ?? null,
    purpose: row.purpose,
    referencedBy: row.referencedBy,
    visitDate: row.visitDate,
    createdById: row.createdById,
    createdAt: row.CREATEDTIME,
    updatedAt: row.MODIFIEDTIME,
    createdBy: creator ?? null,
  };
}

/**
 * Best-effort lookup of creator user info. Returns the rows shaped with the
 * createdBy block populated where possible. If the User table doesn't exist
 * in Catalyst yet (we haven't migrated it), createdBy stays null — acceptable
 * during the parallel-migration period.
 */
async function attachCreators(rows: CatalystRow[]): Promise<any[]> {
  // Guard against undefined entries — some Catalyst endpoints return shapes
  // we don't fully control.
  const safe = rows.filter((r): r is CatalystRow => Boolean(r));
  if (safe.length === 0) return [];
  const creatorIds = new Set(safe.map((r) => r.createdById).filter(Boolean));
  if (creatorIds.size === 0) return safe.map((r) => shapeVisitor(r));

  const byId = new Map<string, { id: string; name: string; email: string }>();
  try {
    const users = await getCachedTableList(USER_TABLE, 200);
    for (const u of users) {
      const id = String(u.ROWID);
      if (creatorIds.has(id)) {
        byId.set(id, { id, name: u.name, email: u.email });
      }
    }
  } catch {
    // User table may not exist yet — silently skip the join.
  }

  return safe.map((r) => shapeVisitor(r, byId.get(String(r.createdById)) ?? null));
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

    const { name, designation, phone, dob, purpose, referencedBy, visitDate } = req.body;

    const row = await insertRow(VISITOR_TABLE, {
      name,
      designation,
      phone,
      dob: toCatalystDate(dob),
      purpose,
      referencedBy,
      visitDate: toCatalystDate(visitDate) || toCatalystDate(new Date()),
      createdById: req.user.id,
    });

    const [shaped] = await attachCreators([row]);
    sendSuccess(res, shaped, 'Visitor logged successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to log visitor', error);
  }
}

/**
 * Build a ZCQL WHERE clause + ORDER BY for the visitor list. Returns the
 * full query so the caller can also append LIMIT/OFFSET.
 */
function buildVisitorZCQL(
  user: { id: string; role: string } | undefined,
  filters: VisitorFilters
): string {
  const conditions: string[] = [];

  if (user?.role === 'STAFF') {
    conditions.push(`createdById = '${zcqlEscapeValue(user.id)}'`);
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
    if (useZCQL()) {
      const baseQuery = buildVisitorZCQL(req.user, filters);
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
    if (req.user?.role === 'STAFF') {
      rows = rows.filter((r) => r.createdById === req.user!.id);
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

    if (req.user?.role === 'STAFF' && row.createdById !== req.user.id) {
      sendError(res, 'Forbidden', 403);
      return;
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
    const { name, designation, phone, dob, purpose, referencedBy, visitDate } = req.body;

    const updateData: Record<string, unknown> = { ROWID: id };
    if (name !== undefined) updateData.name = name;
    if (designation !== undefined) updateData.designation = designation;
    if (phone !== undefined) updateData.phone = phone;
    if (dob !== undefined) updateData.dob = toCatalystDate(dob);
    if (purpose !== undefined) updateData.purpose = purpose;
    if (referencedBy !== undefined) updateData.referencedBy = referencedBy;
    if (visitDate !== undefined) updateData.visitDate = toCatalystDate(visitDate);

    const updated = await updateRow(VISITOR_TABLE, updateData as any);
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
