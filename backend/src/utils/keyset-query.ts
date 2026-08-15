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
 * Page size ceiling. The ZCQL hard limit is 300 and every query fetches
 * limit+1 to probe for a next page, so 250 (-> 251 rows requested) still
 * leaves a margin below the boundary.
 *
 * This was 100, sized for interactive screens that render one page at a time.
 * That is still the DEFAULT (25) and still what list screens ask for. The
 * ceiling is higher for BULK consumers — Print Center loads every printable
 * document so its search can span all of them, and at 100 rows/page that is
 * 22 round-trips for the train table alone. Raising the ceiling changes no
 * existing caller: they request <= 100 and are clamped exactly as before.
 */
export const MAX_KEYSET_LIMIT = 250;
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
