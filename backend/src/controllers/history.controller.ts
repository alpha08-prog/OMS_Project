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

    // Define which actions belong to which entity type (query param values)
    const grievanceActions = ['VERIFIED', 'RESOLVED', 'REJECTED', 'IN_PROGRESS'];
    const trainActions = ['APPROVED', 'REJECTED', 'REGRET', 'ACCEPTED', 'RESOLVED'];
    const tourActions = ['ACCEPTED', 'REGRET'];

    // Fetch verified/resolved/rejected/in_progress grievances
    // Only fetch if no action filter OR action filter matches grievance actions
    const shouldFetchGrievances = (!type || type === 'GRIEVANCE') && 
      (!action || grievanceActions.includes(action as string));
    
    if (shouldFetchGrievances) {
      const grievanceWhere: any = {};
      
      // Build status filter based on action
      if (action === 'RESOLVED') {
        grievanceWhere.status = GrievanceStatus.RESOLVED;
      } else if (action === 'REJECTED') {
        grievanceWhere.status = GrievanceStatus.REJECTED;
      } else if (action === 'VERIFIED') {
        grievanceWhere.isVerified = true;
      } else if (action === 'IN_PROGRESS') {
        grievanceWhere.status = GrievanceStatus.IN_PROGRESS;
      } else {
        // No action filter - show ALL grievances that have been acted upon
        // Include: resolved, rejected, in_progress, OR verified, OR any that have been verified
        // This ensures we get ALL previous actions, not just recent ones
        grievanceWhere.OR = [
          { status: { in: [GrievanceStatus.RESOLVED, GrievanceStatus.REJECTED, GrievanceStatus.IN_PROGRESS] } },
          { isVerified: true }, // Include verified grievances regardless of status
          { verifiedAt: { not: null } }, // Include any grievance that has been verified (has verifiedAt)
          { status: { not: GrievanceStatus.OPEN } }, // Include any grievance that's not in OPEN status (has been acted upon)
        ];
      }
      
      // Add date filter - use updatedAt if verifiedAt is not available
      if (hasDateFilter) {
        // Filter by either verifiedAt or updatedAt to include all relevant grievances
        const dateFilterOR: any[] = [];
        
        // Add verifiedAt filter if it exists in the date range
        if (dateFilter.gte || dateFilter.lte) {
          dateFilterOR.push({ verifiedAt: dateFilter });
        }
        
        // Add updatedAt filter
        if (dateFilter.gte || dateFilter.lte) {
          dateFilterOR.push({ updatedAt: dateFilter });
        }
        
        // If we have date filters, combine with existing conditions
        if (dateFilterOR.length > 0) {
          const existingOR = grievanceWhere.OR;
          if (existingOR) {
            // We have an existing OR condition, combine with date filter using AND
            grievanceWhere.AND = [
              { OR: existingOR },
              { OR: dateFilterOR },
            ];
            delete grievanceWhere.OR;
          } else {
            // No existing OR, just add date filter
            grievanceWhere.OR = dateFilterOR;
          }
        }
      }

      // Remove the take limit to get ALL history items, then we'll paginate in memory
      const grievances = await prisma.grievance.findMany({
        where: grievanceWhere,
        include: {
          verifiedBy: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: [
          { verifiedAt: 'desc' },
          { updatedAt: 'desc' },
          { createdAt: 'desc' }, // Fallback to creation date
        ],
        // Remove take limit to get all matching records
      });

      console.log(`History - Found ${grievances.length} grievances matching criteria`);

      grievances.forEach((g: any) => {
        let actionLabel = 'Verified';
        if (g.status === GrievanceStatus.RESOLVED) {
          actionLabel = 'Resolved';
        } else if (g.status === GrievanceStatus.REJECTED) {
          actionLabel = 'Rejected';
        } else if (g.status === GrievanceStatus.IN_PROGRESS) {
          actionLabel = 'In Progress';
        } else if (g.isVerified) {
          actionLabel = 'Verified';
        }

        // Determine the action date - prefer verifiedAt, then updatedAt, then createdAt
        const actionDate = g.verifiedAt || g.updatedAt || g.createdAt;

        history.push({
          id: g.id,
          type: 'GRIEVANCE',
          action: actionLabel,
          title: `Grievance - ${g.grievanceType.replace(/_/g, ' ')}`,
          description: `${g.petitionerName} • ${g.constituency}`,
          actionBy: g.verifiedBy,
          actionAt: actionDate,
          status: g.status,
          details: {
            petitionerName: g.petitionerName,
            mobileNumber: g.mobileNumber,
            constituency: g.constituency,
            grievanceType: g.grievanceType,
            monetaryValue: g.monetaryValue,
            createdBy: g.createdBy,
            verifiedAt: g.verifiedAt,
            updatedAt: g.updatedAt,
          },
        });
      });
    }

    // Fetch approved/rejected train requests
    // Only fetch if no action filter OR action filter matches train actions
    const shouldFetchTrainRequests = (!type || type === 'TRAIN_REQUEST') && 
      (!action || trainActions.includes(action as string));
    
    if (shouldFetchTrainRequests) {
      const trainWhere: any = {
        status: {
          in: [TrainRequestStatus.APPROVED, TrainRequestStatus.REJECTED, TrainRequestStatus.RESOLVED],
        },
      };
      if (action === 'APPROVED' || action === 'ACCEPTED') {
        trainWhere.status = TrainRequestStatus.APPROVED;
      } else if (action === 'REJECTED' || action === 'REGRET') {
        trainWhere.status = TrainRequestStatus.REJECTED;
      } else if (action === 'RESOLVED') {
        trainWhere.status = TrainRequestStatus.RESOLVED;
      }
      if (hasDateFilter) {
        trainWhere.OR = [
          { approvedAt: dateFilter },
          { updatedAt: dateFilter },
        ];
      }

      // Remove the take limit to get ALL history items
      const trainRequests = await prisma.trainRequest.findMany({
        where: trainWhere,
        include: {
          approvedBy: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: [
          { approvedAt: 'desc' },
          { updatedAt: 'desc' },
          { createdAt: 'desc' }, // Fallback to creation date
        ],
        // Remove take limit to get all matching records
      });

      console.log(`History - Found ${trainRequests.length} train requests matching criteria`);

      trainRequests.forEach((t: any) => {
        let trainActionLabel = 'Accepted';
        if (t.status === TrainRequestStatus.REJECTED) trainActionLabel = 'Regret';
        else if (t.status === TrainRequestStatus.RESOLVED) trainActionLabel = 'Resolved';

        history.push({
          id: t.id,
          type: 'TRAIN_REQUEST',
          action: trainActionLabel,
          title: `Train EQ - ${t.trainName || t.trainNumber || 'N/A'}`,
          description: `${t.passengerName} • PNR: ${t.pnrNumber}`,
          actionBy: t.approvedBy,
          actionAt: t.approvedAt || t.updatedAt,
          status: t.status,
          details: {
            passengerName: t.passengerName,
            pnrNumber: t.pnrNumber,
            contactNumber: t.contactNumber,
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
    // Only fetch if no action filter OR action filter matches tour actions
    const shouldFetchTourPrograms = (!type || type === 'TOUR_PROGRAM') && 
      (!action || tourActions.includes(action as string));
    
    if (shouldFetchTourPrograms) {
      const tourWhere: any = {
        decision: { in: [TourDecision.ACCEPTED, TourDecision.REGRET] },
      };
      if (action === 'ACCEPTED') tourWhere.decision = TourDecision.ACCEPTED;
      if (action === 'REGRET') tourWhere.decision = TourDecision.REGRET;
      if (hasDateFilter) tourWhere.updatedAt = dateFilter;

      // Remove the take limit to get ALL history items
      const tourPrograms = await prisma.tourProgram.findMany({
        where: tourWhere,
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: [
          { updatedAt: 'desc' },
          { createdAt: 'desc' }, // Fallback to creation date
        ],
        // Remove take limit to get all matching records
      });

      console.log(`History - Found ${tourPrograms.length} tour programs matching criteria`);

      tourPrograms.forEach((tp: any) => {
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
            organizerPhone: tp.organizerPhone,
            organizerEmail: tp.organizerEmail,
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

    console.log(`History - Total history items found: ${history.length}`);

    // Apply pagination
    const total = history.length;
    const paginatedHistory = history.slice(skip, skip + limit);

    console.log(`History - Returning page ${page} with ${paginatedHistory.length} items (total: ${total})`);

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
      resolvedTrainRequests,
      acceptedTours,
      regretTours,
    ] = await Promise.all([
      prisma.grievance.count({ where: { status: GrievanceStatus.RESOLVED } }),
      prisma.grievance.count({ where: { status: GrievanceStatus.REJECTED } }),
      prisma.trainRequest.count({ where: { status: TrainRequestStatus.APPROVED } }),
      prisma.trainRequest.count({ where: { status: TrainRequestStatus.REJECTED } }),
      prisma.trainRequest.count({ where: { status: TrainRequestStatus.RESOLVED } }),
      prisma.tourProgram.count({ where: { decision: TourDecision.ACCEPTED } }),
      prisma.tourProgram.count({ where: { decision: TourDecision.REGRET } }),
    ]);

    // Also count verified and in-progress grievances
    const verifiedGrievances = await prisma.grievance.count({ where: { isVerified: true } });
    const inProgressGrievances = await prisma.grievance.count({ where: { status: GrievanceStatus.IN_PROGRESS } });

    const stats = {
      grievances: {
        resolved: resolvedGrievances,
        rejected: rejectedGrievances,
        verified: verifiedGrievances,
        inProgress: inProgressGrievances,
        total: resolvedGrievances + rejectedGrievances + verifiedGrievances + inProgressGrievances,
      },
      trainRequests: {
        approved: approvedTrainRequests,
        rejected: rejectedTrainRequests,
        resolved: resolvedTrainRequests,
        total: approvedTrainRequests + rejectedTrainRequests + resolvedTrainRequests,
      },
      tourPrograms: {
        accepted: acceptedTours,
        regret: regretTours,
        total: acceptedTours + regretTours,
      },
      totalActions:
        resolvedGrievances +
        rejectedGrievances +
        approvedTrainRequests +
        rejectedTrainRequests +
        resolvedTrainRequests +
        acceptedTours +
        regretTours,
    };

    sendSuccess(res, stats, 'History stats retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get history stats', error);
  }
}
