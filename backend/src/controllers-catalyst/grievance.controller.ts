/**
 * Grievance controller — backed by Catalyst Data Store via the custom REST client.
 *
 * Mirrors backend/src/controllers/grievance.controller.ts (the Prisma version).
 *
 * Catalyst-specific notes:
 *   - 4 enums (GrievanceType, GrievanceStatus, ActionRequired, GrievanceStage)
 *     are stored as TEXT. Validation happens in this file.
 *   - Default values (status='OPEN', isVerified=false, isLocked=false,
 *     currentStage='RECEIVED', actionRequired='NO_ACTION') are applied at insert.
 *   - createdBy + verifiedBy joins are done by a second pass against the User
 *     table. If User table doesn't exist in Catalyst yet, those fields stay null.
 *   - Filtering is done in JS after a full table fetch. Acceptable while small;
 *     replace with ZCQL once that scope is enabled.
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
import { cacheClear } from '../lib/cache';
import { getCachedTableList } from '../lib/catalyst-user-lookup';
import { useZCQL } from '../config/feature-flags';
import type { AuthenticatedRequest, GrievanceFilters } from '../types';

const GRIEVANCE_TABLE = 'Grievance';
const USER_TABLE = 'User';

// Enum validation sets
const VALID_TYPES = new Set([
  'WATER',
  'ROAD',
  'POLICE',
  'HEALTH',
  'TRANSFER',
  'FINANCIAL_AID',
  'ELECTRICITY',
  'EDUCATION',
  'HOUSING',
  'OTHER',
]);
const VALID_STATUS = new Set(['OPEN', 'IN_PROGRESS', 'VERIFIED', 'RESOLVED', 'REJECTED']);
const VALID_ACTIONS = new Set([
  'GENERATE_LETTER',
  'CALL_OFFICIAL',
  'FORWARD_TO_DEPT',
  'SCHEDULE_MEETING',
  'NO_ACTION',
]);
const VALID_STAGES = new Set([
  'RECEIVED',
  'UNDER_REVIEW',
  'FORWARDED_TO_DEPT',
  'DEPT_PROCESSING',
  'AWAITING_RESPONSE',
  'RESPONSE_RECEIVED',
  'LETTER_GENERATED',
  'LETTER_SENT',
  'FOLLOW_UP',
  'COMPLETED',
  'CLOSED',
]);

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

/** Catalyst sometimes serialises Double columns as strings. Coerce to number. */
function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return isNaN(n) ? null : n;
}

function invalidateStatCaches() {
  cacheClear('dashboard_stats');
  cacheClear('stats_by_type');
  cacheClear('stats_by_status');
  cacheClear('stats_by_constituency');
}

/** Reshape a Catalyst row into the same JSON the Prisma controller returns. */
function shapeGrievance(
  row: CatalystRow,
  createdBy?: { id: string; name: string; email: string } | null,
  verifiedBy?: { id: string; name: string; email: string } | null
) {
  return {
    id: String(row.ROWID),
    petitionerName: row.petitionerName,
    mobileNumber: row.mobileNumber,
    constituency: row.constituency,
    grievanceType: row.grievanceType,
    description: row.description,
    monetaryValue: parseNumber(row.monetaryValue),
    actionRequired: row.actionRequired,
    letterTemplate: row.letterTemplate ?? null,
    referencedBy: row.referencedBy ?? null,
    status: row.status,
    isVerified: parseBool(row.isVerified),
    verifiedAt: row.verifiedAt ?? null,
    resolvedAt: row.resolvedAt ?? null,
    createdAt: row.CREATEDTIME,
    updatedAt: row.MODIFIEDTIME,
    createdById: row.createdById,
    verifiedById: row.verifiedById ?? null,
    currentStage: row.currentStage,
    isLocked: parseBool(row.isLocked),
    createdBy: createdBy ?? null,
    verifiedBy: verifiedBy ?? null,
  };
}

/**
 * For each grievance, attach the createdBy + verifiedBy user info.
 * Done in a single User-table fetch since these IDs are likely shared.
 */
async function attachUsers(rows: CatalystRow[]): Promise<any[]> {
  const safe = rows.filter((r): r is CatalystRow => Boolean(r));
  if (safe.length === 0) return [];

  const ids = new Set<string>();
  for (const r of safe) {
    if (r.createdById) ids.add(String(r.createdById));
    if (r.verifiedById) ids.add(String(r.verifiedById));
  }

  const byId = new Map<string, { id: string; name: string; email: string }>();
  if (ids.size > 0) {
    try {
      const users = await getCachedTableList(USER_TABLE);
      for (const u of users) {
        const id = String(u.ROWID);
        if (ids.has(id)) byId.set(id, { id, name: u.name, email: u.email });
      }
    } catch {
      // User table may not exist in Catalyst yet — skip the join.
    }
  }

  return safe.map((r) =>
    shapeGrievance(
      r,
      byId.get(String(r.createdById)) ?? null,
      r.verifiedById ? byId.get(String(r.verifiedById)) ?? null : null
    )
  );
}

/**
 * POST /api/grievances
 */
export async function createGrievance(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const {
      petitionerName,
      mobileNumber,
      constituency,
      grievanceType,
      description,
      monetaryValue,
      actionRequired,
      letterTemplate,
      referencedBy,
    } = req.body;

    if (!VALID_TYPES.has(grievanceType)) {
      sendError(res, `Invalid grievanceType: ${grievanceType}`);
      return;
    }
    const action = actionRequired || 'NO_ACTION';
    if (!VALID_ACTIONS.has(action)) {
      sendError(res, `Invalid actionRequired: ${actionRequired}`);
      return;
    }

    const row = await insertRow(GRIEVANCE_TABLE, {
      petitionerName,
      mobileNumber,
      constituency,
      grievanceType,
      description,
      monetaryValue:
        monetaryValue !== undefined && monetaryValue !== null && monetaryValue !== ''
          ? Number(monetaryValue)
          : null,
      actionRequired: action,
      letterTemplate: letterTemplate ?? null,
      referencedBy: referencedBy ?? null,
      status: 'OPEN',
      // Schema confirms isVerified / isLocked are Catalyst boolean columns —
      // send real JS booleans, not strings.
      isVerified: false,
      verifiedAt: null,
      resolvedAt: null,
      createdById: req.user.id,
      verifiedById: null,
      currentStage: 'RECEIVED',
      isLocked: false,
    });

    invalidateStatCaches();
    const [shaped] = await attachUsers([row]);
    sendSuccess(res, shaped, 'Grievance created successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to create grievance', error);
  }
}

/** Build a ZCQL WHERE clause + ORDER BY for the grievance list. */
function buildGrievanceZCQL(
  user: { id: string; role: string } | undefined,
  filters: GrievanceFilters
): string {
  const conditions: string[] = [];

  if (user?.role === 'STAFF') {
    conditions.push(`createdById = '${zcqlEscapeValue(user.id)}'`);
  }

  if (filters.status) {
    conditions.push(`status = '${zcqlEscapeValue(String(filters.status))}'`);
  }
  if (filters.isVerified !== undefined) {
    // Catalyst stores booleans as strings ('true'/'false') — match that.
    const want = String(filters.isVerified) === 'true' ? 'true' : 'false';
    conditions.push(`isVerified = '${want}'`);
  }
  if (filters.grievanceType) {
    conditions.push(
      `grievanceType = '${zcqlEscapeValue(String(filters.grievanceType))}'`
    );
  }
  if (filters.constituency) {
    const q = zcqlEscapeValue(String(filters.constituency));
    conditions.push(`constituency LIKE '%${q}%'`);
  }
  if (filters.search) {
    const q = zcqlEscapeValue(String(filters.search));
    conditions.push(
      `(petitionerName LIKE '%${q}%' OR mobileNumber LIKE '%${q}%' OR description LIKE '%${q}%')`
    );
  }
  if (filters.startDate) {
    const start = toCatalystDate(filters.startDate as unknown as string);
    if (start) conditions.push(`CREATEDTIME >= '${start}'`);
  }
  if (filters.endDate) {
    const end = toCatalystDate(filters.endDate as unknown as string);
    if (end) conditions.push(`CREATEDTIME <= '${end}'`);
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  return `SELECT * FROM ${GRIEVANCE_TABLE}${where} ORDER BY CREATEDTIME DESC`;
}

/**
 * GET /api/grievances
 *
 * Two paths controlled by the USE_ZCQL master flag:
 *   - true:  ZCQL pushes filter / sort / pagination to Catalyst
 *   - false: list everything, filter in JS (legacy fallback)
 */
export async function getGrievances(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );
    const filters = req.query as GrievanceFilters;
    if (useZCQL()) {
      const baseQuery = buildGrievanceZCQL(req.user, filters);
      // Catalyst ZCQL caps LIMIT at 300; +1 for hasMore probe → user limit ≤ 299.
      const safeLimit = zcqlSafeLimit(limit);
      const pagedQuery = `${baseQuery} LIMIT ${safeLimit + 1} OFFSET ${skip}`;
      const fetched = await executeZCQL<CatalystRow>(pagedQuery);
      const hasMore = fetched.length > safeLimit;
      const pageRows = hasMore ? fetched.slice(0, safeLimit) : fetched;
      const grievances = await attachUsers(pageRows);
      const total = skip + pageRows.length + (hasMore ? 1 : 0);
      const meta = calculatePaginationMeta(total, page, safeLimit);
      sendSuccess(res, grievances, 'Grievances retrieved successfully', 200, meta);
      return;
    }

    // ── Fallback path: list everything, filter in JS ────────────────────
    let rows = await listAllRows(GRIEVANCE_TABLE);

    // STAFF data isolation
    if (req.user?.role === 'STAFF') {
      rows = rows.filter((r) => r.createdById === req.user!.id);
    }

    if (filters.status) {
      rows = rows.filter((r) => r.status === filters.status);
    }
    if (filters.isVerified !== undefined) {
      const want = String(filters.isVerified) === 'true';
      rows = rows.filter((r) => Boolean(r.isVerified) === want);
    }
    if (filters.grievanceType) {
      rows = rows.filter((r) => r.grievanceType === filters.grievanceType);
    }
    if (filters.constituency) {
      const q = String(filters.constituency).toLowerCase();
      rows = rows.filter((r) => (r.constituency || '').toLowerCase().includes(q));
    }
    if (filters.search) {
      const q = String(filters.search).toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.petitionerName || '').toLowerCase().includes(q) ||
          (r.mobileNumber || '').includes(q) ||
          (r.description || '').toLowerCase().includes(q)
      );
    }
    if (filters.startDate) {
      const start = new Date(filters.startDate as unknown as string).getTime();
      rows = rows.filter(
        (r) => r.CREATEDTIME && new Date(r.CREATEDTIME).getTime() >= start
      );
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate as unknown as string).getTime();
      rows = rows.filter(
        (r) => r.CREATEDTIME && new Date(r.CREATEDTIME).getTime() <= end
      );
    }

    rows.sort((a, b) => {
      const ta = a.CREATEDTIME ? new Date(a.CREATEDTIME).getTime() : 0;
      const tb = b.CREATEDTIME ? new Date(b.CREATEDTIME).getTime() : 0;
      return tb - ta;
    });

    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    const grievances = await attachUsers(paged);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, grievances, 'Grievances retrieved successfully', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get grievances', error);
  }
}

/**
 * GET /api/grievances/:id
 */
export async function getGrievanceById(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const row = await getRow(GRIEVANCE_TABLE, id);
    if (!row) {
      sendNotFound(res, 'Grievance not found');
      return;
    }

    if (req.user?.role === 'STAFF' && row.createdById !== req.user.id) {
      sendError(res, 'Forbidden', 403);
      return;
    }

    const [shaped] = await attachUsers([row]);
    sendSuccess(res, shaped, 'Grievance retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get grievance', error);
  }
}

/**
 * PUT /api/grievances/:id
 *
 * Excludes immutable fields (id, createdById, createdAt) — same as Prisma version.
 */
export async function updateGrievance(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const body = { ...req.body };
    // Strip immutable fields
    delete body.id;
    delete body.createdById;
    delete body.createdAt;
    delete body.updatedAt;
    delete body.ROWID;
    delete body.CREATEDTIME;
    delete body.MODIFIEDTIME;
    delete body.CREATORID;

    if (body.grievanceType && !VALID_TYPES.has(body.grievanceType)) {
      sendError(res, `Invalid grievanceType: ${body.grievanceType}`);
      return;
    }
    if (body.status && !VALID_STATUS.has(body.status)) {
      sendError(res, `Invalid status: ${body.status}`);
      return;
    }
    if (body.actionRequired && !VALID_ACTIONS.has(body.actionRequired)) {
      sendError(res, `Invalid actionRequired: ${body.actionRequired}`);
      return;
    }
    if (body.currentStage && !VALID_STAGES.has(body.currentStage)) {
      sendError(res, `Invalid currentStage: ${body.currentStage}`);
      return;
    }

    if (body.monetaryValue !== undefined) {
      body.monetaryValue =
        body.monetaryValue === null || body.monetaryValue === ''
          ? null
          : Number(body.monetaryValue);
    }
    if (body.verifiedAt !== undefined) body.verifiedAt = toCatalystDate(body.verifiedAt);
    if (body.resolvedAt !== undefined) body.resolvedAt = toCatalystDate(body.resolvedAt);

    const updated = await updateRow(GRIEVANCE_TABLE, { ROWID: id, ...body });
    const [shaped] = await attachUsers([updated]);
    sendSuccess(res, shaped, 'Grievance updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update grievance', error);
  }
}

/**
 * PATCH /api/grievances/:id/verify
 * Admin-only. Marks the grievance verified + RESOLVED, stamps verifiedBy/At.
 */
export async function verifyGrievance(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const { id } = req.params;
    const now = new Date();
    const updated = await updateRow(GRIEVANCE_TABLE, {
      ROWID: id,
      isVerified: true,
      status: 'RESOLVED',
      verifiedById: req.user.id,
      verifiedAt: toCatalystDate(now),
      resolvedAt: toCatalystDate(now),
    });
    invalidateStatCaches();
    const [shaped] = await attachUsers([updated]);
    sendSuccess(res, shaped, 'Grievance verified and resolved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to verify grievance', error);
  }
}

/**
 * PATCH /api/grievances/:id/status
 */
export async function updateGrievanceStatus(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!VALID_STATUS.has(status)) {
      sendError(res, `Invalid status: ${status}`);
      return;
    }
    const updateData: Record<string, unknown> = { ROWID: id, status };
    if (status === 'RESOLVED') {
      updateData.resolvedAt = toCatalystDate(new Date());
    }
    const updated = await updateRow(GRIEVANCE_TABLE, updateData as any);
    invalidateStatCaches();
    const [shaped] = await attachUsers([updated]);
    sendSuccess(res, shaped, 'Grievance status updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update grievance status', error);
  }
}

/**
 * DELETE /api/grievances/:id
 */
export async function deleteGrievance(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    await deleteRow(GRIEVANCE_TABLE, id);
    invalidateStatCaches();
    sendSuccess(res, null, 'Grievance deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete grievance', error);
  }
}

/**
 * GET /api/grievances/queue/verification
 * Admin-only. Returns OPEN + unverified grievances in FIFO order.
 */
export async function getVerificationQueue(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );

    let rows = await listAllRows(GRIEVANCE_TABLE);
    rows = rows.filter(
      (r) => r.status === 'OPEN' && Boolean(r.isVerified) === false
    );
    rows.sort((a, b) => {
      const ta = a.CREATEDTIME ? new Date(a.CREATEDTIME).getTime() : 0;
      const tb = b.CREATEDTIME ? new Date(b.CREATEDTIME).getTime() : 0;
      return ta - tb; // FIFO: oldest first
    });

    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    const grievances = await attachUsers(paged);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, grievances, 'Verification queue retrieved', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get verification queue', error);
  }
}
