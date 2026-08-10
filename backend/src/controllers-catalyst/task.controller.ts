/**
 * Task controller — backed by Catalyst Data Store via custom REST client.
 *
 * Catalyst-specific notes:
 *   - 2 enums (TaskType, TaskStatus) stored as TEXT, validated in this file.
 *   - Catalyst column `priorities` (couldn't use reserved word `priority`)
 *     is mapped transparently to/from the frontend's `priority` field.
 *   - Cascade delete is done manually here (no FK cascades in Catalyst).
 *   - getTaskTracking counts tasks per staff in JS (no native group-by).
 *   - TaskHistory is its own Catalyst table; we write to it on progress updates.
 */
import { Response } from 'express';
import { randomUUID } from 'crypto';
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

  // zcqlSafeLimit is deliberately NOT imported: it clamps silently, so a
  // caller asking for limit=300 (AllTasks does) got 299 rows on page 1 while
  // page 2 started at 300 — row 299 was returned by no page at all. Compute a
  // legal batch size and assert it instead.
  assertZcqlLimit,
  countRows,
  fetchOffsetWindow,
  columnExists,
  dateRangeClauses,
  countZcqlConditions,
  zcqlSearchWithinBudget,
  fetchChildrenByParentIds,
  MAX_ZCQL_CONDITIONS,
  ZCQL_MAX_LIMIT,
  CatalystRow,
} from '../lib/catalyst-client';
import { cacheSWR, cacheClear } from '../lib/cache';
import {
  keysetPredicate,
  keysetOrderBy,
  encodeCursor,
  decodeCursor,
  type ListCursor,
} from '../lib/keyset';
import { parseKeysetQuery } from '../utils/keyset-query';
import { useZCQL } from '../config/feature-flags';
import {
  getCachedTableList,
  getUserIdAliases,
  isHiddenTestUser,
} from '../lib/catalyst-user-lookup';
import {
  syncGrievanceForTask,
  reconcileGrievanceTaskStatuses,
} from '../lib/grievance-task-sync';
import { emitNotification, emitNotifications } from './notification.controller';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendServerError,
} from '../utils/response';
import { parsePagination, calculatePaginationMeta } from '../utils/pagination';
import type { AuthenticatedRequest } from '../types';

const TASK_TABLE = 'Task';
const HISTORY_TABLE = 'TaskHistory';

const VALID_TASK_TYPES = new Set(['GRIEVANCE', 'TRAIN_REQUEST', 'TOUR_PROGRAM', 'GENERAL']);
const VALID_TASK_STATUS = new Set(['UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD']);

// ── Helpers ───────────────────────────────────────────────────────────────

function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return Boolean(v);
}

function parseInteger(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return isNaN(n) ? 0 : Math.trunc(n);
}

/**
 * The raw Catalyst timestamp bounds for a date filter, derived from the SAME
 * helper the ZCQL path uses so the two can never disagree.
 *
 * The JS filters here used to be `new Date(r.CREATEDTIME) <= new Date(endDate)`,
 * which is wrong twice over: a bare `endDate` parses as UTC midnight (so every
 * row created ON the end date was dropped) while CREATEDTIME parses as server
 * local time, mixing two zones in one comparison. Catalyst timestamps are
 * fixed-width `YYYY-MM-DD HH:mm:ss:SSS`, so comparing the raw strings is both
 * correct and zone-free — and the upper bound is half-open, matching
 * dateRangeClauses.
 */
function catalystDateBounds(
  column: string,
  startDate?: string,
  endDate?: string
): { start?: string; endExclusive?: string } {
  const bounds: { start?: string; endExclusive?: string } = {};
  for (const clause of dateRangeClauses(column, startDate, endDate)) {
    const literal = clause.match(/'([^']+)'/)?.[1];
    if (!literal) continue;
    if (clause.includes('>=')) bounds.start = literal;
    else bounds.endExclusive = literal;
  }
  return bounds;
}

/** Row predicate matching the ZCQL date range exactly. */
function inDateRange(
  row: CatalystRow,
  column: string,
  bounds: { start?: string; endExclusive?: string }
): boolean {
  const value = row[column] ? String(row[column]) : '';
  // A row with no timestamp can't satisfy a date filter — same as before.
  if (!value) return false;
  if (bounds.start && value < bounds.start) return false;
  if (bounds.endExclusive && value >= bounds.endExclusive) return false;
  return true;
}

/**
 * Descending ROWID comparison, done on the STRING.
 *
 * `Number(ROWID)` is NOT safe here: Catalyst ROWIDs are ~17 digits
 * (37719000000744038), well past Number.MAX_SAFE_INTEGER, so two ids less than
 * ~8 apart collapse onto the same double and compare EQUAL — which is exactly
 * the multi-assign case (adjacent ROWIDs, identical CREATEDTIME) the tiebreaker
 * exists for. catalyst-client's parseSafe deliberately keeps ROWID a string for
 * this reason; don't hand it back to Number(). Same-table ROWIDs are equal
 * width, but compare length first so a shorter id can never sort above a
 * longer one.
 */
function compareRowIdDesc(a: unknown, b: unknown): number {
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  if (sa.length !== sb.length) return sb.length - sa.length;
  return sb < sa ? -1 : sb > sa ? 1 : 0;
}

/**
 * JS twin of the ZCQL search clause (title/description, case-insensitive
 * contains). `term` must already be trimmed and lower-cased.
 */
function matchesTaskSearch(row: CatalystRow, term: string): boolean {
  return (
    String(row.title ?? '').toLowerCase().includes(term) ||
    String(row.description ?? '').toLowerCase().includes(term)
  );
}

/**
 * Fetch specific rows by ROWID, scoped and chunked.
 *
 * fetchChildrenByParentIds() is the usual tool for this shape, but it quotes
 * its values and ROWID is compared as a number, so the OR-chain is built here.
 * Chunked at MAX_ZCQL_CONDITIONS because every id costs one leaf condition and
 * an 11th is a hard 400 that returns nothing at all.
 */
async function fetchRowsByRowId(
  table: string,
  ids: string[],
  columns = '*'
): Promise<CatalystRow[]> {
  // Non-numeric ids can never equal a ROWID; the old whole-table scan matched
  // none of them either, so dropping them changes nothing but the query.
  const numeric = [...new Set(ids.map(String))].filter((id) => /^\d+$/.test(id));
  if (numeric.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < numeric.length; i += MAX_ZCQL_CONDITIONS) {
    chunks.push(numeric.slice(i, i + MAX_ZCQL_CONDITIONS));
  }
  const results = await Promise.all(
    chunks.map((chunk) =>
      executeZCQL<CatalystRow>(
        `SELECT ${columns} FROM ${table} ` +
          `WHERE ${chunk.map((id) => `ROWID = ${id}`).join(' OR ')} ` +
          `LIMIT ${assertZcqlLimit(chunk.length)}`
      )
    )
  );
  return results.flat();
}

/** Honest list meta: `total` is present ONLY when a real COUNT came back. */
function listMeta(
  page: number,
  limit: number,
  count: number,
  hasMore: boolean,
  total: number | null
) {
  return total !== null
    ? { page, limit, count, hasMore, total, totalKnown: true, totalPages: Math.ceil(total / limit) }
    : { page, limit, count, hasMore, totalKnown: false };
}

/** Compact per-assignee summary shown to staff so they can see who else
 *  is on the same task without learning anything beyond name + status. */
type CoAssigneeSummary = {
  id: string;
  name: string;
  status: string;
};

/** Reshape a Catalyst Task row → JSON the frontend expects (priority, not priorities). */
function shapeTask(
  row: CatalystRow,
  assignedTo?: { id: string; name: string; email: string } | null,
  assignedBy?: { id: string; name: string; email: string } | null,
  recentHistory?: any[],
  coAssignees?: CoAssigneeSummary[]
) {
  return {
    id: String(row.ROWID),
    title: row.title ?? '',
    description: row.description ?? null,
    // Default legacy/blank rows so the frontend can always render + .replace().
    taskType: row.taskType ?? 'GENERAL',
    // PUBLIC tasks show on the shared board; OFFICE tasks use the admin-assignment
    // flow and are hidden from staff on the board (visible to admins + the assignee).
    source: (row.source as string) ?? 'PUBLIC',
    status: row.status ?? 'ASSIGNED',
    priority: row.priorities ?? 'NORMAL', // Catalyst → frontend mapping
    referenceId: row.referenceId ?? null,
    referenceType: row.referenceType ?? null,
    // Reference number of the linked record (grievance GRV-/tour TOUR-/train
    // TREQ-). Filled in by attachReferenceNumbers for linked tasks; null otherwise.
    referenceNo: null as string | null,
    progressNotes: row.progressNotes ?? null,
    progressPercent: parseInteger(row.progressPercent),
    assignedAt: row.CREATEDTIME, // Catalyst auto-timestamp
    dueDate: row.dueDate ?? null,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    createdAt: row.CREATEDTIME,
    updatedAt: row.MODIFIEDTIME,
    assignedToId: row.assignedToId,
    assignedById: row.assignedById,
    assignedTo: assignedTo ?? null,
    assignedBy: assignedBy ?? null,
    progressHistory: recentHistory ?? [],
    // groupId stamps rows that belong to the same multi-assign action.
    // Empty/null when the task was assigned to a single staff member.
    groupId: row.groupId ? String(row.groupId) : null,
    // Other staff working on the same group (excludes self when called from
    // /my-tasks). Empty array for solo assignments.
    coAssignees: coAssignees ?? [],
    // Forwarding. A task can be forwarded by anyone to any one other user; the
    // latest recipient "owns" the forward (re-forwarding is a hand-off). The
    // full chain stays visible in the TaskHistory timeline. isForwarded is
    // derived from forwardedToId so the UI can flag the task.
    forwardedToId: row.forwardedToId ?? null,
    forwardedById: row.forwardedById ?? null,
    forwardedAt: row.forwardedAt ?? null,
    forwardRemark: row.forwardRemark ?? null,
    isForwarded: Boolean(row.forwardedToId),
  };
}

function shapeHistory(row: CatalystRow, createdBy?: any) {
  return {
    id: String(row.ROWID),
    taskId: row.taskId,
    note: row.note,
    status: row.status ?? null,
    createdAt: row.CREATEDTIME,
    createdById: row.createdById,
    createdBy: createdBy ?? null,
  };
}

/** Look up users by ID from the cached Catalyst AppUser table.
 *  Best-effort: returns empty if Catalyst is unreachable. */
async function lookupUsers(
  ids: Iterable<string>
): Promise<Map<string, { id: string; name: string; email: string }>> {
  const map = new Map<string, { id: string; name: string; email: string }>();
  const idArr = Array.from(ids).filter(Boolean);
  if (idArr.length === 0) return map;
  try {
    const users = await getCachedTableList('AppUser');
    const wanted = new Set(idArr.map(String));
    for (const u of users) {
      const rowId = String(u.ROWID);
      const legacyId = u.legacyId ? String(u.legacyId) : null;
      // Mask dev/test accounts so legacy task rows that reference them
      // (e.g. an old admin@oms.gov.in seed assigning a task) don't leak
      // the test name/email into the UI. Same shape, different content.
      const hidden = isHiddenTestUser(u);
      const name = hidden ? 'System Admin' : String(u.name);
      const email = hidden ? '' : String(u.email);
      if (wanted.has(rowId)) {
        map.set(rowId, { id: rowId, name, email });
      }
      // INDEPENDENT if, not else-if: one user can be referenced by their
      // Catalyst ROWID on some rows and their pre-migration legacy UUID on
      // others. With else-if, a page containing both forms resolved only the
      // ROWID and rendered the user's name blank on the legacy rows.
      if (legacyId && wanted.has(legacyId)) {
        map.set(legacyId, { id: legacyId, name, email });
      }
    }
  } catch {
    /* Catalyst unreachable — return empty map */
  }
  return map;
}

/**
 * Set of id forms (ROWID + legacyId) that identify one user, so an
 * `assignedToId` / `forwardedToId` stored under either form matches the
 * logged-in viewer. Delegates to the shared alias resolver so every
 * controller applies the same matching rule.
 */
async function userIdForms(userId: string): Promise<Set<string>> {
  return new Set(await getUserIdAliases(userId));
}

/** Attach assignedTo + assignedBy user info to a list of tasks. */
async function attachUsers(rows: CatalystRow[]): Promise<any[]> {
  const safe = rows.filter((r): r is CatalystRow => Boolean(r));
  if (safe.length === 0) return [];
  const ids = new Set<string>();
  for (const r of safe) {
    if (r.assignedToId) ids.add(String(r.assignedToId));
    if (r.assignedById) ids.add(String(r.assignedById));
  }
  const users = await lookupUsers(ids);
  return safe.map((r) =>
    shapeTask(
      r,
      users.get(String(r.assignedToId)) ?? null,
      users.get(String(r.assignedById)) ?? null
    )
  );
}

/**
 * Resolve each task's linked record reference number and set it on
 * `referenceNo` so the Task Tracker / All Tasks / Office Tasks boards can show +
 * search by it. Handles all linked record types:
 *   - GRIEVANCE     → GRV-YYYY-NNNN  (fallback GRV-<rowid>)
 *   - TOUR_PROGRAM  → TOUR-YYYY-NNNN (fallback TOUR-<rowid>)
 *   - TRAIN_REQUEST → TREQ-YYYY-NNNN (fallback TREQ-<rowid>)
 * Best-effort: a per-type lookup failure just leaves those tasks' referenceNo
 * null.
 *
 * Scoped to the referenceIds ON THIS PAGE. This used to read Grievance,
 * TourProgram AND TrainRequest IN FULL to decorate ten task rows, so rendering
 * one page of the largest table in the app cost O(three unrelated tables) and
 * grew forever. Now a type is queried only when the page actually references
 * it, in ROWID chunks that fit the 10-condition ZCQL budget.
 *
 * `prefetched` lets a caller that has ALREADY read one of those tables hand its
 * numbers in — the source=OFFICE path reads Grievance to decide which tasks are
 * office tasks, and used to read it a second time right here in the same request.
 */
async function attachReferenceNumbers(
  tasks: any[],
  prefetched?: Partial<Record<string, Map<string, string>>>
): Promise<void> {
  const idsByType: Record<string, Set<string>> = {
    GRIEVANCE: new Set(),
    TOUR_PROGRAM: new Set(),
    TRAIN_REQUEST: new Set(),
  };
  for (const t of tasks) {
    if (!t.referenceId) continue;
    const bucket = idsByType[t.referenceType as string];
    if (bucket) bucket.add(String(t.referenceId));
  }

  const refByType: Record<string, Map<string, string>> = {
    GRIEVANCE: new Map(),
    TOUR_PROGRAM: new Map(),
    TRAIN_REQUEST: new Map(),
  };

  // (Catalyst table, ids, type key, number column, ROWID-fallback prefix)
  const sources: Array<[string, Set<string>, string, string, string]> = [
    ['Grievance', idsByType.GRIEVANCE, 'GRIEVANCE', 'grievanceNumber', 'GRV'],
    ['TourProgram', idsByType.TOUR_PROGRAM, 'TOUR_PROGRAM', 'tourNumber', 'TOUR'],
    ['TrainRequest', idsByType.TRAIN_REQUEST, 'TRAIN_REQUEST', 'trainRequestNumber', 'TREQ'],
  ];

  await Promise.all(
    sources.map(async ([table, ids, type, numberCol, prefix]) => {
      if (ids.size === 0) return;
      const map = refByType[type];

      // Caller already read this table this request — don't read it again.
      const pre = prefetched?.[type];
      if (pre) {
        for (const id of ids) {
          const found = pre.get(id);
          if (found !== undefined) map.set(id, found);
        }
        return;
      }

      try {
        // ZCQL 400s the ENTIRE query when it references an unknown column, and
        // both TourProgram.tourNumber and TrainRequest.trainRequestNumber are
        // absent in Development — so only ask for the column when it exists.
        // Absent column ⇒ every row falls back to the <PREFIX>-<rowid> form,
        // which is exactly what the old row-by-row `r[numberCol]` check did.
        const hasNumber = await columnExists(table, numberCol);
        const rows = await fetchRowsByRowId(
          table,
          [...ids],
          hasNumber ? `ROWID, ${numberCol}` : 'ROWID'
        );
        for (const r of rows) {
          const rid = String(r.ROWID);
          map.set(rid, hasNumber && r[numberCol] ? String(r[numberCol]) : `${prefix}-${rid}`);
        }
      } catch {
        /* table unreadable — leave these refs null */
      }
    })
  );

  for (const t of tasks) {
    if (!t.referenceId) continue;
    const map = refByType[t.referenceType as string];
    if (map) t.referenceNo = map.get(String(t.referenceId)) ?? null;
  }
}

/**
 * For each task in `rows`, look up its sibling rows (same groupId) and
 * attach a compact `coAssignees` summary -- so staff can see who else is
 * working on the same task. The viewer's own row is filtered out by ROWID.
 *
 * Batched -- one extra ZCQL fetch for ALL siblings of ALL groups, then one
 * batch user lookup that combines main-row + sibling-row user IDs. No N+1.
 */
async function attachUsersWithCoAssignees(
  rows: CatalystRow[]
): Promise<any[]> {
  const safe = rows.filter((r): r is CatalystRow => Boolean(r));
  if (safe.length === 0) return [];

  // 1. Find all groupIds present on the main rows.
  const groupIds = Array.from(
    new Set(safe.map((r) => (r.groupId ? String(r.groupId) : '')).filter(Boolean))
  );

  // 2. Scoped fetch for all sibling rows across all groups. This was a bare
  //    `groupId IN (...)`, which is both unbudgeted — an 11th group is a hard
  //    400 that returns NOTHING, silently emptying every coAssignees list on
  //    the page — and reliant on an IN operator Catalyst does not honour
  //    consistently. The helper OR-chains and chunks by the 10-condition limit.
  let siblings: CatalystRow[] = [];
  if (groupIds.length > 0) {
    try {
      siblings = await fetchChildrenByParentIds(TASK_TABLE, 'groupId', groupIds);
    } catch {
      siblings = [];
    }
  }

  // 3. Bucket siblings by groupId.
  const siblingsByGroup = new Map<string, CatalystRow[]>();
  for (const s of siblings) {
    const gid = String(s.groupId ?? '');
    if (!gid) continue;
    if (!siblingsByGroup.has(gid)) siblingsByGroup.set(gid, []);
    siblingsByGroup.get(gid)!.push(s);
  }

  // 4. One user-lookup batch covering main rows AND sibling rows.
  const ids = new Set<string>();
  for (const r of safe) {
    if (r.assignedToId) ids.add(String(r.assignedToId));
    if (r.assignedById) ids.add(String(r.assignedById));
  }
  for (const s of siblings) {
    if (s.assignedToId) ids.add(String(s.assignedToId));
  }
  const users = await lookupUsers(ids);

  // 5. Hydrate each main row with its co-assignees (excluding itself).
  return safe.map((r) => {
    const gid = r.groupId ? String(r.groupId) : '';
    let coAssignees: CoAssigneeSummary[] = [];
    if (gid) {
      const sibs = siblingsByGroup.get(gid) ?? [];
      coAssignees = sibs
        .filter((s) => String(s.ROWID) !== String(r.ROWID))
        .map((s) => {
          const u = users.get(String(s.assignedToId));
          return {
            id: u?.id ?? String(s.assignedToId ?? ''),
            name: u?.name ?? '—',
            status: String(s.status ?? 'ASSIGNED'),
          };
        });
    }
    return shapeTask(
      r,
      users.get(String(r.assignedToId)) ?? null,
      users.get(String(r.assignedById)) ?? null,
      undefined,
      coAssignees
    );
  });
}

/**
 * Newest-first comparator for history rows.
 *
 * The ROWID tiebreaker is not decoration: TaskHistory rows written in the same
 * request share a CREATEDTIME to the millisecond, and without a tiebreaker
 * their relative order is whatever the engine felt like — which reorders the
 * timeline between two identical requests.
 */
function historyNewestFirst(a: CatalystRow, b: CatalystRow): number {
  const ta = a.CREATEDTIME ? new Date(String(a.CREATEDTIME)).getTime() : 0;
  const tb = b.CREATEDTIME ? new Date(String(b.CREATEDTIME)).getTime() : 0;
  if (ta !== tb) return tb - ta;
  return compareRowIdDesc(a.ROWID, b.ROWID);
}

/**
 * Every TaskHistory row for ONE task, newest first.
 *
 * Replaces `listAllRows(HISTORY_TABLE)` + filter: TaskHistory grows with every
 * remark on every task forever, so reading it whole to show one task's timeline
 * got slower with each remark anyone anywhere left. Paged by ROWID rather than
 * capped at the 299-row ZCQL ceiling, because a truncated audit trail is worse
 * than a slow one.
 *
 * Throws on failure, exactly as the listAllRows form did — callers that can
 * tolerate a missing TaskHistory table catch it themselves. Returning an empty
 * timeline for a task that has one would be a silent lie.
 */
async function historyRowsForTask(taskId: string): Promise<CatalystRow[]> {
  const out: CatalystRow[] = [];
  let after = '0';
  for (let i = 0; i < 40; i++) {
    const rows = await executeZCQL<CatalystRow>(
      `SELECT * FROM ${HISTORY_TABLE} ` +
        `WHERE taskId = '${zcqlEscapeValue(taskId)}' AND ROWID > ${after} ` +
        `ORDER BY ROWID ASC LIMIT ${assertZcqlLimit(ZCQL_MAX_LIMIT)}`
    );
    out.push(...rows);
    if (rows.length < ZCQL_MAX_LIMIT) break;
    after = String(rows[rows.length - 1].ROWID);
  }
  return out.sort(historyNewestFirst);
}

/**
 * For a list of task ROWIDs, return up to N most-recent history entries each.
 *
 * Scoped + chunked on taskId. This used to read the ENTIRE TaskHistory table to
 * attach three rows per task, on every render of every task list — the single
 * fastest-growing cost in the module, since TaskHistory gains a row on every
 * remark, status change and forward.
 */
async function recentHistoryByTaskId(
  taskRowIds: string[],
  perTask = 3
): Promise<Map<string, any[]>> {
  const out = new Map<string, any[]>();
  if (taskRowIds.length === 0) return out;
  const idSet = new Set(taskRowIds.map(String));

  let scoped: CatalystRow[] = [];
  try {
    // ORDER BY inside the helper matters: a chunk that comes back at the ZCQL
    // row ceiling is truncated from the OLDEST end, so the entries we actually
    // keep (the newest `perTask`) survive regardless.
    scoped = await fetchChildrenByParentIds(HISTORY_TABLE, 'taskId', taskRowIds, {
      orderBy: 'ORDER BY CREATEDTIME DESC, ROWID DESC',
    });
  } catch {
    return out; // Table might not exist yet — degrade gracefully.
  }

  const byTask: Record<string, CatalystRow[]> = {};
  for (const h of scoped) {
    if (!h.taskId) continue;
    const tid = String(h.taskId);
    if (!idSet.has(tid)) continue;
    (byTask[tid] = byTask[tid] || []).push(h);
  }
  // Resolve creator users in one batch
  const creatorIds = new Set<string>();
  for (const arr of Object.values(byTask)) {
    for (const h of arr) if (h.createdById) creatorIds.add(String(h.createdById));
  }
  const creators = await lookupUsers(creatorIds);
  for (const [tid, arr] of Object.entries(byTask)) {
    arr.sort(historyNewestFirst);
    out.set(
      tid,
      arr.slice(0, perTask).map((h) =>
        shapeHistory(h, creators.get(String(h.createdById)) ?? null)
      )
    );
  }
  return out;
}

/**
 * Create a task assigned to the creator themselves — no admin assignment step.
 * Called when a staff/admin files a grievance or tour so the item immediately
 * shows up on the shared Tasks board ("auto self-assigned"). Best-effort:
 * never throws to the caller, since a notification/task failure must not fail
 * the underlying grievance/tour creation.
 */
/**
 * Insert a Task row, tolerating a Catalyst schema that's missing one of the
 * newer optional columns. A missing column makes the whole insert fail, which
 * (for auto-created self-tasks) would silently drop the task and it would never
 * appear in My Tasks. So we degrade gracefully:
 *   1. Try the full row.
 *   2. Retry without the newer optional columns (`source`, `groupId`).
 *   3. Last resort: insert only the long-standing core columns.
 * The core columns have always existed, so step 3 effectively guarantees the
 * task is created.
 */
async function insertTaskRow(row: Record<string, any>): Promise<CatalystRow> {
  try {
    return await insertRow(TASK_TABLE, row);
  } catch (err) {
    // Step 2 — drop the newer optional columns that may not exist yet.
    if ('source' in row || 'groupId' in row) {
      const rest = { ...row };
      delete rest.source;
      delete rest.groupId;
      try {
        return await insertRow(TASK_TABLE, rest);
      } catch {
        /* fall through to the minimal-core retry */
      }
    }
    // Step 3 — minimal core column set the Task table has always had.
    const CORE = [
      'title',
      'description',
      'taskType',
      'status',
      'priorities',
      'referenceId',
      'referenceType',
      'assignedToId',
      'assignedById',
      'progressNotes',
      'progressPercent',
      'dueDate',
      'startedAt',
      'completedAt',
    ];
    const minimal: Record<string, any> = {};
    for (const k of CORE) if (k in row) minimal[k] = row[k];
    // If we never actually stripped anything (the failure wasn't a missing
    // optional column), rethrow the original error rather than masking it.
    if (Object.keys(minimal).length === Object.keys(row).length) throw err;
    return await insertRow(TASK_TABLE, minimal);
  }
}

export async function autoCreateSelfTask(params: {
  userId: string;
  title: string;
  taskType: string;
  referenceId: string;
  referenceType: string;
  priority?: string;
  description?: string | null;
  source?: string;
}): Promise<void> {
  try {
    // The task is ALWAYS self-assigned to its creator (the person who entered
    // it) — there is no separate assignment step. OFFICE-sourced work differs
    // only by `source`: it surfaces on the admin Office Tasks page, is hidden
    // from the shared "All Tasks" board + staff My Tasks, and may be edited by
    // admins only (enforced in editTaskShared / updateTaskProgress).
    const isOffice = String(params.source ?? 'PUBLIC').toUpperCase() === 'OFFICE';
    await insertTaskRow({
      title: params.title,
      description: params.description ?? null,
      taskType: VALID_TASK_TYPES.has(params.taskType) ? params.taskType : 'GENERAL',
      status: 'ASSIGNED',
      priorities: params.priority || 'NORMAL',
      referenceId: params.referenceId,
      referenceType: params.referenceType,
      source: isOffice ? 'OFFICE' : 'PUBLIC',
      progressNotes: null,
      progressPercent: 0,
      dueDate: null,
      startedAt: null,
      completedAt: null,
      // Self-assigned: the creator is both assignee and assigner.
      assignedToId: params.userId,
      assignedById: params.userId,
      groupId: null,
    });
  } catch (err) {
    console.warn('[task] autoCreateSelfTask failed', err);
  }
}

// ── Endpoints ─────────────────────────────────────────────────────────────

/**
 * POST /api/tasks  — admin assigns a task to a staff member.
 */
export async function createTask(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const {
      title,
      description,
      taskType,
      priority,
      referenceId,
      referenceType,
      assignedToId,
      assignedToIds,
      dueDate,
    } = req.body;

    if (!title?.trim()) {
      sendError(res, 'Task title is required');
      return;
    }
    if (!VALID_TASK_TYPES.has(taskType)) {
      sendError(res, `Invalid taskType: ${taskType}`);
      return;
    }

    // Accept either:
    //   - assignedToIds: string[]  (new multi-assign payload)
    //   - assignedToId: string     (legacy single-assign payload)
    // and normalise to a deduped array.
    const idsRaw: string[] = Array.isArray(assignedToIds)
      ? assignedToIds.map(String)
      : assignedToId
        ? [String(assignedToId)]
        : [];
    const ids = Array.from(new Set(idsRaw.filter(Boolean)));
    if (ids.length === 0) {
      sendError(res, 'At least one staff member must be selected');
      return;
    }

    // Validate every assignee against the cached AppUser table. We collect
    // the resolved user rows here too so we can echo a useful error and
    // (later) hand back the user objects to the client without a re-fetch.
    const allUsers = await getCachedTableList('AppUser');
    const validated: CatalystRow[] = [];
    for (const id of ids) {
      const u = allUsers.find(
        (u) =>
          String(u.ROWID) === id ||
          (u.legacyId && String(u.legacyId) === id)
      );
      if (!u) {
        sendError(res, `Staff member ${id} not found`, 404);
        return;
      }
      if (String(u.role).toUpperCase() !== 'STAFF') {
        sendError(res, `Can only assign tasks to staff members (${u.name})`);
        return;
      }
      const active = u.isActive === true || u.isActive === 'true';
      if (!active) {
        sendError(res, `Staff member ${u.name} is inactive`);
        return;
      }
      validated.push(u);
    }

    let parsedDue: string | null = null;
    if (dueDate) {
      const d = new Date(dueDate);
      if (isNaN(d.getTime())) {
        sendError(res, 'Invalid due date format');
        return;
      }
      parsedDue = toCatalystDate(d);
    }

    // Stamp every row from a multi-assign with the same UUID so the admin
    // UI can collapse them into a single consolidated card. Solo
    // assignments stay groupId=null to keep the legacy data model intact.
    const groupId = ids.length > 1 ? randomUUID() : null;

    const baseRow = {
      title: title.trim(),
      description: description?.trim() || null,
      taskType,
      source: 'PUBLIC', // admin-created tasks are normal board tasks
      status: 'ASSIGNED',
      priorities: priority || 'NORMAL', // Catalyst column is `priorities`
      referenceId: referenceId || null,
      referenceType: referenceType || null,
      progressNotes: null,
      progressPercent: 0,
      dueDate: parsedDue,
      startedAt: null,
      completedAt: null,
      assignedById: req.user.id,
      groupId,
    };

    const rows = await Promise.all(
      ids.map((id) => insertTaskRow({ ...baseRow, assignedToId: id }))
    );

    // Fire one in-app notification per assignee. Best-effort — emit helper
    // swallows errors so a notify failure cannot fail the assignment itself.
    await emitNotifications(ids, {
      type: 'TASK_ASSIGNED',
      title: `New task: ${title}`,
      body: description ? String(description).slice(0, 200) : `Type: ${taskType}`,
      // Each assignee's task is its own row (Promise.all above). Linking to
      // the staff task list with the first row id is a best-effort deep link
      // — the page can highlight that row, or fall back to the full list.
      link: rows[0]
        ? `/staff/tasks?id=${encodeURIComponent(String(rows[0].ROWID))}`
        : '/staff/tasks',
      referenceId: rows[0] ? String(rows[0].ROWID) : undefined,
      referenceType: 'TASK',
    });

    const shaped = await attachUsers(rows);
    const message =
      ids.length === 1
        ? 'Task assigned successfully'
        : `Task assigned to ${ids.length} staff members successfully`;
    invalidateTaskCaches();
    sendSuccess(res, shaped, message, 201);
  } catch (error: any) {
    sendServerError(res, error?.message || 'Failed to create task', error);
  }
}

/**
 * PATCH /api/tasks/:id/assign — admin assigns an EXISTING task to a staff
 * member. Drives the office flow: a staff-created office grievance produces an
 * UNASSIGNED office task that an admin assigns here; it then shows in the
 * assignee's My Tasks (and stays hidden from the shared board for other staff).
 */
export async function assignTask(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const { id } = req.params;
    const { assignedToId } = req.body as { assignedToId?: string };
    if (!assignedToId) {
      sendError(res, 'assignedToId is required');
      return;
    }

    const existing = await getRow(TASK_TABLE, id);
    if (!existing) {
      sendNotFound(res, 'Task not found');
      return;
    }

    // Validate the assignee is an active staff member.
    const allUsers = await getCachedTableList('AppUser');
    const u = allUsers.find(
      (x) =>
        String(x.ROWID) === String(assignedToId) ||
        (x.legacyId && String(x.legacyId) === String(assignedToId))
    );
    if (!u) {
      sendError(res, `Staff member ${assignedToId} not found`, 404);
      return;
    }
    if (String(u.role).toUpperCase() !== 'STAFF') {
      sendError(res, `Can only assign tasks to staff members (${u.name})`);
      return;
    }
    const active = u.isActive === true || u.isActive === 'true';
    if (!active) {
      sendError(res, `Staff member ${u.name} is inactive`);
      return;
    }

    const updated = await updateRow(TASK_TABLE, {
      ROWID: id,
      assignedToId: String(assignedToId),
      assignedById: req.user.id,
      status: 'ASSIGNED',
    });

    // Notify the assignee.
    await emitNotifications([String(assignedToId)], {
      type: 'TASK_ASSIGNED',
      title: `New task: ${existing.title}`,
      body: existing.description
        ? String(existing.description).slice(0, 200)
        : `Type: ${existing.taskType}`,
      link: `/staff/tasks?id=${encodeURIComponent(String(id))}`,
      referenceId: String(id),
      referenceType: 'TASK',
    });

    const [shaped] = await attachUsers([updated]);
    sendSuccess(res, shaped, 'Task assigned successfully');
  } catch (error: any) {
    sendServerError(res, error?.message || 'Failed to assign task', error);
  }
}

/**
 * Standard list ordering for tasks: COMPLETED rows always sink to the bottom,
 * within each bucket HIGH priority floats up, ties break newest-first.
 *
 * The ROWID tiebreaker is load-bearing. Tasks created by one multi-assign share
 * a CREATEDTIME to the millisecond, so without it their relative order differs
 * between two calls — and since pages are cut out of this sorted array, a row
 * that moves across the cut appears twice or not at all.
 */
function taskListCompare(a: CatalystRow, b: CatalystRow): number {
  const ca = String(a.status) === 'COMPLETED' ? 1 : 0;
  const cb = String(b.status) === 'COMPLETED' ? 1 : 0;
  if (ca !== cb) return ca - cb;
  const pa = a.priorities === 'HIGH' ? 1 : 0;
  const pb = b.priorities === 'HIGH' ? 1 : 0;
  if (pa !== pb) return pb - pa;
  const ta = a.CREATEDTIME ? new Date(String(a.CREATEDTIME)).getTime() : 0;
  const tb = b.CREATEDTIME ? new Date(String(b.CREATEDTIME)).getTime() : 0;
  if (ta !== tb) return tb - ta;
  return compareRowIdDesc(a.ROWID, b.ROWID);
}

type TaskFilterParams = {
  status?: string;
  taskType?: string;
  assignedToId?: string;
  /** Match assignedToId against ANY of these (identity aliases: ROWID + legacy UUID). */
  assignedToIds?: string[];
  priority?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
};

/**
 * WHERE clauses only — no ORDER BY, no LIMIT. Kept separate so the page query
 * and the COUNT query derive from the SAME predicate; a total that disagrees
 * with the rows on screen is its own bug.
 */
function buildTaskWhere(params: TaskFilterParams): string[] {
  // Every NON-search clause first, then hand the search box whatever is left of
  // the 10-condition budget. Search is the only variable-width clause, so it is
  // the one that must yield — visibly (a warning names the dropped columns)
  // rather than 400-ing the whole query into an empty result.
  const conditions: string[] = [];
  if (params.status) conditions.push(`status = '${zcqlEscapeValue(params.status)}'`);
  if (params.taskType) conditions.push(`taskType = '${zcqlEscapeValue(params.taskType)}'`);
  if (params.assignedToIds && params.assignedToIds.length > 0)
    conditions.push(zcqlAnyOf('assignedToId', params.assignedToIds));
  else if (params.assignedToId)
    conditions.push(`assignedToId = '${zcqlEscapeValue(params.assignedToId)}'`);
  if (params.priority) conditions.push(`priorities = '${zcqlEscapeValue(params.priority)}'`);
  // Half-open upper bound: a `<= '<end>'` bound drops every row created ON the
  // end date, and patching it to 23:59:59 still drops the last second because
  // CREATEDTIME carries milliseconds after a colon.
  conditions.push(...dateRangeClauses('CREATEDTIME', params.startDate, params.endDate));

  if (params.search && params.search.trim()) {
    // Most-identifying first, so a squeezed budget keeps the column people
    // actually search. LIKE goes through the helper because the Catalyst
    // wildcard is `*` — `%` matches zero rows and does not error.
    const { clause } = zcqlSearchWithinBudget(
      ['title', 'description'],
      params.search.trim(),
      countZcqlConditions(conditions)
    );
    // No budget left at all — match nothing rather than silently ignoring the
    // search box and handing back the unfiltered list.
    conditions.push(clause ?? 'ROWID = 0');
  }
  return conditions;
}

function whereSql(clauses: string[]): string {
  return clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
}

/**
 * SELECT + WHERE + ORDER BY for a task list page (LIMIT/OFFSET added by the
 * caller). Compound ORDER BY works fine on Catalyst — the comment that used to
 * live here claiming only single-column ORDER BY is supported was simply wrong,
 * and it cost every list a ROWID tiebreaker. Without one, rows that tie on the
 * sort column shuffle between requests and duplicate/vanish across page edges.
 *
 * The page is still re-sorted in JS afterwards to honour priority weight
 * (HIGH > NORMAL > LOW), which ZCQL cannot express; the page is small, so that
 * is cheap.
 */
function buildTaskQuery(where: string, orderBy: 'created' | 'due'): string {
  const order =
    orderBy === 'due' ? 'dueDate ASC, ROWID ASC' : 'CREATEDTIME DESC, ROWID DESC';
  return `SELECT * FROM ${TASK_TABLE}${where} ORDER BY ${order}`;
}

/**
 * Fetch `want` rows starting at `skip`, in ZCQL-legal chunks.
 *
 * The legacy page/limit contract permits up to 1000 (AllTasks asks for 300,
 * Office Tasks for 200) while ZCQL rejects LIMIT > 300. The old code ran the
 * limit through zcqlSafeLimit, which clamps SILENTLY and echoed the requested
 * limit back in the meta — so at limit=300, page 1 returned rows 0-298 and page
 * 2 (skip=300) started at row 300. Row 299 was returned by no page at all, and
 * nothing errored.
 */
/**
 * The four buckets of `taskListCompare`, in display order.
 *
 * taskListCompare sinks COMPLETED and floats HIGH before ordering by
 * CREATEDTIME. That is a GLOBAL ordering: the JS path sorts the whole table
 * with it and then slices, so a three-month-old HIGH task still appears on
 * page 1. Ordering by CREATEDTIME and re-sorting only the fetched page does
 * NOT reproduce that — it buries that task on page 8 — and a differential run
 * caught the two paths returning different rows for the same request.
 *
 * The buckets are disjoint and exhaustive, and each is internally ordered by
 * CREATEDTIME DESC, so walking them in order IS taskListCompare order.
 *
 * NULL-SAFETY IS LOAD-BEARING: Catalyst's `!=` excludes NULLs. Measured on the
 * live table, `status != 'COMPLETED'` (145) + `status = 'COMPLETED'` (48) = 193
 * of 195 rows — the two NULL-status rows belong to NEITHER side and would
 * silently disappear. Hence the explicit `OR ... IS NULL`.
 */
const NOT_COMPLETED = `(status != 'COMPLETED' OR status IS NULL)`;
const IS_COMPLETED = `status = 'COMPLETED'`;
const IS_HIGH = `priorities = 'HIGH'`;
const NOT_HIGH = `(priorities != 'HIGH' OR priorities IS NULL)`;

const TASK_DISPLAY_BUCKETS: string[][] = [
  [NOT_COMPLETED, IS_HIGH],
  [NOT_COMPLETED, NOT_HIGH],
  [IS_COMPLETED, IS_HIGH],
  [IS_COMPLETED, NOT_HIGH],
];

/**
 * Fetch the window [skip, skip+want) in taskListCompare order, bucket by
 * bucket. Returns null when the filter set leaves no room for the bucket
 * predicates plus a keyset seek within the 10-condition budget — the caller
 * then falls back to the JS path, which is slower but always correctly ordered.
 *
 * DELIBERATELY USES NO ROW COUNTS.
 *
 * The obvious implementation asks each bucket for its size, so `skip` can jump
 * whole buckets without reading them. That is faster and it is WRONG: a bucket
 * size is a fact about the table at one instant, and pagination arithmetic
 * built on a CACHED size silently breaks the moment anyone writes. Complete a
 * task and bucket 1 shrinks by one while the cached size still says otherwise —
 * every subsequent page computes its offset against a number that is no longer
 * true, and rows get skipped or repeated across page boundaries. Invalidating
 * the cache on write narrows that window; it does not close it, because a page
 * can be requested between the write and the invalidation, and because two
 * pages of one user's session can straddle any write at all.
 *
 * Walking instead removes the class of bug rather than shrinking it: each
 * bucket is read in keyset order and rows are counted off as they stream past,
 * so the arithmetic is derived from the rows themselves and cannot disagree
 * with them. The cost is reading the rows you skip — bounded by the page
 * contract, and paid only on deep pages.
 */
async function fetchTaskWindowDisplayOrdered(
  baseClauses: string[],
  skip: number,
  want: number
): Promise<CatalystRow[] | null> {
  // bucket predicates (max 4 conditions) + keyset seek (3) must fit alongside
  // whatever the user filtered by.
  const worstBucketCost = 4;
  if (countZcqlConditions(baseClauses) + worstBucketCost + 3 > MAX_ZCQL_CONDITIONS) {
    return null;
  }

  const collected: CatalystRow[] = [];
  let skipped = 0;
  // Backstop only: (skip + want) is bounded by the page contract.
  const MAX_PAGES_PER_BUCKET = 64;

  for (const bucket of TASK_DISPLAY_BUCKETS) {
    if (collected.length >= want) break;
    const clauses = [...baseClauses, ...bucket];
    let cursor: ListCursor | null = null;

    for (let page = 0; page < MAX_PAGES_PER_BUCKET; page++) {
      const pageClauses = [...clauses];
      if (cursor) pageClauses.push(keysetPredicate('CREATEDTIME', cursor, 'newest'));

      const rows = await executeZCQL<CatalystRow>(
        `SELECT * FROM ${TASK_TABLE}${whereSql(pageClauses)} ` +
          `${keysetOrderBy('CREATEDTIME', 'newest')} LIMIT ${assertZcqlLimit(ZCQL_MAX_LIMIT)}`
      );
      if (rows.length === 0) break;

      for (const row of rows) {
        if (skipped < skip) skipped += 1;
        else if (collected.length < want) collected.push(row);
        else break;
      }
      if (collected.length >= want) break;
      if (rows.length < ZCQL_MAX_LIMIT) break; // bucket exhausted

      const last = rows[rows.length - 1];
      const t = String(last.CREATEDTIME ?? '');
      const r = String(last.ROWID ?? '');
      if (!t || !r) break; // cannot build a cursor — stop rather than loop
      cursor = { t, r };
    }
  }
  return collected;
}

async function fetchTaskWindow(
  where: string,
  orderBy: 'created' | 'due',
  skip: number,
  want: number
): Promise<CatalystRow[]> {
  // Delegates to the shared KEYSET walk. Chunking with a marching OFFSET —
  // which is what this did — silently DUPLICATES rows at chunk boundaries:
  // measured on a 2067-row table with a full total order and no concurrent
  // writes, the OFFSET walk returned 2068 rows / 2067 unique, the keyset walk
  // exactly 2067. Catalyst's OFFSET is not stable and a ROWID tiebreaker in
  // ORDER BY does not rescue it.
  const [timeColumn, sort] =
    orderBy === 'due'
      ? (['dueDate', 'oldest'] as const) // dueDate ASC
      : (['CREATEDTIME', 'newest'] as const); // CREATEDTIME DESC
  return fetchOffsetWindow(TASK_TABLE, where, timeColumn, sort, skip, want);
}

/**
 * Real COUNT for a task predicate, cached briefly and shared by every page of
 * the same query. Returns null when Catalyst cannot answer — callers MUST then
 * render without a total rather than inventing one.
 */
function countTasks(scope: string, where: string): Promise<number | null> {
  return cacheSWR(`tasks:count:${scope}:${where}`, 30, 120, () =>
    countRows(TASK_TABLE, where)
  );
}

/**
 * Drop every cached number that a task write can invalidate.
 *
 * getTasks serves its `total` from a per-predicate SWR cache, so without this a
 * newly created or completed task left the count on screen wrong for up to two
 * minutes — the list and its own total disagreeing. The dashboard aggregates
 * count tasks too, so they go with it.
 *
 * Prefix-based (cacheClear matches by prefix), because the keys embed the role,
 * user id and predicate — there is no single key to delete.
 */
function invalidateTaskCaches(): void {
  cacheClear('tasks:count');
  cacheClear('dashboard_stats');
  cacheClear('history:count');
}

/**
 * GET /api/tasks/groups — admin-only grouped view.
 *
 * Tasks that share a `groupId` (i.e. were assigned to multiple staff in one
 * action) collapse into a single TaskGroup so the admin sees one card with
 * a list of assignees rather than N near-duplicate rows.
 *
 * Solo (legacy) tasks without a groupId are returned as 1-element groups
 * keyed off their ROWID so the response shape is uniform.
 *
 * Pagination here is GROUP-LEVEL: limit=10 returns up to 10 task groups,
 * each potentially containing N assignees. We don't paginate inside a
 * group because tasks-per-group is bounded by your team size (15-ish).
 */
export async function getTaskGroups(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );
    const { status, taskType, priority, includeCompleted } = req.query as Record<string, string>;

    // We need every matching row to group correctly. ZCQL `SELECT *` caps at
    // 299 rows and silently drops the rest, so we use listAllRows (which
    // paginates internally) for correctness.
    //
    // Scaling guard: if the caller did not pick a specific status and didn't
    // opt into completed tasks via `includeCompleted=true`, we drop COMPLETED
    // rows in JS so the working set stays bounded by ACTIVE tasks regardless
    // of how many years of history accumulate. Admin queues are almost always
    // looking at open work; completed history has its own report.
    let rows = await listAllRows(TASK_TABLE);
    if (status) {
      rows = rows.filter((r) => r.status === status);
    } else if (includeCompleted !== 'true') {
      rows = rows.filter((r) => r.status !== 'COMPLETED');
    }
    if (taskType) rows = rows.filter((r) => r.taskType === taskType);
    if (priority) rows = rows.filter((r) => r.priorities === priority);
    const allRows: CatalystRow[] = rows;

    // Bucket by groupId. Solo rows become their own group keyed by ROWID
    // so callers always iterate uniformly.
    const buckets = new Map<string, CatalystRow[]>();
    for (const r of allRows) {
      const key = r.groupId ? `g:${String(r.groupId)}` : `solo:${String(r.ROWID)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(r);
    }

    // Sort groups by most-recent activity in the group (max MODIFIEDTIME),
    // HIGH priority floats to the top.
    const groups = Array.from(buckets.entries()).map(([key, rows]) => {
      const repr = rows[0];
      const latestModified = rows.reduce((acc, r) => {
        const t = r.MODIFIEDTIME ? new Date(r.MODIFIEDTIME).getTime() : 0;
        return t > acc ? t : acc;
      }, 0);
      const isHigh = repr.priorities === 'HIGH';
      return { key, rows, latestModified, isHigh };
    });
    groups.sort((a, b) => {
      if (a.isHigh !== b.isHigh) return a.isHigh ? -1 : 1;
      return b.latestModified - a.latestModified;
    });

    const total = groups.length;
    const pageGroups = groups.slice(skip, skip + limit);

    // Batch-resolve every user referenced across the page (assignees +
    // assigners). One AppUser cache hit, no N+1.
    const userIds = new Set<string>();
    for (const { rows } of pageGroups) {
      for (const r of rows) {
        if (r.assignedToId) userIds.add(String(r.assignedToId));
        if (r.assignedById) userIds.add(String(r.assignedById));
      }
    }
    const users = await lookupUsers(userIds);

    const shapedGroups = pageGroups.map(({ rows }) => {
      const repr = rows[0];
      const isMultiAssign = rows.length > 1 || Boolean(repr.groupId);
      const groupId = repr.groupId
        ? String(repr.groupId)
        : `solo:${String(repr.ROWID)}`;

      let completed = 0;
      let inProgress = 0;
      let onHold = 0;
      const assignees = rows.map((r) => {
        const s = String(r.status ?? 'ASSIGNED');
        if (s === 'COMPLETED') completed++;
        else if (s === 'IN_PROGRESS') inProgress++;
        else if (s === 'ON_HOLD') onHold++;
        return {
          taskId: String(r.ROWID),
          user: users.get(String(r.assignedToId)) ?? null,
          status: s,
          priority: r.priorities ?? 'NORMAL',
          progressPercent: parseInteger(r.progressPercent),
          progressNotes: r.progressNotes ?? null,
          startedAt: r.startedAt ?? null,
          completedAt: r.completedAt ?? null,
          updatedAt: r.MODIFIEDTIME,
        };
      });

      // Earliest CREATEDTIME in the group is when the assignment happened.
      const earliest = rows.reduce((acc, r) => {
        const t = r.CREATEDTIME ? new Date(r.CREATEDTIME).getTime() : Infinity;
        return t < acc ? t : acc;
      }, Infinity);

      return {
        groupId,
        isMultiAssign,
        title: repr.title,
        description: repr.description ?? null,
        taskType: repr.taskType,
        priority: repr.priorities ?? 'NORMAL',
        referenceId: repr.referenceId ?? null,
        referenceType: repr.referenceType ?? null,
        dueDate: repr.dueDate ?? null,
        assignedById: repr.assignedById,
        assignedBy: users.get(String(repr.assignedById)) ?? null,
        createdAt: earliest === Infinity ? repr.CREATEDTIME : new Date(earliest).toISOString(),
        assignees,
        totalAssignees: rows.length,
        completedCount: completed,
        inProgressCount: inProgress,
        onHoldCount: onHold,
      };
    });

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, shapedGroups, 'Task groups retrieved successfully', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get task groups', error);
  }
}

/**
 * GET /api/tasks — list with filters (admin).
 */
export async function getTasks(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );
    const { status, taskType, assignedToId, priority, startDate, endDate, source, search } =
      req.query as Record<string, string>;

    const bounds = catalystDateBounds('CREATEDTIME', startDate, endDate);
    const hasDateFilter = Boolean(bounds.start || bounds.endExclusive);
    const term = search?.trim().toLowerCase() ?? '';

    let pageRows: CatalystRow[];
    // null means "no real count available" — never a number derived from the page.
    let total: number | null;

    // ── Source filter (e.g. the Office Tasks page) ──────────────────────────
    // A task counts as OFFICE if its own row says so OR it's linked to an OFFICE
    // grievance. The grievance check makes this robust even before the
    // Task.source column exists (Grievance.source is authoritative — office
    // grievances can't be created without it). Runs over the full table so no
    // office task is ever missed behind pagination.
    if (source) {
      const wantOffice = source.toUpperCase() === 'OFFICE';
      let rows = await listAllRows(TASK_TABLE);

      // ONE read of Grievance, reused for BOTH the office test and the
      // reference-number decoration below. attachReferenceNumbers used to read
      // the very same table a second time later in this request.
      const officeGrievanceIds = new Set<string>();
      let grievanceNumbers: Map<string, string> | undefined;
      try {
        const grievances = await listAllRows('Grievance');
        grievanceNumbers = new Map<string, string>();
        for (const g of grievances) {
          const gid = String(g.ROWID);
          if (String(g.source ?? 'PUBLIC').toUpperCase() === 'OFFICE') {
            officeGrievanceIds.add(gid);
          }
          grievanceNumbers.set(
            gid,
            g.grievanceNumber ? String(g.grievanceNumber) : `GRV-${gid}`
          );
        }
      } catch {
        /* Grievance unreadable — fall back to the row's own source, and let
           attachReferenceNumbers do its own scoped lookup. */
      }

      const isOfficeTask = (r: CatalystRow) =>
        String(r.source ?? 'PUBLIC').toUpperCase() === 'OFFICE' ||
        (r.referenceType === 'GRIEVANCE' &&
          Boolean(r.referenceId) &&
          officeGrievanceIds.has(String(r.referenceId)));

      rows = rows.filter((r) => (wantOffice ? isOfficeTask(r) : !isOfficeTask(r)));
      if (status) rows = rows.filter((r) => r.status === status);
      if (taskType) rows = rows.filter((r) => r.taskType === taskType);
      if (assignedToId) rows = rows.filter((r) => String(r.assignedToId) === assignedToId);
      if (priority) rows = rows.filter((r) => r.priorities === priority);
      if (hasDateFilter) rows = rows.filter((r) => inDateRange(r, 'CREATEDTIME', bounds));
      if (term) rows = rows.filter((r) => matchesTaskSearch(r, term));
      rows.sort(taskListCompare);
      total = rows.length;
      const officePageRows = rows.slice(skip, skip + limit);

      const tasks = await attachUsers(officePageRows);
      const [, historyMap] = await Promise.all([
        attachReferenceNumbers(
          tasks,
          grievanceNumbers ? { GRIEVANCE: grievanceNumbers } : undefined
        ),
        recentHistoryByTaskId(officePageRows.map((r) => String(r.ROWID))),
      ]);
      for (const t of tasks) t.progressHistory = historyMap.get(t.id) ?? [];
      // Stamp the resolved source so the client identifies it even when the
      // Task.source column is absent.
      if (wantOffice) for (const t of tasks) t.source = 'OFFICE';

      sendSuccess(
        res,
        tasks,
        'Tasks retrieved successfully',
        200,
        listMeta(page, limit, tasks.length, skip + tasks.length < total, total)
      );
      return;
    }

    let hasMore: boolean;

    if (useZCQL()) {
      const where = whereSql(
        buildTaskWhere({
          status, taskType, assignedToId, priority, startDate, endDate, search,
        })
      );
      // ── Cursor mode ────────────────────────────────────────────────────
      // Opted into by sending `cursor` or `sort`; page/limit callers keep the
      // old contract. A cursor page is ONE query at any depth, where page/limit
      // has to walk the rows it skips.
      if (req.query.cursor !== undefined || req.query.sort !== undefined) {
        const { limit: kLimit, cursor: cursorRaw, sort } = parseKeysetQuery(req.query);
        const cursor = decodeCursor(cursorRaw);
        const clauses = buildTaskWhere({
          status, taskType, assignedToId, priority, startDate, endDate, search,
        });
        if (cursor) clauses.push(keysetPredicate('CREATEDTIME', cursor, sort));

        const [fetchedK, countedK] = await Promise.all([
          executeZCQL<CatalystRow>(
            `SELECT * FROM ${TASK_TABLE}${whereSql(clauses)} ` +
              `${keysetOrderBy('CREATEDTIME', sort)} LIMIT ${assertZcqlLimit(kLimit + 1)}`
          ),
          cursor ? Promise.resolve(null) : countTasks('all', where),
        ]);
        const moreK = fetchedK.length > kLimit;
        const rowsK = moreK ? fetchedK.slice(0, kLimit) : fetchedK;
        // Same page-level ordering the page/limit branch applies.
        rowsK.sort(taskListCompare);
        const lastK = rowsK[rowsK.length - 1];
        sendSuccess(
          res,
          await attachUsers(rowsK),
          'Tasks retrieved successfully',
          200,
          {
            limit: kLimit,
            count: rowsK.length,
            hasMore: moreK,
            sort,
            // Cursor is built from the LAST row in QUERY order, which after the
            // in-page re-sort is no longer rowsK[last] — take it from the
            // pre-sort fetch or the walk skips rows.
            nextCursor:
              moreK && fetchedK[kLimit - 1]
                ? encodeCursor({
                    t: String(fetchedK[kLimit - 1].CREATEDTIME),
                    r: String(fetchedK[kLimit - 1].ROWID),
                  })
                : null,
            ...(countedK !== null && countedK !== undefined
              ? { total: countedK, totalKnown: true, totalPages: Math.ceil(countedK / kLimit) }
              : { totalKnown: false }),
          }
        );
        return;
      }

      // A real COUNT replaces `skip + pageRows.length + (hasMore ? 1 : 0)`,
      // which read like a total but could never exceed currentPage + 1 — so the
      // pager built on it stopped after two pages and hid the rest of the table.
      // Counted in PARALLEL with the page and shared across pages via the cache.
      const baseClauses = buildTaskWhere({
        status, taskType, assignedToId, priority, startDate, endDate, search,
      });
      const [ordered, counted] = await Promise.all([
        fetchTaskWindowDisplayOrdered(baseClauses, skip, limit + 1),
        countTasks('all', where),
      ]);

      if (ordered === null) {
        // The filter set left no room for the bucket predicates. Rather than
        // serve a DIFFERENTLY-ORDERED page (which is what made the ZCQL and JS
        // paths disagree), drop to the scan path, which is slower but always
        // ordered the way the user expects.
        console.warn(
          '[task] filter set leaves no budget for display-ordered paging — ' +
            'answering this list from the JS path to preserve ordering'
        );
        let rows = await listAllRows(TASK_TABLE);
        if (status) rows = rows.filter((r) => r.status === status);
        if (taskType) rows = rows.filter((r) => r.taskType === taskType);
        if (assignedToId) rows = rows.filter((r) => r.assignedToId === assignedToId);
        if (priority) rows = rows.filter((r) => r.priorities === priority);
        if (hasDateFilter) rows = rows.filter((r) => inDateRange(r, 'CREATEDTIME', bounds));
        if (search) rows = rows.filter((r) => matchesTaskSearch(r, search));
        rows.sort(taskListCompare);
        total = rows.length;
        pageRows = rows.slice(skip, skip + limit);
        hasMore = skip + pageRows.length < total;
      } else {
        hasMore = ordered.length > limit;
        pageRows = hasMore ? ordered.slice(0, limit) : ordered;
        // Already in taskListCompare order (bucket walk) — the sort below is a
        // no-op safety net, not the thing that establishes the order.
        pageRows.sort(taskListCompare);
        total = counted;
      }
    } else {
      let rows = await listAllRows(TASK_TABLE);
      if (status) rows = rows.filter((r) => r.status === status);
      if (taskType) rows = rows.filter((r) => r.taskType === taskType);
      if (assignedToId) rows = rows.filter((r) => r.assignedToId === assignedToId);
      if (priority) rows = rows.filter((r) => r.priorities === priority);
      // Same bounds the ZCQL branch pushes down, so the two branches agree.
      if (hasDateFilter) rows = rows.filter((r) => inDateRange(r, 'CREATEDTIME', bounds));
      if (term) rows = rows.filter((r) => matchesTaskSearch(r, term));

      rows.sort(taskListCompare);

      total = rows.length;
      pageRows = rows.slice(skip, skip + limit);
      hasMore = skip + pageRows.length < total;
    }

    // attachReferenceNumbers and recentHistoryByTaskId are independent Catalyst
    // reads — run them in parallel instead of two serial round-trips.
    const tasks = await attachUsers(pageRows);
    const [, historyMap] = await Promise.all([
      attachReferenceNumbers(tasks),
      recentHistoryByTaskId(pageRows.map((r) => String(r.ROWID))),
    ]);
    for (const t of tasks) t.progressHistory = historyMap.get(t.id) ?? [];

    sendSuccess(
      res,
      tasks,
      'Tasks retrieved successfully',
      200,
      listMeta(page, limit, tasks.length, hasMore, total)
    );
  } catch (error) {
    sendServerError(res, 'Failed to get tasks', error);
  }
}

/**
 * GET /api/tasks/all — EVERY task, visible to ANY authenticated user.
 *
 * Powers the shared "All Tasks" board: everyone can see what's pending across
 * the office. Supports the same filters as the admin list plus a free-text
 * `search` over title/description.
 */
export async function getAllTasks(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );
    const { status, taskType, assignedToId, priority, startDate, endDate, search } =
      req.query as Record<string, string>;

    let rows = await listAllRows(TASK_TABLE);
    // Office tasks use the admin-assignment flow and are hidden from the shared
    // board for staff — only admins (and the assignee, via My Tasks) see them.
    if (req.user?.role === 'STAFF') {
      rows = rows.filter((r) => String(r.source ?? 'PUBLIC').toUpperCase() !== 'OFFICE');
    }
    if (status) rows = rows.filter((r) => r.status === status);
    if (taskType) rows = rows.filter((r) => r.taskType === taskType);
    if (assignedToId) rows = rows.filter((r) => String(r.assignedToId) === assignedToId);
    if (priority) rows = rows.filter((r) => r.priorities === priority);
    // Half-open, lexicographic bounds — the old `new Date(endDate)` comparison
    // parsed a bare end date as UTC midnight and dropped every row created ON
    // that date, while comparing it against a CREATEDTIME parsed as local time.
    const bounds = catalystDateBounds('CREATEDTIME', startDate, endDate);
    if (bounds.start || bounds.endExclusive) {
      rows = rows.filter((r) => inDateRange(r, 'CREATEDTIME', bounds));
    }
    if (search) {
      const q = String(search).trim().toLowerCase();
      if (q) rows = rows.filter((r) => matchesTaskSearch(r, q));
    }

    rows.sort(taskListCompare);
    const total = rows.length;
    const pageRows = rows.slice(skip, skip + limit);

    // attachReferenceNumbers and recentHistoryByTaskId are independent Catalyst
    // reads — run them in parallel instead of two serial round-trips.
    const tasks = await attachUsers(pageRows);
    const [, historyMap] = await Promise.all([
      attachReferenceNumbers(tasks),
      recentHistoryByTaskId(pageRows.map((r) => String(r.ROWID))),
    ]);
    for (const t of tasks) t.progressHistory = historyMap.get(t.id) ?? [];

    sendSuccess(
      res,
      tasks,
      'All tasks retrieved successfully',
      200,
      listMeta(page, limit, tasks.length, skip + tasks.length < total, total)
    );
  } catch (error) {
    sendServerError(res, 'Failed to get all tasks', error);
  }
}

/**
 * PATCH /api/tasks/:id/forward — ANY authenticated user forwards a task to one
 * other user (chosen from the directory), with an optional remark. The row is
 * stamped with the recipient + bumped to HIGH priority so it surfaces on the
 * recipient's "Forwarded to Me" page. The forward is recorded in TaskHistory
 * (so it shows in the shared timeline visible to everyone) and the recipient is
 * notified. Tolerant of a Catalyst schema missing the forwarded* columns (the
 * priority bump still applies; add the columns to enable the forwarded views).
 */
export async function forwardTask(
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
      sendError(res, 'You cannot forward a task to yourself');
      return;
    }

    const existing = await getRow(TASK_TABLE, id);
    if (!existing) {
      sendNotFound(res, 'Task not found');
      return;
    }

    const note = typeof remark === 'string' ? remark.trim() : '';
    // Resolve recipient + forwarder names for the audit note.
    const names = await lookupUsers([String(recipientId), String(req.user.id)]);
    const recipientName = names.get(String(recipientId))?.name || 'a user';
    const forwarderName =
      names.get(String(req.user.id))?.name || req.user.name || 'a user';

    // Forwarding moves the task into active work: bump it to IN_PROGRESS (unless
    // already completed) and stamp startedAt, so the tracker and any linked
    // grievance both reflect that someone is now on it.
    const nowIst = nowCatalystIST();
    const willProgress = String(existing.status) !== 'COMPLETED';
    const forwardUpdate: { ROWID: string; [column: string]: any } = {
      ROWID: id,
      forwardedToId: String(recipientId),
      forwardedById: req.user.id,
      forwardedAt: nowIst,
      forwardRemark: note || null,
      priorities: 'HIGH',
    };
    if (willProgress) {
      forwardUpdate.status = 'IN_PROGRESS';
      if (!existing.startedAt) forwardUpdate.startedAt = nowIst;
    }
    const updated = await updateRowTolerant(
      TASK_TABLE,
      forwardUpdate,
      ['forwardedToId', 'forwardedById', 'forwardedAt', 'forwardRemark']
    );

    // Audit entry — surfaces in the shared timeline (getTaskAudit) for everyone
    // and on the linked grievance timeline (which pulls TaskHistory). Stamped
    // with the new status so the "Forwarded to …" line carries In Progress.
    try {
      await insertRow(HISTORY_TABLE, {
        taskId: id,
        note: `Forwarded to ${recipientName} by ${forwarderName}${note ? `: ${note}` : ''}`,
        status: willProgress ? 'IN_PROGRESS' : null,
        createdById: req.user.id,
      });
    } catch {
      /* TaskHistory table optional — ignore */
    }

    // Mirror the forward-driven status onto the linked grievance (grievance
    // tasks only) so the grievance pages move to In Progress too.
    if (willProgress) {
      await syncGrievanceForTask(updated, 'IN_PROGRESS');
    }

    // Notify the recipient so it shows in their bell + Forwarded to Me page.
    await emitNotification({
      recipientId: String(recipientId),
      type: 'TASK_FORWARDED',
      title: `Task forwarded to you: ${existing.title ?? 'Task'}`,
      body: `${forwarderName} forwarded this task to you${note ? `: ${note}` : '.'}`,
      link: '/forwarded',
      referenceId: String(id),
      referenceType: 'TASK',
    });

    const [shaped] = await attachUsers([updated]);
    invalidateTaskCaches();
    sendSuccess(res, shaped, `Task forwarded to ${recipientName}`);
  } catch (error) {
    sendServerError(res, 'Failed to forward task', error);
  }
}

/**
 * GET /api/tasks/forwarded — items (tasks + grievances) forwarded TO the
 * current user that aren't done yet. Each caller sees only their own queue.
 * Powers the "Forwarded to Me" page and the dashboard card. Reads LIVE source
 * status, so a completed task / resolved grievance drops off every surface at
 * once. Returns a unified list discriminated by `entityType`.
 */
export async function getForwardedTasks(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const me = await userIdForms(req.user.id);

    // ── Tasks forwarded to me (not completed) ──
    let taskRows = await listAllRows(TASK_TABLE);
    taskRows = taskRows.filter(
      (r) =>
        r.forwardedToId &&
        me.has(String(r.forwardedToId)) &&
        String(r.status) !== 'COMPLETED'
    );
    const tasks = await attachUsers(taskRows);
    await attachReferenceNumbers(tasks);
    const taskForwarders = await lookupUsers(
      new Set(taskRows.map((r) => String(r.forwardedById)).filter(Boolean))
    );
    const taskItems = tasks.map((t) => ({
      entityType: 'TASK' as const,
      id: t.id,
      title: t.title,
      referenceNo: t.referenceNo,
      status: t.status,
      priority: t.priority,
      description: t.description,
      assignedTo: t.assignedTo,
      forwardedById: t.forwardedById ?? null,
      forwardedBy: t.forwardedById
        ? taskForwarders.get(String(t.forwardedById)) ?? null
        : null,
      forwardedAt: t.forwardedAt ?? null,
      forwardRemark: t.forwardRemark ?? null,
    }));

    // ── Grievances forwarded to me (not resolved/rejected) ──
    // Read raw rows; the forwarded card only needs id/ref/status/petitioner +
    // who forwarded it. Kept inline (no import from grievance.controller) to
    // avoid a circular module dependency.
    let grievanceRows: CatalystRow[] = [];
    try {
      grievanceRows = await listAllRows('Grievance');
    } catch {
      grievanceRows = [];
    }
    grievanceRows = grievanceRows.filter(
      (r) =>
        r.forwardedToId &&
        me.has(String(r.forwardedToId)) &&
        !['RESOLVED', 'REJECTED'].includes(String(r.status))
    );
    const grievanceForwarders = await lookupUsers(
      new Set(grievanceRows.map((r) => String(r.forwardedById)).filter(Boolean))
    );
    const grievanceItems = grievanceRows.map((r) => ({
      entityType: 'GRIEVANCE' as const,
      id: String(r.ROWID),
      title: `${r.grievanceType ?? 'Grievance'} — ${r.petitionerName ?? ''}`.trim(),
      referenceNo: r.grievanceNumber
        ? String(r.grievanceNumber)
        : `GRV-${String(r.ROWID)}`,
      status: (r.status as string) ?? null,
      priority: (r.priorities as string) ?? 'MEDIUM',
      description: (r.description as string) ?? null,
      assignedTo: null,
      forwardedById: r.forwardedById ?? null,
      forwardedBy: r.forwardedById
        ? grievanceForwarders.get(String(r.forwardedById)) ?? null
        : null,
      forwardedAt: r.forwardedAt ?? null,
      forwardRemark: (r.forwardRemark as string) ?? null,
    }));

    // Most-recently forwarded first across both entity types.
    const items = [...taskItems, ...grievanceItems].sort((a, b) => {
      const ta = a.forwardedAt ? new Date(String(a.forwardedAt)).getTime() : 0;
      const tb = b.forwardedAt ? new Date(String(b.forwardedAt)).getTime() : 0;
      return tb - ta;
    });

    sendSuccess(res, items, 'Forwarded items retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get forwarded tasks', error);
  }
}

/**
 * PATCH /api/tasks/:id/edit — shared edit for the All-Tasks board.
 *
 * ANY authenticated user may change the status and/or add a remark. Every
 * change is recorded in TaskHistory with the editor's id + timestamp, so the
 * audit timeline always shows who edited/remarked and when.
 */
export async function editTaskShared(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const { id } = req.params;
    const { status, progressNotes } = req.body as {
      status?: string;
      progressNotes?: string;
    };

    const existing = await getRow(TASK_TABLE, id);
    if (!existing) {
      sendNotFound(res, 'Task not found');
      return;
    }
    // Office tasks are admin-managed only — staff (even the creator/assignee)
    // cannot edit them. PUBLIC tasks stay editable by any authenticated user.
    if (
      String(existing.source ?? 'PUBLIC').toUpperCase() === 'OFFICE' &&
      req.user.role === 'STAFF'
    ) {
      sendError(res, 'Office tasks can only be edited by an admin', 403);
      return;
    }
    if (status && !VALID_TASK_STATUS.has(status)) {
      sendError(res, `Invalid status: ${status}`);
      return;
    }
    const note = typeof progressNotes === 'string' ? progressNotes.trim() : '';
    if (!status && !note) {
      sendError(res, 'Provide a status change or a remark');
      return;
    }

    const updateData: Record<string, unknown> = { ROWID: id };
    if (status) {
      updateData.status = status;
      if (status === 'IN_PROGRESS' && !existing.startedAt) {
        updateData.startedAt = nowCatalystIST();
      }
      if (status === 'COMPLETED') {
        updateData.completedAt = nowCatalystIST();
        updateData.progressPercent = 100;
      }
    }
    if (note) updateData.progressNotes = note;

    // Audit entry attributed to whoever made the edit.
    await insertRow(HISTORY_TABLE, {
      taskId: id,
      note: note || `Status changed to ${status}`,
      status: status || null,
      createdById: req.user.id,
    });

    const updated = await updateRow(TASK_TABLE, updateData as any);
    // If this is a grievance task, mirror the new status onto its grievance so
    // the grievance pages stay in lock-step with the Task Tracker.
    if (status) {
      await syncGrievanceForTask(existing, status);
    }
    const [shaped] = await attachUsers([updated]);
    const historyMap = await recentHistoryByTaskId([id], 20);
    shaped.progressHistory = historyMap.get(id) ?? [];
    sendSuccess(res, shaped, 'Task updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update task', error);
  }
}

/**
 * GET /api/tasks/:id/audit — full audit timeline for ANY task, visible to any
 * authenticated user (the shared board needs everyone to see who edited/
 * remarked and when). Read-only sibling of the staff-scoped getTaskHistory.
 */
export async function getTaskAudit(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const task = await getRow(TASK_TABLE, id);
    if (!task) {
      sendNotFound(res, 'Task not found');
      return;
    }
    // Scoped to this task — the old form read the WHOLE TaskHistory table and
    // threw away everything but one task's rows.
    const matched = await historyRowsForTask(id);
    const creatorIds = new Set(matched.map((h) => String(h.createdById)).filter(Boolean));
    const creators = await lookupUsers(creatorIds);
    const history = matched.map((h) =>
      shapeHistory(h, creators.get(String(h.createdById)) ?? null)
    );
    sendSuccess(res, history, 'Task audit timeline retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get task audit', error);
  }
}

/**
 * GET /api/tasks/my-tasks — staff sees only their own tasks.
 */
export async function getMyTasks(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );
    const { status, startDate, endDate } = req.query as Record<string, string>;

    // My Tasks shows EVERY task assigned to the staff member — including office
    // grievances they entered (those are read-only in the UI; staff edits are
    // blocked server-side in updateTaskProgress/editTaskShared).
    let pageRows: CatalystRow[];
    // null means "no real count available" — never a number derived from the page.
    let total: number | null;
    let hasMore: boolean;

    // Match against all identity aliases (ROWID + legacy UUID) — tasks
    // assigned before/after a migration may carry either form.
    const me = await userIdForms(req.user.id);

    if (useZCQL()) {
      const where = whereSql(
        buildTaskWhere({ status, assignedToIds: [...me], startDate, endDate })
      );
      // Real COUNT instead of `skip + pageRows.length + (hasMore ? 1 : 0)`,
      // which capped any pager at two pages. The cache key carries the WHERE,
      // which already contains this staff member's identity aliases, so one
      // staffer's count can't be served to another.
      const [fetched, counted] = await Promise.all([
        fetchTaskWindow(where, 'due', skip, limit + 1),
        countTasks('mine', where),
      ]);
      hasMore = fetched.length > limit;
      pageRows = hasMore ? fetched.slice(0, limit) : fetched;
      // Re-sort: completed sinks; otherwise HIGH priority first, then newest.
      pageRows.sort(taskListCompare);
      total = counted;
    } else {
      let rows = await listAllRows(TASK_TABLE);
      rows = rows.filter((r) => me.has(String(r.assignedToId)));
      if (status) rows = rows.filter((r) => r.status === status);
      // Same bounds the ZCQL branch pushes down, so the two branches agree.
      const bounds = catalystDateBounds('CREATEDTIME', startDate, endDate);
      if (bounds.start || bounds.endExclusive) {
        rows = rows.filter((r) => inDateRange(r, 'CREATEDTIME', bounds));
      }

      rows.sort((a, b) => {
        const pa = a.priorities === 'HIGH' ? 1 : 0;
        const pb = b.priorities === 'HIGH' ? 1 : 0;
        if (pa !== pb) return pb - pa;
        const da = a.dueDate ? new Date(String(a.dueDate)).getTime() : Infinity;
        const db = b.dueDate ? new Date(String(b.dueDate)).getTime() : Infinity;
        if (da !== db) return da - db;
        // Tiebreaker: tasks with no due date all compare equal above, so
        // without this the order shifts between requests and rows duplicate or
        // vanish across the page boundary carved out of this array.
        return compareRowIdDesc(a.ROWID, b.ROWID);
      });

      total = rows.length;
      pageRows = rows.slice(skip, skip + limit);
      hasMore = skip + pageRows.length < total;
    }

    // Use the co-assignee-aware variant so each task carries a list of
    // other staff working on the same multi-assigned task. This is the
    // "+N others assigned" badge data the staff dashboard renders.
    // attachReferenceNumbers and recentHistoryByTaskId are independent Catalyst
    // reads — run them in parallel instead of two serial round-trips.
    const tasks = await attachUsersWithCoAssignees(pageRows);
    const [, historyMap] = await Promise.all([
      attachReferenceNumbers(tasks),
      recentHistoryByTaskId(pageRows.map((r) => String(r.ROWID))),
    ]);
    for (const t of tasks) t.progressHistory = historyMap.get(t.id) ?? [];

    sendSuccess(
      res,
      tasks,
      'My tasks retrieved successfully',
      200,
      listMeta(page, limit, tasks.length, hasMore, total)
    );
  } catch (error) {
    sendServerError(res, 'Failed to get tasks', error);
  }
}

/**
 * GET /api/tasks/:id
 */
export async function getTaskById(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const row = await getRow(TASK_TABLE, id);
    if (!row) {
      sendNotFound(res, 'Task not found');
      return;
    }
    if (req.user?.role === 'STAFF') {
      const me = await userIdForms(req.user.id);
      if (!me.has(String(row.assignedToId))) {
        sendError(res, 'Forbidden', 403);
        return;
      }
    }
    const [shaped] = await attachUsers([row]);
    sendSuccess(res, shaped, 'Task retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get task', error);
  }
}

/**
 * PATCH /api/tasks/:id/progress — staff updates progress, creates history entry.
 */
export async function updateTaskProgress(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const { id } = req.params;
    const { status, progressNotes } = req.body;

    const existing = await getRow(TASK_TABLE, id);
    if (!existing) {
      sendNotFound(res, 'Task not found');
      return;
    }
    // Office tasks are admin-managed only — staff cannot update their progress.
    if (
      String(existing.source ?? 'PUBLIC').toUpperCase() === 'OFFICE' &&
      req.user.role === 'STAFF'
    ) {
      sendError(res, 'Office tasks can only be edited by an admin', 403);
      return;
    }
    if (req.user.role === 'STAFF') {
      const me = await userIdForms(req.user.id);
      if (!me.has(String(existing.assignedToId))) {
        sendError(res, 'Not authorized to update this task', 403);
        return;
      }
    }
    if (status && !VALID_TASK_STATUS.has(status)) {
      sendError(res, `Invalid status: ${status}`);
      return;
    }

    const updateData: Record<string, unknown> = { ROWID: id };
    if (status) {
      updateData.status = status;
      if (status === 'IN_PROGRESS' && !existing.startedAt) {
        updateData.startedAt = nowCatalystIST();
      }
      if (status === 'COMPLETED') {
        updateData.completedAt = nowCatalystIST();
        updateData.progressPercent = 100;
      }
    }
    if (progressNotes !== undefined && progressNotes.trim()) {
      updateData.progressNotes = progressNotes.trim();
    }

    if ((progressNotes && progressNotes.trim()) || status) {
      await insertRow(HISTORY_TABLE, {
        taskId: id,
        note: progressNotes?.trim() || `Status changed to ${status}`,
        status: status || null,
        createdById: req.user.id,
      });
    }

    const updated = await updateRow(TASK_TABLE, updateData as any);

    // Mirror the new status onto the linked grievance (grievance tasks only) so
    // the grievance pages reflect staff progress made on the board.
    if (status) {
      await syncGrievanceForTask(existing, status);
    }

    // Staff just resolved the task -> notify the admin who assigned it so they
    // know it's done without having to poll the tracker. Best-effort, like the
    // assignment notification: emit helper swallows errors.
    if (
      status === 'COMPLETED' &&
      req.user.role === 'STAFF' &&
      existing.assignedById
    ) {
      const resolverName = req.user.name || 'A staff member';
      const taskTitle = String(existing.title ?? 'Task');
      await emitNotification({
        recipientId: String(existing.assignedById),
        type: 'TASK_RESOLVED',
        title: `Task resolved: ${taskTitle}`,
        body: `${resolverName} marked "${taskTitle}" as resolved.`,
        // Admin task tracker page; carry the row id so the page can scroll
        // / highlight the resolved task.
        link: `/admin/task-tracker?id=${encodeURIComponent(String(id))}`,
        referenceId: id,
        referenceType: 'TASK',
      });
    }

    const [shaped] = await attachUsers([updated]);
    const historyMap = await recentHistoryByTaskId([id], 10);
    shaped.progressHistory = historyMap.get(id) ?? [];
    invalidateTaskCaches();
    sendSuccess(res, shaped, 'Task progress updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update task progress', error);
  }
}

/**
 * GET /api/tasks/:id/history
 */
export async function getTaskHistory(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const { id } = req.params;
    const task = await getRow(TASK_TABLE, id);
    if (!task) {
      sendNotFound(res, 'Task not found');
      return;
    }
    if (req.user.role === 'STAFF') {
      const me = await userIdForms(req.user.id);
      if (!me.has(String(task.assignedToId))) {
        sendError(res, 'Not authorized to view this task history', 403);
        return;
      }
    }

    // Scoped to this task — the old form read the WHOLE TaskHistory table and
    // threw away everything but one task's rows.
    const matched = await historyRowsForTask(id);

    const creatorIds = new Set(matched.map((h) => String(h.createdById)).filter(Boolean));
    const creators = await lookupUsers(creatorIds);
    const history = matched.map((h) =>
      shapeHistory(h, creators.get(String(h.createdById)) ?? null)
    );

    sendSuccess(res, history, 'Task history retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get task history', error);
  }
}

/**
 * PATCH /api/tasks/:id/status — admin changes status.
 */
export async function updateTaskStatus(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!VALID_TASK_STATUS.has(status)) {
      sendError(res, `Invalid status: ${status}`);
      return;
    }
    const updateData: Record<string, unknown> = { ROWID: id, status };
    if (status === 'COMPLETED') {
      updateData.completedAt = nowCatalystIST();
      updateData.progressPercent = 100;
    }
    const updated = await updateRow(TASK_TABLE, updateData as any);
    // Mirror onto the linked grievance (grievance tasks only). `updated` is the
    // full row, so it carries referenceType / referenceId.
    await syncGrievanceForTask(updated, status);
    const [shaped] = await attachUsers([updated]);
    invalidateTaskCaches();
    sendSuccess(res, shaped, 'Task status updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update task status', error);
  }
}

/**
 * GET /api/tasks/tracking — admin dashboard summary.
 */
export async function getTaskTracking(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const rows = await listAllRows(TASK_TABLE);
    const summary = {
      total: rows.length,
      assigned: rows.filter((r) => r.status === 'ASSIGNED').length,
      inProgress: rows.filter((r) => r.status === 'IN_PROGRESS').length,
      completed: rows.filter((r) => r.status === 'COMPLETED').length,
      onHold: rows.filter((r) => r.status === 'ON_HOLD').length,
    };

    // Pending tasks per staff (status != COMPLETED)
    const pendingByStaff = new Map<string, number>();
    for (const r of rows) {
      if (r.status === 'COMPLETED') continue;
      if (!r.assignedToId) continue;
      const id = String(r.assignedToId);
      pendingByStaff.set(id, (pendingByStaff.get(id) || 0) + 1);
    }

    const staffMembers = await lookupUsers(pendingByStaff.keys());
    const staffTaskCounts = Array.from(pendingByStaff.entries())
      .map(([staffId, count]) => ({
        staff: staffMembers.get(staffId),
        pendingTasks: count,
      }))
      .filter((entry) => entry.staff);

    // Recent activity — top 10 by MODIFIEDTIME
    const recent = [...rows]
      .sort((a, b) => {
        const ta = a.MODIFIEDTIME ? new Date(a.MODIFIEDTIME).getTime() : 0;
        const tb = b.MODIFIEDTIME ? new Date(b.MODIFIEDTIME).getTime() : 0;
        return tb - ta;
      })
      .slice(0, 10);
    const recentShaped = await attachUsers(recent);

    sendSuccess(
      res,
      { summary, staffTaskCounts, recentActivity: recentShaped },
      'Task tracking data retrieved'
    );
  } catch (error) {
    sendServerError(res, 'Failed to get task tracking', error);
  }
}

/**
 * DELETE /api/tasks/:id — admin. Cascades delete on TaskHistory rows.
 */
export async function deleteTask(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    // Cascade-delete history rows first (Catalyst doesn't auto-cascade).
    // Scoped lookup: reading the whole TaskHistory table to find one task's
    // children was the same full-scan pattern as the list path, and the deletes
    // were serial on top of it. allSettled keeps the "ignore individual
    // failures" semantics while collapsing N round-trips into one batch.
    try {
      const matchedIds = (await historyRowsForTask(id)).map((h) => String(h.ROWID));
      await Promise.allSettled(matchedIds.map((hid) => deleteRow(HISTORY_TABLE, hid)));
    } catch {
      // History table may not exist yet — proceed with task delete anyway.
    }

    await deleteRow(TASK_TABLE, id);
    invalidateTaskCaches();
    sendSuccess(res, null, 'Task deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete task', error);
  }
}

/**
 * GET /api/tasks/staff — list active STAFF for assignment dropdown.
 */
export async function getStaffMembers(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    // Read from cached Catalyst AppUser. Filter to active STAFF users
    // in JS (cheap on a list of office staff).
    const allUsers = await getCachedTableList('AppUser');
    const staff = allUsers
      .filter((u) => {
        const isActive = u.isActive === true || u.isActive === 'true';
        // Hide dev/test accounts (staff@oms.gov.in etc) from the
        // assignment dropdown -- they remain logged-in-able but never
        // show up as a candidate assignee.
        return (
          String(u.role) === 'STAFF' && isActive && !isHiddenTestUser(u)
        );
      })
      .map((u) => ({
        // Prefer legacyId for backward compat with old client-side caches;
        // fall back to ROWID for users created post-migration.
        id: u.legacyId ? String(u.legacyId) : String(u.ROWID),
        name: String(u.name),
        email: String(u.email),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    sendSuccess(res, staff, 'Staff members retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get staff members', error);
  }
}

/**
 * POST /api/tasks/reconcile-grievances — admin one-time backfill.
 *
 * Forward/reverse sync keeps NEW grievance/task status changes mirrored, but
 * rows that drifted before the sync existed stay out of step until touched.
 * This walks every grievance↔task pair and forces them into agreement (most-
 * advanced status wins). Idempotent — safe to run more than once.
 */
export async function reconcileGrievanceTasks(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const result = await reconcileGrievanceTaskStatuses();
    sendSuccess(res, result, 'Grievance and task statuses reconciled');
  } catch (error) {
    sendServerError(res, 'Failed to reconcile grievance and task statuses', error);
  }
}
