import { getQueryString } from './pagination';
import type { SortDir } from '../lib/keyset';

/**
 * Query-string parsing for cursor-paged list endpoints.
 *
 * Deliberately ADDITIVE — `parsePagination` and its `Math.min(1000, ...)` clamp
 * are left untouched. That clamp is pinned by committed tests and is still the
 * contract for every page/limit caller that hasn't migrated, so raising it
 * would mean starting this change by deleting tests for behaviour other
 * endpoints still depend on.
 */
export interface KeysetQuery {
  limit: number;
  cursor: string | null;
  sort: SortDir;
}

/**
 * Page size ceiling is 100, not 299. The ZCQL hard limit is 300 and every
 * query fetches limit+1 to probe for a next page, so capping at 100 keeps a
 * wide margin below the boundary and keeps response bodies small enough that
 * a page render stays a single fast round-trip.
 */
export const MAX_KEYSET_LIMIT = 100;
export const DEFAULT_KEYSET_LIMIT = 25;

export function parseKeysetQuery(query: Record<string, any>): KeysetQuery {
  const rawLimit = parseInt(getQueryString(query.limit) || String(DEFAULT_KEYSET_LIMIT), 10);
  const limit = Math.min(
    MAX_KEYSET_LIMIT,
    Math.max(1, Number.isNaN(rawLimit) ? DEFAULT_KEYSET_LIMIT : rawLimit)
  );
  return {
    limit,
    cursor: getQueryString(query.cursor) || null,
    sort: getQueryString(query.sort) === 'oldest' ? 'oldest' : 'newest',
  };
}
