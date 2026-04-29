/**
 * Task controller — backed by Catalyst Data Store via custom REST client.
 *
 * Mirrors backend/src/controllers/task.controller.ts (the Prisma version).
 *
 * Catalyst-specific notes:
 *   - 2 enums (TaskType, TaskStatus) stored as TEXT, validated in this file.
 *   - Catalyst column `priorities` (couldn't use reserved word `priority`)
 *     is mapped transparently to/from the frontend's `priority` field.
 *   - User table still lives on Neon — assignedToId validation queries Prisma.
 *   - Cascade delete (Prisma `onDelete: Cascade`) is done manually here.
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
  deleteRow,
  toCatalystDate,
  executeZCQL,
  zcqlEscapeValue,
  zcqlSafeLimit,
  CatalystRow,
} from '../lib/catalyst-client';
import { useZCQL } from '../config/feature-flags';
import { getCachedTableList, isHiddenTestUser } from '../lib/catalyst-user-lookup';
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
const VALID_TASK_STATUS = new Set(['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD']);

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
    title: row.title,
    description: row.description ?? null,
    taskType: row.taskType,
    status: row.status,
    priority: row.priorities ?? 'NORMAL', // Catalyst → frontend mapping
    referenceId: row.referenceId ?? null,
    referenceType: row.referenceType ?? null,
    progressNotes: row.progressNotes ?? null,
    progressPercent: parseInteger(row.progressPercent),
    assignedAt: row.CREATEDTIME, // Catalyst auto-timestamp = Prisma assignedAt
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
      } else if (legacyId && wanted.has(legacyId)) {
        map.set(legacyId, { id: legacyId, name, email });
      }
    }
  } catch {
    /* Catalyst unreachable — return empty map */
  }
  return map;
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

  // 2. One ZCQL fetch for all sibling rows across all groups.
  let siblings: CatalystRow[] = [];
  if (groupIds.length > 0) {
    const inClause = groupIds.map((g) => `'${zcqlEscapeValue(g)}'`).join(',');
    try {
      siblings = await executeZCQL<CatalystRow>(
        `SELECT * FROM ${TASK_TABLE} WHERE groupId IN (${inClause})`
      );
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

/** For a list of task ROWIDs, return up to N most-recent history entries each. */
async function recentHistoryByTaskId(
  taskRowIds: string[],
  perTask = 3
): Promise<Map<string, any[]>> {
  const out = new Map<string, any[]>();
  if (taskRowIds.length === 0) return out;
  const idSet = new Set(taskRowIds);
  let allHistory: CatalystRow[] = [];
  try {
    allHistory = await listAllRows(HISTORY_TABLE);
  } catch {
    return out; // Table might not exist yet — degrade gracefully.
  }
  const byTask: Record<string, CatalystRow[]> = {};
  for (const h of allHistory) {
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
    arr.sort((a, b) => {
      const ta = a.CREATEDTIME ? new Date(a.CREATEDTIME).getTime() : 0;
      const tb = b.CREATEDTIME ? new Date(b.CREATEDTIME).getTime() : 0;
      return tb - ta;
    });
    out.set(
      tid,
      arr.slice(0, perTask).map((h) =>
        shapeHistory(h, creators.get(String(h.createdById)) ?? null)
      )
    );
  }
  return out;
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
      ids.map((id) => insertRow(TASK_TABLE, { ...baseRow, assignedToId: id }))
    );

    const shaped = await attachUsers(rows);
    const message =
      ids.length === 1
        ? 'Task assigned successfully'
        : `Task assigned to ${ids.length} staff members successfully`;
    sendSuccess(res, shaped, message, 201);
  } catch (error: any) {
    sendServerError(res, error?.message || 'Failed to create task', error);
  }
}

function buildTaskZCQL(params: {
  status?: string;
  taskType?: string;
  assignedToId?: string;
  priority?: string;
  orderBy?: 'created' | 'due';
}): string {
  const conditions: string[] = [];
  if (params.status) conditions.push(`status = '${zcqlEscapeValue(params.status)}'`);
  if (params.taskType) conditions.push(`taskType = '${zcqlEscapeValue(params.taskType)}'`);
  if (params.assignedToId)
    conditions.push(`assignedToId = '${zcqlEscapeValue(params.assignedToId)}'`);
  if (params.priority) conditions.push(`priorities = '${zcqlEscapeValue(params.priority)}'`);

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  // Catalyst ZCQL supports only single-column ORDER BY. We sort by the time
  // column server-side, then re-sort the page in JS to honor priority weight
  // (HIGH > NORMAL > LOW) — the page is small (limit ~10), so JS sort is cheap.
  const orderCol = params.orderBy === 'due' ? 'dueDate' : 'CREATEDTIME';
  const orderDir = params.orderBy === 'due' ? 'ASC' : 'DESC';
  return `SELECT * FROM ${TASK_TABLE}${where} ORDER BY ${orderCol} ${orderDir}`;
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
    const { status, taskType, priority } = req.query as Record<string, string>;

    let allRows: CatalystRow[];
    if (useZCQL()) {
      const baseQuery = buildTaskZCQL({ status, taskType, priority, orderBy: 'created' });
      // No safeLimit cap here -- we need every row to group correctly. The
      // cardinality is bounded by total active tasks, which is small.
      allRows = await executeZCQL<CatalystRow>(baseQuery);
    } else {
      let rows = await listAllRows(TASK_TABLE);
      if (status) rows = rows.filter((r) => r.status === status);
      if (taskType) rows = rows.filter((r) => r.taskType === taskType);
      if (priority) rows = rows.filter((r) => r.priorities === priority);
      allRows = rows;
    }

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
    const { status, taskType, assignedToId, priority } = req.query as Record<string, string>;

    let pageRows: CatalystRow[];
    let total: number;

    if (useZCQL()) {
      const baseQuery = buildTaskZCQL({ status, taskType, assignedToId, priority, orderBy: 'created' });
      const safeLimit = zcqlSafeLimit(limit);
      const fetched = await executeZCQL<CatalystRow>(`${baseQuery} LIMIT ${safeLimit + 1} OFFSET ${skip}`);
      const hasMore = fetched.length > safeLimit;
      pageRows = hasMore ? fetched.slice(0, safeLimit) : fetched;
      // Re-sort the page so HIGH priority floats above NORMAL/LOW.
      pageRows.sort((a, b) => {
        const pa = a.priorities === 'HIGH' ? 1 : 0;
        const pb = b.priorities === 'HIGH' ? 1 : 0;
        if (pa !== pb) return pb - pa;
        const ta = a.CREATEDTIME ? new Date(a.CREATEDTIME).getTime() : 0;
        const tb = b.CREATEDTIME ? new Date(b.CREATEDTIME).getTime() : 0;
        return tb - ta;
      });
      total = skip + pageRows.length + (hasMore ? 1 : 0);
    } else {
      let rows = await listAllRows(TASK_TABLE);
      if (status) rows = rows.filter((r) => r.status === status);
      if (taskType) rows = rows.filter((r) => r.taskType === taskType);
      if (assignedToId) rows = rows.filter((r) => r.assignedToId === assignedToId);
      if (priority) rows = rows.filter((r) => r.priorities === priority);

      rows.sort((a, b) => {
        const pa = a.priorities === 'HIGH' ? 1 : 0;
        const pb = b.priorities === 'HIGH' ? 1 : 0;
        if (pa !== pb) return pb - pa;
        const ta = a.CREATEDTIME ? new Date(a.CREATEDTIME).getTime() : 0;
        const tb = b.CREATEDTIME ? new Date(b.CREATEDTIME).getTime() : 0;
        return tb - ta;
      });

      total = rows.length;
      pageRows = rows.slice(skip, skip + limit);
    }

    const tasks = await attachUsers(pageRows);
    const historyMap = await recentHistoryByTaskId(pageRows.map((r) => String(r.ROWID)));
    for (const t of tasks) t.progressHistory = historyMap.get(t.id) ?? [];

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, tasks, 'Tasks retrieved successfully', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get tasks', error);
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
    const { status } = req.query as Record<string, string>;

    let pageRows: CatalystRow[];
    let total: number;

    if (useZCQL()) {
      const baseQuery = buildTaskZCQL({
        status,
        assignedToId: req.user.id,
        orderBy: 'due',
      });
      const safeLimit = zcqlSafeLimit(limit);
      const fetched = await executeZCQL<CatalystRow>(`${baseQuery} LIMIT ${safeLimit + 1} OFFSET ${skip}`);
      const hasMore = fetched.length > safeLimit;
      pageRows = hasMore ? fetched.slice(0, safeLimit) : fetched;
      // Re-sort: HIGH priority first, then due date asc.
      pageRows.sort((a, b) => {
        const pa = a.priorities === 'HIGH' ? 1 : 0;
        const pb = b.priorities === 'HIGH' ? 1 : 0;
        if (pa !== pb) return pb - pa;
        const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return da - db;
      });
      total = skip + pageRows.length + (hasMore ? 1 : 0);
    } else {
      let rows = await listAllRows(TASK_TABLE);
      rows = rows.filter((r) => r.assignedToId === req.user!.id);
      if (status) rows = rows.filter((r) => r.status === status);

      rows.sort((a, b) => {
        const pa = a.priorities === 'HIGH' ? 1 : 0;
        const pb = b.priorities === 'HIGH' ? 1 : 0;
        if (pa !== pb) return pb - pa;
        const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return da - db;
      });

      total = rows.length;
      pageRows = rows.slice(skip, skip + limit);
    }

    // Use the co-assignee-aware variant so each task carries a list of
    // other staff working on the same multi-assigned task. This is the
    // "+N others assigned" badge data the staff dashboard renders.
    const tasks = await attachUsersWithCoAssignees(pageRows);
    const historyMap = await recentHistoryByTaskId(pageRows.map((r) => String(r.ROWID)));
    for (const t of tasks) t.progressHistory = historyMap.get(t.id) ?? [];

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, tasks, 'My tasks retrieved successfully', 200, meta);
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
    if (req.user?.role === 'STAFF' && row.assignedToId !== req.user.id) {
      sendError(res, 'Forbidden', 403);
      return;
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
    if (existing.assignedToId !== req.user.id && req.user.role === 'STAFF') {
      sendError(res, 'Not authorized to update this task', 403);
      return;
    }
    if (status && !VALID_TASK_STATUS.has(status)) {
      sendError(res, `Invalid status: ${status}`);
      return;
    }

    const updateData: Record<string, unknown> = { ROWID: id };
    if (status) {
      updateData.status = status;
      if (status === 'IN_PROGRESS' && !existing.startedAt) {
        updateData.startedAt = toCatalystDate(new Date());
      }
      if (status === 'COMPLETED') {
        updateData.completedAt = toCatalystDate(new Date());
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
    const [shaped] = await attachUsers([updated]);
    const historyMap = await recentHistoryByTaskId([id], 10);
    shaped.progressHistory = historyMap.get(id) ?? [];
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
    if (req.user.role === 'STAFF' && task.assignedToId !== req.user.id) {
      sendError(res, 'Not authorized to view this task history', 403);
      return;
    }

    const allHistory = await listAllRows(HISTORY_TABLE);
    const matched = allHistory.filter((h) => h.taskId === id);
    matched.sort((a, b) => {
      const ta = a.CREATEDTIME ? new Date(a.CREATEDTIME).getTime() : 0;
      const tb = b.CREATEDTIME ? new Date(b.CREATEDTIME).getTime() : 0;
      return tb - ta;
    });

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
      updateData.completedAt = toCatalystDate(new Date());
      updateData.progressPercent = 100;
    }
    const updated = await updateRow(TASK_TABLE, updateData as any);
    const [shaped] = await attachUsers([updated]);
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
    try {
      const allHistory = await listAllRows(HISTORY_TABLE);
      const matchedIds = allHistory
        .filter((h) => h.taskId === id)
        .map((h) => String(h.ROWID));
      for (const hid of matchedIds) {
        try {
          await deleteRow(HISTORY_TABLE, hid);
        } catch {
          /* keep going */
        }
      }
    } catch {
      // History table may not exist yet — proceed with task delete anyway.
    }

    await deleteRow(TASK_TABLE, id);
    sendSuccess(res, null, 'Task deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete task', error);
  }
}

/**
 * GET /api/tasks/staff — list active STAFF for assignment dropdown.
 *
 * User table still on Neon — same Prisma query as before.
 */
export async function getStaffMembers(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    // Read from cached Catalyst AppUser — no Neon round-trip. Filter to
    // active STAFF users in JS (cheap on a list of office staff).
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
