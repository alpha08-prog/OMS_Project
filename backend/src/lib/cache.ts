/**
 * Simple in-memory cache with TTL (time-to-live)
 * Avoids hitting the database for frequently accessed, rarely changing data
 */

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
  /** When this entry's data becomes stale-but-still-served. */
  staleAt?: number;
  /** True while a background refresh is in flight; prevents thundering herd. */
  refreshing?: boolean;
};

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function cacheSet<T>(key: string, data: T, ttlSeconds: number): void {
  store.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Stale-while-revalidate cache get/set in one call.
 *
 * Semantics:
 *   - Fresh hit (< staleSeconds old): return immediately, no work.
 *   - Stale hit (between staleSeconds and ttlSeconds): return immediately,
 *     kick off background refresh exactly once (refreshing flag prevents
 *     thundering herd if 100 requests arrive in the same second).
 *   - Miss (no entry OR past ttlSeconds): block, compute, cache, return.
 *
 * The result is that even at 100k+ rows, only the very first user pays the
 * full aggregation cost. Every subsequent user gets instant cached data;
 * background refresh keeps the cache warm without making anyone wait.
 */
export async function cacheSWR<T>(
  key: string,
  staleSeconds: number,
  ttlSeconds: number,
  compute: () => Promise<T>
): Promise<T> {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();

  if (entry && now <= entry.expiresAt) {
    // Hit (fresh or stale). If stale, trigger a background refresh.
    if (entry.staleAt !== undefined && now > entry.staleAt && !entry.refreshing) {
      entry.refreshing = true;
      void (async () => {
        try {
          const fresh = await compute();
          store.set(key, {
            data: fresh,
            staleAt: Date.now() + staleSeconds * 1000,
            expiresAt: Date.now() + ttlSeconds * 1000,
          });
        } catch (err) {
          // Refresh failed — clear the flag so a later request can retry.
          const current = store.get(key);
          if (current) current.refreshing = false;
          console.warn(`[cache] SWR refresh failed for ${key}`, err);
        }
      })();
    }
    return entry.data;
  }

  // Miss — compute synchronously.
  const fresh = await compute();
  store.set(key, {
    data: fresh,
    staleAt: Date.now() + staleSeconds * 1000,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  return fresh;
}

export function cacheDelete(key: string): void {
  store.delete(key);
}

export function cacheClear(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
