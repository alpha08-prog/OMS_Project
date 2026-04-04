import { Response } from 'express';
import { GrievanceStatus, NewsPriority, TrainRequestStatus, TourDecision } from '@prisma/client';
import prisma from '../lib/prisma';
import { cacheGet, cacheSet, cacheClear } from '../lib/cache';
import { sendSuccess, sendServerError } from '../utils/response';
import type { AuthenticatedRequest, DashboardStats } from '../types';

/**
 * Get dashboard summary statistics
 * GET /api/stats/summary
 */
export async function getDashboardSummary(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    // Check cache first (30-second TTL — dashboard refreshes frequently)
    const cached = cacheGet<DashboardStats>('dashboard_stats');
    if (cached) {
      sendSuccess(res, cached, 'Dashboard statistics (cached)');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const month = today.getMonth() + 1;
    const day = today.getDate();

    // Run all counts in parallel
    const [
      totalGrievances,
      openGrievances,
      inProgressGrievances,
      verifiedGrievances,
      resolvedGrievances,
      pendingVerificationGrievances,
      totalVisitors,
      todayVisitors,
      totalTrainRequests,
      pendingTrainRequests,
      approvedTrainRequests,
      totalNews,
      criticalNews,
      totalTourPrograms,
      upcomingTourPrograms,
      pendingTourDecisions,
    ] = await Promise.all([
      // Grievances
      prisma.grievance.count(),
      prisma.grievance.count({ where: { status: GrievanceStatus.OPEN } }),
      prisma.grievance.count({ where: { status: GrievanceStatus.IN_PROGRESS } }),
      prisma.grievance.count({ where: { status: GrievanceStatus.VERIFIED } }),
      prisma.grievance.count({ where: { status: GrievanceStatus.RESOLVED } }),
      prisma.grievance.count({
        where: {
          isVerified: false,
          status: { notIn: [GrievanceStatus.RESOLVED, GrievanceStatus.REJECTED] },
        },
      }),
      // Visitors
      prisma.visitor.count(),
      prisma.visitor.count({
        where: {
          visitDate: { gte: today, lt: tomorrow },
        },
      }),
      // Train Requests
      prisma.trainRequest.count(),
      prisma.trainRequest.count({ where: { status: TrainRequestStatus.PENDING } }),
      prisma.trainRequest.count({ where: { status: TrainRequestStatus.APPROVED } }),
      // News
      prisma.newsIntelligence.count(),
      prisma.newsIntelligence.count({ where: { priority: NewsPriority.CRITICAL } }),
      // Tour Programs
      prisma.tourProgram.count(),
      prisma.tourProgram.count({
        where: {
          dateTime: { gte: today },
          decision: TourDecision.ACCEPTED,
        },
      }),
      prisma.tourProgram.count({
        where: {
          decision: TourDecision.PENDING,
          dateTime: { gte: today },
        },
      }),
    ]);

    // Get birthday count using raw query (from dedicated birthdays table)
    const birthdayResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM birthdays
      WHERE EXTRACT(MONTH FROM dob) = ${month}
        AND EXTRACT(DAY FROM dob) = ${day}
    `;
    const todayBirthdays = Number(birthdayResult[0]?.count || 0);

    const stats: DashboardStats = {
      grievances: {
        total: totalGrievances,
        open: openGrievances,
        inProgress: inProgressGrievances,
        verified: verifiedGrievances,
        resolved: resolvedGrievances,
        pendingVerification: pendingVerificationGrievances,
      },
      visitors: {
        total: totalVisitors,
        today: todayVisitors,
      },
      trainRequests: {
        total: totalTrainRequests,
        pending: pendingTrainRequests,
        approved: approvedTrainRequests,
      },
      news: {
        total: totalNews,
        critical: criticalNews,
      },
      tourPrograms: {
        total: totalTourPrograms,
        upcoming: upcomingTourPrograms,
        pending: pendingTourDecisions,
      },
      birthdays: {
        today: todayBirthdays,
      },
    };

    cacheSet('dashboard_stats', stats, 300); // cache for 5 minutes
    sendSuccess(res, stats, 'Dashboard statistics retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get dashboard statistics', error);
  }
}

/**
 * Get grievance statistics by type
 * GET /api/stats/grievances/by-type
 */
export async function getGrievancesByType(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const cached = cacheGet<unknown[]>('stats_by_type');
    if (cached) { sendSuccess(res, cached, 'Grievance statistics by type (cached)'); return; }

    const stats = await prisma.grievance.groupBy({
      by: ['grievanceType'],
      _count: { id: true },
    });

    const formatted = stats.map((s) => ({
      type: s.grievanceType,
      count: s._count.id,
    }));

    cacheSet('stats_by_type', formatted, 300);
    sendSuccess(res, formatted, 'Grievance statistics by type retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get grievance statistics', error);
  }
}

/**
 * Get grievance statistics by status
 * GET /api/stats/grievances/by-status
 */
export async function getGrievancesByStatus(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const cached = cacheGet<unknown[]>('stats_by_status');
    if (cached) { sendSuccess(res, cached, 'Grievance statistics by status (cached)'); return; }

    const stats = await prisma.grievance.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    const formatted = stats.map((s) => ({
      status: s.status,
      count: s._count.id,
    }));

    cacheSet('stats_by_status', formatted, 300);
    sendSuccess(res, formatted, 'Grievance statistics by status retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get grievance statistics', error);
  }
}

/**
 * Get grievance statistics by constituency
 * GET /api/stats/grievances/by-constituency
 */
export async function getGrievancesByConstituency(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const cached = cacheGet<unknown[]>('stats_by_constituency');
    if (cached) { sendSuccess(res, cached, 'Grievance statistics by constituency (cached)'); return; }

    const stats = await prisma.grievance.groupBy({
      by: ['constituency'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    const formatted = stats.map((s) => ({
      constituency: s.constituency,
      count: s._count.id,
    }));

    cacheSet('stats_by_constituency', formatted, 300);
    sendSuccess(res, formatted, 'Grievance statistics by constituency retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get grievance statistics', error);
  }
}

/**
 * Get monthly grievance trends
 * GET /api/stats/grievances/monthly
 */
export async function getMonthlyGrievanceTrends(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const cached = cacheGet<unknown[]>('stats_monthly_trends');
    if (cached) { sendSuccess(res, cached, 'Monthly grievance trends (cached)'); return; }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const trends = await prisma.$queryRaw<Array<{ month: string; count: bigint }>>`
      SELECT TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') as month,
             COUNT(*) as count
      FROM grievances
      WHERE "createdAt" >= ${sixMonthsAgo}
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY month ASC
    `;

    const formatted = trends.map((t) => ({
      month: t.month,
      count: Number(t.count),
    }));

    cacheSet('stats_monthly_trends', formatted, 600); // 10 min — historical data barely changes
    sendSuccess(res, formatted, 'Monthly grievance trends retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get monthly trends', error);
  }
}

/**
 * Get monetization summary (CSR tracking)
 * GET /api/stats/monetization
 */
export async function getMonetizationSummary(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const result = await prisma.grievance.aggregate({
      _sum: { monetaryValue: true },
      _avg: { monetaryValue: true },
      _count: { monetaryValue: true },
      where: {
        monetaryValue: { not: null },
      },
    });

    const byStatus = await prisma.grievance.groupBy({
      by: ['status'],
      _sum: { monetaryValue: true },
      where: {
        monetaryValue: { not: null },
      },
    });

    const summary = {
      totalValue: result._sum.monetaryValue || 0,
      averageValue: result._avg.monetaryValue || 0,
      totalRequests: result._count.monetaryValue,
      byStatus: byStatus.map((s) => ({
        status: s.status,
        totalValue: s._sum.monetaryValue || 0,
      })),
    };

    sendSuccess(res, summary, 'Monetization summary retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get monetization summary', error);
  }
}

/**
 * Get recent activity across all modules
 * GET /api/stats/recent-activity
 */
export async function getRecentActivity(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const [
      recentGrievances,
      recentVisitors,
      recentNews,
      recentTrainRequests,
    ] = await Promise.all([
      prisma.grievance.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          petitionerName: true,
          grievanceType: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.visitor.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          designation: true,
          purpose: true,
          createdAt: true,
        },
      }),
      prisma.newsIntelligence.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          headline: true,
          priority: true,
          createdAt: true,
        },
      }),
      prisma.trainRequest.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          passengerName: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    const activity = {
      grievances: recentGrievances.map((g) => ({
        type: 'grievance',
        ...g,
      })),
      visitors: recentVisitors.map((v) => ({
        type: 'visitor',
        ...v,
      })),
      news: recentNews.map((n) => ({
        type: 'news',
        ...n,
      })),
      trainRequests: recentTrainRequests.map((t) => ({
        type: 'train_request',
        ...t,
      })),
    };

    sendSuccess(res, activity, 'Recent activity retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get recent activity', error);
  }
}
