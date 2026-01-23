import { Response } from 'express';
import { TaskStatus, TaskType } from '@prisma/client';
import prisma from '../lib/prisma';
import { sendSuccess, sendError, sendNotFound, sendServerError } from '../utils/response';
import { parsePagination, calculatePaginationMeta } from '../utils/pagination';
import type { AuthenticatedRequest } from '../types';

/**
 * Create a new task assignment
 * POST /api/tasks
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

    const task = await prisma.taskAssignment.create({
      data: {
        title,
        description,
        taskType: taskType as TaskType,
        priority: priority || 'NORMAL',
        referenceId,
        referenceType,
        assignedToId,
        assignedById: req.user.id,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
        assignedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    sendSuccess(res, task, 'Task assigned successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to create task', error);
  }
}

/**
 * Get all tasks with filters
 * GET /api/tasks
 */
export async function getTasks(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(req.query as { page?: string; limit?: string });
    const { status, taskType, assignedToId, priority } = req.query;

    const where: any = {};

    if (status) where.status = status;
    if (taskType) where.taskType = taskType;
    if (assignedToId) where.assignedToId = assignedToId;
    if (priority) where.priority = priority;

    const [total, tasks] = await Promise.all([
      prisma.taskAssignment.count({ where }),
      prisma.taskAssignment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true },
          },
          assignedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ]);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, tasks, 'Tasks retrieved successfully', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get tasks', error);
  }
}

/**
 * Get tasks assigned to the logged-in staff member
 * GET /api/tasks/my-tasks
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

    const { page, limit, skip } = parsePagination(req.query as { page?: string; limit?: string });
    const { status } = req.query;

    const where: any = {
      assignedToId: req.user.id,
    };

    if (status) where.status = status;

    const [total, tasks] = await Promise.all([
      prisma.taskAssignment.count({ where }),
      prisma.taskAssignment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { priority: 'desc' },
          { dueDate: 'asc' },
        ],
        include: {
          assignedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ]);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, tasks, 'My tasks retrieved successfully', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get tasks', error);
  }
}

/**
 * Get task by ID
 * GET /api/tasks/:id
 */
export async function getTaskById(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    const task = await prisma.taskAssignment.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
        assignedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!task) {
      sendNotFound(res, 'Task not found');
      return;
    }

    sendSuccess(res, task, 'Task retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get task', error);
  }
}

/**
 * Update task progress (Staff)
 * PATCH /api/tasks/:id/progress
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
    const { status, progressNotes, progressPercent } = req.body;

    // Verify task belongs to user
    const existingTask = await prisma.taskAssignment.findUnique({
      where: { id },
    });

    if (!existingTask) {
      sendNotFound(res, 'Task not found');
      return;
    }

    if (existingTask.assignedToId !== req.user.id && req.user.role === 'STAFF') {
      sendError(res, 'Not authorized to update this task', 403);
      return;
    }

    const updateData: any = {};
    
    if (status) {
      updateData.status = status as TaskStatus;
      if (status === 'IN_PROGRESS' && !existingTask.startedAt) {
        updateData.startedAt = new Date();
      }
      if (status === 'COMPLETED') {
        updateData.completedAt = new Date();
        updateData.progressPercent = 100;
      }
    }
    
    if (progressNotes !== undefined) updateData.progressNotes = progressNotes;
    if (progressPercent !== undefined) updateData.progressPercent = progressPercent;

    const task = await prisma.taskAssignment.update({
      where: { id },
      data: updateData,
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
        assignedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    sendSuccess(res, task, 'Task progress updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update task progress', error);
  }
}

/**
 * Update task status (Admin - for marking as resolved)
 * PATCH /api/tasks/:id/status
 */
export async function updateTaskStatus(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const updateData: any = {
      status: status as TaskStatus,
    };

    if (status === 'COMPLETED') {
      updateData.completedAt = new Date();
      updateData.progressPercent = 100;
    }

    const task = await prisma.taskAssignment.update({
      where: { id },
      data: updateData,
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
        assignedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    sendSuccess(res, task, 'Task status updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update task status', error);
  }
}

/**
 * Get task tracking/stats for admin
 * GET /api/tasks/tracking
 */
export async function getTaskTracking(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    // Get counts by status
    const [assigned, inProgress, completed, onHold, total] = await Promise.all([
      prisma.taskAssignment.count({ where: { status: 'ASSIGNED' } }),
      prisma.taskAssignment.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.taskAssignment.count({ where: { status: 'COMPLETED' } }),
      prisma.taskAssignment.count({ where: { status: 'ON_HOLD' } }),
      prisma.taskAssignment.count(),
    ]);

    // Get tasks grouped by staff
    const tasksByStaff = await prisma.taskAssignment.groupBy({
      by: ['assignedToId'],
      _count: { id: true },
      where: {
        status: { not: 'COMPLETED' },
      },
    });

    // Get staff details
    const staffIds = tasksByStaff.map(t => t.assignedToId);
    const staffMembers = await prisma.user.findMany({
      where: { id: { in: staffIds } },
      select: { id: true, name: true, email: true },
    });

    const staffTaskCounts = tasksByStaff.map(t => ({
      staff: staffMembers.find(s => s.id === t.assignedToId),
      pendingTasks: t._count.id,
    }));

    // Get recent activity
    const recentTasks = await prisma.taskAssignment.findMany({
      take: 10,
      orderBy: { updatedAt: 'desc' },
      include: {
        assignedTo: {
          select: { id: true, name: true },
        },
      },
    });

    sendSuccess(res, {
      summary: {
        total,
        assigned,
        inProgress,
        completed,
        onHold,
      },
      staffTaskCounts,
      recentActivity: recentTasks,
    }, 'Task tracking data retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get task tracking', error);
  }
}

/**
 * Delete task
 * DELETE /api/tasks/:id
 */
export async function deleteTask(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    await prisma.taskAssignment.delete({
      where: { id },
    });

    sendSuccess(res, null, 'Task deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete task', error);
  }
}

/**
 * Get all staff members (for task assignment dropdown)
 * GET /api/tasks/staff
 */
export async function getStaffMembers(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const staff = await prisma.user.findMany({
      where: {
        role: 'STAFF',
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: 'asc' },
    });

    sendSuccess(res, staff, 'Staff members retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get staff members', error);
  }
}
