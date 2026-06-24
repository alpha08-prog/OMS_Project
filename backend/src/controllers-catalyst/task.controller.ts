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
  zcqlSafeLimit,
  CatalystRow,
} from '../lib/catalyst-client';
import { useZCQL } from '../config/feature-flags';
import { getCachedTableList, isHiddenTestUser } from '../lib/catalyst-user-lookup';
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

// Forwarding target: Shri. Mallikarjungouda Patil (an admin). Any user can
// forward a task to him; it then surfaces as a high-priority card on his
// dashboard.
//
// The recipient ids are configurable via the OMS_FORWARD_TO_IDS env var
// (comma-separated AppUser ROWIDs) so a local/staging machine can point this at
// a TEST admin without touching code. When the var is unset — i.e. production —
// it falls back to Patil's real ids, so the deployed app keeps working with his
// actual account. The first id is stamped on forwarded rows; the full set
// decides who is allowed to see the forwarded queue.
// All ids below belong to the SAME person (Shri. Mallikarjungouda Patil) across
// different Catalyst environments — every one of them may view the forwarded
// queue. The FIRST id is also the canonical recipient stamped on newly-forwarded
// rows, so it must be his id in THIS project: 37719000000085050 (his row has no
// legacyId, so his login resolves to that ROWID — it MUST be in the set or
// getForwardedTasks() returns [] for him). The 37807* ids are his account in the
// other environment; kept here so tasks forwarded under them still surface too.
const DEFAULT_FORWARD_TO_IDS = [
  '37719000000085050',
  '37807000000030336',
  '37807000000012006',
];
const CONFIGURED_FORWARD_TO_IDS = (process.env.OMS_FORWARD_TO_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const FORWARD_TO_IDS =
  CONFIGURED_FORWARD_TO_IDS.length > 0
    ? CONFIGURED_FORWARD_TO_IDS
    : DEFAULT_FORWARD_TO_IDS;
const PATIL_FORWARD_TO_ID = FORWARD_TO_IDS[0];
const PATIL_USER_IDS = new Set(FORWARD_TO_IDS);

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
    // Forwarding (to Shri. Mallikarjungouda Patil). isForwarded is derived from
    // forwardedToId so the UI can flag the task / hide the Forward action.
    forwardedToId: row.forwardedToId ?? null,
    forwardedById: row.forwardedById ?? null,
    forwardedAt: row.forwardedAt ?? null,
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
 * Resolve each task's linked record reference number and set it on
 * `referenceNo` so the Task Tracker / All Tasks / Office Tasks boards can show +
 * search by it. Handles all linked record types:
 *   - GRIEVANCE     → GRV-YYYY-NNNN  (fallback GRV-<rowid>)
 *   - TOUR_PROGRAM  → TOUR-YYYY-NNNN (fallback TOUR-<rowid>)
 *   - TRAIN_REQUEST → TREQ-YYYY-NNNN (fallback TREQ-<rowid>)
 * Best-effort: a per-type lookup failure just leaves those tasks' referenceNo
 * null. Each record table is read once, in parallel.
 */
async function attachReferenceNumbers(tasks: any[]): Promise<void> {
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
      try {
        const rows = await listAllRows(table);
        const map = refByType[type];
        for (const r of rows) {
          const rid = String(r.ROWID);
          if (ids.has(rid)) {
            map.set(rid, r[numberCol] ? String(r[numberCol]) : `${prefix}-${rid}`);
          }
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
  return tb - ta;
}

function buildTaskZCQL(params: {
  status?: string;
  taskType?: string;
  assignedToId?: string;
  priority?: string;
  startDate?: string;
  endDate?: string;
  orderBy?: 'created' | 'due';
}): string {
  const conditions: string[] = [];
  if (params.status) conditions.push(`status = '${zcqlEscapeValue(params.status)}'`);
  if (params.taskType) conditions.push(`taskType = '${zcqlEscapeValue(params.taskType)}'`);
  if (params.assignedToId)
    conditions.push(`assignedToId = '${zcqlEscapeValue(params.assignedToId)}'`);
  if (params.priority) conditions.push(`priorities = '${zcqlEscapeValue(params.priority)}'`);
  if (params.startDate) {
    const start = toCatalystDate(params.startDate);
    if (start) conditions.push(`CREATEDTIME >= '${start}'`);
  }
  if (params.endDate) {
    const end = toCatalystDate(params.endDate);
    if (end) conditions.push(`CREATEDTIME <= '${end}'`);
  }

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
    const { status, taskType, assignedToId, priority, startDate, endDate, source } =
      req.query as Record<string, string>;

    let pageRows: CatalystRow[];
    let total: number;

    // ── Source filter (e.g. the Office Tasks page) ──────────────────────────
    // A task counts as OFFICE if its own row says so OR it's linked to an OFFICE
    // grievance. The grievance check makes this robust even before the
    // Task.source column exists (Grievance.source is authoritative — office
    // grievances can't be created without it). Runs over the full table so no
    // office task is ever missed behind pagination.
    if (source) {
      const wantOffice = source.toUpperCase() === 'OFFICE';
      let rows = await listAllRows(TASK_TABLE);

      const officeGrievanceIds = new Set<string>();
      try {
        const grievances = await listAllRows('Grievance');
        for (const g of grievances) {
          if (String(g.source ?? 'PUBLIC').toUpperCase() === 'OFFICE') {
            officeGrievanceIds.add(String(g.ROWID));
          }
        }
      } catch {
        /* Grievance table unreadable — fall back to the row's own source. */
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
      if (startDate) {
        const start = new Date(startDate).getTime();
        rows = rows.filter((r) => r.CREATEDTIME && new Date(r.CREATEDTIME).getTime() >= start);
      }
      if (endDate) {
        const end = new Date(endDate).getTime();
        rows = rows.filter((r) => r.CREATEDTIME && new Date(r.CREATEDTIME).getTime() <= end);
      }
      rows.sort(taskListCompare);
      total = rows.length;
      const officePageRows = rows.slice(skip, skip + limit);

      const tasks = await attachUsers(officePageRows);
      const [, historyMap] = await Promise.all([
        attachReferenceNumbers(tasks),
        recentHistoryByTaskId(officePageRows.map((r) => String(r.ROWID))),
      ]);
      for (const t of tasks) t.progressHistory = historyMap.get(t.id) ?? [];
      // Stamp the resolved source so the client identifies it even when the
      // Task.source column is absent.
      if (wantOffice) for (const t of tasks) t.source = 'OFFICE';

      const meta = calculatePaginationMeta(total, page, limit);
      sendSuccess(res, tasks, 'Tasks retrieved successfully', 200, meta);
      return;
    }

    if (useZCQL()) {
      const baseQuery = buildTaskZCQL({
        status, taskType, assignedToId, priority, startDate, endDate, orderBy: 'created',
      });
      const safeLimit = zcqlSafeLimit(limit);
      const fetched = await executeZCQL<CatalystRow>(`${baseQuery} LIMIT ${safeLimit + 1} OFFSET ${skip}`);
      const hasMore = fetched.length > safeLimit;
      pageRows = hasMore ? fetched.slice(0, safeLimit) : fetched;
      // Page-level sort: completed sinks to the bottom; within each bucket,
      // HIGH priority floats up; ties break on newest-first.
      pageRows.sort(taskListCompare);
      total = skip + pageRows.length + (hasMore ? 1 : 0);
    } else {
      let rows = await listAllRows(TASK_TABLE);
      if (status) rows = rows.filter((r) => r.status === status);
      if (taskType) rows = rows.filter((r) => r.taskType === taskType);
      if (assignedToId) rows = rows.filter((r) => r.assignedToId === assignedToId);
      if (priority) rows = rows.filter((r) => r.priorities === priority);
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

      rows.sort(taskListCompare);

      total = rows.length;
      pageRows = rows.slice(skip, skip + limit);
    }

    // attachReferenceNumbers and recentHistoryByTaskId are independent Catalyst
    // reads — run them in parallel instead of two serial round-trips.
    const tasks = await attachUsers(pageRows);
    const [, historyMap] = await Promise.all([
      attachReferenceNumbers(tasks),
      recentHistoryByTaskId(pageRows.map((r) => String(r.ROWID))),
    ]);
    for (const t of tasks) t.progressHistory = historyMap.get(t.id) ?? [];

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, tasks, 'Tasks retrieved successfully', 200, meta);
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
    if (startDate) {
      const start = new Date(startDate).getTime();
      rows = rows.filter((r) => r.CREATEDTIME && new Date(r.CREATEDTIME).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(endDate).getTime();
      rows = rows.filter((r) => r.CREATEDTIME && new Date(r.CREATEDTIME).getTime() <= end);
    }
    if (search) {
      const q = String(search).toLowerCase();
      rows = rows.filter(
        (r) =>
          String(r.title ?? '').toLowerCase().includes(q) ||
          String(r.description ?? '').toLowerCase().includes(q)
      );
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

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, tasks, 'All tasks retrieved successfully', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get all tasks', error);
  }
}

/**
 * PATCH /api/tasks/:id/forward — ANY authenticated user forwards a task to
 * Shri. Mallikarjungouda Patil. The row is stamped forwarded + bumped to HIGH
 * priority so it surfaces as a high-priority card on his dashboard. Tolerant
 * of a Catalyst schema that's missing the forwarded* columns (the priority
 * bump still applies; add the columns to enable the dashboard card).
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
    const existing = await getRow(TASK_TABLE, id);
    if (!existing) {
      sendNotFound(res, 'Task not found');
      return;
    }

    const updated = await updateRowTolerant(
      TASK_TABLE,
      {
        ROWID: id,
        forwardedToId: PATIL_FORWARD_TO_ID,
        forwardedById: req.user.id,
        forwardedAt: nowCatalystIST(),
        priorities: 'HIGH',
      },
      ['forwardedToId', 'forwardedById', 'forwardedAt']
    );

    // Audit entry — who forwarded it and when. Best-effort.
    try {
      await insertRow(HISTORY_TABLE, {
        taskId: id,
        note: `Task forwarded to Shri. Mallikarjungouda Patil by ${req.user.name || 'a user'}`,
        status: null,
        createdById: req.user.id,
      });
    } catch {
      /* TaskHistory table optional — ignore */
    }

    // Notify Patil so it shows in his notification bell too.
    await emitNotification({
      recipientId: PATIL_FORWARD_TO_ID,
      type: 'TASK_ASSIGNED',
      title: `Task forwarded to you: ${existing.title ?? 'Task'}`,
      body: `${req.user.name || 'A user'} forwarded this task for your action.`,
      link: '/admin/home',
      referenceId: String(id),
      referenceType: 'TASK',
    });

    const [shaped] = await attachUsers([updated]);
    sendSuccess(res, shaped, 'Task forwarded to Shri. Mallikarjungouda Patil');
  } catch (error) {
    sendServerError(res, 'Failed to forward task', error);
  }
}

/**
 * GET /api/tasks/forwarded — tasks forwarded to Shri. Mallikarjungouda Patil
 * that are not yet COMPLETED. Only HE gets data; every other caller gets an
 * empty list. Powers the high-priority "Forwarded to you" card on his
 * dashboard.
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
    // Scope strictly to Patil — others must never see the forwarded queue.
    if (!PATIL_USER_IDS.has(String(req.user.id))) {
      sendSuccess(res, [], 'No forwarded tasks');
      return;
    }

    let rows = await listAllRows(TASK_TABLE);
    // Scope to rows forwarded to one of the CONFIGURED recipient ids (not just
    // "any forwardedToId"), so a task forwarded under a local/test config never
    // surfaces in the production recipient's queue on the shared Catalyst DB.
    rows = rows.filter(
      (r) =>
        PATIL_USER_IDS.has(String(r.forwardedToId)) &&
        String(r.status) !== 'COMPLETED'
    );
    // Most-recently forwarded first.
    rows.sort((a, b) => {
      const ta = a.forwardedAt ? new Date(String(a.forwardedAt)).getTime() : 0;
      const tb = b.forwardedAt ? new Date(String(b.forwardedAt)).getTime() : 0;
      return tb - ta;
    });

    const tasks = await attachUsers(rows);
    await attachReferenceNumbers(tasks);

    // Resolve who forwarded each task so the card can show "forwarded by".
    const forwarderIds = new Set(
      rows.map((r) => String(r.forwardedById)).filter(Boolean)
    );
    const forwarders = await lookupUsers(forwarderIds);
    for (const t of tasks) {
      t.forwardedBy = t.forwardedById
        ? forwarders.get(String(t.forwardedById)) ?? null
        : null;
    }

    sendSuccess(res, tasks, 'Forwarded tasks retrieved successfully');
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
    let total: number;

    if (useZCQL()) {
      const baseQuery = buildTaskZCQL({
        status,
        assignedToId: req.user.id,
        startDate,
        endDate,
        orderBy: 'due',
      });
      const safeLimit = zcqlSafeLimit(limit);
      const fetched = await executeZCQL<CatalystRow>(`${baseQuery} LIMIT ${safeLimit + 1} OFFSET ${skip}`);
      const hasMore = fetched.length > safeLimit;
      pageRows = hasMore ? fetched.slice(0, safeLimit) : fetched;
      // Re-sort: completed sinks; otherwise HIGH priority first, then newest.
      pageRows.sort(taskListCompare);
      total = skip + pageRows.length + (hasMore ? 1 : 0);
    } else {
      let rows = await listAllRows(TASK_TABLE);
      rows = rows.filter((r) => r.assignedToId === req.user!.id);
      if (status) rows = rows.filter((r) => r.status === status);
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
    // attachReferenceNumbers and recentHistoryByTaskId are independent Catalyst
    // reads — run them in parallel instead of two serial round-trips.
    const tasks = await attachUsersWithCoAssignees(pageRows);
    const [, historyMap] = await Promise.all([
      attachReferenceNumbers(tasks),
      recentHistoryByTaskId(pageRows.map((r) => String(r.ROWID))),
    ]);
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
    // Office tasks are admin-managed only — staff cannot update their progress.
    if (
      String(existing.source ?? 'PUBLIC').toUpperCase() === 'OFFICE' &&
      req.user.role === 'STAFF'
    ) {
      sendError(res, 'Office tasks can only be edited by an admin', 403);
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
      updateData.completedAt = nowCatalystIST();
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
