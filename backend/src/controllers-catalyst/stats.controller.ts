/**
 * Stats controller — Catalyst-backed.
 *
 * Uses listAllRows + JS aggregation since Catalyst ZCQL has limited GROUP BY
 * support across versions. Cached aggressively (5 min) — admins refresh
 * dashboards rapidly, no point re-aggregating each time.
 */
import { Response } from 'express';
import { listAllRows } from '../lib/catalyst-client';
import { cacheSWR } from '../lib/cache';
import { sendSuccess, sendServerError } from '../utils/response';
import type { AuthenticatedRequest, DashboardStats } from '../types';

const GRIEVANCE_TABLE = 'Grievance';
const VISITOR_TABLE = 'Visitor';
const TRAIN_TABLE = 'TrainRequest';
const NEWS_TABLE = 'News';
const TOUR_TABLE = 'TourProgram';
const BIRTHDAY_TABLE = 'Birthday';

function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return Boolean(v);
}

function parseNumber(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return isNaN(n) ? 0 : n;
}

/**
 * GET /api/stats/summary
 *
 * Aggregating over 6 full tables in JS is O(total_rows). At 100k rows per
 * table that's a 30s+ request, which would block every admin dashboard hit.
 *
 * Mitigation: stale-while-revalidate cache.
 *   - Fresh window: 2 minutes — admins clicking around get instant data.
 *   - Stale window: 10 minutes — between 2 and 10 min old, we serve the
 *     cached value AND trigger a background recompute. The next dashboard
 *     hit sees the just-refreshed data.
 *   - Hard expiry: 10 minutes — only the very first admin in any 10-min
 *     window (or after a restart) pays the aggregation cost.
 *
 * Catalyst ZCQL COUNT()/GROUP BY are unreliable across environments
 * (per existing codebase note in history.controller.ts), so we can't push
 * the aggregation down to the DB. SWR is the next-best lever.
 */
export async function getDashboardSummary(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const stats = await cacheSWR<DashboardStats>(
      'dashboard_stats',
      120, // stale after 2 min — start background refresh
      600, // hard expiry at 10 min
      computeDashboardSummary
    );
    sendSuccess(res, stats, 'Dashboard statistics retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get dashboard statistics', error);
  }
}

async function computeDashboardSummary(): Promise<DashboardStats> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const month = today.getMonth() + 1;
  const day = today.getDate();

  const [grievances, visitors, trainRequests, news, tours, birthdays] =
    await Promise.all([
      listAllRows(GRIEVANCE_TABLE),
      listAllRows(VISITOR_TABLE),
      listAllRows(TRAIN_TABLE),
      listAllRows(NEWS_TABLE),
      listAllRows(TOUR_TABLE),
      listAllRows(BIRTHDAY_TABLE),
    ]);

  let totalG = 0,
    openG = 0,
    inProgressG = 0,
    verifiedG = 0,
    resolvedG = 0,
    pendingVerificationG = 0;
  for (const g of grievances) {
    totalG++;
    if (g.status === 'OPEN') openG++;
    if (g.status === 'IN_PROGRESS') inProgressG++;
    if (g.status === 'VERIFIED') verifiedG++;
    if (g.status === 'RESOLVED') resolvedG++;
    if (
      !parseBool(g.isVerified) &&
      g.status !== 'RESOLVED' &&
      g.status !== 'REJECTED'
    ) {
      pendingVerificationG++;
    }
  }

  let totalV = 0,
    todayV = 0;
  for (const v of visitors) {
    totalV++;
    if (v.visitDate) {
      const t = new Date(v.visitDate).getTime();
      if (t >= today.getTime() && t < tomorrow.getTime()) todayV++;
    }
  }

  let totalT = 0,
    pendingT = 0,
    approvedT = 0;
  for (const t of trainRequests) {
    totalT++;
    if (t.status === 'PENDING') pendingT++;
    if (t.status === 'APPROVED') approvedT++;
  }

  let totalN = 0,
    criticalN = 0;
  for (const n of news) {
    totalN++;
    if (n.newsPriority === 'CRITICAL' || n.priority === 'CRITICAL') criticalN++;
  }

  let totalTP = 0,
    upcomingTP = 0,
    pendingTP = 0;
  for (const tp of tours) {
    totalTP++;
    const dt = tp.dateTime ? new Date(tp.dateTime).getTime() : 0;
    if (tp.decision === 'ACCEPTED' && dt >= today.getTime()) upcomingTP++;
    if (tp.decision === 'PENDING' && dt >= today.getTime()) pendingTP++;
  }

  let todayBirthdays = 0;
  for (const b of birthdays) {
    if (!b.dob) continue;
    const d = new Date(b.dob);
    if (d.getMonth() + 1 === month && d.getDate() === day) todayBirthdays++;
  }

  return {
    grievances: {
      total: totalG,
      open: openG,
      inProgress: inProgressG,
      verified: verifiedG,
      resolved: resolvedG,
      pendingVerification: pendingVerificationG,
    },
    visitors: { total: totalV, today: todayV },
    trainRequests: { total: totalT, pending: pendingT, approved: approvedT },
    news: { total: totalN, critical: criticalN },
    tourPrograms: { total: totalTP, upcoming: upcomingTP, pending: pendingTP },
    birthdays: { today: todayBirthdays },
  };
}

/** GET /api/stats/grievances/by-type */
export async function getGrievancesByType(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const formatted = await cacheSWR('stats_by_type', 120, 600, async () => {
      const grievances = await listAllRows(GRIEVANCE_TABLE);
      const counts = new Map<string, number>();
      for (const g of grievances) {
        const key = String(g.grievanceType ?? 'OTHER');
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return Array.from(counts.entries()).map(([type, count]) => ({ type, count }));
    });
    sendSuccess(res, formatted, 'Grievance statistics by type retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get grievance statistics', error);
  }
}

/** GET /api/stats/grievances/by-status */
export async function getGrievancesByStatus(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const formatted = await cacheSWR('stats_by_status', 120, 600, async () => {
      const grievances = await listAllRows(GRIEVANCE_TABLE);
      const counts = new Map<string, number>();
      for (const g of grievances) {
        const key = String(g.status ?? 'OPEN');
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return Array.from(counts.entries()).map(([status, count]) => ({ status, count }));
    });
    sendSuccess(res, formatted, 'Grievance statistics by status retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get grievance statistics', error);
  }
}

/** GET /api/stats/grievances/by-constituency — top 10. */
export async function getGrievancesByConstituency(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const formatted = await cacheSWR('stats_by_constituency', 120, 600, async () => {
      const grievances = await listAllRows(GRIEVANCE_TABLE);
      const counts = new Map<string, number>();
      for (const g of grievances) {
        const key = String(g.constituency ?? 'Unknown');
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return Array.from(counts.entries())
        .map(([constituency, count]) => ({ constituency, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    });
    sendSuccess(res, formatted, 'Grievance statistics by constituency retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get grievance statistics', error);
  }
}

/** GET /api/stats/grievances/monthly — last 6 months. */
export async function getMonthlyGrievanceTrends(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const formatted = await cacheSWR('stats_monthly_trends', 120, 900, async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const cutoff = sixMonthsAgo.getTime();

      const grievances = await listAllRows(GRIEVANCE_TABLE);
      const buckets = new Map<string, number>();
      for (const g of grievances) {
        if (!g.CREATEDTIME) continue;
        const d = new Date(g.CREATEDTIME);
        if (d.getTime() < cutoff) continue;
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        buckets.set(month, (buckets.get(month) ?? 0) + 1);
      }

      return Array.from(buckets.entries())
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month));
    });
    sendSuccess(res, formatted, 'Monthly grievance trends retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get monthly trends', error);
  }
}

/** GET /api/stats/monetization — CSR tracking. */
export async function getMonetizationSummary(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    // SWR-cached like the sibling stats endpoints (same 2-min stale / 10-min
    // expiry) so a dashboard that loads this alongside the summary doesn't scan
    // the Grievance table twice. Invalidated by invalidateStatCaches() on edits.
    const summary = await cacheSWR('stats_monetization', 120, 600, async () => {
      const grievances = await listAllRows(GRIEVANCE_TABLE);
      let totalValue = 0;
      let totalRequests = 0;
      const byStatus = new Map<string, number>();

      for (const g of grievances) {
        const v = parseNumber(g.monetaryValue);
        if (!v) continue;
        totalValue += v;
        totalRequests++;
        const status = String(g.status ?? 'OPEN');
        byStatus.set(status, (byStatus.get(status) ?? 0) + v);
      }

      return {
        totalValue,
        averageValue: totalRequests > 0 ? totalValue / totalRequests : 0,
        totalRequests,
        byStatus: Array.from(byStatus.entries()).map(([status, totalValue]) => ({
          status,
          totalValue,
        })),
      };
    });

    sendSuccess(res, summary, 'Monetization summary retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get monetization summary', error);
  }
}

/** GET /api/stats/recent-activity — last 5 across modules. */
export async function getRecentActivity(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const [grievances, visitors, news, trainRequests] = await Promise.all([
      listAllRows(GRIEVANCE_TABLE),
      listAllRows(VISITOR_TABLE),
      listAllRows(NEWS_TABLE),
      listAllRows(TRAIN_TABLE),
    ]);

    const top5ByCreatedAt = (rows: any[]) =>
      rows
        .slice()
        .sort((a, b) => {
          const ta = a.CREATEDTIME ? new Date(a.CREATEDTIME).getTime() : 0;
          const tb = b.CREATEDTIME ? new Date(b.CREATEDTIME).getTime() : 0;
          return tb - ta;
        })
        .slice(0, 5);

    const activity = {
      grievances: top5ByCreatedAt(grievances).map((g) => ({
        type: 'grievance',
        id: String(g.ROWID),
        petitionerName: g.petitionerName,
        grievanceType: g.grievanceType,
        status: g.status,
        createdAt: g.CREATEDTIME,
      })),
      visitors: top5ByCreatedAt(visitors).map((v) => ({
        type: 'visitor',
        id: String(v.ROWID),
        name: v.name,
        designation: v.designation,
        purpose: v.purpose,
        createdAt: v.CREATEDTIME,
      })),
      news: top5ByCreatedAt(news).map((n) => ({
        type: 'news',
        id: String(n.ROWID),
        headline: n.headline,
        priority: n.newsPriority ?? n.priority,
        createdAt: n.CREATEDTIME,
      })),
      trainRequests: top5ByCreatedAt(trainRequests).map((t) => ({
        type: 'train_request',
        id: String(t.ROWID),
        passengerName: t.passengerName,
        status: t.status,
        createdAt: t.CREATEDTIME,
      })),
    };

    sendSuccess(res, activity, 'Recent activity retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get recent activity', error);
  }
}
