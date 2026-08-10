/**
 * News Intelligence controller — backed by Catalyst Data Store via custom REST client.
 *
 * Catalyst-specific notes:
 *   - 2 enums (NewsCategory, NewsPriority) stored as TEXT, validated here.
 *   - Catalyst column `newsPriority` ↔ frontend `priority` (priority is a
 *     reserved word in Catalyst, same as we did for Task).
 *   - No data isolation by createdById — News is office-wide intelligence,
 *     anyone authenticated can see all entries.
 */
import { Response } from 'express';
import {
  insertRow,
  listAllRows,
  getRow,
  deleteRow,
  executeZCQL,
  zcqlEscapeValue,
  zcqlLike,
  // zcqlSafeLimit is deliberately NOT used here: it clamps silently, which is
  // how rows past the ZCQL ceiling went missing. See fetchNewsWindow.
  assertZcqlLimit,
  countRows,
  fetchOffsetWindow,
  countZcqlConditions,
  zcqlSearchWithinBudget,
  dateRangeClauses,
  toCatalystDate,
  nowCatalystIST,
  updateRowTolerant,
  ZCQL_MAX_LIMIT,
  CatalystRow,
} from '../lib/catalyst-client';
import { cacheSWR, cacheClear } from '../lib/cache';
import { useZCQL } from '../config/feature-flags';
import { getCachedTableList } from '../lib/catalyst-user-lookup';
import { emitNotifications } from './notification.controller';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendServerError,
} from '../utils/response';
// calculatePaginationMeta is intentionally not imported any more: it requires a
// `total`, which is what pushed this controller into fabricating one.
// parsePagination stays for the page/limit contract the frontend still uses.
import { parsePagination } from '../utils/pagination';
import type { AuthenticatedRequest, NewsFilters } from '../types';

const NEWS_TABLE = 'News';

/**
 * Drop cached numbers a news write invalidates.
 *
 * getNews serves `total` from a per-predicate SWR cache; without this, creating
 * or deleting an item left the count on screen disagreeing with the list for up
 * to two minutes. Prefix-based because the keys embed the filter predicate.
 */
function invalidateNewsCaches(): void {
  cacheClear('news:count');
  cacheClear('dashboard_stats');
}

const VALID_CATEGORIES = new Set([
  'DEVELOPMENT_WORK',
  'CONSPIRACY_FAKE_NEWS',
  'LEADER_ACTIVITY',
  'PARTY_ACTIVITY',
  'OPPOSITION',
  'OTHER',
]);
const VALID_PRIORITIES = new Set(['NORMAL', 'HIGH', 'CRITICAL']);

/** Reshape a Catalyst News row → JSON the frontend expects (priority, not newsPriority). */
function shapeNews(
  row: CatalystRow,
  createdBy?: { id: string; name: string; email: string } | null,
  lastEditedBy?: { id: string; name: string; email: string } | null
) {
  return {
    id: String(row.ROWID),
    headline: row.headline,
    category: row.category,
    priority: row.newsPriority ?? 'NORMAL', // Catalyst → frontend mapping
    mediaSource: row.mediaSource,
    region: row.region,
    description: row.description ?? null,
    imageUrl: row.imageUrl ?? null,
    createdAt: row.CREATEDTIME,
    updatedAt: row.MODIFIEDTIME,
    createdById: row.createdById ?? null,
    createdBy: createdBy ?? null,
    // Edit audit — who last edited this news entry and when (security trail).
    lastEditedById: row.lastEditedById ?? null,
    lastEditedAt: row.lastEditedAt ?? null,
    lastEditedBy: lastEditedBy ?? null,
  };
}

/** Look up users from cached Catalyst AppUser. Best-effort. */
async function lookupUsers(
  ids: Iterable<string>
): Promise<Map<string, { id: string; name: string; email: string }>> {
  const map = new Map<string, { id: string; name: string; email: string }>();
  const list = Array.from(ids).filter(Boolean);
  if (list.length === 0) return map;
  try {
    const users = await getCachedTableList('AppUser');
    const wanted = new Set(list.map(String));
    for (const u of users) {
      const rowId = String(u.ROWID);
      const legacyId = u.legacyId ? String(u.legacyId) : null;
      if (wanted.has(rowId)) {
        map.set(rowId, { id: rowId, name: String(u.name), email: String(u.email) });
      }
      // INDEPENDENT if, not else-if: one user can be referenced by their
      // Catalyst ROWID on some rows and their pre-migration legacy UUID on
      // others. With else-if, a page containing both forms resolved only the
      // ROWID and rendered the user's name blank on the legacy rows.
      if (legacyId && wanted.has(legacyId)) {
        map.set(legacyId, { id: legacyId, name: String(u.name), email: String(u.email) });
      }
    }
  } catch {
    /* Catalyst unreachable — return empty map */
  }
  return map;
}

async function hydrate(rows: CatalystRow[]): Promise<any[]> {
  const safe = rows.filter((r): r is CatalystRow => Boolean(r));
  if (safe.length === 0) return [];
  const ids = new Set<string>();
  for (const r of safe) {
    if (r.createdById) ids.add(String(r.createdById));
    if (r.lastEditedById) ids.add(String(r.lastEditedById));
  }
  const users = await lookupUsers(ids);
  return safe.map((r) =>
    shapeNews(
      r,
      (r.createdById && users.get(String(r.createdById))) || null,
      (r.lastEditedById && users.get(String(r.lastEditedById))) || null
    )
  );
}

/** Priority sort weight — CRITICAL > HIGH > NORMAL. */
function priorityWeight(p: unknown): number {
  if (p === 'CRITICAL') return 2;
  if (p === 'HIGH') return 1;
  return 0;
}

/**
 * Ordering for a news list: CRITICAL first, then newest.
 *
 * The trailing ROWID key is not decoration. Bulk-entered items share a
 * CREATEDTIME to the millisecond, and a tie group with no total order is
 * re-sequenced arbitrarily between requests — so a group straddling a page
 * boundary shows the same item twice on one page and never on the next.
 * Descending, to agree with the `ORDER BY CREATEDTIME DESC, ROWID DESC` the
 * page query uses.
 */
function compareNews(a: CatalystRow, b: CatalystRow): number {
  const pa = priorityWeight(a.newsPriority);
  const pb = priorityWeight(b.newsPriority);
  if (pa !== pb) return pb - pa;
  const ta = a.CREATEDTIME ? new Date(a.CREATEDTIME).getTime() : 0;
  const tb = b.CREATEDTIME ? new Date(b.CREATEDTIME).getTime() : 0;
  if (ta !== tb) return tb - ta;
  // ROWIDs are same-width numeric strings, so lexical order is numeric order.
  return String(b.ROWID ?? '').localeCompare(String(a.ROWID ?? ''));
}

/**
 * Local-midnight epoch for a date filter, `plusDays` days after it — the JS
 * twin of dateRangeClauses().
 *
 * The fallback branch below filters in Node, so it can't use the SQL helper,
 * but it MUST agree with it or the two branches answer the same request
 * differently. Two traps, both of which silently drop rows:
 *   - `new Date('2026-08-07')` is UTC midnight while `new Date(CREATEDTIME)`
 *     parses as LOCAL time, so on an IST server the old bounds shifted by 5h30
 *     — entries created before 05:30 on the start date vanished.
 *   - a `<=` end bound lands on midnight, so it excluded the whole end date.
 *     Callers pass plusDays=1 and compare with `<` instead.
 */
function dayBoundMs(value: unknown, plusDays: number): number | null {
  const formatted = toCatalystDate(
    value === undefined || value === null ? undefined : String(value)
  );
  if (!formatted) return null;
  const [y, m, d] = formatted.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d + plusDays).getTime();
}

// ── Endpoints ─────────────────────────────────────────────────────────────

/** POST /api/news */
export async function createNews(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const { headline, category, priority, mediaSource, region, description, imageUrl } =
      req.body;

    if (!VALID_CATEGORIES.has(category)) {
      sendError(res, `Invalid category: ${category}`);
      return;
    }
    const prio = (priority || 'NORMAL').toString().toUpperCase();
    if (!VALID_PRIORITIES.has(prio)) {
      sendError(res, `Invalid priority: ${priority}`);
      return;
    }

    const row = await insertRow(NEWS_TABLE, {
      headline,
      category,
      newsPriority: prio, // frontend `priority` → Catalyst `newsPriority`
      mediaSource,
      region,
      description: description?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
      createdById: req.user.id,
    });

    // Critical news fans out to every authenticated user. Best-effort.
    if (prio === 'CRITICAL') {
      try {
        const users = await getCachedTableList('AppUser');
        const ids = users.map((u: any) => String(u.ROWID)).filter(Boolean);
        if (ids.length > 0) {
          await emitNotifications(ids, {
            type: 'NEWS_CRITICAL',
            title: `🚨 Critical news: ${headline}`,
            body: description ? String(description).slice(0, 200) : '',
            // News list is at /news/view (admin + super-admin). Pass the row
            // id so the page can highlight or expand the matching card.
            link: `/news/view?id=${encodeURIComponent(String(row.ROWID))}`,
            referenceId: String(row.ROWID),
            referenceType: 'NEWS',
          });
        }
      } catch (notifErr) {
        console.error('[news] critical-news notification fan-out failed:', notifErr);
      }
    }

    const [shaped] = await hydrate([row]);
    invalidateNewsCaches();
    sendSuccess(res, shaped, 'News intelligence created successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to create news intelligence', error);
  }
}

/**
 * WHERE clauses only — no ORDER BY, no LIMIT.
 *
 * Kept separate from the query text so the page query and the COUNT query are
 * built from the SAME predicate. A total that disagrees with the rows on
 * screen is its own bug, and the only way to guarantee they agree is to derive
 * both from one array of clauses.
 */
function buildNewsWhere(filters: NewsFilters): string[] {
  // Every fixed-width clause first, then hand the search box whatever is left
  // of the 10-condition budget. Search is the only clause whose width varies,
  // so it is the one that has to yield.
  const conditions: string[] = [];
  if (filters.priority) {
    conditions.push(`newsPriority = '${zcqlEscapeValue(String(filters.priority))}'`);
  }
  if (filters.category) {
    conditions.push(`category = '${zcqlEscapeValue(String(filters.category))}'`);
  }
  if (filters.region) {
    conditions.push(zcqlLike('region', String(filters.region)));
  }
  // Half-open upper bound. The old `CREATEDTIME <= toCatalystDate(endDate)`
  // compared against MIDNIGHT of the end date, so "up to today" returned
  // nothing from today; and patching it to 23:59:59 would still lose the last
  // second, because stored values carry milliseconds after a colon and the
  // comparison is lexicographic.
  conditions.push(
    ...dateRangeClauses('CREATEDTIME', filters.startDate, filters.endDate)
  );

  if (filters.search && String(filters.search).trim()) {
    // Columns most-identifying first: if the budget forces one to be shed, the
    // headline must be the last to go. Over budget the whole query 400s and
    // the list comes back empty, so this yields loudly (the helper warns)
    // instead.
    const { clause } = zcqlSearchWithinBudget(
      ['headline', 'mediaSource', 'description'],
      String(filters.search),
      countZcqlConditions(conditions)
    );
    // No budget left at all — match nothing rather than silently ignoring the
    // search box and handing back the unfiltered list.
    conditions.push(clause ?? 'ROWID = 0');
  }
  return conditions;
}

function whereSql(clauses: string[]): string {
  return clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
}

/**
 * Fetch `want` rows starting at `skip`, in ZCQL-legal chunks.
 *
 * parsePagination permits limit up to 1000 while ZCQL rejects LIMIT > 300.
 * This used to run the requested limit through zcqlSafeLimit, which clamps
 * SILENTLY: at limit=1000, page 1 returned rows 0-298 and page 2 (OFFSET 1000)
 * returned rows 1000-1298 — rows 299-999 were returned by no page at all. That
 * stayed hidden while `total` was fabricated and the pager capped itself at
 * two pages; with a real count below it would have become a visible hole.
 *
 * ZCQL can't express CRITICAL > HIGH > NORMAL natively, so the ordering here
 * is chronological and the priority weighting is applied to the fetched window
 * afterwards, as before.
 */
async function fetchNewsWindow(
  filterWhere: string,
  skip: number,
  want: number
): Promise<CatalystRow[]> {
  // Delegates to the shared KEYSET walk. The obvious implementation — LIMIT 299
  // with a marching OFFSET — silently DUPLICATES rows at chunk boundaries:
  // measured on a 2067-row table with a full total order and no concurrent
  // writes, the OFFSET walk returned 2068 rows / 2067 unique while the keyset
  // walk returned exactly 2067. Catalyst's OFFSET is not stable, and a
  // tiebreaker in ORDER BY does not fix it.
  return fetchOffsetWindow(NEWS_TABLE, filterWhere, 'CREATEDTIME', 'newest', skip, want);
}

/** GET /api/news */
export async function getNews(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );
    const filters = req.query as NewsFilters;

    let pageRows: CatalystRow[];
    let hasMore: boolean;
    // null means "we could not obtain a count" — the response then OMITS total
    // rather than inventing one.
    let total: number | null;

    if (useZCQL()) {
      const filterClauses = buildNewsWhere(filters);
      const filterWhere = whereSql(filterClauses);

      const [fetched, counted] = await Promise.all([
        fetchNewsWindow(filterWhere, skip, limit + 1),
        // A real COUNT, run in PARALLEL with the page query and behind a
        // stale-while-revalidate cache because it is display-only. News is
        // office-wide with no per-user scoping, so one key can serve everyone
        // — the key still varies by predicate so a filtered list gets its own
        // filtered count.
        cacheSWR(`news:count:${JSON.stringify(filterClauses)}`, 30, 120, () =>
          countRows(NEWS_TABLE, filterWhere)
        ),
      ]);
      hasMore = fetched.length > limit;
      pageRows = hasMore ? fetched.slice(0, limit) : fetched;
      // Re-sort the page in JS to honor priority weight (CRITICAL > HIGH >
      // NORMAL) — ZCQL can't express that order over the stored strings.
      pageRows.sort(compareNews);
      total = counted;
    } else {
      let rows = await listAllRows(NEWS_TABLE);

      if (filters.priority) {
        rows = rows.filter((r) => r.newsPriority === filters.priority);
      }
      if (filters.category) {
        rows = rows.filter((r) => r.category === filters.category);
      }
      if (filters.region) {
        const q = String(filters.region).toLowerCase();
        rows = rows.filter((r) => (r.region || '').toLowerCase().includes(q));
      }
      // Guard on the TRIMMED term, exactly as the ZCQL branch does. Without
      // the trim these two branches answered a whitespace-only `search`
      // differently: ZCQL treated it as "no search" and returned the list,
      // this path filtered on '   ' and returned nothing.
      if (filters.search && String(filters.search).trim()) {
        const q = String(filters.search).toLowerCase();
        rows = rows.filter(
          (r) =>
            (r.headline || '').toLowerCase().includes(q) ||
            (r.description || '').toLowerCase().includes(q) ||
            (r.mediaSource || '').toLowerCase().includes(q)
        );
      }
      // Same half-open day window the ZCQL branch gets from dateRangeClauses.
      // The two branches must answer the same request identically; the old
      // bounds here were both timezone-shifted and inclusive-of-midnight, so
      // this path quietly returned a different set of rows.
      const startMs = dayBoundMs(filters.startDate, 0);
      if (startMs !== null) {
        rows = rows.filter(
          (r) => r.CREATEDTIME && new Date(r.CREATEDTIME).getTime() >= startMs
        );
      }
      const endMs = dayBoundMs(filters.endDate, 1);
      if (endMs !== null) {
        rows = rows.filter(
          (r) => r.CREATEDTIME && new Date(r.CREATEDTIME).getTime() < endMs
        );
      }

      rows.sort(compareNews);

      total = rows.length;
      pageRows = rows.slice(skip, skip + limit);
      hasMore = skip + pageRows.length < total;
    }

    const data = await hydrate(pageRows);

    sendSuccess(res, data, 'News retrieved successfully', 200, {
      page,
      limit,
      count: pageRows.length,
      hasMore,
      // `total` is present ONLY when it is real. It used to be
      // skip + rows.length + (hasMore ? 1 : 0), which can never exceed
      // currentPage + 1 — so every pager built on it stopped at two pages and
      // the rest of the table was unreachable.
      ...(total !== null
        ? { total, totalKnown: true, totalPages: Math.ceil(total / limit) }
        : { totalKnown: false }),
    });
  } catch (error) {
    sendServerError(res, 'Failed to get news', error);
  }
}

/** GET /api/news/:id */
export async function getNewsById(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const row = await getRow(NEWS_TABLE, id);
    if (!row) {
      sendNotFound(res, 'News not found');
      return;
    }
    const [shaped] = await hydrate([row]);
    sendSuccess(res, shaped, 'News retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get news', error);
  }
}

/** PUT /api/news/:id */
export async function updateNews(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const body = { ...req.body };
    delete body.id;
    delete body.createdById;
    delete body.createdAt;
    delete body.updatedAt;
    delete body.ROWID;
    delete body.CREATEDTIME;
    delete body.MODIFIEDTIME;
    delete body.CREATORID;

    const updateData: Record<string, unknown> = { ROWID: id };

    const allowed = ['headline', 'mediaSource', 'region', 'description', 'imageUrl'];
    for (const k of allowed) {
      if (body[k] !== undefined) updateData[k] = body[k];
    }
    if (body.category !== undefined) {
      if (!VALID_CATEGORIES.has(body.category)) {
        sendError(res, `Invalid category: ${body.category}`);
        return;
      }
      updateData.category = body.category;
    }
    if (body.priority !== undefined) {
      const prio = String(body.priority).toUpperCase();
      if (!VALID_PRIORITIES.has(prio)) {
        sendError(res, `Invalid priority: ${body.priority}`);
        return;
      }
      updateData.newsPriority = prio; // map to Catalyst column
    }

    // Edit audit — stamp who edited and when. Never let the client override it.
    if (req.user) {
      updateData.lastEditedById = req.user.id;
      updateData.lastEditedAt = nowCatalystIST();
    }

    // updateRowTolerant retries without the audit columns if Catalyst's schema
    // doesn't have them yet, so the edit still succeeds before the migration.
    const updated = await updateRowTolerant(NEWS_TABLE, updateData as any, [
      'lastEditedById',
      'lastEditedAt',
    ]);
    const [shaped] = await hydrate([updated]);
    invalidateNewsCaches();
    sendSuccess(res, shaped, 'News updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update news', error);
  }
}

/** DELETE /api/news/:id */
export async function deleteNews(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    await deleteRow(NEWS_TABLE, id);
    invalidateNewsCaches();
    sendSuccess(res, null, 'News deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete news', error);
  }
}

/** GET /api/news/alerts/critical — top 10 CRITICAL by createdAt desc. */
export async function getCriticalAlerts(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const rows = await listAllRows(NEWS_TABLE);
    const matched = rows
      .filter((r) => r.newsPriority === 'CRITICAL')
      // compareNews, not a bare CREATEDTIME compare: every row here is
      // CRITICAL so the priority key is a no-op, but the trailing ROWID key is
      // not. Bulk-entered alerts tie to the millisecond, and slicing an
      // unordered tie group at 10 means which alerts make the cut changes
      // between two identical requests.
      .sort(compareNews)
      .slice(0, 10);

    const data = await hydrate(matched);
    sendSuccess(res, data, 'Critical alerts retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get critical alerts', error);
  }
}
