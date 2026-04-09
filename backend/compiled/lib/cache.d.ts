/**
 * Simple in-memory cache with TTL (time-to-live)
 * Avoids hitting the database for frequently accessed, rarely changing data
 */
export declare function cacheGet<T>(key: string): T | null;
export declare function cacheSet<T>(key: string, data: T, ttlSeconds: number): void;
export declare function cacheDelete(key: string): void;
export declare function cacheClear(prefix?: string): void;
//# sourceMappingURL=cache.d.ts.map