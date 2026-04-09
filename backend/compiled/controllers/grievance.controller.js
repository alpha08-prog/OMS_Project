"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGrievance = createGrievance;
exports.getGrievances = getGrievances;
exports.getGrievanceById = getGrievanceById;
exports.updateGrievance = updateGrievance;
exports.verifyGrievance = verifyGrievance;
exports.updateGrievanceStatus = updateGrievanceStatus;
exports.deleteGrievance = deleteGrievance;
exports.getVerificationQueue = getVerificationQueue;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../lib/prisma"));
const response_1 = require("../utils/response");
const pagination_1 = require("../utils/pagination");
const cache_1 = require("../lib/cache");
/** Bust all stat caches when grievance data changes */
function invalidateStatCaches() {
    (0, cache_1.cacheClear)('dashboard_stats');
    (0, cache_1.cacheClear)('stats_by_type');
    (0, cache_1.cacheClear)('stats_by_status');
    (0, cache_1.cacheClear)('stats_by_constituency');
}
/**
 * Create a new grievance
 * POST /api/grievances
 */
async function createGrievance(req, res) {
    try {
        if (!req.user) {
            (0, response_1.sendError)(res, 'Not authenticated', 401);
            return;
        }
        const { petitionerName, mobileNumber, constituency, grievanceType, description, monetaryValue, actionRequired, letterTemplate, referencedBy, } = req.body;
        const grievance = await prisma_1.default.grievance.create({
            data: {
                petitionerName,
                mobileNumber,
                constituency,
                grievanceType,
                description,
                monetaryValue: monetaryValue ? parseFloat(monetaryValue) : null,
                actionRequired,
                letterTemplate,
                referencedBy,
                createdById: req.user.id,
            },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        invalidateStatCaches();
        (0, response_1.sendSuccess)(res, grievance, 'Grievance created successfully', 201);
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to create grievance', error);
    }
}
/**
 * Get all grievances with pagination and filters
 * GET /api/grievances
 */
async function getGrievances(req, res) {
    try {
        const { page, limit, skip } = (0, pagination_1.parsePagination)(req.query);
        const filters = req.query;
        // Build where clause
        const where = {};
        // Staff can only see grievances they submitted
        if (req.user?.role === 'STAFF') {
            where.createdById = req.user.id;
        }
        if (filters.status) {
            where.status = filters.status;
        }
        if (filters.isVerified !== undefined) {
            where.isVerified = filters.isVerified === 'true';
        }
        if (filters.grievanceType) {
            where.grievanceType = filters.grievanceType;
        }
        if (filters.constituency) {
            where.constituency = { contains: filters.constituency, mode: 'insensitive' };
        }
        if (filters.search) {
            where.OR = [
                { petitionerName: { contains: filters.search, mode: 'insensitive' } },
                { mobileNumber: { contains: filters.search } },
                { description: { contains: filters.search, mode: 'insensitive' } },
            ];
        }
        if (filters.startDate || filters.endDate) {
            where.createdAt = {};
            if (filters.startDate)
                where.createdAt.gte = new Date(filters.startDate);
            if (filters.endDate)
                where.createdAt.lte = new Date(filters.endDate);
        }
        // Get total count and grievances
        const [total, grievances] = await Promise.all([
            prisma_1.default.grievance.count({ where }),
            prisma_1.default.grievance.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    createdBy: {
                        select: { id: true, name: true, email: true },
                    },
                    verifiedBy: {
                        select: { id: true, name: true, email: true },
                    },
                },
            }),
        ]);
        const meta = (0, pagination_1.calculatePaginationMeta)(total, page, limit);
        (0, response_1.sendSuccess)(res, grievances, 'Grievances retrieved successfully', 200, meta);
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get grievances', error);
    }
}
/**
 * Get single grievance by ID
 * GET /api/grievances/:id
 */
async function getGrievanceById(req, res) {
    try {
        const { id } = req.params;
        const grievance = await prisma_1.default.grievance.findUnique({
            where: { id },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
                verifiedBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        if (!grievance) {
            (0, response_1.sendNotFound)(res, 'Grievance not found');
            return;
        }
        (0, response_1.sendSuccess)(res, grievance, 'Grievance retrieved successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get grievance', error);
    }
}
/**
 * Update grievance
 * PUT /api/grievances/:id
 */
async function updateGrievance(req, res) {
    try {
        const { id } = req.params;
        const updateData = req.body;
        // Remove fields that shouldn't be updated directly
        delete updateData.id;
        delete updateData.createdById;
        delete updateData.createdAt;
        const grievance = await prisma_1.default.grievance.update({
            where: { id },
            data: updateData,
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
                verifiedBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        (0, response_1.sendSuccess)(res, grievance, 'Grievance updated successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to update grievance', error);
    }
}
/**
 * Verify grievance (Admin only)
 * PATCH /api/grievances/:id/verify
 * This also marks the grievance as RESOLVED
 */
async function verifyGrievance(req, res) {
    try {
        if (!req.user) {
            (0, response_1.sendError)(res, 'Not authenticated', 401);
            return;
        }
        const { id } = req.params;
        const grievance = await prisma_1.default.grievance.update({
            where: { id },
            data: {
                isVerified: true,
                status: client_1.GrievanceStatus.RESOLVED, // Mark as RESOLVED when verified
                verifiedById: req.user.id,
                verifiedAt: new Date(),
                resolvedAt: new Date(), // Also set resolved timestamp
            },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
                verifiedBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        invalidateStatCaches();
        (0, response_1.sendSuccess)(res, grievance, 'Grievance verified and resolved successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to verify grievance', error);
    }
}
/**
 * Update grievance status
 * PATCH /api/grievances/:id/status
 */
async function updateGrievanceStatus(req, res) {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const updateData = { status };
        if (status === client_1.GrievanceStatus.RESOLVED) {
            updateData.resolvedAt = new Date();
        }
        const grievance = await prisma_1.default.grievance.update({
            where: { id },
            data: updateData,
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
                verifiedBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        invalidateStatCaches();
        (0, response_1.sendSuccess)(res, grievance, 'Grievance status updated successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to update grievance status', error);
    }
}
/**
 * Delete grievance
 * DELETE /api/grievances/:id
 */
async function deleteGrievance(req, res) {
    try {
        const { id } = req.params;
        await prisma_1.default.grievance.delete({
            where: { id },
        });
        (0, response_1.sendSuccess)(res, null, 'Grievance deleted successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to delete grievance', error);
    }
}
/**
 * Get grievances pending verification
 * GET /api/grievances/queue/verification
 */
async function getVerificationQueue(req, res) {
    try {
        const { page, limit, skip } = (0, pagination_1.parsePagination)(req.query);
        const where = {
            isVerified: false,
            status: client_1.GrievanceStatus.OPEN,
        };
        const [total, grievances] = await Promise.all([
            prisma_1.default.grievance.count({ where }),
            prisma_1.default.grievance.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'asc' }, // FIFO queue
                include: {
                    createdBy: {
                        select: { id: true, name: true, email: true },
                    },
                },
            }),
        ]);
        const meta = (0, pagination_1.calculatePaginationMeta)(total, page, limit);
        (0, response_1.sendSuccess)(res, grievances, 'Verification queue retrieved', 200, meta);
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get verification queue', error);
    }
}
//# sourceMappingURL=grievance.controller.js.map