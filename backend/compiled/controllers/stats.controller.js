"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardSummary = getDashboardSummary;
exports.getGrievancesByType = getGrievancesByType;
exports.getGrievancesByStatus = getGrievancesByStatus;
exports.getGrievancesByConstituency = getGrievancesByConstituency;
exports.getMonthlyGrievanceTrends = getMonthlyGrievanceTrends;
exports.getMonetizationSummary = getMonetizationSummary;
exports.getRecentActivity = getRecentActivity;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../lib/prisma"));
const cache_1 = require("../lib/cache");
const response_1 = require("../utils/response");
/**
 * Get dashboard summary statistics
 * GET /api/stats/summary
 */
async function getDashboardSummary(req, res) {
    try {
        // Check cache first (30-second TTL — dashboard refreshes frequently)
        const cached = (0, cache_1.cacheGet)('dashboard_stats');
        if (cached) {
            (0, response_1.sendSuccess)(res, cached, 'Dashboard statistics (cached)');
            return;
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const month = today.getMonth() + 1;
        const day = today.getDate();
        // Run all counts in parallel
        const [totalGrievances, openGrievances, inProgressGrievances, verifiedGrievances, resolvedGrievances, pendingVerificationGrievances, totalVisitors, todayVisitors, totalTrainRequests, pendingTrainRequests, approvedTrainRequests, totalNews, criticalNews, totalTourPrograms, upcomingTourPrograms, pendingTourDecisions,] = await Promise.all([
            // Grievances
            prisma_1.default.grievance.count(),
            prisma_1.default.grievance.count({ where: { status: client_1.GrievanceStatus.OPEN } }),
            prisma_1.default.grievance.count({ where: { status: client_1.GrievanceStatus.IN_PROGRESS } }),
            prisma_1.default.grievance.count({ where: { status: client_1.GrievanceStatus.VERIFIED } }),
            prisma_1.default.grievance.count({ where: { status: client_1.GrievanceStatus.RESOLVED } }),
            prisma_1.default.grievance.count({
                where: {
                    isVerified: false,
                    status: { notIn: [client_1.GrievanceStatus.RESOLVED, client_1.GrievanceStatus.REJECTED] },
                },
            }),
            // Visitors
            prisma_1.default.visitor.count(),
            prisma_1.default.visitor.count({
                where: {
                    visitDate: { gte: today, lt: tomorrow },
                },
            }),
            // Train Requests
            prisma_1.default.trainRequest.count(),
            prisma_1.default.trainRequest.count({ where: { status: client_1.TrainRequestStatus.PENDING } }),
            prisma_1.default.trainRequest.count({ where: { status: client_1.TrainRequestStatus.APPROVED } }),
            // News
            prisma_1.default.newsIntelligence.count(),
            prisma_1.default.newsIntelligence.count({ where: { priority: client_1.NewsPriority.CRITICAL } }),
            // Tour Programs
            prisma_1.default.tourProgram.count(),
            prisma_1.default.tourProgram.count({
                where: {
                    dateTime: { gte: today },
                    decision: client_1.TourDecision.ACCEPTED,
                },
            }),
            prisma_1.default.tourProgram.count({
                where: {
                    decision: client_1.TourDecision.PENDING,
                    dateTime: { gte: today },
                },
            }),
        ]);
        // Get birthday count using raw query (from dedicated birthdays table)
        const birthdayResult = await prisma_1.default.$queryRaw `
      SELECT COUNT(*) as count FROM birthdays
      WHERE EXTRACT(MONTH FROM dob) = ${month}
        AND EXTRACT(DAY FROM dob) = ${day}
    `;
        const todayBirthdays = Number(birthdayResult[0]?.count || 0);
        const stats = {
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
        (0, cache_1.cacheSet)('dashboard_stats', stats, 300); // cache for 5 minutes
        (0, response_1.sendSuccess)(res, stats, 'Dashboard statistics retrieved successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get dashboard statistics', error);
    }
}
/**
 * Get grievance statistics by type
 * GET /api/stats/grievances/by-type
 */
async function getGrievancesByType(req, res) {
    try {
        const cached = (0, cache_1.cacheGet)('stats_by_type');
        if (cached) {
            (0, response_1.sendSuccess)(res, cached, 'Grievance statistics by type (cached)');
            return;
        }
        const stats = await prisma_1.default.grievance.groupBy({
            by: ['grievanceType'],
            _count: { id: true },
        });
        const formatted = stats.map((s) => ({
            type: s.grievanceType,
            count: s._count.id,
        }));
        (0, cache_1.cacheSet)('stats_by_type', formatted, 300);
        (0, response_1.sendSuccess)(res, formatted, 'Grievance statistics by type retrieved');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get grievance statistics', error);
    }
}
/**
 * Get grievance statistics by status
 * GET /api/stats/grievances/by-status
 */
async function getGrievancesByStatus(req, res) {
    try {
        const cached = (0, cache_1.cacheGet)('stats_by_status');
        if (cached) {
            (0, response_1.sendSuccess)(res, cached, 'Grievance statistics by status (cached)');
            return;
        }
        const stats = await prisma_1.default.grievance.groupBy({
            by: ['status'],
            _count: { id: true },
        });
        const formatted = stats.map((s) => ({
            status: s.status,
            count: s._count.id,
        }));
        (0, cache_1.cacheSet)('stats_by_status', formatted, 300);
        (0, response_1.sendSuccess)(res, formatted, 'Grievance statistics by status retrieved');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get grievance statistics', error);
    }
}
/**
 * Get grievance statistics by constituency
 * GET /api/stats/grievances/by-constituency
 */
async function getGrievancesByConstituency(req, res) {
    try {
        const cached = (0, cache_1.cacheGet)('stats_by_constituency');
        if (cached) {
            (0, response_1.sendSuccess)(res, cached, 'Grievance statistics by constituency (cached)');
            return;
        }
        const stats = await prisma_1.default.grievance.groupBy({
            by: ['constituency'],
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 10,
        });
        const formatted = stats.map((s) => ({
            constituency: s.constituency,
            count: s._count.id,
        }));
        (0, cache_1.cacheSet)('stats_by_constituency', formatted, 300);
        (0, response_1.sendSuccess)(res, formatted, 'Grievance statistics by constituency retrieved');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get grievance statistics', error);
    }
}
/**
 * Get monthly grievance trends
 * GET /api/stats/grievances/monthly
 */
async function getMonthlyGrievanceTrends(req, res) {
    try {
        const cached = (0, cache_1.cacheGet)('stats_monthly_trends');
        if (cached) {
            (0, response_1.sendSuccess)(res, cached, 'Monthly grievance trends (cached)');
            return;
        }
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const trends = await prisma_1.default.$queryRaw `
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
        (0, cache_1.cacheSet)('stats_monthly_trends', formatted, 600); // 10 min — historical data barely changes
        (0, response_1.sendSuccess)(res, formatted, 'Monthly grievance trends retrieved');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get monthly trends', error);
    }
}
/**
 * Get monetization summary (CSR tracking)
 * GET /api/stats/monetization
 */
async function getMonetizationSummary(req, res) {
    try {
        const result = await prisma_1.default.grievance.aggregate({
            _sum: { monetaryValue: true },
            _avg: { monetaryValue: true },
            _count: { monetaryValue: true },
            where: {
                monetaryValue: { not: null },
            },
        });
        const byStatus = await prisma_1.default.grievance.groupBy({
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
        (0, response_1.sendSuccess)(res, summary, 'Monetization summary retrieved');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get monetization summary', error);
    }
}
/**
 * Get recent activity across all modules
 * GET /api/stats/recent-activity
 */
async function getRecentActivity(req, res) {
    try {
        const [recentGrievances, recentVisitors, recentNews, recentTrainRequests,] = await Promise.all([
            prisma_1.default.grievance.findMany({
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
            prisma_1.default.visitor.findMany({
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
            prisma_1.default.newsIntelligence.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    headline: true,
                    priority: true,
                    createdAt: true,
                },
            }),
            prisma_1.default.trainRequest.findMany({
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
        (0, response_1.sendSuccess)(res, activity, 'Recent activity retrieved');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get recent activity', error);
    }
}
//# sourceMappingURL=stats.controller.js.map