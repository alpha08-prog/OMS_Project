/**
 * Grievance controller — backed by Catalyst Data Store via the custom REST client.
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
  nowCatalystIST,
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
import { lookupUsers } from '../lib/catalyst-user-lookup';
import { useZCQL } from '../config/feature-flags';
import { emitNotification } from './notification.controller';
import { autoCreateSelfTask } from './task.controller';
import type { AuthenticatedRequest, GrievanceFilters } from '../types';

const GRIEVANCE_TABLE = 'Grievance';

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
  // Newer categories — must match the frontend dropdown values exactly.
  'Revenue',
  'RDPR',
  'Railway',
  'Agriculture',
  'Job',
  'TEMPLE_VISIT',
  'OTHER',
]);
const VALID_TEMPLE_SERVICES = new Set([
  'SPECIAL_DARSHAN',
  'DARSHAN',
  'SPARSH_DARSHAN',
  'MANGALARATI',
  'BHASMARATI',
  'POOJA',
  'ACCOMMODATION',
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
const VALID_PRIORITY = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const VALID_SOURCE = new Set(['PUBLIC', 'OFFICE']);

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
  cacheClear('stats_monetization');
}

/** Reshape a Catalyst row into the JSON shape the frontend expects. */
function shapeGrievance(
  row: CatalystRow,
  createdBy?: { id: string; name: string; email: string } | null,
  verifiedBy?: { id: string; name: string; email: string } | null,
  lastEditedBy?: { id: string; name: string; email: string } | null
) {
  return {
    id: String(row.ROWID),
    // Human-friendly reference: prefer the stored short sequential number
    // (GRV-YYYY-NNNN); fall back to the ROWID form for legacy rows / before the
    // grievanceNumber column exists. Searchable + used for the progress timeline.
    referenceNo: row.grievanceNumber
      ? String(row.grievanceNumber)
      : `GRV-${String(row.ROWID)}`,
    petitionerName: row.petitionerName,
    mobileNumber: row.mobileNumber,
    constituency: row.constituency,
    wardVillage: row.wardVillage ?? null,
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
    // Legacy rows pre-date these columns; default at the read layer so
    // the frontend can treat them as ('MEDIUM' / 'PUBLIC') without nulls.
    priority: (row.priorities as string) ?? 'MEDIUM',
    source: (row.source as string) ?? 'PUBLIC',
    // Temple-visit fields — present only when grievanceType === 'TEMPLE_VISIT'.
    // All optional, so legacy rows return null here.
    templeKey: row.templeKey ?? null,
    templeRecipient: row.templeRecipient ?? null,
    memberCount:
      row.memberCount === null || row.memberCount === undefined || row.memberCount === ''
        ? null
        : Number(row.memberCount),
    originDistrict: row.originDistrict ?? null,
    originState: row.originState ?? null,
    visitDateFrom: row.visitDateFrom ?? null,
    visitDateTo: row.visitDateTo ?? null,
    servicesRequested: parseServicesRequested(row.servicesRequested),
    showMobileOnLetter: parseBool(row.showMobileOnLetter),
    createdBy: createdBy ?? null,
    verifiedBy: verifiedBy ?? null,
    // Edit audit — who last edited this grievance and when (security trail).
    lastEditedById: row.lastEditedById ?? null,
    lastEditedAt: row.lastEditedAt ?? null,
    lastEditedBy: lastEditedBy ?? null,
  };
}

/** servicesRequested stores as comma-separated TEXT — split + trim on read. */
function parseServicesRequested(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  if (typeof v !== 'string' || !v.trim()) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Normalise an inbound servicesRequested array. Predefined codes are
 * uppercased and validated against VALID_TEMPLE_SERVICES; any entry that
 * begins with "OTHER:" is treated as freeform staff text and preserved
 * (with internal commas stripped, since storage is comma-separated).
 */
function normalizeServicesRequested(
  input: unknown[]
): { values: string[]; error?: string } {
  const out: string[] = [];
  for (const raw of input) {
    const t = String(raw).trim();
    if (!t) continue;
    const colon = t.indexOf(':');
    if (colon > 0 && t.slice(0, colon).toUpperCase() === 'OTHER') {
      const note = t.slice(colon + 1).trim().replace(/,/g, ' ');
      if (note) out.push(`OTHER:${note}`);
      continue;
    }
    const upper = t.toUpperCase();
    if (!VALID_TEMPLE_SERVICES.has(upper)) {
      return { values: [], error: `Invalid temple service: ${upper}` };
    }
    out.push(upper);
  }
  return { values: out };
}

/**
 * For each grievance, attach the createdBy + verifiedBy user info.
 * Resolved via lookupUsers, which queries the AppUser table and handles both
 * Catalyst ROWIDs and legacy UUID ids (createdById can be either form).
 */
async function attachUsers(rows: CatalystRow[]): Promise<any[]> {
  const safe = rows.filter((r): r is CatalystRow => Boolean(r));
  if (safe.length === 0) return [];

  const ids = new Set<string>();
  for (const r of safe) {
    if (r.createdById) ids.add(String(r.createdById));
    if (r.verifiedById) ids.add(String(r.verifiedById));
    if (r.lastEditedById) ids.add(String(r.lastEditedById));
  }

  let byId = new Map<string, { id: string; name: string; email: string }>();
  if (ids.size > 0) {
    try {
      byId = await lookupUsers(ids);
    } catch {
      // AppUser unreachable — leave creator/verifier/editor null.
    }
  }

  return safe.map((r) =>
    shapeGrievance(
      r,
      (r.createdById && byId.get(String(r.createdById))) || null,
      (r.verifiedById && byId.get(String(r.verifiedById))) || null,
      (r.lastEditedById && byId.get(String(r.lastEditedById))) || null
    )
  );
}

/**
 * POST /api/grievances
 */
/**
 * Best-effort sequential reference number: GRV-<IST year>-NNNN. Scans existing
 * grievanceNumber values for the current year and returns max+1. Not
 * transaction-safe — adequate for office-scale concurrency.
 */
async function nextGrievanceNumber(): Promise<string> {
  const istYear = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCFullYear();
  const prefix = `GRV-${istYear}-`;
  let maxSeq = 0;
  try {
    const rows = await listAllRows(GRIEVANCE_TABLE);
    for (const r of rows) {
      const num = String(r.grievanceNumber ?? '');
      if (num.startsWith(prefix)) {
        const seq = parseInt(num.slice(prefix.length), 10);
        if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
      }
    }
  } catch {
    /* table unreadable — fall back to 1 */
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

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
      wardVillage,
      grievanceType,
      description,
      monetaryValue,
      actionRequired,
      letterTemplate,
      referencedBy,
      priority,
      source,
      // Temple-visit specific (optional for every other grievanceType).
      templeKey,
      templeRecipient,
      memberCount,
      originDistrict,
      originState,
      visitDateFrom,
      visitDateTo,
      servicesRequested,
      showMobileOnLetter,
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
    const finalPriority = priority || 'MEDIUM';
    if (!VALID_PRIORITY.has(finalPriority)) {
      sendError(res, `Invalid priority: ${priority}`);
      return;
    }
    const finalSource = source || 'PUBLIC';
    if (!VALID_SOURCE.has(finalSource)) {
      sendError(res, `Invalid source: ${source}`);
      return;
    }

    const grievancePayload: Record<string, unknown> = {
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
      // `priority` is a Catalyst reserved keyword, so the column is named
      // `priorities`. Translate frontend `priority` -> stored `priorities`.
      priorities: finalPriority,
      source: finalSource,
    };
    if (typeof wardVillage === 'string' && wardVillage.trim()) {
      grievancePayload.wardVillage = wardVillage.trim();
    }

    // Temple-visit fields — only persisted when the staff actually supplied
    // them. We validate enum-ish fields here so an invalid value never reaches
    // Catalyst, but we don't require them for TEMPLE_VISIT (the staff can
    // also save a draft and fill these in later via PUT /grievances/:id).
    if (grievanceType === 'TEMPLE_VISIT' || templeKey) {
      if (templeKey) grievancePayload.templeKey = String(templeKey).trim();
      if (typeof templeRecipient === 'string' && templeRecipient.trim()) {
        // Multi-line address block — newline-separated. Used by the PDF
        // generator when the templeKey is outside the static registry.
        grievancePayload.templeRecipient = templeRecipient.trim();
      }
      if (memberCount !== undefined && memberCount !== null && memberCount !== '') {
        const n = Number(memberCount);
        if (!Number.isInteger(n) || n < 1) {
          sendError(res, 'memberCount must be a positive integer');
          return;
        }
        grievancePayload.memberCount = n;
      }
      if (typeof originDistrict === 'string' && originDistrict.trim()) {
        grievancePayload.originDistrict = originDistrict.trim();
      }
      if (typeof originState === 'string' && originState.trim()) {
        grievancePayload.originState = originState.trim();
      }
      if (visitDateFrom) {
        const v = toCatalystDate(visitDateFrom);
        if (v) grievancePayload.visitDateFrom = v;
      }
      if (visitDateTo) {
        const v = toCatalystDate(visitDateTo);
        if (v) grievancePayload.visitDateTo = v;
      }
      if (Array.isArray(servicesRequested) && servicesRequested.length > 0) {
        const clean = normalizeServicesRequested(servicesRequested);
        if (clean.error) {
          sendError(res, clean.error);
          return;
        }
        if (clean.values.length > 0) {
          grievancePayload.servicesRequested = clean.values.join(',');
        }
      }
      if (showMobileOnLetter !== undefined) {
        grievancePayload.showMobileOnLetter = Boolean(showMobileOnLetter);
      }
    }

    const row = await insertRow(GRIEVANCE_TABLE, grievancePayload);

    // Assign a short sequential reference number (GRV-YYYY-NNNN). Done as a
    // separate best-effort update so creation still succeeds if the
    // `grievanceNumber` column isn't in Catalyst yet — the reference then falls
    // back to the ROWID form at the read layer until the column is added.
    try {
      const grievanceNumber = await nextGrievanceNumber();
      await updateRow(GRIEVANCE_TABLE, { ROWID: String(row.ROWID), grievanceNumber });
      row.grievanceNumber = grievanceNumber;
    } catch (err) {
      console.warn('[grievance] Could not assign grievanceNumber (column missing?)', err);
    }

    // Auto self-assign: the grievance immediately becomes a task owned by its
    // creator (no admin verification/assignment step) so it surfaces on the
    // shared Tasks board. Best-effort — never fails the grievance creation.
    const refNo = row.grievanceNumber
      ? String(row.grievanceNumber)
      : `GRV-${String(row.ROWID)}`;
    await autoCreateSelfTask({
      userId: req.user.id,
      // Reference number in the title so the grievance is findable by id on the
      // shared All Tasks board (its search matches the title).
      title: `Grievance ${refNo}: ${grievanceType} - ${petitionerName}`,
      taskType: 'GRIEVANCE',
      referenceId: String(row.ROWID),
      referenceType: 'GRIEVANCE',
      priority: finalPriority === 'CRITICAL' || finalPriority === 'HIGH' ? 'HIGH' : 'NORMAL',
      description: typeof description === 'string' ? description.slice(0, 500) : null,
      // Both PUBLIC and OFFICE grievances self-assign to their creator. OFFICE
      // ones surface on the admin Office Tasks page (admin-managed, editable by
      // admins only); PUBLIC ones go to the shared "All Tasks" board.
      source: finalSource,
    });

    invalidateStatCaches();
    const [shaped] = await attachUsers([row]);
    sendSuccess(res, shaped, 'Grievance created successfully', 201);
  } catch (error) {
    // Pass through the underlying Catalyst error message — invaluable when a
    // missing/misnamed column or invalid type is the cause. Without this the
    // staff only sees "Failed to create grievance" while the real reason is
    // buried in the server console.
    const msg =
      error instanceof Error && error.message
        ? `Failed to create grievance: ${error.message}`
        : 'Failed to create grievance';
    sendServerError(res, msg, error);
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
  if (filters.priority) {
    // Catalyst column is `priorities` (priority is a reserved keyword).
    conditions.push(`priorities = '${zcqlEscapeValue(String(filters.priority))}'`);
  }
  if (filters.source) {
    conditions.push(`source = '${zcqlEscapeValue(String(filters.source))}'`);
  }
  if (filters.constituency) {
    const q = zcqlEscapeValue(String(filters.constituency));
    conditions.push(`constituency LIKE '%${q}%'`);
  }
  if (filters.search) {
    const raw = String(filters.search).trim();
    const q = zcqlEscapeValue(raw);
    const clauses = [
      `petitionerName LIKE '%${q}%'`,
      `mobileNumber LIKE '%${q}%'`,
      `description LIKE '%${q}%'`,
      `grievanceNumber LIKE '%${q}%'`,
      `constituency LIKE '%${q}%'`,
      `wardVillage LIKE '%${q}%'`,
      `grievanceType LIKE '%${q}%'`,
    ];
    // Legacy "GRV-<rowid>" reference → match the ROWID directly.
    const m = raw.match(/^GRV-(\d+)$/i);
    if (m) clauses.push(`ROWID = ${m[1]}`);
    conditions.push(`(${clauses.join(' OR ')})`);
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
    // Free-text search (incl. reference number / GRV-<rowid>) always runs through
    // the JS path: it reliably matches grievanceNumber + ROWID and scans the
    // whole table, sidestepping ZCQL LIKE/ROWID quirks. ZCQL still handles the
    // common filtered/sorted list when there's no search term.
    if (useZCQL() && !filters.search) {
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
    if (filters.priority) {
      rows = rows.filter((r) => r.priorities === filters.priority);
    }
    if (filters.source) {
      rows = rows.filter((r) => r.source === filters.source);
    }
    if (filters.constituency) {
      const q = String(filters.constituency).toLowerCase();
      rows = rows.filter((r) => (r.constituency || '').toLowerCase().includes(q));
    }
    if (filters.search) {
      const raw = String(filters.search).trim();
      const q = raw.toLowerCase();
      // A "GRV-<rowid>" or bare "<rowid>" search → the digits to match on the
      // ROWID directly. This finds a grievance by its ROWID-based reference even
      // when it also has a sequential grievanceNumber. 6+ digits so short
      // numeric searches aren't mistaken for a ROWID.
      const rowidMatch = raw.match(/^(?:GRV-)?(\d{6,})$/i);
      rows = rows.filter((r) => {
        // The SAME human reference the UI shows: the sequential grievanceNumber
        // (GRV-YYYY-NNNN) when present, else the ROWID fallback (GRV-<rowid>).
        // `includes` means pasting any displayed reference — full or partial —
        // finds the row.
        const refNo = (r.grievanceNumber
          ? String(r.grievanceNumber)
          : `GRV-${String(r.ROWID)}`
        ).toLowerCase();
        return (
          (r.petitionerName || '').toLowerCase().includes(q) ||
          (r.mobileNumber || '').includes(q) ||
          (r.description || '').toLowerCase().includes(q) ||
          (r.constituency || '').toLowerCase().includes(q) ||
          (r.wardVillage || '').toLowerCase().includes(q) ||
          (r.grievanceType || '').toLowerCase().includes(q) ||
          refNo.includes(q) ||
          (rowidMatch ? String(r.ROWID) === rowidMatch[1] : false)
        );
      });
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
 * Excludes immutable fields (id, createdById, createdAt).
 */
export async function updateGrievance(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    // Office grievances are admin-managed (Office Tasks page) — staff cannot
    // edit them, even by calling this endpoint directly. Admins/Super Admins
    // are unaffected. PUBLIC grievances stay editable by their creator.
    if (req.user?.role === 'STAFF') {
      const existing = await getRow(GRIEVANCE_TABLE, id);
      if (
        existing &&
        String(existing.source ?? 'PUBLIC').toUpperCase() === 'OFFICE'
      ) {
        sendError(res, 'Office grievances can only be edited by an admin', 403);
        return;
      }
    }

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
    // Derived/immutable: referenceNo is not a column; grievanceNumber is fixed.
    delete body.referenceNo;
    delete body.grievanceNumber;

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

    // Temple-visit fields — validate when present so PUT can't store junk.
    if (body.memberCount !== undefined && body.memberCount !== null && body.memberCount !== '') {
      const n = Number(body.memberCount);
      if (!Number.isInteger(n) || n < 1) {
        sendError(res, 'memberCount must be a positive integer');
        return;
      }
      body.memberCount = n;
    }
    if (body.visitDateFrom !== undefined) body.visitDateFrom = toCatalystDate(body.visitDateFrom);
    if (body.visitDateTo !== undefined) body.visitDateTo = toCatalystDate(body.visitDateTo);
    if (Array.isArray(body.servicesRequested)) {
      const clean = normalizeServicesRequested(body.servicesRequested);
      if (clean.error) {
        sendError(res, clean.error);
        return;
      }
      body.servicesRequested = clean.values.join(',');
    }
    if (body.showMobileOnLetter !== undefined) {
      body.showMobileOnLetter = Boolean(body.showMobileOnLetter);
    }

    // Edit audit — stamp who edited and when. Never let the client override it.
    if (req.user) {
      body.lastEditedById = req.user.id;
      body.lastEditedAt = nowCatalystIST();
    }

    const updated = await updateRow(GRIEVANCE_TABLE, { ROWID: id, ...body });
    invalidateStatCaches();
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
    const now = nowCatalystIST();
    const updated = await updateRow(GRIEVANCE_TABLE, {
      ROWID: id,
      isVerified: true,
      status: 'RESOLVED',
      verifiedById: req.user.id,
      verifiedAt: now,
      resolvedAt: now,
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
    const { status, reason } = req.body as { status: string; reason?: string };
    if (!VALID_STATUS.has(status)) {
      sendError(res, `Invalid status: ${status}`);
      return;
    }
    // Pull the existing row before updating so we know who created the
    // grievance — needed to notify them on REJECTED.
    const existing = await getRow(GRIEVANCE_TABLE, id);
    const updateData: Record<string, unknown> = { ROWID: id, status };
    if (status === 'RESOLVED') {
      updateData.resolvedAt = nowCatalystIST();
    }
    // Reopening — wipe the resolved/closed bookkeeping so the row reads as
    // genuinely open again (resolvedAt cleared, stage rewound).
    if (status === 'OPEN') {
      updateData.resolvedAt = null;
      updateData.currentStage = 'RECEIVED';
    }
    const updated = await updateRow(GRIEVANCE_TABLE, updateData as any);
    invalidateStatCaches();

    // Notify the submitting staff member when their grievance is rejected.
    // Best-effort — emitNotification swallows its own errors.
    if (status === 'REJECTED' && existing?.createdById) {
      const petitioner = String(existing.petitionerName ?? 'a petitioner');
      const trimmedReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
      const body = trimmedReason
        ? `Your grievance for "${petitioner}" was rejected by an admin. Reason: ${trimmedReason}`
        : `Your grievance for "${petitioner}" was rejected by an admin.`;
      void emitNotification({
        recipientId: String(existing.createdById),
        type: 'GRIEVANCE_REJECTED',
        title: 'Grievance rejected',
        body,
        // Deep-link to the specific grievance — GrievanceView opens the
        // details dialog when ?id=<row> is present.
        link: `/grievances/view?id=${encodeURIComponent(String(id))}`,
        referenceId: String(id),
        referenceType: 'GRIEVANCE',
      });
    }

    const [shaped] = await attachUsers([updated]);
    sendSuccess(res, shaped, 'Grievance status updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update grievance status', error);
  }
}

/**
 * GET /api/grievances/:id/timeline
 *
 * Progress timeline for a single grievance — created + edited events plus every
 * remark/status update recorded on its linked task(s) (TaskHistory). Lets a
 * user search a reference number and see the full history of that grievance.
 */
export async function getGrievanceTimeline(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const grievance = await getRow(GRIEVANCE_TABLE, id);
    if (!grievance) {
      sendNotFound(res, 'Grievance not found');
      return;
    }

    type Event = {
      at: string | null;
      byId: string | null;
      by: string | null;
      type: 'CREATED' | 'EDITED' | 'REMARK';
      note: string;
      status: string | null;
    };
    const events: Event[] = [];

    events.push({
      at: grievance.CREATEDTIME ?? null,
      byId: grievance.createdById ? String(grievance.createdById) : null,
      by: null,
      type: 'CREATED',
      note: 'Grievance created',
      status: grievance.status ?? null,
    });
    if (grievance.lastEditedAt) {
      events.push({
        at: String(grievance.lastEditedAt),
        byId: grievance.lastEditedById ? String(grievance.lastEditedById) : null,
        by: null,
        type: 'EDITED',
        note: 'Grievance edited',
        status: grievance.status ?? null,
      });
    }

    // Linked task(s) → their TaskHistory entries (remarks / status changes).
    let taskRows: CatalystRow[] = [];
    try {
      taskRows = await executeZCQL<CatalystRow>(
        `SELECT * FROM Task WHERE referenceId = '${zcqlEscapeValue(id)}'`
      );
    } catch {
      taskRows = [];
    }
    const taskIds = new Set(taskRows.map((t) => String(t.ROWID)));
    if (taskIds.size > 0) {
      try {
        const history = await listAllRows('TaskHistory');
        for (const h of history) {
          if (!h.taskId || !taskIds.has(String(h.taskId))) continue;
          events.push({
            at: h.CREATEDTIME ?? null,
            byId: h.createdById ? String(h.createdById) : null,
            by: null,
            type: 'REMARK',
            note: String(h.note ?? ''),
            status: h.status ? String(h.status) : null,
          });
        }
      } catch {
        /* TaskHistory table missing — skip */
      }
    }

    // Resolve actor names in one batch.
    const ids = new Set<string>();
    for (const e of events) if (e.byId) ids.add(e.byId);
    const users = ids.size ? await lookupUsers(ids) : new Map();
    for (const e of events) e.by = e.byId ? users.get(e.byId)?.name ?? null : null;

    events.sort((a, b) => {
      const ta = a.at ? new Date(a.at).getTime() : 0;
      const tb = b.at ? new Date(b.at).getTime() : 0;
      return ta - tb;
    });

    sendSuccess(
      res,
      {
        referenceNo: grievance.grievanceNumber
          ? String(grievance.grievanceNumber)
          : `GRV-${String(grievance.ROWID)}`,
        status: grievance.status ?? null,
        timeline: events,
      },
      'Grievance timeline retrieved'
    );
  } catch (error) {
    sendServerError(res, 'Failed to get grievance timeline', error);
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
    // TEMPLE_VISIT is a self-service flow — staff generate the darshan letter
    // directly, which closes the grievance. They bypass admin verification
    // entirely, so they should not appear in this queue.
    rows = rows.filter(
      (r) =>
        r.status === 'OPEN' &&
        Boolean(r.isVerified) === false &&
        r.grievanceType !== 'TEMPLE_VISIT'
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
