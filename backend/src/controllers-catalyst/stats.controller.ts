/**
 * Stats controller — Catalyst-backed.
 *
 * Aggregates are pushed DOWN to the datastore. `COUNT(ROWID)` and `GROUP BY`
 * both work here (measured against the live datastore), so a dashboard load is
 * a dozen O(1) queries issued in parallel instead of six whole-table reads.
 * Two quirks shape everything below:
 *   - `COUNT(*)` is rejected — always count ROWID (countRows/groupCount do).
 *   - Date functions (MONTH(), DAY()) are a syntax error, so month buckets are
 *     expressed as ranged COUNTs instead.
 *
 * Every endpoint keeps its original JS full-scan as a FALLBACK: countRows and
 * groupCount return null rather than throwing when an aggregate is unavailable,
 * and a dashboard that is slow is much better than one that is wrong.
 * Still cached aggressively (5 min) — admins refresh dashboards rapidly.
 */
import { Response } from 'express';
import {
  listAllRows,
  countRows,
  groupCount,
  columnExists,
  dateRangeClauses,
  executeZCQL,
  type CatalystRow,
} from '../lib/catalyst-client';
import { cacheSWR } from '../lib/cache';
import { sendSuccess, sendServerError } from '../utils/response';
import type { AuthenticatedRequest, DashboardStats } from '../types';

const GRIEVANCE_TABLE = 'Grievance';
const VISITOR_TABLE = 'Visitor';
const TRAIN_TABLE = 'TrainRequest';
const NEWS_TABLE = 'News';
const TOUR_TABLE = 'TourProgram';
const BIRTHDAY_TABLE = 'Birthday';

/** Grievances in these statuses are done, so they are never "awaiting verification". */
const VERIFICATION_TERMINAL = new Set(['RESOLVED', 'REJECTED']);

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

// ── ZCQL aggregate helpers ────────────────────────────────────────────────

type Bucket = { key: string | null; count: number };

/** Local calendar day (YYYY-MM-DD) — the form dateRangeClauses expects. */
function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Catalyst datetime literal for a PRECISE instant (YYYY-MM-DD HH:mm:ss).
 *
 * Catalyst datetime columns are timezone-naive and compare lexicographically,
 * and toCatalystDate writes local wall-clock, so this is the same clock the
 * stored values are on. Only ever used for `>=` LOWER bounds — upper bounds go
 * through dateRangeClauses, which makes them half-open.
 */
function catalystStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${localDay(d)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function whereOf(clauses: string[]): string {
  return clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
}

/** Fold groupCount rows into a map, keeping the unset bucket as a distinct null key. */
function tally(rows: Bucket[]): Map<string | null, number> {
  const out = new Map<string | null, number>();
  for (const r of rows) out.set(r.key, (out.get(r.key) ?? 0) + r.count);
  return out;
}

/**
 * Read one bucket out of a GROUP BY result, case-insensitively.
 *
 * ZCQL GROUP BY folds case — 'up' and 'UP' come back as ONE bucket, verified on
 * live data — so the casing of the key it hands back is not guaranteed to be
 * the casing we asked for. Matching exactly would risk silently returning 0 for
 * a bucket that exists. Only used for columns whose values are validated enums
 * on write (status, decision), where folding cannot merge two distinct values.
 */
function bucketFor(buckets: Map<string | null, number>, want: string): number {
  let n = 0;
  for (const [key, count] of buckets) {
    if (key !== null && key.toUpperCase() === want) n += count;
  }
  return n;
}

/**
 * Pull the aggregate value out of a ZCQL row. Catalyst names the column after
 * the function (`SUM(monetaryValue)`), so identify it by elimination rather
 * than by guessing the key.
 */
function aggregateNumber(row: Record<string, unknown> | undefined, groupColumn?: string): number | null {
  if (!row) return null;
  for (const [k, v] of Object.entries(row)) {
    if (groupColumn && k === groupColumn) continue;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
      return Number(v);
    }
  }
  return null;
}

/**
 * GET /api/stats/summary
 *
 * Kept behind stale-while-revalidate even now that the aggregation is pushed
 * down, because the dashboard is polled far more often than the numbers move.
 *   - Fresh window: 2 minutes.
 *   - Stale window: 10 minutes — serve the cached value and recompute in the
 *     background so the next hit sees fresh data.
 * Invalidated by invalidateStatCaches() in grievance.controller on every write.
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
  const pushedDown = await summaryViaAggregates();
  if (pushedDown) return pushedDown;
  // Aggregates unavailable on this datastore — pay the full scan rather than
  // report a number we cannot stand behind.
  console.warn('[stats] dashboard aggregates unavailable, falling back to full scans');
  return summaryViaFullScan();
}

/**
 * The dashboard as ~a dozen scalar queries, all issued in parallel.
 *
 * Returns null if ANY piece comes back unavailable, so the caller falls back to
 * the full scan instead of shipping a half-computed dashboard.
 */
async function summaryViaAggregates(): Promise<DashboardStats | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDay = localDay(today);

  // Half-open bounds throughout: a `<= '<day> 23:59:59'` upper bound drops the
  // last second of the day, because stored timestamps carry milliseconds after
  // a colon and compare lexicographically. dateRangeClauses handles that.
  const visitorTodayWhere = whereOf(dateRangeClauses('visitDate', todayDay, todayDay));
  const tourFuture = dateRangeClauses('dateTime', todayDay, null);

  // The JS version read `newsPriority || priority`, but `priority` is NOT a
  // column on News here — and one unknown column 400s the ENTIRE query, so the
  // second arm is gated rather than assumed.
  const hasPriorityColumn = await columnExists(NEWS_TABLE, 'priority');
  const criticalWhere = whereOf([
    hasPriorityColumn
      ? `(newsPriority = 'CRITICAL' OR priority = 'CRITICAL')`
      : `newsPriority = 'CRITICAL'`,
  ]);

  const [
    grievanceTotal,
    grievanceByStatus,
    verifiedByStatus,
    visitorTotal,
    visitorToday,
    trainTotal,
    trainByStatus,
    newsTotal,
    newsCritical,
    tourTotal,
    tourFutureByDecision,
    birthdays,
  ] = await Promise.all([
    countRows(GRIEVANCE_TABLE, ''),
    groupCount(GRIEVANCE_TABLE, 'status'),
    // Verified-per-status, so pendingVerification can be derived by subtraction
    // without a second full pass. `isVerified = true` EXCLUDES rows where the
    // flag is unset, which is exactly what `!parseBool(undefined)` did.
    groupCount(GRIEVANCE_TABLE, 'status', ` WHERE isVerified = true`),
    countRows(VISITOR_TABLE, ''),
    countRows(VISITOR_TABLE, visitorTodayWhere),
    countRows(TRAIN_TABLE, ''),
    groupCount(TRAIN_TABLE, 'status'),
    countRows(NEWS_TABLE, ''),
    countRows(NEWS_TABLE, criticalWhere),
    countRows(TOUR_TABLE, ''),
    // One GROUP BY over future-dated tours answers both `upcoming` and
    // `pending`. Rows with no dateTime are excluded by the range clause, which
    // matches the JS treating a missing date as epoch 0 (never >= today).
    groupCount(TOUR_TABLE, 'decision', whereOf(tourFuture)),
    // Birthdays stay a full read: "same month and day, any year" cannot be
    // expressed in ZCQL — date functions are a syntax error and LIKE against a
    // datetime column is rejected outright ("datetime value expected").
    listAllRows(BIRTHDAY_TABLE),
  ]);

  if (
    grievanceTotal === null ||
    grievanceByStatus === null ||
    verifiedByStatus === null ||
    visitorTotal === null ||
    visitorToday === null ||
    trainTotal === null ||
    trainByStatus === null ||
    newsTotal === null ||
    newsCritical === null ||
    tourTotal === null ||
    tourFutureByDecision === null
  ) {
    return null;
  }

  const grievanceStatuses = tally(grievanceByStatus);
  const verifiedStatuses = tally(verifiedByStatus);

  // Awaiting verification = every non-terminal grievance minus the ones already
  // verified. A grievance with NO status is counted, exactly as the JS
  // `status !== 'RESOLVED' && status !== 'REJECTED'` comparison counted it.
  let pendingVerification = 0;
  for (const [key, count] of grievanceStatuses) {
    if (key !== null && VERIFICATION_TERMINAL.has(key.toUpperCase())) continue;
    const verified = key === null
      ? verifiedStatuses.get(null) ?? 0
      : bucketFor(verifiedStatuses, key.toUpperCase());
    // Clamp: the two counts are separate queries, so a write landing between
    // them must not produce a negative.
    pendingVerification += Math.max(0, count - verified);
  }

  const trainStatuses = tally(trainByStatus);
  const tourDecisions = tally(tourFutureByDecision);

  const month = today.getMonth() + 1;
  const day = today.getDate();
  let todayBirthdays = 0;
  for (const b of birthdays) {
    if (!b.dob) continue;
    const d = new Date(b.dob as string);
    if (d.getMonth() + 1 === month && d.getDate() === day) todayBirthdays++;
  }

  return {
    grievances: {
      total: grievanceTotal,
      open: bucketFor(grievanceStatuses, 'OPEN'),
      inProgress: bucketFor(grievanceStatuses, 'IN_PROGRESS'),
      verified: bucketFor(grievanceStatuses, 'VERIFIED'),
      resolved: bucketFor(grievanceStatuses, 'RESOLVED'),
      pendingVerification,
    },
    visitors: { total: visitorTotal, today: visitorToday },
    trainRequests: {
      total: trainTotal,
      pending: bucketFor(trainStatuses, 'PENDING'),
      approved: bucketFor(trainStatuses, 'APPROVED'),
    },
    news: { total: newsTotal, critical: newsCritical },
    tourPrograms: {
      total: tourTotal,
      upcoming: bucketFor(tourDecisions, 'ACCEPTED'),
      pending: bucketFor(tourDecisions, 'PENDING'),
    },
    birthdays: { today: todayBirthdays },
  };
}

/** Original whole-table aggregation. Kept as the fallback when COUNT/GROUP BY are unavailable. */
async function summaryViaFullScan(): Promise<DashboardStats> {
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
      const t = new Date(v.visitDate as string).getTime();
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
    const dt = tp.dateTime ? new Date(tp.dateTime as string).getTime() : 0;
    if (tp.decision === 'ACCEPTED' && dt >= today.getTime()) upcomingTP++;
    if (tp.decision === 'PENDING' && dt >= today.getTime()) pendingTP++;
  }

  let todayBirthdays = 0;
  for (const b of birthdays) {
    if (!b.dob) continue;
    const d = new Date(b.dob as string);
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

/**
 * Tally one Grievance column via GROUP BY, falling back to a full scan.
 *
 * `nullLabel` is the value the JS version substituted for an unset column
 * (`String(row[col] ?? 'OTHER')`). groupCount reports unset values as key null,
 * and folding them into the same label is what keeps a chart from gaining a
 * phantom slice. Note this maps ONLY null/undefined, matching `??` — an empty
 * string stays its own bucket, as it did before.
 */
async function grievanceTally(
  column: string,
  nullLabel: string
): Promise<Array<{ label: string; count: number }>> {
  const grouped = await groupCount(GRIEVANCE_TABLE, column);
  if (grouped) {
    const counts = new Map<string, number>();
    for (const { key, count } of grouped) {
      const label = key === null ? nullLabel : key;
      counts.set(label, (counts.get(label) ?? 0) + count);
    }
    return Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
  }

  console.warn(`[stats] GROUP BY unavailable for ${column}, falling back to a full scan`);
  const grievances = await listAllRows(GRIEVANCE_TABLE);
  const counts = new Map<string, number>();
  for (const g of grievances) {
    const label = String(g[column] ?? nullLabel);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
}

/** GET /api/stats/grievances/by-type */
export async function getGrievancesByType(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const formatted = await cacheSWR('stats_by_type', 120, 600, async () => {
      // Safe to group: grievanceType is validated against a closed enum on both
      // create and update, and no two members differ only by case — which
      // matters because ZCQL GROUP BY folds case.
      const tallied = await grievanceTally('grievanceType', 'OTHER');
      return tallied.map(({ label, count }) => ({ type: label, count }));
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
      const tallied = await grievanceTally('status', 'OPEN');
      return tallied.map(({ label, count }) => ({ status: label, count }));
    });
    sendSuccess(res, formatted, 'Grievance statistics by status retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get grievance statistics', error);
  }
}

/**
 * GET /api/stats/grievances/by-constituency — top 10.
 *
 * DELIBERATELY still a full scan. ZCQL GROUP BY is case-insensitive, and unlike
 * status/type, `constituency` is free text with no write-side validation — the
 * live table holds both 'up' and 'UP' as separate entries today, which GROUP BY
 * merges into a single bucket of 2. That silently changes the chart, and at the
 * 10-row cutoff it can change which constituencies appear at all. Pushing this
 * down needs the column normalised at the write side first.
 */
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

/**
 * Month buckets as ranged COUNTs, issued in parallel.
 *
 * MONTH()/DAY() are a ZCQL syntax error, so the only way to bucket by month is
 * one bounded COUNT per month. Returns null if any bucket is unavailable, so a
 * partially-computed trend line never reaches the chart.
 */
async function monthlyTrendsViaCounts(): Promise<Array<{ month: string; count: number }> | null> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const now = new Date();
  const newestBucket = new Date(now.getFullYear(), now.getMonth(), 1);

  const buckets: Array<{ month: string; where: string }> = [];
  for (
    let m = new Date(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth(), 1);
    m <= newestBucket;
    m = new Date(m.getFullYear(), m.getMonth() + 1, 1)
  ) {
    // The OLDEST bucket is partial. The JS version cut at the exact
    // now-minus-6-months instant, not at a month boundary, so starting this
    // bucket at the 1st would silently add the days before the cutoff.
    const from = m.getTime() < sixMonthsAgo.getTime() ? sixMonthsAgo : m;
    // Upper bound comes from dateRangeClauses so it stays HALF-OPEN (strictly
    // before the 1st of the next month); a `<=` bound would drop the last day.
    const lastDayOfMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    buckets.push({
      month: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`,
      where: whereOf([
        `CREATEDTIME >= '${catalystStamp(from)}'`,
        ...dateRangeClauses('CREATEDTIME', null, localDay(lastDayOfMonth)),
      ]),
    });
  }

  const counts = await Promise.all(
    buckets.map((b) => countRows(GRIEVANCE_TABLE, b.where))
  );
  if (counts.some((c) => c === null)) return null;

  // Months with no grievances were absent from the old output — keep them
  // absent rather than introducing zero points the chart never had.
  return buckets
    .map((b, i) => ({ month: b.month, count: counts[i] as number }))
    .filter((b) => b.count > 0);
}

/** GET /api/stats/grievances/monthly — last 6 months. */
export async function getMonthlyGrievanceTrends(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const formatted = await cacheSWR('stats_monthly_trends', 120, 900, async () => {
      const pushedDown = await monthlyTrendsViaCounts();
      if (pushedDown) return pushedDown;

      console.warn('[stats] monthly COUNT buckets unavailable, falling back to a full scan');
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const cutoff = sixMonthsAgo.getTime();

      const grievances = await listAllRows(GRIEVANCE_TABLE);
      const buckets = new Map<string, number>();
      for (const g of grievances) {
        if (!g.CREATEDTIME) continue;
        const d = new Date(g.CREATEDTIME as string);
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

type MonetizationSummary = {
  totalValue: number;
  averageValue: number;
  totalRequests: number;
  byStatus: Array<{ status: string; totalValue: number }>;
};

/**
 * Monetization via SUM + GROUP BY. Verified against the live datastore to
 * reproduce the JS numbers exactly, including the two subtleties:
 *   - `monetaryValue != 0` excludes unset values as well as zeros, which is
 *     what the JS `if (!v) continue` did — so `totalRequests` matches and the
 *     average is computed over the same denominator.
 *   - a status whose rows carry no value sums to null; the JS never created an
 *     entry for it, so it is dropped rather than charted as a ₹0 bar.
 * Returns null on any failure so the caller falls back to the full scan.
 */
async function monetizationViaAggregates(): Promise<MonetizationSummary | null> {
  try {
    const [totalRows, requestRows, statusRows] = await Promise.all([
      executeZCQL<Record<string, unknown>>(
        `SELECT SUM(monetaryValue) FROM ${GRIEVANCE_TABLE}`
      ),
      executeZCQL<Record<string, unknown>>(
        `SELECT COUNT(ROWID) FROM ${GRIEVANCE_TABLE} WHERE monetaryValue != 0`
      ),
      executeZCQL<Record<string, unknown>>(
        `SELECT status, SUM(monetaryValue) FROM ${GRIEVANCE_TABLE} GROUP BY status`
      ),
    ]);

    const totalRequests = aggregateNumber(requestRows[0]);
    if (totalRequests === null) return null;
    // No rows with a value at all: SUM comes back null, and the total is 0.
    const totalValue = aggregateNumber(totalRows[0]) ?? 0;

    const byStatus = new Map<string, number>();
    for (const row of statusRows) {
      const value = aggregateNumber(row, 'status');
      if (!value) continue; // null (no values) or 0 — the JS produced no entry either
      const raw = row.status;
      const status = raw === null || raw === undefined ? 'OPEN' : String(raw);
      byStatus.set(status, (byStatus.get(status) ?? 0) + value);
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
  } catch (err) {
    console.warn(
      '[stats] monetization aggregates unavailable:',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/** GET /api/stats/monetization — CSR tracking. */
export async function getMonetizationSummary(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    // SWR-cached like the sibling stats endpoints (same 2-min stale / 10-min
    // expiry). Invalidated by invalidateStatCaches() on edits.
    const summary = await cacheSWR('stats_monetization', 120, 600, async () => {
      const pushedDown = await monetizationViaAggregates();
      if (pushedDown) return pushedDown;

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
      } satisfies MonetizationSummary;
    });

    sendSuccess(res, summary, 'Monetization summary retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get monetization summary', error);
  }
}

/**
 * The five newest rows of a table.
 *
 * Was `listAllRows(table)` sorted in JS and sliced to 5 — i.e. reading 2000+
 * train requests to show five. Compound ORDER BY works on every table here, and
 * the ROWID tiebreaker keeps the order stable when two rows share a timestamp
 * (CREATEDTIME sorts lexicographically, which for `YYYY-MM-DD HH:mm:ss:SSS` is
 * also chronological).
 */
async function latestFive(table: string): Promise<CatalystRow[]> {
  try {
    return await executeZCQL<CatalystRow>(
      `SELECT * FROM ${table} ORDER BY CREATEDTIME DESC, ROWID DESC LIMIT 5`
    );
  } catch (err) {
    console.warn(
      `[stats] ordered top-5 unavailable for ${table}, falling back to a full scan:`,
      err instanceof Error ? err.message : err
    );
    const rows = await listAllRows(table);
    // Must reproduce `ORDER BY CREATEDTIME DESC, ROWID DESC` exactly, or the
    // fallback hands back a different five than the ZCQL branch. Two reasons the
    // old `new Date(...).getTime()` compare did not: it drops the milliseconds
    // ('...:05:801' parses as :05), collapsing same-second rows into a tie, and
    // it then had no tiebreaker at all. CREATEDTIME is fixed-width, so a string
    // compare is both chronological and exactly what ZCQL does. ROWIDs are ~17
    // digits (past MAX_SAFE_INTEGER), so compare them as digit strings.
    return rows
      .slice()
      .sort((a, b) => {
        const sa = String(a.CREATEDTIME ?? '');
        const sb = String(b.CREATEDTIME ?? '');
        if (sa !== sb) return sb < sa ? -1 : 1;
        const ra = String(a.ROWID ?? '');
        const rb = String(b.ROWID ?? '');
        if (ra.length !== rb.length) return rb.length - ra.length;
        return rb < ra ? -1 : rb > ra ? 1 : 0;
      })
      .slice(0, 5);
  }
}

/** GET /api/stats/recent-activity — last 5 across modules. */
export async function getRecentActivity(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const [grievances, visitors, news, trainRequests] = await Promise.all([
      latestFive(GRIEVANCE_TABLE),
      latestFive(VISITOR_TABLE),
      latestFive(NEWS_TABLE),
      latestFive(TRAIN_TABLE),
    ]);

    const activity = {
      grievances: grievances.map((g) => ({
        type: 'grievance',
        id: String(g.ROWID),
        petitionerName: g.petitionerName,
        grievanceType: g.grievanceType,
        status: g.status,
        createdAt: g.CREATEDTIME,
      })),
      visitors: visitors.map((v) => ({
        type: 'visitor',
        id: String(v.ROWID),
        name: v.name,
        designation: v.designation,
        purpose: v.purpose,
        createdAt: v.CREATEDTIME,
      })),
      news: news.map((n) => ({
        type: 'news',
        id: String(n.ROWID),
        headline: n.headline,
        priority: n.newsPriority ?? n.priority,
        createdAt: n.CREATEDTIME,
      })),
      trainRequests: trainRequests.map((t) => ({
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
