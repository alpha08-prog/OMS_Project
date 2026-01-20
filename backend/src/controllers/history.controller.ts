import { Response } from 'express';
import { GrievanceStatus, TrainRequestStatus, TourDecision } from '@prisma/client';
import prisma from '../lib/prisma';
import { sendSuccess, sendServerError } from '../utils/response';
import { parsePagination, calculatePaginationMeta } from '../utils/pagination';
import type { AuthenticatedRequest } from '../types';

/**
 * History item type
 */
type HistoryItem = {
  id: string;
  type: 'GRIEVANCE' | 'TRAIN_REQUEST' | 'TOUR_PROGRAM';
  action: string;
  title: string;
  description: string;
  actionBy: { id: string; name: string; email: string } | null;
  actionAt: Date;
  status: string;
  details: Record<string, any>;
};

/**
 * Get admin action history
 * GET /api/history
 * Returns all actions taken by admins (verified/rejected grievances, approved/rejected train requests, tour decisions)
 */
export async function getAdminHistory(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(req.query as { page?: string; limit?: string });
    const { type, action, startDate, endDate } = req.query;

    const history: HistoryItem[] = [];

    // Build date filter
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) dateFilter.lte = new Date(endDate as string);
    const hasDateFilter = Object.keys(dateFilter).length > 0;

    // Fetch resolved/rejected grievances
    if (!type || type === 'GRIEVANCE') {
      const grievanceWhere: any = {
        status: { in: [GrievanceStatus.RESOLVED, GrievanceStatus.REJECTED] },
      };
      if (action === 'RESOLVED') grievanceWhere.status = GrievanceStatus.RESOLVED;
      if (action === 'REJECTED') grievanceWhere.status = GrievanceStatus.REJECTED;
      if (hasDateFilter) grievanceWhere.verifiedAt = dateFilter;

      const grievances = await prisma.grievance.findMany({
        where: grievanceWhere,
        include: {
          verifiedBy: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { verifiedAt: 'desc' },
        take: 100, // Limit for performance
      });

      grievances.forEach((g) => {
        history.push({
          id: g.id,
          type: 'GRIEVANCE',
          action: g.status === GrievanceStatus.RESOLVED ? 'Verified & Resolved' : 'Rejected',
          title: `Grievance - ${g.grievanceType.replace(/_/g, ' ')}`,
          description: `${g.petitionerName} • ${g.constituency}`,
          actionBy: g.verifiedBy,
          actionAt: g.verifiedAt || g.updatedAt,
          status: g.status,
          details: {
            petitionerName: g.petitionerName,
            mobileNumber: g.mobileNumber,
            constituency: g.constituency,
            grievanceType: g.grievanceType,
            monetaryValue: g.monetaryValue,
            createdBy: g.createdBy,
          },
        });
      });
    }

    // Fetch approved/rejected train requests
    if (!type || type === 'TRAIN_REQUEST') {
      const trainWhere: any = {
        status: { in: [TrainRequestStatus.APPROVED, TrainRequestStatus.REJECTED] },
      };
      if (action === 'APPROVED') trainWhere.status = TrainRequestStatus.APPROVED;
      if (action === 'REJECTED') trainWhere.status = TrainRequestStatus.REJECTED;
      if (hasDateFilter) trainWhere.approvedAt = dateFilter;

      const trainRequests = await prisma.trainRequest.findMany({
        where: trainWhere,
        include: {
          approvedBy: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { approvedAt: 'desc' },
        take: 100,
      });

      trainRequests.forEach((t) => {
        history.push({
          id: t.id,
          type: 'TRAIN_REQUEST',
          action: t.status === TrainRequestStatus.APPROVED ? 'Approved' : 'Rejected',
          title: `Train EQ - ${t.trainName || t.trainNumber || 'N/A'}`,
          description: `${t.passengerName} • PNR: ${t.pnrNumber}`,
          actionBy: t.approvedBy,
          actionAt: t.approvedAt || t.updatedAt,
          status: t.status,
          details: {
            passengerName: t.passengerName,
            pnrNumber: t.pnrNumber,
            trainName: t.trainName,
            trainNumber: t.trainNumber,
            dateOfJourney: t.dateOfJourney,
            fromStation: t.fromStation,
            toStation: t.toStation,
            journeyClass: t.journeyClass,
            rejectionReason: t.rejectionReason,
            createdBy: t.createdBy,
          },
        });
      });
    }

    // Fetch tour program decisions (accepted/regret)
    if (!type || type === 'TOUR_PROGRAM') {
      const tourWhere: any = {
        decision: { in: [TourDecision.ACCEPTED, TourDecision.REGRET] },
      };
      if (action === 'ACCEPTED') tourWhere.decision = TourDecision.ACCEPTED;
      if (action === 'REGRET') tourWhere.decision = TourDecision.REGRET;
      if (hasDateFilter) tourWhere.updatedAt = dateFilter;

      const tourPrograms = await prisma.tourProgram.findMany({
        where: tourWhere,
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      });

      tourPrograms.forEach((tp) => {
        history.push({
          id: tp.id,
          type: 'TOUR_PROGRAM',
          action: tp.decision === TourDecision.ACCEPTED ? 'Accepted' : 'Regret',
          title: `Tour - ${tp.eventName}`,
          description: `${tp.organizer} • ${tp.venue}`,
          actionBy: null, // Tour programs don't track who made the decision
          actionAt: tp.updatedAt,
          status: tp.decision,
          details: {
            eventName: tp.eventName,
            organizer: tp.organizer,
            dateTime: tp.dateTime,
            venue: tp.venue,
            venueLink: tp.venueLink,
            decisionNote: tp.decisionNote,
            createdBy: tp.createdBy,
          },
        });
      });
    }

    // Sort by actionAt descending
    history.sort((a, b) => new Date(b.actionAt).getTime() - new Date(a.actionAt).getTime());

    // Apply pagination
    const total = history.length;
    const paginatedHistory = history.slice(skip, skip + limit);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, paginatedHistory, 'History retrieved successfully', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get history', error);
  }
}

/**
 * Get history statistics
 * GET /api/history/stats
 */
export async function getHistoryStats(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const [
      resolvedGrievances,
      rejectedGrievances,
      approvedTrainRequests,
      rejectedTrainRequests,
      acceptedTours,
      regretTours,
    ] = await Promise.all([
      prisma.grievance.count({ where: { status: GrievanceStatus.RESOLVED } }),
      prisma.grievance.count({ where: { status: GrievanceStatus.REJECTED } }),
      prisma.trainRequest.count({ where: { status: TrainRequestStatus.APPROVED } }),
      prisma.trainRequest.count({ where: { status: TrainRequestStatus.REJECTED } }),
      prisma.tourProgram.count({ where: { decision: TourDecision.ACCEPTED } }),
      prisma.tourProgram.count({ where: { decision: TourDecision.REGRET } }),
    ]);

    const stats = {
      grievances: {
        resolved: resolvedGrievances,
        rejected: rejectedGrievances,
        total: resolvedGrievances + rejectedGrievances,
      },
      trainRequests: {
        approved: approvedTrainRequests,
        rejected: rejectedTrainRequests,
        total: approvedTrainRequests + rejectedTrainRequests,
      },
      tourPrograms: {
        accepted: acceptedTours,
        regret: regretTours,
        total: acceptedTours + regretTours,
      },
      totalActions: resolvedGrievances + rejectedGrievances + approvedTrainRequests + rejectedTrainRequests + acceptedTours + regretTours,
    };

    sendSuccess(res, stats, 'History stats retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get history stats', error);
  }
}
