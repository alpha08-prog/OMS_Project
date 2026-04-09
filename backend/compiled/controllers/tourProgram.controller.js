"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTourProgram = createTourProgram;
exports.getTourPrograms = getTourPrograms;
exports.getTourProgramById = getTourProgramById;
exports.updateTourProgram = updateTourProgram;
exports.updateDecision = updateDecision;
exports.deleteTourProgram = deleteTourProgram;
exports.getTodaySchedule = getTodaySchedule;
exports.getUpcomingEvents = getUpcomingEvents;
exports.getPendingDecisions = getPendingDecisions;
exports.getEvents = getEvents;
exports.submitEventReport = submitEventReport;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../lib/prisma"));
const response_1 = require("../utils/response");
const pagination_1 = require("../utils/pagination");
const google_service_1 = require("../services/google.service");
const cache_1 = require("../lib/cache");
/**
 * Create tour program entry
 * POST /api/tour-programs
 */
async function createTourProgram(req, res) {
    try {
        if (!req.user) {
            (0, response_1.sendError)(res, 'Not authenticated', 401);
            return;
        }
        const { eventName, organizer, organizerPhone, organizerEmail, dateTime, venue, venueLink, description, referencedBy, } = req.body;
        const tourProgram = await prisma_1.default.tourProgram.create({
            data: {
                eventName,
                organizer,
                organizerPhone: organizerPhone?.trim() || null,
                organizerEmail: organizerEmail?.trim() || null,
                dateTime: new Date(dateTime),
                venue,
                venueLink,
                description,
                referencedBy,
                createdById: req.user.id,
            },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        (0, response_1.sendSuccess)(res, tourProgram, 'Tour program created successfully', 201);
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to create tour program', error);
    }
}
/**
 * Get all tour programs with pagination and filters
 * GET /api/tour-programs
 */
async function getTourPrograms(req, res) {
    try {
        const { page, limit, skip } = (0, pagination_1.parsePagination)(req.query);
        const filters = req.query;
        // Build where clause
        const where = {};
        if (filters.decision) {
            where.decision = filters.decision;
        }
        if (filters.search) {
            where.OR = [
                { eventName: { contains: filters.search, mode: 'insensitive' } },
                { organizer: { contains: filters.search, mode: 'insensitive' } },
                { venue: { contains: filters.search, mode: 'insensitive' } },
            ];
        }
        if (filters.startDate || filters.endDate) {
            where.dateTime = {};
            if (filters.startDate)
                where.dateTime.gte = new Date(filters.startDate);
            if (filters.endDate)
                where.dateTime.lte = new Date(filters.endDate);
        }
        const [total, tourPrograms] = await Promise.all([
            prisma_1.default.tourProgram.count({ where }),
            prisma_1.default.tourProgram.findMany({
                where,
                skip,
                take: limit,
                orderBy: { dateTime: 'asc' },
                include: {
                    createdBy: {
                        select: { id: true, name: true, email: true },
                    },
                },
            }),
        ]);
        const meta = (0, pagination_1.calculatePaginationMeta)(total, page, limit);
        (0, response_1.sendSuccess)(res, tourPrograms, 'Tour programs retrieved successfully', 200, meta);
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get tour programs', error);
    }
}
/**
 * Get single tour program by ID
 * GET /api/tour-programs/:id
 */
async function getTourProgramById(req, res) {
    try {
        const { id } = req.params;
        const tourProgram = await prisma_1.default.tourProgram.findUnique({
            where: { id },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        if (!tourProgram) {
            (0, response_1.sendNotFound)(res, 'Tour program not found');
            return;
        }
        (0, response_1.sendSuccess)(res, tourProgram, 'Tour program retrieved successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get tour program', error);
    }
}
/**
 * Update tour program
 * PUT /api/tour-programs/:id
 */
async function updateTourProgram(req, res) {
    try {
        const { id } = req.params;
        const updateData = req.body;
        delete updateData.id;
        delete updateData.createdById;
        delete updateData.createdAt;
        if (updateData.dateTime) {
            updateData.dateTime = new Date(updateData.dateTime);
        }
        const tourProgram = await prisma_1.default.tourProgram.update({
            where: { id },
            data: updateData,
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        (0, response_1.sendSuccess)(res, tourProgram, 'Tour program updated successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to update tour program', error);
    }
}
/**
 * Update tour program decision
 * PATCH /api/tour-programs/:id/decision
 */
async function updateDecision(req, res) {
    try {
        const { id } = req.params;
        const { decision, decisionNote } = req.body;
        if (!Object.values(client_1.TourDecision).includes(decision)) {
            (0, response_1.sendError)(res, 'Invalid decision value', 400);
            return;
        }
        const tourProgram = await prisma_1.default.tourProgram.update({
            where: { id },
            data: {
                decision,
                decisionNote,
            },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        // If accepted, push event to the admin's Google Calendar (silently — never block the response)
        if (decision === client_1.TourDecision.ACCEPTED && req.user?.id) {
            (0, google_service_1.createTourCalendarEvent)(req.user.id, {
                id: tourProgram.id,
                eventName: tourProgram.eventName,
                organizer: tourProgram.organizer,
                venue: tourProgram.venue,
                dateTime: tourProgram.dateTime,
                description: tourProgram.description,
                venueLink: tourProgram.venueLink,
            })
                .then(async (googleEventId) => {
                if (googleEventId) {
                    await prisma_1.default.tourProgram.update({
                        where: { id: tourProgram.id },
                        data: { googleCalendarEventId: googleEventId },
                    });
                }
            })
                .catch((err) => {
                console.error('Google Calendar event creation failed (non-blocking):', err);
            });
        }
        (0, cache_1.cacheClear)('calendar_events_');
        (0, cache_1.cacheClear)('dashboard_stats');
        (0, response_1.sendSuccess)(res, tourProgram, 'Decision updated successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to update decision', error);
    }
}
/**
 * Delete tour program
 * DELETE /api/tour-programs/:id
 */
async function deleteTourProgram(req, res) {
    try {
        const { id } = req.params;
        await prisma_1.default.tourProgram.delete({
            where: { id },
        });
        (0, response_1.sendSuccess)(res, null, 'Tour program deleted successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to delete tour program', error);
    }
}
/**
 * Get today's schedule
 * GET /api/tour-programs/schedule/today
 */
async function getTodaySchedule(req, res) {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tourPrograms = await prisma_1.default.tourProgram.findMany({
            where: {
                dateTime: {
                    gte: today,
                    lt: tomorrow,
                },
                decision: client_1.TourDecision.ACCEPTED,
            },
            orderBy: { dateTime: 'asc' },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        (0, response_1.sendSuccess)(res, tourPrograms, "Today's schedule retrieved successfully");
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get schedule', error);
    }
}
/**
 * Get upcoming events
 * GET /api/tour-programs/upcoming
 */
async function getUpcomingEvents(req, res) {
    try {
        const now = new Date();
        const sevenDaysLater = new Date();
        sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
        const tourPrograms = await prisma_1.default.tourProgram.findMany({
            where: {
                dateTime: {
                    gte: now,
                    lte: sevenDaysLater,
                },
            },
            orderBy: { dateTime: 'asc' },
            take: 20, // safety cap — no unbounded result sets
            select: {
                id: true,
                eventName: true,
                organizer: true,
                venue: true,
                dateTime: true,
                decision: true,
                description: true,
                createdBy: { select: { id: true, name: true, email: true } },
            },
        });
        (0, response_1.sendSuccess)(res, tourPrograms, 'Upcoming events retrieved successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get upcoming events', error);
    }
}
/**
 * Get pending decisions
 * GET /api/tour-programs/pending
 */
async function getPendingDecisions(req, res) {
    try {
        const { page, limit, skip } = (0, pagination_1.parsePagination)(req.query);
        // Show ALL pending invitations regardless of date
        // Admin needs to review all pending items
        const where = {
            decision: client_1.TourDecision.PENDING,
        };
        const [total, tourPrograms] = await Promise.all([
            prisma_1.default.tourProgram.count({ where }),
            prisma_1.default.tourProgram.findMany({
                where,
                skip,
                take: limit,
                orderBy: { dateTime: 'desc' }, // Most recent first
                include: {
                    createdBy: {
                        select: { id: true, name: true, email: true },
                    },
                },
            }),
        ]);
        const meta = (0, pagination_1.calculatePaginationMeta)(total, page, limit);
        (0, response_1.sendSuccess)(res, tourPrograms, 'Pending decisions retrieved', 200, meta);
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get pending decisions', error);
    }
}
/**
 * Get all completed events (ACCEPTED tours where dateTime has passed)
 * GET /api/tour-programs/events
 */
async function getEvents(req, res) {
    try {
        const { page, limit, skip } = (0, pagination_1.parsePagination)(req.query);
        const filters = req.query;
        const now = new Date();
        const where = {
            decision: client_1.TourDecision.ACCEPTED,
            dateTime: { lt: now },
        };
        if (filters.search) {
            where.OR = [
                { eventName: { contains: filters.search, mode: 'insensitive' } },
                { organizer: { contains: filters.search, mode: 'insensitive' } },
                { venue: { contains: filters.search, mode: 'insensitive' } },
            ];
        }
        if (filters.venue) {
            where.venue = { contains: filters.venue, mode: 'insensitive' };
        }
        if (filters.startDate || filters.endDate) {
            where.dateTime = { lt: now };
            if (filters.startDate)
                where.dateTime.gte = new Date(filters.startDate);
            if (filters.endDate)
                where.dateTime.lte = new Date(filters.endDate);
        }
        if (filters.isCompleted !== undefined) {
            where.isCompleted = filters.isCompleted === 'true';
        }
        const [total, events] = await Promise.all([
            prisma_1.default.tourProgram.count({ where }),
            prisma_1.default.tourProgram.findMany({
                where,
                skip,
                take: limit,
                orderBy: { dateTime: 'desc' },
                include: {
                    createdBy: { select: { id: true, name: true, email: true } },
                    completedBy: { select: { id: true, name: true, email: true } },
                },
            }),
        ]);
        const meta = (0, pagination_1.calculatePaginationMeta)(total, page, limit);
        (0, response_1.sendSuccess)(res, events, 'Events retrieved successfully', 200, meta);
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get events', error);
    }
}
/**
 * Submit post-event report (staff)
 * PATCH /api/tour-programs/:id/complete
 */
async function submitEventReport(req, res) {
    try {
        if (!req.user) {
            (0, response_1.sendError)(res, 'Not authenticated', 401);
            return;
        }
        const { id } = req.params;
        const { driveLink, keynotes, attendeesCount, outcomeSummary, mediaLink } = req.body;
        // Single query: fetch only needed validation fields, skip full include
        const existing = await prisma_1.default.tourProgram.findUnique({
            where: { id },
            select: { id: true, decision: true, dateTime: true },
        });
        if (!existing) {
            (0, response_1.sendNotFound)(res, 'Tour program not found');
            return;
        }
        if (existing.decision !== client_1.TourDecision.ACCEPTED) {
            (0, response_1.sendError)(res, 'Only accepted tour programs can have event reports', 400);
            return;
        }
        if (new Date(existing.dateTime) > new Date()) {
            (0, response_1.sendError)(res, 'Event has not occurred yet', 400);
            return;
        }
        const updated = await prisma_1.default.tourProgram.update({
            where: { id },
            data: {
                isCompleted: true,
                completedAt: new Date(),
                driveLink: driveLink?.trim() || null,
                keynotes: keynotes?.trim() || null,
                attendeesCount: attendeesCount ? parseInt(attendeesCount) : null,
                outcomeSummary: outcomeSummary?.trim() || null,
                mediaLink: mediaLink?.trim() || null,
                completedById: req.user.id,
            },
            include: {
                createdBy: { select: { id: true, name: true, email: true } },
                completedBy: { select: { id: true, name: true, email: true } },
            },
        });
        (0, response_1.sendSuccess)(res, updated, 'Event report submitted successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to submit event report', error);
    }
}
//# sourceMappingURL=tourProgram.controller.js.map