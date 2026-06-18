/**
 * Per-request performance metrics, request-scoped via AsyncLocalStorage.
 *
 * DIAGNOSTIC-ONLY (remove once the prod latency issue is resolved). Lets the
 * request logger in app.ts report how many Catalyst round-trips a single API
 * request made and how long they took — so we can tell the "serial round-trip
 * floor" (every request) apart from a cold-start tax (first request only).
 *
 * AsyncLocalStorage is used instead of a plain module-level counter because the
 * server handles concurrent requests: a global counter would mis-attribute one
 * request's Catalyst calls to another. Each request gets its own isolated store.
 */
import { AsyncLocalStorage } from 'async_hooks';

export interface CatalystCallSample {
  method: string;
  path: string;
  /** Wall time of the HTTPS round-trip to Catalyst, in ms. */
  ms: number;
  /** True if this call had to mint a fresh OAuth access token (cold token cache). */
  tokenFetched: boolean;
}

export interface RequestMetrics {
  catalystCalls: CatalystCallSample[];
}

const storage = new AsyncLocalStorage<RequestMetrics>();

/**
 * Run `fn` inside a fresh per-request metrics scope and hand it the store.
 * The store propagates through the awaited controller/auth code via async
 * context, so `recordCatalystCall` below sees it even after `fn` returns.
 */
export function withRequestMetrics<T>(fn: (metrics: RequestMetrics) => T): T {
  const metrics: RequestMetrics = { catalystCalls: [] };
  return storage.run(metrics, () => fn(metrics));
}

/** Record one Catalyst round-trip against the current request (no-op outside a scope). */
export function recordCatalystCall(sample: CatalystCallSample): void {
  const metrics = storage.getStore();
  if (metrics) metrics.catalystCalls.push(sample);
}
