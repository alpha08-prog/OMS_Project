"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVisitor = createVisitor;
exports.getVisitors = getVisitors;
exports.getVisitorById = getVisitorById;
exports.updateVisitor = updateVisitor;
exports.deleteVisitor = deleteVisitor;
exports.getTodayBirthdays = getTodayBirthdays;
exports.getVisitorsByDate = getVisitorsByDate;
const prisma_1 = __importDefault(require("../lib/prisma"));
const response_1 = require("../utils/response");
const pagination_1 = require("../utils/pagination");
/**
 * Create a new visitor entry
 * POST /api/visitors
 */
async function createVisitor(req, res) {
    try {
        if (!req.user) {
            (0, response_1.sendError)(res, 'Not authenticated', 401);
            return;
        }
        const { name, designation, phone, dob, purpose, referencedBy } = req.body;
        const visitor = await prisma_1.default.visitor.create({
            data: {
                name,
                designation,
                phone,
                dob: dob ? new Date(dob) : null,
                purpose,
                referencedBy,
                createdById: req.user.id,
            },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        (0, response_1.sendSuccess)(res, visitor, 'Visitor logged successfully', 201);
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to log visitor', error);
    }
}
/**
 * Get all visitors with pagination and filters
 * GET /api/visitors
 */
async function getVisitors(req, res) {
    try {
        const { page, limit, skip } = (0, pagination_1.parsePagination)(req.query);
        const filters = req.query;
        // Build where clause
        const where = {};
        if (filters.search) {
            where.OR = [
                { name: { contains: filters.search, mode: 'insensitive' } },
                { designation: { contains: filters.search, mode: 'insensitive' } },
                { purpose: { contains: filters.search, mode: 'insensitive' } },
            ];
        }
        if (filters.startDate || filters.endDate) {
            where.visitDate = {};
            if (filters.startDate)
                where.visitDate.gte = new Date(filters.startDate);
            if (filters.endDate)
                where.visitDate.lte = new Date(filters.endDate);
        }
        const [total, visitors] = await Promise.all([
            prisma_1.default.visitor.count({ where }),
            prisma_1.default.visitor.findMany({
                where,
                skip,
                take: limit,
                orderBy: { visitDate: 'desc' },
                include: {
                    createdBy: {
                        select: { id: true, name: true, email: true },
                    },
                },
            }),
        ]);
        const meta = (0, pagination_1.calculatePaginationMeta)(total, page, limit);
        (0, response_1.sendSuccess)(res, visitors, 'Visitors retrieved successfully', 200, meta);
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get visitors', error);
    }
}
/**
 * Get single visitor by ID
 * GET /api/visitors/:id
 */
async function getVisitorById(req, res) {
    try {
        const { id } = req.params;
        const visitor = await prisma_1.default.visitor.findUnique({
            where: { id },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        if (!visitor) {
            (0, response_1.sendNotFound)(res, 'Visitor not found');
            return;
        }
        (0, response_1.sendSuccess)(res, visitor, 'Visitor retrieved successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get visitor', error);
    }
}
/**
 * Update visitor
 * PUT /api/visitors/:id
 */
async function updateVisitor(req, res) {
    try {
        const { id } = req.params;
        const { name, designation, phone, dob, purpose, referencedBy } = req.body;
        const visitor = await prisma_1.default.visitor.update({
            where: { id },
            data: {
                name,
                designation,
                phone,
                dob: dob ? new Date(dob) : undefined,
                purpose,
                referencedBy,
            },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        (0, response_1.sendSuccess)(res, visitor, 'Visitor updated successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to update visitor', error);
    }
}
/**
 * Delete visitor
 * DELETE /api/visitors/:id
 */
async function deleteVisitor(req, res) {
    try {
        const { id } = req.params;
        await prisma_1.default.visitor.delete({
            where: { id },
        });
        (0, response_1.sendSuccess)(res, null, 'Visitor deleted successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to delete visitor', error);
    }
}
/**
 * Get today's birthdays
 * GET /api/visitors/birthdays/today
 */
async function getTodayBirthdays(req, res) {
    try {
        const today = new Date();
        const month = today.getMonth() + 1;
        const day = today.getDate();
        // Use raw query to filter by month and day
        const visitors = await prisma_1.default.$queryRaw `
      SELECT id, name, designation, phone, dob, purpose, "referencedBy", "visitDate"
      FROM visitors
      WHERE EXTRACT(MONTH FROM dob) = ${month}
        AND EXTRACT(DAY FROM dob) = ${day}
      ORDER BY "visitDate" DESC
    `;
        (0, response_1.sendSuccess)(res, visitors, "Today's birthdays retrieved successfully");
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get birthdays', error);
    }
}
/**
 * Get visitors by date
 * GET /api/visitors/date/:date
 */
async function getVisitorsByDate(req, res) {
    try {
        const { date } = req.params;
        const targetDate = new Date(date);
        const nextDay = new Date(targetDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const visitors = await prisma_1.default.visitor.findMany({
            where: {
                visitDate: {
                    gte: targetDate,
                    lt: nextDay,
                },
            },
            orderBy: { visitDate: 'desc' },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        (0, response_1.sendSuccess)(res, visitors, 'Visitors retrieved successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get visitors', error);
    }
}
//# sourceMappingURL=visitor.controller.js.map