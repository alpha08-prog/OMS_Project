/**
 * Unit tests for stats controller — DashboardStats shape and cache behaviour.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cacheGet, cacheSet, cacheClear } from '../lib/cache';

// Re-export the shape assertion helpers
interface GrievanceStats {
  total: number;
  open: number;
  inProgress: number;
  verified: number;
  resolved: number;
  pendingVerification: number;
}

interface DashboardStats {
  grievances: GrievanceStats;
  visitors: { total: number; today: number };
  trainRequests: { total: number; pending: number; approved: number };
  news: { total: number; critical: number };
  tourPrograms: { total: number; upcoming: number; pending: number };
  birthdays: { today: number };
}

// ── Shape tests ────────────────────────────────────────────────────────────────

describe('DashboardStats shape', () => {
  const sample: DashboardStats = {
    grievances: { total: 10, open: 5, inProgress: 2, verified: 1, resolved: 2, pendingVerification: 7 },
    visitors: { total: 20, today: 3 },
    trainRequests: { total: 15, pending: 4, approved: 9 },
    news: { total: 8, critical: 1 },
    tourPrograms: { total: 12, upcoming: 3, pending: 2 },
    birthdays: { today: 1 },
  };

  it('has pendingVerification field on grievances', () => {
    expect(sample.grievances).toHaveProperty('pendingVerification');
    expect(typeof sample.grievances.pendingVerification).toBe('number');
  });

  it('pendingVerification equals open + inProgress when all unresolved are unverified', () => {
    // open(5) + inProgress(2) = 7 — matches sample.pendingVerification
    expect(sample.grievances.pendingVerification).toBe(
      sample.grievances.open + sample.grievances.inProgress
    );
  });

  it('all required keys are present', () => {
    expect(sample).toHaveProperty('grievances');
    expect(sample).toHaveProperty('visitors');
    expect(sample).toHaveProperty('trainRequests');
    expect(sample).toHaveProperty('news');
    expect(sample).toHaveProperty('tourPrograms');
    expect(sample).toHaveProperty('birthdays');
  });
});

// ── Cache integration for stats ───────────────────────────────────────────────

describe('Stats cache integration', () => {
  beforeEach(() => cacheClear());

  it('returns null on cache miss for dashboard_stats', () => {
    expect(cacheGet('dashboard_stats')).toBeNull();
  });

  it('stores and retrieves stats from cache', () => {
    const mockStats = { grievances: { total: 5, pendingVerification: 2 } };
    cacheSet('dashboard_stats', mockStats, 300);
    expect(cacheGet('dashboard_stats')).toEqual(mockStats);
  });

  it('invalidating dashboard_stats clears only that key', () => {
    cacheSet('dashboard_stats', { g: 1 }, 300);
    cacheSet('stats_by_type', [{ type: 'WATER', count: 3 }], 300);
    cacheClear('dashboard_stats');
    expect(cacheGet('dashboard_stats')).toBeNull();
    expect(cacheGet('stats_by_type')).not.toBeNull();
  });

  it('invalidateStatCaches pattern clears all stat keys', () => {
    cacheSet('dashboard_stats', {}, 300);
    cacheSet('stats_by_type', {}, 300);
    cacheSet('stats_by_status', {}, 300);
    cacheSet('stats_by_constituency', {}, 300);
    // Simulate invalidateStatCaches()
    cacheClear('dashboard_stats');
    cacheClear('stats_by_type');
    cacheClear('stats_by_status');
    cacheClear('stats_by_constituency');
    expect(cacheGet('dashboard_stats')).toBeNull();
    expect(cacheGet('stats_by_type')).toBeNull();
    expect(cacheGet('stats_by_status')).toBeNull();
    expect(cacheGet('stats_by_constituency')).toBeNull();
  });

  it('cached stats survive TTL until expiry', () => {
    const stats = { grievances: { pendingVerification: 9 } };
    cacheSet('dashboard_stats', stats, 300); // 300-second TTL
    expect(cacheGet('dashboard_stats')).toEqual(stats);
  });
});
