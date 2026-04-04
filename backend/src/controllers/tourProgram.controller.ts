import { Response } from 'express';
import { TourDecision } from '@prisma/client';
import prisma from '../lib/prisma';
import { sendSuccess, sendError, sendNotFound, sendServerError } from '../utils/response';
import { parsePagination, calculatePaginationMeta } from '../utils/pagination';
import type { AuthenticatedRequest, TourProgramFilters, EventFilters } from '../types';
import { createTourCalendarEvent } from '../services/google.service';
import { cacheClear } from '../lib/cache';

/**
 * Create tour program entry
 * POST /api/tour-programs
 */
export async function createTourProgram(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const {
      eventName,
      organizer,
      organizerPhone,
      organizerEmail,
      dateTime,
      venue,
      venueLink,
      description,
      referencedBy,
    } = req.body;

    const tourProgram = await prisma.tourProgram.create({
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

    sendSuccess(res, tourProgram, 'Tour program created successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to create tour program', error);
  }
}

/**
 * Get all tour programs with pagination and filters
 * GET /api/tour-programs
 */
export async function getTourPrograms(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(req.query as { page?: string; limit?: string });
    const filters = req.query as TourProgramFilters;

    // Build where clause
    const where: any = {};

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
      if (filters.startDate) where.dateTime.gte = new Date(filters.startDate);
      if (filters.endDate) where.dateTime.lte = new Date(filters.endDate);
    }

    const [total, tourPrograms] = await Promise.all([
      prisma.tourProgram.count({ where }),
      prisma.tourProgram.findMany({
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

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, tourPrograms, 'Tour programs retrieved successfully', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get tour programs', error);
  }
}

/**
 * Get single tour program by ID
 * GET /api/tour-programs/:id
 */
export async function getTourProgramById(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    const tourProgram = await prisma.tourProgram.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!tourProgram) {
      sendNotFound(res, 'Tour program not found');
      return;
    }

    sendSuccess(res, tourProgram, 'Tour program retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get tour program', error);
  }
}

/**
 * Update tour program
 * PUT /api/tour-programs/:id
 */
export async function updateTourProgram(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const updateData = req.body;

    delete updateData.id;
    delete updateData.createdById;
    delete updateData.createdAt;

    if (updateData.dateTime) {
      updateData.dateTime = new Date(updateData.dateTime);
    }

    const tourProgram = await prisma.tourProgram.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    sendSuccess(res, tourProgram, 'Tour program updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update tour program', error);
  }
}

/**
 * Update tour program decision
 * PATCH /api/tour-programs/:id/decision
 */
export async function updateDecision(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { decision, decisionNote } = req.body;

    if (!Object.values(TourDecision).includes(decision)) {
      sendError(res, 'Invalid decision value', 400);
      return;
    }

    const tourProgram = await prisma.tourProgram.update({
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
    if (decision === TourDecision.ACCEPTED && req.user?.id) {
      createTourCalendarEvent(req.user.id, {
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
            await prisma.tourProgram.update({
              where: { id: tourProgram.id },
              data: { googleCalendarEventId: googleEventId },
            });
          }
        })
        .catch((err) => {
          console.error('Google Calendar event creation failed (non-blocking):', err);
        });
    }

    cacheClear('calendar_events_');
    cacheClear('dashboard_stats');
    sendSuccess(res, tourProgram, 'Decision updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update decision', error);
  }
}

/**
 * Delete tour program
 * DELETE /api/tour-programs/:id
 */
export async function deleteTourProgram(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    await prisma.tourProgram.delete({
      where: { id },
    });

    sendSuccess(res, null, 'Tour program deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete tour program', error);
  }
}

/**
 * Get today's schedule
 * GET /api/tour-programs/schedule/today
 */
export async function getTodaySchedule(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tourPrograms = await prisma.tourProgram.findMany({
      where: {
        dateTime: {
          gte: today,
          lt: tomorrow,
        },
        decision: TourDecision.ACCEPTED,
      },
      orderBy: { dateTime: 'asc' },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    sendSuccess(res, tourPrograms, "Today's schedule retrieved successfully");
  } catch (error) {
    sendServerError(res, 'Failed to get schedule', error);
  }
}

/**
 * Get upcoming events
 * GET /api/tour-programs/upcoming
 */
export async function getUpcomingEvents(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const now = new Date();
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

    const tourPrograms = await prisma.tourProgram.findMany({
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

    sendSuccess(res, tourPrograms, 'Upcoming events retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get upcoming events', error);
  }
}

/**
 * Get pending decisions
 * GET /api/tour-programs/pending
 */
export async function getPendingDecisions(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(req.query as { page?: string; limit?: string });

    // Show ALL pending invitations regardless of date
    // Admin needs to review all pending items
    const where = {
      decision: TourDecision.PENDING,
    };

    const [total, tourPrograms] = await Promise.all([
      prisma.tourProgram.count({ where }),
      prisma.tourProgram.findMany({
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

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, tourPrograms, 'Pending decisions retrieved', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get pending decisions', error);
  }
}

/**
 * Get all completed events (ACCEPTED tours where dateTime has passed)
 * GET /api/tour-programs/events
 */
export async function getEvents(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(req.query as { page?: string; limit?: string });
    const filters = req.query as EventFilters;
    const now = new Date();

    const where: any = {
      decision: TourDecision.ACCEPTED,
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
      if (filters.startDate) where.dateTime.gte = new Date(filters.startDate);
      if (filters.endDate) where.dateTime.lte = new Date(filters.endDate);
    }
    if (filters.isCompleted !== undefined) {
      where.isCompleted = filters.isCompleted === 'true';
    }

    const [total, events] = await Promise.all([
      prisma.tourProgram.count({ where }),
      prisma.tourProgram.findMany({
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

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, events, 'Events retrieved successfully', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get events', error);
  }
}

/**
 * Submit post-event report (staff)
 * PATCH /api/tour-programs/:id/complete
 */
export async function submitEventReport(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const { id } = req.params;
    const { driveLink, keynotes, attendeesCount, outcomeSummary, mediaLink } = req.body;

    // Single query: fetch only needed validation fields, skip full include
    const existing = await prisma.tourProgram.findUnique({
      where: { id },
      select: { id: true, decision: true, dateTime: true },
    });
    if (!existing) {
      sendNotFound(res, 'Tour program not found');
      return;
    }
    if (existing.decision !== TourDecision.ACCEPTED) {
      sendError(res, 'Only accepted tour programs can have event reports', 400);
      return;
    }
    if (new Date(existing.dateTime) > new Date()) {
      sendError(res, 'Event has not occurred yet', 400);
      return;
    }

    const updated = await prisma.tourProgram.update({
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

    sendSuccess(res, updated, 'Event report submitted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to submit event report', error);
  }
}
