"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const cache_1 = require("./cache");
(0, vitest_1.describe)('In-Memory Cache', () => {
    (0, vitest_1.beforeEach)(() => {
        (0, cache_1.cacheClear)();
    });
    (0, vitest_1.it)('should return null for missing key', () => {
        (0, vitest_1.expect)((0, cache_1.cacheGet)('nonexistent')).toBeNull();
    });
    (0, vitest_1.it)('should store and retrieve value', () => {
        (0, cache_1.cacheSet)('key1', { name: 'test' }, 60);
        (0, vitest_1.expect)((0, cache_1.cacheGet)('key1')).toEqual({ name: 'test' });
    });
    (0, vitest_1.it)('should return null for expired entry', async () => {
        (0, cache_1.cacheSet)('expiring', 'data', 0); // 0-second TTL = already expired
        // Small delay to ensure expiry
        await new Promise((r) => setTimeout(r, 10));
        (0, vitest_1.expect)((0, cache_1.cacheGet)('expiring')).toBeNull();
    });
    (0, vitest_1.it)('should delete a specific key', () => {
        (0, cache_1.cacheSet)('a', 1, 60);
        (0, cache_1.cacheSet)('b', 2, 60);
        (0, cache_1.cacheDelete)('a');
        (0, vitest_1.expect)((0, cache_1.cacheGet)('a')).toBeNull();
        (0, vitest_1.expect)((0, cache_1.cacheGet)('b')).toBe(2);
    });
    (0, vitest_1.it)('should clear all keys', () => {
        (0, cache_1.cacheSet)('x', 1, 60);
        (0, cache_1.cacheSet)('y', 2, 60);
        (0, cache_1.cacheClear)();
        (0, vitest_1.expect)((0, cache_1.cacheGet)('x')).toBeNull();
        (0, vitest_1.expect)((0, cache_1.cacheGet)('y')).toBeNull();
    });
    (0, vitest_1.it)('should clear keys by prefix', () => {
        (0, cache_1.cacheSet)('calendar_events_user1', [1], 60);
        (0, cache_1.cacheSet)('calendar_events_user2', [2], 60);
        (0, cache_1.cacheSet)('dashboard_stats', {}, 60);
        (0, cache_1.cacheClear)('calendar_events_');
        (0, vitest_1.expect)((0, cache_1.cacheGet)('calendar_events_user1')).toBeNull();
        (0, vitest_1.expect)((0, cache_1.cacheGet)('calendar_events_user2')).toBeNull();
        (0, vitest_1.expect)((0, cache_1.cacheGet)('dashboard_stats')).toEqual({});
    });
    (0, vitest_1.it)('should overwrite existing key', () => {
        (0, cache_1.cacheSet)('key', 'old', 60);
        (0, cache_1.cacheSet)('key', 'new', 60);
        (0, vitest_1.expect)((0, cache_1.cacheGet)('key')).toBe('new');
    });
});
//# sourceMappingURL=cache.test.js.map