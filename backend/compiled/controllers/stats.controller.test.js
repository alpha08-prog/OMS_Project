"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Unit tests for stats controller — DashboardStats shape and cache behaviour.
 */
const vitest_1 = require("vitest");
const cache_1 = require("../lib/cache");
// ── Shape tests ────────────────────────────────────────────────────────────────
(0, vitest_1.describe)('DashboardStats shape', () => {
    const sample = {
        grievances: { total: 10, open: 5, inProgress: 2, verified: 1, resolved: 2, pendingVerification: 7 },
        visitors: { total: 20, today: 3 },
        trainRequests: { total: 15, pending: 4, approved: 9 },
        news: { total: 8, critical: 1 },
        tourPrograms: { total: 12, upcoming: 3, pending: 2 },
        birthdays: { today: 1 },
    };
    (0, vitest_1.it)('has pendingVerification field on grievances', () => {
        (0, vitest_1.expect)(sample.grievances).toHaveProperty('pendingVerification');
        (0, vitest_1.expect)(typeof sample.grievances.pendingVerification).toBe('number');
    });
    (0, vitest_1.it)('pendingVerification equals open + inProgress when all unresolved are unverified', () => {
        // open(5) + inProgress(2) = 7 — matches sample.pendingVerification
        (0, vitest_1.expect)(sample.grievances.pendingVerification).toBe(sample.grievances.open + sample.grievances.inProgress);
    });
    (0, vitest_1.it)('all required keys are present', () => {
        (0, vitest_1.expect)(sample).toHaveProperty('grievances');
        (0, vitest_1.expect)(sample).toHaveProperty('visitors');
        (0, vitest_1.expect)(sample).toHaveProperty('trainRequests');
        (0, vitest_1.expect)(sample).toHaveProperty('news');
        (0, vitest_1.expect)(sample).toHaveProperty('tourPrograms');
        (0, vitest_1.expect)(sample).toHaveProperty('birthdays');
    });
});
// ── Cache integration for stats ───────────────────────────────────────────────
(0, vitest_1.describe)('Stats cache integration', () => {
    (0, vitest_1.beforeEach)(() => (0, cache_1.cacheClear)());
    (0, vitest_1.it)('returns null on cache miss for dashboard_stats', () => {
        (0, vitest_1.expect)((0, cache_1.cacheGet)('dashboard_stats')).toBeNull();
    });
    (0, vitest_1.it)('stores and retrieves stats from cache', () => {
        const mockStats = { grievances: { total: 5, pendingVerification: 2 } };
        (0, cache_1.cacheSet)('dashboard_stats', mockStats, 300);
        (0, vitest_1.expect)((0, cache_1.cacheGet)('dashboard_stats')).toEqual(mockStats);
    });
    (0, vitest_1.it)('invalidating dashboard_stats clears only that key', () => {
        (0, cache_1.cacheSet)('dashboard_stats', { g: 1 }, 300);
        (0, cache_1.cacheSet)('stats_by_type', [{ type: 'WATER', count: 3 }], 300);
        (0, cache_1.cacheClear)('dashboard_stats');
        (0, vitest_1.expect)((0, cache_1.cacheGet)('dashboard_stats')).toBeNull();
        (0, vitest_1.expect)((0, cache_1.cacheGet)('stats_by_type')).not.toBeNull();
    });
    (0, vitest_1.it)('invalidateStatCaches pattern clears all stat keys', () => {
        (0, cache_1.cacheSet)('dashboard_stats', {}, 300);
        (0, cache_1.cacheSet)('stats_by_type', {}, 300);
        (0, cache_1.cacheSet)('stats_by_status', {}, 300);
        (0, cache_1.cacheSet)('stats_by_constituency', {}, 300);
        // Simulate invalidateStatCaches()
        (0, cache_1.cacheClear)('dashboard_stats');
        (0, cache_1.cacheClear)('stats_by_type');
        (0, cache_1.cacheClear)('stats_by_status');
        (0, cache_1.cacheClear)('stats_by_constituency');
        (0, vitest_1.expect)((0, cache_1.cacheGet)('dashboard_stats')).toBeNull();
        (0, vitest_1.expect)((0, cache_1.cacheGet)('stats_by_type')).toBeNull();
        (0, vitest_1.expect)((0, cache_1.cacheGet)('stats_by_status')).toBeNull();
        (0, vitest_1.expect)((0, cache_1.cacheGet)('stats_by_constituency')).toBeNull();
    });
    (0, vitest_1.it)('cached stats survive TTL until expiry', () => {
        const stats = { grievances: { pendingVerification: 9 } };
        (0, cache_1.cacheSet)('dashboard_stats', stats, 300); // 300-second TTL
        (0, vitest_1.expect)((0, cache_1.cacheGet)('dashboard_stats')).toEqual(stats);
    });
});
//# sourceMappingURL=stats.controller.test.js.map