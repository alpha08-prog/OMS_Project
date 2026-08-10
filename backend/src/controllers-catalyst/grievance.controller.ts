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
  updateRowTolerant,
  deleteRow,
  toCatalystDate,
  nowCatalystIST,
  executeZCQL,
  zcqlEscapeValue,
  zcqlAnyOf,
  zcqlLike,
  // zcqlSafeLimit is deliberately NOT used here: it clamps silently, and the
  // list contract allows limit=1000 (GrievanceView asks for exactly that).
  // assertZcqlLimit + chunking serve the window the caller asked for instead.
  assertZcqlLimit,
  countRows,
  fetchOffsetWindow,
  dateRangeClauses,
  countZcqlConditions,
  zcqlSearchWithinBudget,
  fetchChildrenByParentIds,
  MAX_ZCQL_CONDITIONS,
  ZCQL_MAX_LIMIT,
  CatalystRow,
} from '../lib/catalyst-client';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendServerError,
} from '../utils/response';
import { parsePagination, calculatePaginationMeta } from '../utils/pagination';
import { cacheClear, cacheSWR } from '../lib/cache';
import { lookupUsers, getUserIdAliases } from '../lib/catalyst-user-lookup';
import {
  keysetPredicate,
  keysetOrderBy,
  encodeCursor,
  decodeCursor,
} from '../lib/keyset';
import { parseKeysetQuery } from '../utils/keyset-query';
import { useZCQL } from '../config/feature-flags';
import { emitNotification } from './notification.controller';
import { autoCreateSelfTask } from './task.controller';
import { syncTasksForGrievance } from '../lib/grievance-task-sync';
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
  'MP_LAD',
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
  // The list total is cached per-predicate (see getGrievances); any write
  // changes it, so drop it here rather than serving a count that disagrees
  // with the rows on screen for up to two minutes.
  cacheClear('grievance:count');
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
 * Best-effort sequential reference number: GRV-<IST year>-NNNN. Returns max+1
 * for the current year. Still NOT transaction-safe — pre-existing, and
 * adequate for office-scale concurrency.
 *
 * One query, not a full-table scan: the sequence is zero-padded to 4 digits, so
 * lexical DESC equals numeric DESC up to 9999 and the highest existing number
 * is the first row. Previously this read EVERY grievance on every create —
 * i.e. the cost of filing grievance N was proportional to the N-1 before it.
 */
async function nextGrievanceNumber(): Promise<string> {
  const istYear = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCFullYear();
  const prefix = `GRV-${istYear}-`;
  let maxSeq = 0;
  try {
    const rows = await executeZCQL<CatalystRow>(
      `SELECT grievanceNumber FROM ${GRIEVANCE_TABLE} ` +
        `WHERE ${zcqlLike('grievanceNumber', prefix, 'prefix')} ` +
        `ORDER BY grievanceNumber DESC LIMIT 1`
    );
    const num = String(rows[0]?.grievanceNumber ?? '');
    if (num.startsWith(prefix)) {
      const seq = parseInt(num.slice(prefix.length), 10);
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
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

/**
 * The "GRV-<rowid>" / bare-ROWID search shape, recognised identically by the
 * ZCQL branch and the JS fallback. 6+ digits so a short numeric search (a
 * partial mobile number, say) isn't mistaken for a ROWID.
 */
const ROWID_SEARCH = /^(?:GRV-)?(\d{6,})$/i;

/**
 * WHERE clauses only — no ORDER BY, no LIMIT. Kept separate so the page query
 * and the COUNT query are built from the SAME predicate; a total that
 * disagrees with the rows on screen is its own bug.
 *
 * `unsatisfiable` means the filter set is legal but cannot be expressed within
 * ZCQL's 10-condition ceiling. The caller must answer with an empty page
 * rather than send a query that would 400 and surface as a 500.
 */
function buildGrievanceWhere(
  staffIds: string[] | null,
  filters: GrievanceFilters
): { clauses: string[]; unsatisfiable: boolean } {
  // Every NON-search clause is built FIRST; the search box then gets whatever
  // is left of the 10-condition budget. Search is the only variable-width
  // clause, so it is the one that has to yield — and it yields visibly (a
  // warning names the dropped columns) instead of 400-ing the whole query.
  // The old form hard-coded seven LIKE columns, which together with a status
  // filter (1) and a date range (2) was already exactly 10: a single staff
  // alias tipped it to 11 and killed the entire search.
  const conditions: string[] = [];

  // STAFF scoping — match ALL identity aliases (ROWID + legacy UUID), since
  // rows written in different eras carry different forms of the same user.
  if (staffIds && staffIds.length > 0) {
    conditions.push(zcqlAnyOf('createdById', staffIds));
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
    conditions.push(zcqlLike('constituency', String(filters.constituency)));
  }
  // Half-open upper bound. CREATEDTIME is 'YYYY-MM-DD HH:mm:ss:SSS' (millis
  // after a COLON) and compares lexicographically, so the old
  // `<= toCatalystDate(endDate)` bound — a midnight timestamp — excluded every
  // grievance filed ON the end date.
  conditions.push(
    ...dateRangeClauses(
      'CREATEDTIME',
      filters.startDate as unknown as string,
      filters.endDate as unknown as string
    )
  );

  const term = filters.search ? String(filters.search).trim() : '';
  if (!term) return { clauses: conditions, unsatisfiable: false };

  const usedBase = countZcqlConditions(conditions);
  // An exact ROWID term draws on the same budget as the LIKE columns, so
  // reserve it before sizing them — and skip it entirely if nothing is left.
  const rowidMatch = term.match(ROWID_SEARCH);
  const rowidClause =
    rowidMatch && usedBase < MAX_ZCQL_CONDITIONS ? `ROWID = ${rowidMatch[1]}` : null;
  // Most-identifying FIRST: when the budget forces columns to be shed, the
  // ones people actually search by have to be the ones that survive.
  const { clause } = zcqlSearchWithinBudget(
    [
      'grievanceNumber',
      'petitionerName',
      'mobileNumber',
      'constituency',
      'wardVillage',
      'grievanceType',
      'description',
    ],
    term,
    usedBase + (rowidClause ? 1 : 0)
  );
  const parts = [clause, rowidClause].filter((c): c is string => Boolean(c));
  if (parts.length === 0) {
    // Not one search column fits. Returning the unfiltered list would ignore
    // the search box, and even a `ROWID = 0` sentinel would itself be the 11th
    // condition — so tell the caller to answer with an empty page.
    return { clauses: conditions, unsatisfiable: true };
  }
  conditions.push(parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`);
  return { clauses: conditions, unsatisfiable: false };
}

function whereSql(clauses: string[]): string {
  return clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
}

/**
 * Fetch `want` rows starting at `skip`, in ZCQL-legal chunks.
 *
 * The list contract permits limits up to 1000 (GrievanceView asks for exactly
 * that) while ZCQL rejects LIMIT > 300. The old code ran the request through
 * zcqlSafeLimit, which clamps to 299 SILENTLY while the meta still echoed the
 * requested limit — so at limit=1000 page 1 returned rows 0-298 and page 2
 * (skip=1000) returned rows 1000-1298, and rows 299-999 were returned by no
 * page at all with nothing erroring. Serve the window actually asked for.
 */
async function fetchGrievanceWindow(
  filterWhere: string,
  skip: number,
  want: number
): Promise<CatalystRow[]> {
  // Delegates to the shared KEYSET walk. The obvious implementation — LIMIT 299
  // with a marching OFFSET — silently DUPLICATES rows at chunk boundaries:
  // measured on a 2067-row table with a full total order and no concurrent
  // writes, the OFFSET walk returned 2068 rows / 2067 unique while the keyset
  // walk returned exactly 2067. Catalyst's OFFSET is not stable, and a
  // tiebreaker in ORDER BY does not fix it.
  return fetchOffsetWindow(GRIEVANCE_TABLE, filterWhere, 'CREATEDTIME', 'newest', skip, want);
}

/**
 * The date bounds the ZCQL branch filters on, as plain strings — read back out
 * of the very clauses it builds so the two paths cannot drift apart.
 *
 * CREATEDTIME is 'YYYY-MM-DD HH:mm:ss:SSS' and compares lexicographically, so
 * comparing the raw strings in JS is the IDENTICAL predicate, half-open upper
 * bound included. The old fallback did `new Date(r.CREATEDTIME) <= new
 * Date(endDate)`, which read the row as local time and the bound as UTC
 * midnight — dropping the whole of the end date plus a 5.5h sliver either side.
 */
function createdTimeBounds(filters: GrievanceFilters): {
  gte: string | null;
  lt: string | null;
} {
  let gte: string | null = null;
  let lt: string | null = null;
  for (const clause of dateRangeClauses(
    'CREATEDTIME',
    filters.startDate as unknown as string,
    filters.endDate as unknown as string
  )) {
    const m = clause.match(/^\S+\s*(>=|<)\s*'([^']+)'$/);
    if (!m) {
      console.warn(
        `[grievance] unrecognised date clause "${clause}" — skipping it in the ` +
          `JS fallback rather than filtering differently from ZCQL`
      );
      continue;
    }
    if (m[1] === '>=') gte = m[2];
    else lt = m[2];
  }
  return { gte, lt };
}

/**
 * CREATEDTIME DESC, ROWID DESC — the same order the ZCQL branch asks for.
 * CREATEDTIME is fixed-width, so a string compare orders it chronologically
 * and matches ZCQL exactly. ROWIDs are ~17 digits, past
 * Number.MAX_SAFE_INTEGER, so they are compared as digit strings (longer =
 * larger) rather than coerced to numbers that would collide.
 */
function compareGrievanceDesc(a: CatalystRow, b: CatalystRow): number {
  const sa = String(a.CREATEDTIME ?? '');
  const sb = String(b.CREATEDTIME ?? '');
  if (sa !== sb) return sb < sa ? -1 : 1;
  const ra = String(a.ROWID ?? '');
  const rb = String(b.ROWID ?? '');
  if (ra.length !== rb.length) return rb.length - ra.length;
  return rb < ra ? -1 : rb > ra ? 1 : 0;
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
    // STAFF see only their own rows — resolved to the full identity-alias set
    // (Catalyst ROWID + legacy UUID) so pre-migration rows still match.
    const staffIds =
      req.user?.role === 'STAFF' ? await getUserIdAliases(req.user.id) : null;
    // Free-text search (incl. reference number / GRV-<rowid>) always runs through
    // the JS path: it reliably matches grievanceNumber + ROWID and scans the
    // whole table, sidestepping ZCQL LIKE/ROWID quirks. ZCQL still handles the
    // common filtered/sorted list when there's no search term.
    const zcqlPlan =
      useZCQL() && !filters.search ? buildGrievanceWhere(staffIds, filters) : null;
    // ZCQL can only answer when the WHOLE predicate fits the 10-condition
    // ceiling, and NOTHING sizes the non-search clauses: six dropdowns + a
    // constituency LIKE + both date bounds + two staff aliases land exactly on
    // 10, with zero headroom, and one more would be a hard 400 surfacing as a
    // 500. When it doesn't fit, fall through to the JS path — which can still
    // answer. (Replying with an empty page carrying `total: 0, totalKnown:
    // true` would assert a count that was never measured and hide real rows.)
    const zcqlUsable =
      zcqlPlan !== null &&
      !zcqlPlan.unsatisfiable &&
      countZcqlConditions(zcqlPlan.clauses) <= MAX_ZCQL_CONDITIONS;
    if (zcqlPlan && !zcqlUsable) {
      console.warn(
        '[grievance] filter set does not fit the ZCQL condition budget — ' +
          'answering this list from the JS path instead'
      );
    }
    if (zcqlPlan && zcqlUsable) {
      const clauses = zcqlPlan.clauses;
      const filterWhere = whereSql(clauses);

      // A real COUNT over the SAME predicate as the page query. The old
      // `skip + pageRows.length + (hasMore ? 1 : 0)` looked like a total but
      // could never exceed currentPage + 1, so every pager built on it capped
      // at ~2 pages and hid the rest of the table.
      //
      // It runs in PARALLEL with the page query and only on page 1 — later
      // pages reuse the total the client already has. The cache key is scoped
      // by role + user id because STAFF results are per-identity: a shared key
      // would leak one staffer's row count to another.
      const countKey =
        `grievance:count:${req.user?.role}:${req.user?.id}:` + JSON.stringify(clauses);

      // ── Cursor mode ──────────────────────────────────────────────────────
      // Opted into by sending `cursor` or `sort`. Page/limit callers keep the
      // old contract untouched. A cursor page costs ONE query at any depth,
      // where page/limit has to walk the rows it skips.
      const usesCursorApi =
        req.query.cursor !== undefined || req.query.sort !== undefined;
      if (usesCursorApi) {
        const { limit: kLimit, cursor: cursorRaw, sort } = parseKeysetQuery(req.query);
        const cursor = decodeCursor(cursorRaw);
        const pageClauses = [...clauses];
        if (cursor) pageClauses.push(keysetPredicate('CREATEDTIME', cursor, sort));

        const [fetched, total] = await Promise.all([
          executeZCQL<CatalystRow>(
            `SELECT * FROM ${GRIEVANCE_TABLE}${whereSql(pageClauses)} ` +
              `${keysetOrderBy('CREATEDTIME', sort)} LIMIT ${assertZcqlLimit(kLimit + 1)}`
          ),
          cursor
            ? Promise.resolve(null)
            : cacheSWR(countKey, 30, 120, () => countRows(GRIEVANCE_TABLE, filterWhere)),
        ]);
        const more = fetched.length > kLimit;
        const rowsOut = more ? fetched.slice(0, kLimit) : fetched;
        const last = rowsOut[rowsOut.length - 1];
        sendSuccess(
          res,
          await attachUsers(rowsOut),
          'Grievances retrieved successfully',
          200,
          {
            limit: kLimit,
            count: rowsOut.length,
            hasMore: more,
            sort,
            nextCursor:
              more && last
                ? encodeCursor({ t: String(last.CREATEDTIME), r: String(last.ROWID) })
                : null,
            ...(total !== null && total !== undefined
              ? { total, totalKnown: true, totalPages: Math.ceil(total / kLimit) }
              : { totalKnown: false }),
          }
        );
        return;
      }

      const [fetched, total] = await Promise.all([
        fetchGrievanceWindow(filterWhere, skip, limit + 1),
        page === 1
          ? cacheSWR(countKey, 30, 120, () => countRows(GRIEVANCE_TABLE, filterWhere))
          : Promise.resolve(null),
      ]);

      const hasMore = fetched.length > limit;
      const pageRows = hasMore ? fetched.slice(0, limit) : fetched;
      const grievances = await attachUsers(pageRows);
      sendSuccess(res, grievances, 'Grievances retrieved successfully', 200, {
        page,
        limit,
        count: pageRows.length,
        hasMore,
        // `total` is present ONLY when it is real — never derived from the
        // page contents. countRows returns null when COUNT is unavailable.
        ...(total !== null && total !== undefined
          ? { total, totalKnown: true, totalPages: Math.ceil(total / limit) }
          : { totalKnown: false }),
      });
      return;
    }

    // ── Fallback path: list everything, filter in JS ────────────────────
    let rows = await listAllRows(GRIEVANCE_TABLE);

    // STAFF data isolation
    if (staffIds) {
      const idSet = new Set(staffIds);
      rows = rows.filter((r) => idSet.has(String(r.createdById)));
    }

    if (filters.status) {
      rows = rows.filter((r) => r.status === filters.status);
    }
    if (filters.isVerified !== undefined) {
      const want = String(filters.isVerified) === 'true';
      // parseBool, not Boolean(): Catalyst serialises boolean columns as the
      // STRINGS "true"/"false", and Boolean("false") is true — which would make
      // ?isVerified=false return nothing and ?isVerified=true return
      // everything, disagreeing with the ZCQL branch's `isVerified = 'false'`.
      rows = rows.filter((r) => parseBool(r.isVerified) === want);
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
      // when it also has a sequential grievanceNumber. Shared with the ZCQL
      // branch so both paths recognise the same shape.
      const rowidMatch = raw.match(ROWID_SEARCH);
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
    // The SAME half-open window the ZCQL branch applies, compared as strings.
    // Divergence between the two paths is itself a bug: the fallback used to
    // include the end date only up to its UTC midnight, so it returned a
    // different set of rows than ZCQL for the identical query.
    const { gte, lt } = createdTimeBounds(filters);
    if (gte) {
      rows = rows.filter((r) => r.CREATEDTIME && String(r.CREATEDTIME) >= gte);
    }
    if (lt) {
      rows = rows.filter((r) => r.CREATEDTIME && String(r.CREATEDTIME) < lt);
    }

    // Same ORDER BY as the ZCQL branch, ROWID tiebreaker included.
    rows.sort(compareGrievanceDesc);

    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    const grievances = await attachUsers(paged);

    // This path reads the whole table, so the total is genuinely known here.
    sendSuccess(res, grievances, 'Grievances retrieved successfully', 200, {
      ...calculatePaginationMeta(total, page, limit),
      count: paged.length,
      totalKnown: true,
      hasMore: skip + paged.length < total,
    });
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

    if (req.user?.role === 'STAFF') {
      const aliases = await getUserIdAliases(req.user.id);
      if (!aliases.includes(String(row.createdById))) {
        sendError(res, 'Forbidden', 403);
        return;
      }
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
    // Mirror an explicit status change onto the linked grievance task(s) so the
    // Task Tracker and the grievance pages never disagree. (Other edits — name,
    // priority, etc. — don't carry a status and leave the task untouched.)
    if (body.status) {
      await syncTasksForGrievance(id, String(body.status));
    }
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
    // Verifying resolves the grievance — close its linked task(s) to match.
    await syncTasksForGrievance(id, 'RESOLVED');
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
    // Keep the linked grievance task(s) in lock-step with the new status.
    await syncTasksForGrievance(id, status);
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
 * PATCH /api/grievances/:id/forward — ANY authenticated user forwards a
 * grievance to one other user (chosen from the directory), with an optional
 * remark. Stamps the grievance with the recipient, records the event on the
 * grievance's linked task's TaskHistory (so it shows in the grievance timeline,
 * which reads REMARKs from the linked task), and notifies the recipient.
 * Tolerant of a Catalyst schema missing the forwarded* columns.
 */
export async function forwardGrievance(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const { id } = req.params;
    const { recipientId, remark } = req.body as {
      recipientId?: string;
      remark?: string;
    };
    if (!recipientId) {
      sendError(res, 'recipientId is required');
      return;
    }
    if (String(recipientId) === String(req.user.id)) {
      sendError(res, 'You cannot forward a grievance to yourself');
      return;
    }

    const existing = await getRow(GRIEVANCE_TABLE, id);
    if (!existing) {
      sendNotFound(res, 'Grievance not found');
      return;
    }

    const note = typeof remark === 'string' ? remark.trim() : '';
    const names = await lookupUsers([String(recipientId), String(req.user.id)]);
    const recipientName = names.get(String(recipientId))?.name || 'a user';
    const forwarderName =
      names.get(String(req.user.id))?.name || req.user.name || 'a user';

    // Forwarding moves the grievance into active work → In Progress (unless it's
    // already completed/rejected, which we never reopen). The same status is
    // mirrored onto the linked task below so the Task Tracker matches.
    const willProgress = !['RESOLVED', 'REJECTED'].includes(String(existing.status));
    const grievanceForwardUpdate: { ROWID: string; [column: string]: any } = {
      ROWID: id,
      forwardedToId: String(recipientId),
      forwardedById: req.user.id,
      forwardedAt: nowCatalystIST(),
      forwardRemark: note || null,
    };
    if (willProgress) grievanceForwardUpdate.status = 'IN_PROGRESS';
    const updated = await updateRowTolerant(
      GRIEVANCE_TABLE,
      grievanceForwardUpdate,
      ['forwardedToId', 'forwardedById', 'forwardedAt', 'forwardRemark']
    );
    // Mirror the In-Progress move onto the linked task + refresh stat caches.
    if (willProgress) {
      await syncTasksForGrievance(id, 'IN_PROGRESS');
      invalidateStatCaches();
    }

    // Record the forward on the grievance's linked task so it appears in the
    // grievance timeline (getGrievanceTimeline pulls REMARKs from the linked
    // task's TaskHistory). Best-effort — skip if there's no linked task yet.
    try {
      const taskRows = await executeZCQL<CatalystRow>(
        `SELECT ROWID FROM Task WHERE referenceId = '${zcqlEscapeValue(id)}'`
      );
      const linkedTaskId = taskRows[0] ? String(taskRows[0].ROWID) : null;
      if (linkedTaskId) {
        await insertRow('TaskHistory', {
          taskId: linkedTaskId,
          note: `Forwarded to ${recipientName} by ${forwarderName}${note ? `: ${note}` : ''}`,
          status: willProgress ? 'IN_PROGRESS' : null,
          createdById: req.user.id,
        });
      }
    } catch {
      /* Linked task / TaskHistory missing — forward still succeeds */
    }

    await emitNotification({
      recipientId: String(recipientId),
      type: 'GRIEVANCE_FORWARDED',
      title: `Grievance forwarded to you: ${
        existing.grievanceNumber ? String(existing.grievanceNumber) : `GRV-${id}`
      }`,
      body: `${forwarderName} forwarded this grievance to you${note ? `: ${note}` : '.'}`,
      link: '/forwarded',
      referenceId: String(id),
      referenceType: 'GRIEVANCE',
    });

    const [shaped] = await attachUsers([updated]);
    sendSuccess(res, shaped, `Grievance forwarded to ${recipientName}`);
  } catch (error) {
    sendServerError(res, 'Failed to forward grievance', error);
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
      // Only the ROWID is used below — don't drag every Task column back.
      taskRows = await executeZCQL<CatalystRow>(
        `SELECT ROWID FROM Task WHERE referenceId = '${zcqlEscapeValue(id)}'`
      );
    } catch {
      taskRows = [];
    }
    const taskIds = new Set(taskRows.map((t) => String(t.ROWID)));
    if (taskIds.size > 0) {
      try {
        // Scoped to this grievance's task(s). This used to read the ENTIRE
        // TaskHistory table and filter it in JS — the whole audit log of every
        // task in the office, fetched to render one grievance's timeline, and
        // growing forever. fetchChildrenByParentIds chunks the id OR-chain at
        // the 10-condition ceiling and runs the chunks in parallel.
        const history = await fetchChildrenByParentIds(
          'TaskHistory',
          'taskId',
          [...taskIds]
        );
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
        // parseBool, not Boolean(): a Catalyst "false" string is truthy, which
        // would empty this queue entirely. Same coercion shapeGrievance uses.
        parseBool(r.isVerified) === false &&
        r.grievanceType !== 'TEMPLE_VISIT'
    );
    // FIFO: oldest first — the exact inverse of the list ordering, ROWID
    // tiebreaker included so same-second arrivals keep a stable queue position
    // instead of swapping places (and pages) between refreshes.
    rows.sort((a, b) => -compareGrievanceDesc(a, b));

    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    const grievances = await attachUsers(paged);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, grievances, 'Verification queue retrieved', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get verification queue', error);
  }
}
