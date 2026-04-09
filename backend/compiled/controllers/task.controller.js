"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTask = createTask;
exports.getTasks = getTasks;
exports.getMyTasks = getMyTasks;
exports.getTaskById = getTaskById;
exports.updateTaskProgress = updateTaskProgress;
exports.getTaskHistory = getTaskHistory;
exports.updateTaskStatus = updateTaskStatus;
exports.getTaskTracking = getTaskTracking;
exports.deleteTask = deleteTask;
exports.getStaffMembers = getStaffMembers;
const prisma_1 = __importDefault(require("../lib/prisma"));
const response_1 = require("../utils/response");
const pagination_1 = require("../utils/pagination");
/**
 * Create a new task assignment
 * POST /api/tasks
 */
async function createTask(req, res) {
    try {
        if (!req.user) {
            (0, response_1.sendError)(res, 'Not authenticated', 401);
            return;
        }
        const { title, description, taskType, priority, referenceId, referenceType, assignedToId, dueDate, } = req.body;
        // Validate required fields
        if (!title || !title.trim()) {
            (0, response_1.sendError)(res, 'Task title is required', 400);
            return;
        }
        if (!assignedToId) {
            (0, response_1.sendError)(res, 'Staff member must be selected', 400);
            return;
        }
        // Verify assignedToId user exists and is a STAFF member
        const assignedUser = await prisma_1.default.user.findUnique({
            where: { id: assignedToId },
            select: { id: true, role: true, isActive: true },
        });
        if (!assignedUser) {
            (0, response_1.sendError)(res, 'Selected staff member not found', 404);
            return;
        }
        if (assignedUser.role !== 'STAFF') {
            (0, response_1.sendError)(res, 'Can only assign tasks to staff members', 400);
            return;
        }
        if (!assignedUser.isActive) {
            (0, response_1.sendError)(res, 'Selected staff member is inactive', 400);
            return;
        }
        // Validate taskType
        const validTaskTypes = ['GRIEVANCE', 'TRAIN_REQUEST', 'TOUR_PROGRAM', 'GENERAL'];
        if (!taskType || !validTaskTypes.includes(taskType)) {
            (0, response_1.sendError)(res, `Invalid task type. Must be one of: ${validTaskTypes.join(', ')}`, 400);
            return;
        }
        // Parse dueDate if provided
        let parsedDueDate = null;
        if (dueDate) {
            parsedDueDate = new Date(dueDate);
            if (isNaN(parsedDueDate.getTime())) {
                (0, response_1.sendError)(res, 'Invalid due date format', 400);
                return;
            }
        }
        const task = await prisma_1.default.taskAssignment.create({
            data: {
                title: title.trim(),
                description: description?.trim() || null,
                taskType: taskType,
                priority: priority || 'NORMAL',
                referenceId: referenceId || null,
                referenceType: referenceType || null,
                assignedToId,
                assignedById: req.user.id,
                dueDate: parsedDueDate,
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
        (0, response_1.sendSuccess)(res, task, 'Task assigned successfully', 201);
    }
    catch (error) {
        console.error('Task creation error:', error);
        // Handle Prisma errors
        if (error.code === 'P2002') {
            (0, response_1.sendError)(res, 'A task with this reference already exists', 409);
            return;
        }
        if (error.code === 'P2003') {
            (0, response_1.sendError)(res, 'Invalid reference: The referenced item does not exist', 400);
            return;
        }
        // Extract more specific error message
        const errorMessage = error?.message || 'Failed to create task';
        (0, response_1.sendError)(res, errorMessage, 500);
    }
}
/**
 * Get all tasks with filters
 * GET /api/tasks
 */
async function getTasks(req, res) {
    try {
        const { page, limit, skip } = (0, pagination_1.parsePagination)(req.query);
        const { status, taskType, assignedToId, priority } = req.query;
        const where = {};
        if (status)
            where.status = status;
        if (taskType)
            where.taskType = taskType;
        if (assignedToId)
            where.assignedToId = assignedToId;
        if (priority)
            where.priority = priority;
        console.log(`TaskController - getTasks - Query params:`, { page, limit, skip, status, taskType, assignedToId, priority });
        console.log(`TaskController - getTasks - Where clause:`, where);
        const [total, tasks] = await Promise.all([
            prisma_1.default.taskAssignment.count({ where }),
            prisma_1.default.taskAssignment.findMany({
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
                    progressHistory: {
                        orderBy: { createdAt: 'desc' },
                        take: 3,
                        include: {
                            createdBy: {
                                select: { id: true, name: true, email: true },
                            },
                        },
                    },
                },
            }),
        ]);
        console.log(`TaskController - getTasks - Found ${total} total tasks, returning ${tasks.length} tasks`);
        const meta = (0, pagination_1.calculatePaginationMeta)(total, page, limit);
        (0, response_1.sendSuccess)(res, tasks, 'Tasks retrieved successfully', 200, meta);
    }
    catch (error) {
        console.error('TaskController - getTasks - Error:', error);
        (0, response_1.sendServerError)(res, 'Failed to get tasks', error);
    }
}
/**
 * Get tasks assigned to the logged-in staff member
 * GET /api/tasks/my-tasks
 */
async function getMyTasks(req, res) {
    try {
        if (!req.user) {
            (0, response_1.sendError)(res, 'Not authenticated', 401);
            return;
        }
        const { page, limit, skip } = (0, pagination_1.parsePagination)(req.query);
        const { status } = req.query;
        const where = {
            assignedToId: req.user.id,
        };
        if (status)
            where.status = status;
        const [total, tasks] = await Promise.all([
            prisma_1.default.taskAssignment.count({ where }),
            prisma_1.default.taskAssignment.findMany({
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
                    progressHistory: {
                        orderBy: { createdAt: 'desc' },
                        take: 3, // Show last 3 updates in list
                        include: {
                            createdBy: {
                                select: { id: true, name: true, email: true },
                            },
                        },
                    },
                },
            }),
        ]);
        const meta = (0, pagination_1.calculatePaginationMeta)(total, page, limit);
        (0, response_1.sendSuccess)(res, tasks, 'My tasks retrieved successfully', 200, meta);
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get tasks', error);
    }
}
/**
 * Get task by ID
 * GET /api/tasks/:id
 */
async function getTaskById(req, res) {
    try {
        const { id } = req.params;
        const task = await prisma_1.default.taskAssignment.findUnique({
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
            (0, response_1.sendNotFound)(res, 'Task not found');
            return;
        }
        (0, response_1.sendSuccess)(res, task, 'Task retrieved successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get task', error);
    }
}
/**
 * Update task progress (Staff)
 * PATCH /api/tasks/:id/progress
 */
async function updateTaskProgress(req, res) {
    try {
        if (!req.user) {
            (0, response_1.sendError)(res, 'Not authenticated', 401);
            return;
        }
        const { id } = req.params;
        const { status, progressNotes } = req.body;
        // Verify task belongs to user
        const existingTask = await prisma_1.default.taskAssignment.findUnique({
            where: { id },
        });
        if (!existingTask) {
            (0, response_1.sendNotFound)(res, 'Task not found');
            return;
        }
        if (existingTask.assignedToId !== req.user.id && req.user.role === 'STAFF') {
            (0, response_1.sendError)(res, 'Not authorized to update this task', 403);
            return;
        }
        const updateData = {};
        if (status) {
            updateData.status = status;
            if (status === 'IN_PROGRESS' && !existingTask.startedAt) {
                updateData.startedAt = new Date();
            }
            if (status === 'COMPLETED') {
                updateData.completedAt = new Date();
                updateData.progressPercent = 100;
            }
        }
        // Keep latest progressNotes on task for backward compatibility
        if (progressNotes !== undefined && progressNotes.trim()) {
            updateData.progressNotes = progressNotes;
        }
        // Create progress history entry if there's a note or status change
        if ((progressNotes && progressNotes.trim()) || status) {
            await prisma_1.default.taskProgressHistory.create({
                data: {
                    taskId: id,
                    note: progressNotes?.trim() || `Status changed to ${status}`,
                    status: status || null,
                    createdById: req.user.id,
                },
            });
        }
        const task = await prisma_1.default.taskAssignment.update({
            where: { id },
            data: updateData,
            include: {
                assignedTo: {
                    select: { id: true, name: true, email: true },
                },
                assignedBy: {
                    select: { id: true, name: true, email: true },
                },
                progressHistory: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    include: {
                        createdBy: {
                            select: { id: true, name: true, email: true },
                        },
                    },
                },
            },
        });
        (0, response_1.sendSuccess)(res, task, 'Task progress updated successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to update task progress', error);
    }
}
/**
 * Get task progress history
 * GET /api/tasks/:id/history
 */
async function getTaskHistory(req, res) {
    try {
        if (!req.user) {
            (0, response_1.sendError)(res, 'Not authenticated', 401);
            return;
        }
        const { id } = req.params;
        // Verify task exists and user has access
        const task = await prisma_1.default.taskAssignment.findUnique({
            where: { id },
            select: { id: true, assignedToId: true },
        });
        if (!task) {
            (0, response_1.sendNotFound)(res, 'Task not found');
            return;
        }
        // Staff can only see their own tasks
        if (req.user.role === 'STAFF' && task.assignedToId !== req.user.id) {
            (0, response_1.sendError)(res, 'Not authorized to view this task history', 403);
            return;
        }
        const history = await prisma_1.default.taskProgressHistory.findMany({
            where: { taskId: id },
            orderBy: { createdAt: 'desc' },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        (0, response_1.sendSuccess)(res, history, 'Task history retrieved successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get task history', error);
    }
}
/**
 * Update task status (Admin - for marking as resolved)
 * PATCH /api/tasks/:id/status
 */
async function updateTaskStatus(req, res) {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const updateData = {
            status: status,
        };
        if (status === 'COMPLETED') {
            updateData.completedAt = new Date();
            updateData.progressPercent = 100;
        }
        const task = await prisma_1.default.taskAssignment.update({
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
        (0, response_1.sendSuccess)(res, task, 'Task status updated successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to update task status', error);
    }
}
/**
 * Get task tracking/stats for admin
 * GET /api/tasks/tracking
 */
async function getTaskTracking(req, res) {
    try {
        console.log('TaskController - getTaskTracking - Fetching task tracking data');
        // Get counts by status
        const [assigned, inProgress, completed, onHold, total] = await Promise.all([
            prisma_1.default.taskAssignment.count({ where: { status: 'ASSIGNED' } }),
            prisma_1.default.taskAssignment.count({ where: { status: 'IN_PROGRESS' } }),
            prisma_1.default.taskAssignment.count({ where: { status: 'COMPLETED' } }),
            prisma_1.default.taskAssignment.count({ where: { status: 'ON_HOLD' } }),
            prisma_1.default.taskAssignment.count(),
        ]);
        console.log(`TaskController - getTaskTracking - Counts: total=${total}, assigned=${assigned}, inProgress=${inProgress}, completed=${completed}, onHold=${onHold}`);
        // Get tasks grouped by staff
        const tasksByStaff = await prisma_1.default.taskAssignment.groupBy({
            by: ['assignedToId'],
            _count: { id: true },
            where: {
                status: { not: 'COMPLETED' },
            },
        });
        console.log(`TaskController - getTaskTracking - Tasks by staff:`, tasksByStaff.length);
        // Get staff details
        const staffIds = tasksByStaff.map((t) => t.assignedToId).filter(Boolean);
        let staffMembers = [];
        if (staffIds.length > 0) {
            staffMembers = await prisma_1.default.user.findMany({
                where: { id: { in: staffIds } },
                select: { id: true, name: true, email: true },
            });
        }
        console.log(`TaskController - getTaskTracking - Staff members found:`, staffMembers.length);
        const staffTaskCounts = tasksByStaff
            .map((t) => ({
            staff: staffMembers.find(s => s.id === t.assignedToId),
            pendingTasks: t._count.id,
        }))
            .filter((item) => item.staff); // Only include items where staff was found
        console.log(`TaskController - getTaskTracking - Staff task counts:`, staffTaskCounts.length);
        // Get recent activity
        const recentTasks = await prisma_1.default.taskAssignment.findMany({
            take: 10,
            orderBy: { updatedAt: 'desc' },
            include: {
                assignedTo: {
                    select: { id: true, name: true },
                },
            },
        });
        console.log(`TaskController - getTaskTracking - Recent tasks:`, recentTasks.length);
        const trackingData = {
            summary: {
                total,
                assigned,
                inProgress,
                completed,
                onHold,
            },
            staffTaskCounts,
            recentActivity: recentTasks,
        };
        console.log(`TaskController - getTaskTracking - Returning tracking data:`, JSON.stringify(trackingData, null, 2));
        (0, response_1.sendSuccess)(res, trackingData, 'Task tracking data retrieved');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get task tracking', error);
    }
}
/**
 * Delete task
 * DELETE /api/tasks/:id
 */
async function deleteTask(req, res) {
    try {
        const { id } = req.params;
        await prisma_1.default.taskAssignment.delete({
            where: { id },
        });
        (0, response_1.sendSuccess)(res, null, 'Task deleted successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to delete task', error);
    }
}
/**
 * Get all staff members (for task assignment dropdown)
 * GET /api/tasks/staff
 */
async function getStaffMembers(req, res) {
    try {
        const staff = await prisma_1.default.user.findMany({
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
        (0, response_1.sendSuccess)(res, staff, 'Staff members retrieved');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get staff members', error);
    }
}
//# sourceMappingURL=task.controller.js.map