"use strict";
/**
 * Simple in-memory cache with TTL (time-to-live)
 * Avoids hitting the database for frequently accessed, rarely changing data
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheGet = cacheGet;
exports.cacheSet = cacheSet;
exports.cacheDelete = cacheDelete;
exports.cacheClear = cacheClear;
const store = new Map();
function cacheGet(key) {
    const entry = store.get(key);
    if (!entry)
        return null;
    if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
    }
    return entry.data;
}
function cacheSet(key, data, ttlSeconds) {
    store.set(key, {
        data,
        expiresAt: Date.now() + ttlSeconds * 1000,
    });
}
function cacheDelete(key) {
    store.delete(key);
}
function cacheClear(prefix) {
    if (!prefix) {
        store.clear();
        return;
    }
    for (const key of store.keys()) {
        if (key.startsWith(prefix))
            store.delete(key);
    }
}
//# sourceMappingURL=cache.js.map