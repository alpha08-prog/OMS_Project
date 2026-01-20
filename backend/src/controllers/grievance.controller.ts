import { Response } from 'express';
import { GrievanceStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { sendSuccess, sendError, sendNotFound, sendServerError } from '../utils/response';
import { parsePagination, calculatePaginationMeta } from '../utils/pagination';
import type { AuthenticatedRequest, GrievanceFilters } from '../types';

/**
 * Create a new grievance
 * POST /api/grievances
 */
export async function createGrievance(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const {
      petitionerName,
      mobileNumber,
      constituency,
      grievanceType,
      description,
      monetaryValue,
      actionRequired,
      letterTemplate,
      referencedBy,
    } = req.body;

    const grievance = await prisma.grievance.create({
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

    sendSuccess(res, grievance, 'Grievance created successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to create grievance', error);
  }
}

/**
 * Get all grievances with pagination and filters
 * GET /api/grievances
 */
export async function getGrievances(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(req.query as { page?: string; limit?: string });
    const filters = req.query as GrievanceFilters;

    // Build where clause
    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
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
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    // Get total count and grievances
    const [total, grievances] = await Promise.all([
      prisma.grievance.count({ where }),
      prisma.grievance.findMany({
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

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, grievances, 'Grievances retrieved successfully', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get grievances', error);
  }
}

/**
 * Get single grievance by ID
 * GET /api/grievances/:id
 */
export async function getGrievanceById(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    const grievance = await prisma.grievance.findUnique({
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
      sendNotFound(res, 'Grievance not found');
      return;
    }

    sendSuccess(res, grievance, 'Grievance retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get grievance', error);
  }
}

/**
 * Update grievance
 * PUT /api/grievances/:id
 */
export async function updateGrievance(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    delete updateData.id;
    delete updateData.createdById;
    delete updateData.createdAt;

    const grievance = await prisma.grievance.update({
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

    sendSuccess(res, grievance, 'Grievance updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update grievance', error);
  }
}

/**
 * Verify grievance (Admin only)
 * PATCH /api/grievances/:id/verify
 */
export async function verifyGrievance(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const { id } = req.params;

    const grievance = await prisma.grievance.update({
      where: { id },
      data: {
        isVerified: true,
        status: GrievanceStatus.VERIFIED,
        verifiedById: req.user.id,
        verifiedAt: new Date(),
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

    sendSuccess(res, grievance, 'Grievance verified successfully');
  } catch (error) {
    sendServerError(res, 'Failed to verify grievance', error);
  }
}

/**
 * Update grievance status
 * PATCH /api/grievances/:id/status
 */
export async function updateGrievanceStatus(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const updateData: any = { status };

    if (status === GrievanceStatus.RESOLVED) {
      updateData.resolvedAt = new Date();
    }

    const grievance = await prisma.grievance.update({
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

    sendSuccess(res, grievance, 'Grievance status updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update grievance status', error);
  }
}

/**
 * Delete grievance
 * DELETE /api/grievances/:id
 */
export async function deleteGrievance(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    await prisma.grievance.delete({
      where: { id },
    });

    sendSuccess(res, null, 'Grievance deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete grievance', error);
  }
}

/**
 * Get grievances pending verification
 * GET /api/grievances/queue/verification
 */
export async function getVerificationQueue(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(req.query as { page?: string; limit?: string });

    const where = {
      isVerified: false,
      status: GrievanceStatus.OPEN,
    };

    const [total, grievances] = await Promise.all([
      prisma.grievance.count({ where }),
      prisma.grievance.findMany({
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

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, grievances, 'Verification queue retrieved', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get verification queue', error);
  }
}
