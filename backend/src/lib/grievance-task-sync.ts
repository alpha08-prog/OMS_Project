/**
 * Grievance ↔ Task status mirroring.
 *
 * Every grievance auto-creates a "self task" (see autoCreateSelfTask) so the
 * work surfaces on the Tasks board / Task Tracker. The two records have
 * SEPARATE status enums and were historically never kept in sync — so the
 * Task Tracker (which reads `Task.status`) and the grievance pages (which read
 * `Grievance.status`) could report contradictory counts for what is really the
 * same item. e.g. a grievance marked RESOLVED whose linked task was still
 * ASSIGNED showed up as "Resolved" on the grievance page but not in the Task
 * Tracker's "Resolved" (COMPLETED) bucket.
 *
 * This module mirrors the two in BOTH directions so the pages always agree:
 *   - grievance status changes  → its linked task(s) follow
 *   - grievance-task status changes → its grievance follows
 *
 * Both directions write with the direct catalyst-client helpers (NOT the HTTP
 * controllers), so the two sync paths can never recurse into one another.
 */
import {
  listAllRows,
  getRow,
  insertRow,
  updateRow,
  executeZCQL,
  zcqlEscapeValue,
  nowCatalystIST,
  CatalystRow,
} from './catalyst-client';
import { cacheClear } from './cache';

const GRIEVANCE_TABLE = 'Grievance';
const TASK_TABLE = 'Task';

/**
 * Grievance status → the task status that represents the same lifecycle point.
 * Matches exactly how the Task Tracker already labels grievance-task statuses
 * (IN_PROGRESS = "In Progress", COMPLETED = "Resolved", ON_HOLD = "Rejected").
 */
export const GRIEVANCE_TO_TASK_STATUS: Record<string, string> = {
  OPEN: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  VERIFIED: 'IN_PROGRESS',
  RESOLVED: 'COMPLETED',
  REJECTED: 'ON_HOLD',
};

/** Task status → the grievance status it implies (inverse of the above). */
export const TASK_TO_GRIEVANCE_STATUS: Record<string, string> = {
  UNASSIGNED: 'OPEN',
  ASSIGNED: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'RESOLVED',
  ON_HOLD: 'REJECTED',
};

/** Same set of caches grievance.controller invalidates on any status write. */
function invalidateGrievanceStatCaches(): void {
  cacheClear('dashboard_stats');
  cacheClear('stats_by_type');
  cacheClear('stats_by_status');
  cacheClear('stats_by_constituency');
  cacheClear('stats_monetization');
}

/** Build a Task update payload, stamping the same started/completed
 *  bookkeeping the task controllers use (so derived rows look identical to
 *  hand-edited ones). */
function taskUpdateFields(
  target: string,
  existing: CatalystRow
): { ROWID: string; [column: string]: unknown } {
  const update: { ROWID: string; [column: string]: unknown } = {
    ROWID: String(existing.ROWID),
    status: target,
  };
  if (target === 'IN_PROGRESS' && !existing.startedAt) update.startedAt = nowCatalystIST();
  if (target === 'COMPLETED') {
    if (!existing.completedAt) update.completedAt = nowCatalystIST();
    update.progressPercent = 100;
  }
  return update;
}

/** Build a Grievance update payload, mirroring the resolved/reopened
 *  bookkeeping in updateGrievanceStatus. */
function grievanceUpdateFields(
  target: string,
  existing: CatalystRow
): { ROWID: string; [column: string]: unknown } {
  const update: { ROWID: string; [column: string]: unknown } = {
    ROWID: String(existing.ROWID),
    status: target,
  };
  if (target === 'RESOLVED' && !existing.resolvedAt) update.resolvedAt = nowCatalystIST();
  if (target === 'OPEN') {
    update.resolvedAt = null;
    update.currentStage = 'RECEIVED';
  }
  return update;
}

/** Map a grievance's stored priority to the task priority bucket. */
function taskPriorityForGrievance(g: CatalystRow): string {
  const p = String(g.priorities ?? '').toUpperCase();
  return p === 'CRITICAL' || p === 'HIGH' ? 'HIGH' : 'NORMAL';
}

/**
 * Create the missing self-task for a grievance, stamped to a given task status.
 * Self-assigned to the grievance's creator, mirroring autoCreateSelfTask.
 * Tolerant of a Catalyst schema missing the newer optional columns.
 */
async function createTaskForGrievance(g: CatalystRow, taskStatus: string): Promise<void> {
  const refNo = g.grievanceNumber ? String(g.grievanceNumber) : `GRV-${String(g.ROWID)}`;
  const creatorId = g.createdById ? String(g.createdById) : null;
  const now = nowCatalystIST();
  const row: Record<string, any> = {
    title: `Grievance ${refNo}: ${String(g.grievanceType ?? 'OTHER')} - ${String(g.petitionerName ?? '')}`,
    description: typeof g.description === 'string' ? g.description.slice(0, 500) : null,
    taskType: 'GRIEVANCE',
    status: taskStatus,
    priorities: taskPriorityForGrievance(g),
    referenceId: String(g.ROWID),
    referenceType: 'GRIEVANCE',
    source: String(g.source ?? 'PUBLIC').toUpperCase() === 'OFFICE' ? 'OFFICE' : 'PUBLIC',
    progressNotes: null,
    progressPercent: taskStatus === 'COMPLETED' ? 100 : 0,
    dueDate: null,
    startedAt: taskStatus === 'IN_PROGRESS' || taskStatus === 'COMPLETED' ? now : null,
    completedAt: taskStatus === 'COMPLETED' ? now : null,
    assignedToId: creatorId,
    assignedById: creatorId,
    groupId: null,
  };
  try {
    await insertRow(TASK_TABLE, row);
  } catch {
    // Drop newer optional columns that may not exist yet, then retry once.
    const { source, groupId, ...core } = row;
    void source;
    void groupId;
    await insertRow(TASK_TABLE, core);
  }
}

/** Tasks linked to a source record (referenceType + referenceId = its rowid). */
async function linkedTasks(referenceType: string, referenceId: string): Promise<CatalystRow[]> {
  let rows: CatalystRow[] = [];
  try {
    rows = await executeZCQL<CatalystRow>(
      `SELECT * FROM ${TASK_TABLE} WHERE referenceId = '${zcqlEscapeValue(referenceId)}'`
    );
  } catch {
    // ZCQL unavailable / column unindexed — fall back to a full scan.
    try {
      rows = await listAllRows(TASK_TABLE);
    } catch {
      return [];
    }
  }
  return rows.filter(
    (t) =>
      String(t.referenceType) === referenceType &&
      String(t.referenceId) === String(referenceId)
  );
}

/**
 * Forward sync: a grievance's status changed → push the mapped status onto
 * every linked task. The grievance is authoritative here (an admin explicitly
 * set this status), so we always mirror it. Best-effort; never throws.
 */
export async function syncTasksForGrievance(
  grievanceId: string,
  grievanceStatus: string
): Promise<void> {
  try {
    const target = GRIEVANCE_TO_TASK_STATUS[grievanceStatus];
    if (!target) return;
    const tasks = await linkedTasks('GRIEVANCE', grievanceId);
    for (const t of tasks) {
      if (String(t.status) === target) continue;
      try {
        await updateRow(TASK_TABLE, taskUpdateFields(target, t));
      } catch (err) {
        console.warn('[grievance-task-sync] task update failed', t.ROWID, err);
      }
    }
  } catch (err) {
    console.warn('[grievance-task-sync] syncTasksForGrievance failed', grievanceId, err);
  }
}

/**
 * Mark every task linked to a source record COMPLETED. Used when a record's
 * deliverable is produced (e.g. a Train EQ letter is printed/generated), which
 * closes out the work item. Best-effort; never throws.
 */
export async function markLinkedTasksCompleted(
  referenceType: string,
  referenceId: string
): Promise<void> {
  try {
    const tasks = await linkedTasks(referenceType, referenceId);
    for (const t of tasks) {
      if (String(t.status) === 'COMPLETED') continue;
      try {
        await updateRow(TASK_TABLE, taskUpdateFields('COMPLETED', t));
      } catch (err) {
        console.warn('[grievance-task-sync] complete linked task failed', t.ROWID, err);
      }
    }
  } catch (err) {
    console.warn('[grievance-task-sync] markLinkedTasksCompleted failed', referenceId, err);
  }
}

/**
 * Reverse sync: a grievance-linked task's status changed → move its grievance
 * to the matching status. Guards against destructive moves:
 *   - never downgrade a VERIFIED grievance to IN_PROGRESS (both already read as
 *     "In Progress" in the tracker, and VERIFIED is the more advanced state),
 *   - never auto-reopen a grievance that's past OPEN just because a task fell
 *     back to ASSIGNED — reopening stays an explicit grievance action.
 * Best-effort; never throws.
 */
export async function syncGrievanceForTask(
  task: CatalystRow | null | undefined,
  newTaskStatus: string
): Promise<void> {
  try {
    if (!task || String(task.referenceType) !== 'GRIEVANCE' || !task.referenceId) return;
    const mapped = TASK_TO_GRIEVANCE_STATUS[newTaskStatus];
    if (!mapped) return;

    const grievance = await getRow(GRIEVANCE_TABLE, String(task.referenceId));
    if (!grievance) return;
    const current = String(grievance.status);
    if (current === mapped) return;

    // Don't downgrade an already-advanced grievance.
    if (mapped === 'IN_PROGRESS' && current === 'VERIFIED') return;
    // Only the active→open walk-back is mirrored; never auto-reopen a
    // verified/terminal grievance from a passive ASSIGNED task.
    if (mapped === 'OPEN' && current !== 'IN_PROGRESS') return;

    await updateRow(GRIEVANCE_TABLE, grievanceUpdateFields(mapped, grievance));
    invalidateGrievanceStatCaches();
  } catch (err) {
    console.warn('[grievance-task-sync] syncGrievanceForTask failed', task?.referenceId, err);
  }
}

// ── One-time reconciliation ────────────────────────────────────────────────

/**
 * Unified lifecycle precedence used by the backfill: when a grievance and its
 * task(s) disagree, the most-advanced status on either side wins. Both enums
 * map onto one scale so they can be compared directly.
 */
const GRIEVANCE_PHASE: Record<string, number> = {
  OPEN: 0,
  IN_PROGRESS: 1,
  VERIFIED: 2,
  REJECTED: 3,
  RESOLVED: 4,
};
const TASK_PHASE: Record<string, number> = {
  UNASSIGNED: 0,
  ASSIGNED: 0,
  IN_PROGRESS: 1,
  ON_HOLD: 3,
  COMPLETED: 4,
};
const PHASE_TO_GRIEVANCE: Record<number, string> = {
  0: 'OPEN',
  1: 'IN_PROGRESS',
  2: 'VERIFIED',
  3: 'REJECTED',
  4: 'RESOLVED',
};

export type ReconcileResult = {
  grievancesScanned: number;
  grievancesUpdated: number;
  tasksUpdated: number;
  tasksCreated: number;
};

/**
 * One-time backfill: walk every grievance that has linked task(s) and force the
 * pair into agreement using the most-advanced status on either side — so a
 * RESOLVED grievance closes its still-ASSIGNED task, and an IN_PROGRESS task
 * carries its still-OPEN grievance forward. Idempotent — safe to re-run.
 */
export async function reconcileGrievanceTaskStatuses(): Promise<ReconcileResult> {
  const [grievances, tasks] = await Promise.all([
    listAllRows(GRIEVANCE_TABLE),
    listAllRows(TASK_TABLE),
  ]);

  const tasksByGrievance = new Map<string, CatalystRow[]>();
  for (const t of tasks) {
    if (String(t.referenceType) !== 'GRIEVANCE' || !t.referenceId) continue;
    const gid = String(t.referenceId);
    const list = tasksByGrievance.get(gid);
    if (list) list.push(t);
    else tasksByGrievance.set(gid, [t]);
  }

  let grievancesScanned = 0;
  let grievancesUpdated = 0;
  let tasksUpdated = 0;
  let tasksCreated = 0;

  for (const g of grievances) {
    const gStatus = String(g.status);
    const linked = tasksByGrievance.get(String(g.ROWID)) ?? [];

    // Grievances created before auto-tasking have no linked task at all, so
    // they were invisible to the Task Tracker and its counts. Create the
    // missing self-task now, stamped to match the grievance's current status —
    // this is what makes "Completed" line up on both screens.
    if (linked.length === 0) {
      try {
        await createTaskForGrievance(g, GRIEVANCE_TO_TASK_STATUS[gStatus] ?? 'ASSIGNED');
        tasksCreated++;
      } catch (err) {
        console.warn('[grievance-task-sync] reconcile task create failed', g.ROWID, err);
      }
      continue;
    }

    grievancesScanned++;

    let winningPhase = GRIEVANCE_PHASE[gStatus] ?? 0;
    for (const t of linked) {
      const p = TASK_PHASE[String(t.status)] ?? 0;
      if (p > winningPhase) winningPhase = p;
    }

    const desiredGrievance = PHASE_TO_GRIEVANCE[winningPhase];
    const desiredTask = GRIEVANCE_TO_TASK_STATUS[desiredGrievance];

    if (desiredGrievance !== gStatus) {
      try {
        await updateRow(GRIEVANCE_TABLE, grievanceUpdateFields(desiredGrievance, g));
        grievancesUpdated++;
      } catch (err) {
        console.warn('[grievance-task-sync] reconcile grievance update failed', g.ROWID, err);
      }
    }
    for (const t of linked) {
      if (String(t.status) === desiredTask) continue;
      try {
        await updateRow(TASK_TABLE, taskUpdateFields(desiredTask, t));
        tasksUpdated++;
      } catch (err) {
        console.warn('[grievance-task-sync] reconcile task update failed', t.ROWID, err);
      }
    }
  }

  invalidateGrievanceStatCaches();
  return { grievancesScanned, grievancesUpdated, tasksUpdated, tasksCreated };
}
