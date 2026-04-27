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

/** Reshape a Catalyst Task row → JSON the frontend expects (priority, not priorities). */
function shapeTask(
  row: CatalystRow,
  assignedTo?: { id: string; name: string; email: string } | null,
  assignedBy?: { id: string; name: string; email: string } | null,
  recentHistory?: any[]
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

/** Look up a set of users by ID (UUIDs from Neon User table). */
async function lookupUsers(
  ids: Iterable<string>
): Promise<Map<string, { id: string; name: string; email: string }>> {
  const map = new Map<string, { id: string; name: string; email: string }>();
  const idArr = Array.from(ids).filter(Boolean);
  if (idArr.length === 0) return map;
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: idArr } },
      select: { id: true, name: true, email: true },
    });
    for (const u of users) map.set(u.id, u);
  } catch {
    // Best-effort lookup — if Prisma fails, just return the empty map.
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
      dueDate,
    } = req.body;

    if (!title?.trim()) {
      sendError(res, 'Task title is required');
      return;
    }
    if (!assignedToId) {
      sendError(res, 'Staff member must be selected');
      return;
    }
    if (!VALID_TASK_TYPES.has(taskType)) {
      sendError(res, `Invalid taskType: ${taskType}`);
      return;
    }

    // Cross-DB validation: confirm assignedToId is an active STAFF user in Neon.
    const assignedUser = await prisma.user.findUnique({
      where: { id: assignedToId },
      select: { id: true, role: true, isActive: true },
    });
    if (!assignedUser) {
      sendError(res, 'Selected staff member not found', 404);
      return;
    }
    if (assignedUser.role !== 'STAFF') {
      sendError(res, 'Can only assign tasks to staff members');
      return;
    }
    if (!assignedUser.isActive) {
      sendError(res, 'Selected staff member is inactive');
      return;
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

    const row = await insertRow(TASK_TABLE, {
      title: title.trim(),
      description: description?.trim() || null,
      taskType,
      status: 'ASSIGNED',
      priorities: priority || 'NORMAL', // Note: Catalyst column is `priorities`
      referenceId: referenceId || null,
      referenceType: referenceType || null,
      progressNotes: null,
      progressPercent: 0,
      dueDate: parsedDue,
      startedAt: null,
      completedAt: null,
      assignedToId,
      assignedById: req.user.id,
    });

    const [shaped] = await attachUsers([row]);
    sendSuccess(res, shaped, 'Task assigned successfully', 201);
  } catch (error: any) {
    sendServerError(res, error?.message || 'Failed to create task', error);
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

    let rows = await listAllRows(TASK_TABLE);

    if (status) rows = rows.filter((r) => r.status === status);
    if (taskType) rows = rows.filter((r) => r.taskType === taskType);
    if (assignedToId) rows = rows.filter((r) => r.assignedToId === assignedToId);
    if (priority) rows = rows.filter((r) => r.priorities === priority);

    rows.sort((a, b) => {
      // Priority order: HIGH > NORMAL — same as Prisma `priority desc`
      const pa = a.priorities === 'HIGH' ? 1 : 0;
      const pb = b.priorities === 'HIGH' ? 1 : 0;
      if (pa !== pb) return pb - pa;
      const ta = a.CREATEDTIME ? new Date(a.CREATEDTIME).getTime() : 0;
      const tb = b.CREATEDTIME ? new Date(b.CREATEDTIME).getTime() : 0;
      return tb - ta;
    });

    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    const tasks = await attachUsers(paged);

    // Attach 3 most-recent history entries per task
    const historyMap = await recentHistoryByTaskId(paged.map((r) => String(r.ROWID)));
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

    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    const tasks = await attachUsers(paged);

    const historyMap = await recentHistoryByTaskId(paged.map((r) => String(r.ROWID)));
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
    const staff = await prisma.user.findMany({
      where: { role: 'STAFF', isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
    sendSuccess(res, staff, 'Staff members retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get staff members', error);
  }
}
