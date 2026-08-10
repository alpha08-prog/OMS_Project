/**
 * Birthday controller — backed by Catalyst Data Store via custom REST client.
 *
 * Catalyst-specific notes:
 *   - No enums on this model.
 *   - Month/day filters (today's birthdays, upcoming, month filter) are done in
 *     JS instead of EXTRACT() since ZCQL/Catalyst doesn't support it.
 *   - Duplicate-name check is done case-insensitive in JS too.
 *   - No data isolation — birthdays are office-wide.
 */
import { Response } from 'express';
import {
  insertRow,
  listAllRows,
  getRow,
  updateRowTolerant,
  deleteRow,
  toCatalystDate,
  nowCatalystIST,
  executeZCQL,
  walkRowsByRowId,
  zcqlEscapeValue,
  columnExists,
  assertZcqlLimit,
  ZCQL_MAX_LIMIT,
  CatalystRow,
} from '../lib/catalyst-client';
import { cacheGet, cacheSet, cacheClear } from '../lib/cache';
import { getCachedTableList } from '../lib/catalyst-user-lookup';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendServerError,
} from '../utils/response';
import { parsePagination, calculatePaginationMeta } from '../utils/pagination';
import type { AuthenticatedRequest } from '../types';

const BIRTHDAY_TABLE = 'Birthday';
const VISITOR_TABLE = 'Visitor';
const PASSENGER_TABLE = 'TrainPassenger';

/** Cache key PREFIX for the three-table DOB union. Cleared on every write below. */
const SOURCES_CACHE_KEY = 'birthday:sources';

/**
 * Generation suffix on the cache key.
 *
 * cacheClear on its own does NOT guarantee a write is visible. cacheSWR's
 * background refresh captures the key up front and unconditionally writes its
 * result when it finishes, so a create/update/delete that lands while a
 * refresh is in flight has its cacheClear undone moments later by a snapshot
 * read BEFORE the write — and that resurrected snapshot then sits there for
 * the full TTL. Bumping the generation retires the key instead: the in-flight
 * refresh writes under an id no reader will look up, and the prefix sweep
 * collects it.
 */
let sourcesGeneration = 0;

function sourcesCacheKey(): string {
  return `${SOURCES_CACHE_KEY}:${sourcesGeneration}`;
}

/** Retire the current snapshot so the next read rebuilds it. */
function invalidateBirthdaySources(): void {
  sourcesGeneration += 1;
  // Prefix sweep — drops the generation just retired along with any older one
  // an in-flight refresh may since have re-created.
  cacheClear(SOURCES_CACHE_KEY);
}
/** Serve instantly for 5 min; refresh in the background after 1 min. */
const SOURCES_STALE_SECONDS = 60;
const SOURCES_TTL_SECONDS = 300;
/** Ceiling on the paged walk per table — ~30k DOB-bearing rows. */
const MAX_SOURCE_PAGES = 100;

/** Catalyst serialises boolean columns as "true"/"false" strings — coerce. */
function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  if (typeof v === 'number') return v !== 0;
  return Boolean(v);
}

/** Reshape a Catalyst Birthday row → JSON the frontend expects.
 *  `source` distinguishes a real Birthday row from a DOB pulled in from
 *  another module (Visitor / Train passenger); only BIRTHDAY rows are
 *  editable/deletable. */
function shapeBirthday(
  row: CatalystRow,
  createdBy?: { id: string; name: string; email: string } | null,
  lastEditedBy?: { id: string; name: string; email: string } | null
) {
  const source = (row.__source as string) ?? 'BIRTHDAY';
  return {
    id: String(row.ROWID),
    name: row.name,
    phone: row.phone ?? null,
    dob: row.dob,
    relation: row.relation,
    notes: row.notes ?? null,
    designation: row.designation ?? null,
    constituency: row.constituency ?? null,
    wardVillage: row.wardVillage ?? null,
    // Whether this person is a serving official — marks their birthday in the
    // UI. Prefer the explicit isOfficial flag (carried from the Visitor row);
    // fall back to a designation/relation of "Official" so it still works
    // before the Catalyst column is added.
    isOfficial:
      parseBool(row.isOfficial) ||
      String(row.designation ?? '').toLowerCase() === 'official' ||
      String(row.relation ?? '').toLowerCase() === 'official',
    createdAt: row.CREATEDTIME,
    updatedAt: row.MODIFIEDTIME,
    createdById: row.createdById ?? null,
    createdBy: createdBy ?? null,
    // Edit audit — who last edited this entry and when (security trail).
    lastEditedById: row.lastEditedById ?? null,
    lastEditedAt: row.lastEditedAt ?? null,
    lastEditedBy: lastEditedBy ?? null,
    // Where this DOB came from + whether it can be edited/deleted here.
    source,
    canDelete: source === 'BIRTHDAY',
  };
}

/**
 * Read every row of `table` that actually carries a DOB.
 *
 * `dob` is sparse — the overwhelming majority of visitors and train passengers
 * never supply one — so pushing `dob IS NOT NULL` down means the rows we would
 * have thrown away in JS never cross the wire at all. Two hazards it has to
 * respect:
 *
 *   - Naming a column the table doesn't have 400s the ENTIRE query, not just
 *     the predicate, so the reference is gated on columnExists and falls back
 *     to the plain full read.
 *   - ZCQL caps a result set at 300 rows. A single unbounded SELECT would stop
 *     there and silently drop every birthday past it, so this walks in pages —
 *     seeking on ROWID, NOT OFFSET. Catalyst's OFFSET duplicates rows at chunk
 *     boundaries (measured: 2068 returned / 2067 unique on a 2067-row table),
 *     which here would show the same person's birthday twice.
 */
async function fetchDobRows(table: string): Promise<CatalystRow[]> {
  try {
    if (await columnExists(table, 'dob')) {
      const { rows, truncated } = await walkRowsByRowId(
        table,
        ' WHERE dob IS NOT NULL',
        { maxPages: MAX_SOURCE_PAGES }
      );
      // Never let a cap masquerade as a complete read.
      if (truncated) {
        console.warn(
          `[birthday] ${table} has more than ${MAX_SOURCE_PAGES * ZCQL_MAX_LIMIT} ` +
            `rows with a dob — the birthday feed is truncated.`
        );
      }
      return rows;
    }
  } catch (err) {
    console.warn(
      `[birthday] scoped dob read failed for ${table}, falling back to a full scan:`,
      err instanceof Error ? err.message : err
    );
  }
  return listAllRows(table);
}

/**
 * Union of every DOB-bearing record across the office, normalised to look like
 * Birthday rows so the existing filter/sort/hydrate code works unchanged.
 *   - Birthday table  (real entries — editable)
 *   - Visitor table   (visitors logged with a DOB)
 *   - TrainPassenger  (primary passengers logged with a DOB)
 * Non-Birthday rows get a prefixed ROWID so their ids never collide with real
 * Birthday ids, and are flagged read-only via __source.
 */
async function buildBirthdaySources(): Promise<{
  rows: CatalystRow[];
  /** False when any source failed — the caller must not cache a partial feed. */
  complete: boolean;
}> {
  const out: CatalystRow[] = [];

  // Fetch the three DOB sources in parallel — they're independent reads.
  // Previously these ran as three serial round-trips to Catalyst.
  // fetchDobRows already falls back to a full scan on a scoped-query failure,
  // so reaching this catch means the table itself is unreadable. Say so, and
  // flag the result as incomplete — a silently empty source is
  // indistinguishable from "nobody has a birthday".
  let complete = true;
  const tolerate = (table: string) => (err: unknown) => {
    complete = false;
    console.warn(
      `[birthday] source ${table} unreadable; omitting it from the feed:`,
      err instanceof Error ? err.message : err
    );
    return [] as CatalystRow[];
  };
  const [birthdayRows, visitorRows, passengerRows] = await Promise.all([
    fetchDobRows(BIRTHDAY_TABLE).catch(tolerate(BIRTHDAY_TABLE)),
    fetchDobRows(VISITOR_TABLE).catch(tolerate(VISITOR_TABLE)),
    fetchDobRows(PASSENGER_TABLE).catch(tolerate(PASSENGER_TABLE)),
  ]);

  for (const r of birthdayRows) {
    if (!r.dob) continue;
    out.push({ ...r, __source: 'BIRTHDAY' });
  }

  for (const r of visitorRows) {
    if (!r.dob) continue;
    out.push({
      ROWID: `visitor-${String(r.ROWID)}`,
      name: r.name,
      phone: r.phone ?? null,
      dob: r.dob,
      relation: r.designation ? String(r.designation) : 'Visitor',
      notes: r.purpose ?? null,
      designation: r.designation ?? null,
      constituency: r.constituency ?? null,
      wardVillage: r.wardVillage ?? null,
      // Carry the serving-official flag through so the birthday feed can mark it.
      isOfficial: r.isOfficial ?? null,
      CREATEDTIME: r.CREATEDTIME,
      MODIFIEDTIME: r.MODIFIEDTIME,
      createdById: r.createdById ?? null,
      __source: 'VISITOR',
    });
  }

  for (const r of passengerRows) {
    if (!r.dob) continue;
    out.push({
      ROWID: `train-${String(r.ROWID)}`,
      name: r.passengerName,
      phone: null,
      dob: r.dob,
      // Train EQ passengers default to the standard "Other" category so the
      // value matches the relation dropdown/filter set. The TRAIN source
      // badge still marks where the DOB came from.
      relation: 'Other',
      notes: null,
      designation: null,
      constituency: null,
      wardVillage: null,
      CREATEDTIME: r.CREATEDTIME,
      MODIFIEDTIME: r.MODIFIEDTIME,
      createdById: null,
      __source: 'TRAIN',
    });
  }

  return { rows: out, complete };
}

/**
 * The cached view of the union above — this is what every endpoint calls.
 *
 * Four endpoints depend on it (list, today, upcoming, and the dashboard
 * count), and each call was three full-table reads, so a single dashboard
 * render paid for the aggregate more than once.
 *
 * There is no query to push down instead. A birthday match is a month/day
 * comparison against a stored date, and ZCQL has no MONTH()/DAY() function —
 * date functions are a syntax error, not a slow path — so the month and
 * day-of-year predicates genuinely cannot be expressed server-side. Nor can
 * the union: it spans three tables with no join. Sharing one snapshot is the
 * only lever available, which is why it's the one applied. Writes below clear
 * the key, so an entry added here is visible on the next request.
 */
async function collectBirthdaySources(): Promise<CatalystRow[]> {
  const key = sourcesCacheKey();
  const cached = cacheGet<CatalystRow[]>(key);
  // Hand out a copy. Callers sort in place, and sorting the cached array would
  // silently reorder the snapshot that every other endpoint is about to read.
  if (cached) return [...cached];

  const { rows, complete } = await buildBirthdaySources();

  // NEVER cache a degraded snapshot. If one of the three sources was
  // unreadable, the result is missing people — caching it would turn a
  // momentary blip into minutes of "nobody has a birthday today", which reads
  // as fact rather than failure. Leaving it uncached means the very next
  // request retries.
  if (complete) {
    cacheSet(key, rows, SOURCES_TTL_SECONDS);
  } else {
    console.warn(
      '[birthday] partial snapshot (a source was unreadable) — not caching it, ' +
        'so the next request retries rather than serving an incomplete feed.'
    );
  }
  return [...rows];
}

/**
 * Final tiebreaker for every birthday ordering.
 *
 * Day-of-month and dob keys produce enormous tie groups — everyone born on the
 * 12th compares equal, and rows with no dob all collapse onto the same
 * sentinel. Without a total order the group is re-sequenced arbitrarily
 * between requests, so slicing it into pages (or into a top-10) shows an entry
 * twice on one page and never on the next. Name, then id, makes it total.
 */
function tieBreak(a: CatalystRow, b: CatalystRow): number {
  const byName = String(a.name ?? '').localeCompare(String(b.name ?? ''));
  if (byName !== 0) return byName;
  return String(a.ROWID ?? '').localeCompare(String(b.ROWID ?? ''));
}

/**
 * Local-midnight epoch for a date filter, `plusDays` days after it — the JS
 * twin of dateRangeClauses().
 *
 * These rows are a union assembled in Node, so the filter can't be a SQL
 * clause, but the BOUNDS have to be the ones dateRangeClauses would produce.
 * The old code got both ends wrong, and both silently dropped rows:
 *   - `new Date('2026-08-07')` is UTC midnight while `new Date(CREATEDTIME)`
 *     parses as LOCAL time, so on an IST server the window was 5h30 off.
 *   - the end bound was `<=` midnight, which excluded the entire end date.
 *     Callers pass plusDays=1 and compare with `<` — half-open, so it holds
 *     regardless of whether the stored value carries milliseconds.
 */
function dayBoundMs(value: unknown, plusDays: number): number | null {
  const formatted = toCatalystDate(
    value === undefined || value === null ? undefined : String(value)
  );
  if (!formatted) return null;
  const [y, m, d] = formatted.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d + plusDays).getTime();
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
    shapeBirthday(
      r,
      (r.createdById && users.get(String(r.createdById))) || null,
      (r.lastEditedById && users.get(String(r.lastEditedById))) || null
    )
  );
}

// ── Endpoints ─────────────────────────────────────────────────────────────

/** POST /api/birthdays */
export async function createBirthday(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const { name, phone, dob, relation, notes, designation, constituency, wardVillage } = req.body;

    // Duplicate check via targeted ZCQL — O(1) regardless of table size.
    // Catalyst text equality is case-insensitive, but we still re-check in JS
    // after fetch so the contract is explicit and not dependent on Catalyst's
    // collation defaults.
    const trimmedName = String(name).trim();
    const lower = trimmedName.toLowerCase();
    const existing = await executeZCQL<CatalystRow>(
      `SELECT * FROM ${BIRTHDAY_TABLE} WHERE name = '${zcqlEscapeValue(trimmedName)}' LIMIT 20`
    );
    if (existing.some((r) => String(r.name ?? '').trim().toLowerCase() === lower)) {
      sendError(res, `A birthday entry for "${name}" already exists`, 409);
      return;
    }

    const payload: Record<string, unknown> = {
      name,
      phone: phone?.trim() || null,
      dob: toCatalystDate(dob),
      relation,
      notes: notes?.trim() || null,
      designation: designation?.trim() || null,
      createdById: req.user.id,
    };
    if (constituency?.trim()) payload.constituency = constituency.trim();
    if (wardVillage?.trim()) payload.wardVillage = wardVillage.trim();

    const row = await insertRow(BIRTHDAY_TABLE, payload);
    // The list/today/upcoming endpoints read a cached snapshot; drop it so the
    // entry the user just created shows up on their next request instead of
    // when the snapshot happens to expire.
    invalidateBirthdaySources();

    const [shaped] = await hydrate([row]);
    sendSuccess(res, shaped, 'Birthday entry created successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to create birthday entry', error);
  }
}

/** GET /api/birthdays — list with search/relation/month filters. */
export async function getBirthdays(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );
    const { search, relation, month, startDate, endDate } = req.query as Record<string, string>;

    let rows = await collectBirthdaySources();

    // Half-open [startDate 00:00, endDate+1day 00:00) in local time — see
    // dayBoundMs. The previous `<= endDate` bound landed on midnight, so
    // filtering "up to today" returned nothing entered today.
    const startMs = dayBoundMs(startDate, 0);
    if (startMs !== null) {
      rows = rows.filter(
        (r) => r.CREATEDTIME && new Date(r.CREATEDTIME).getTime() >= startMs
      );
    }
    const endMs = dayBoundMs(endDate, 1);
    if (endMs !== null) {
      rows = rows.filter(
        (r) => r.CREATEDTIME && new Date(r.CREATEDTIME).getTime() < endMs
      );
    }

    if (search) {
      const q = String(search).toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.name || '').toLowerCase().includes(q) ||
          (r.phone || '').includes(q)
      );
    }
    if (relation) {
      rows = rows.filter((r) => r.relation === relation);
    }
    if (month) {
      const m = parseInt(String(month), 10);
      if (!isNaN(m) && m >= 1 && m <= 12) {
        rows = rows.filter((r) => {
          if (!r.dob) return false;
          return new Date(r.dob).getMonth() + 1 === m;
        });
        // When filtering by month, sort by day-of-month asc. Day-of-month has
        // at most 31 distinct values over the whole month, so this key alone
        // leaves tie groups far larger than a page — hence tieBreak, which is
        // what stops the slice below from repeating and skipping entries.
        rows.sort((a, b) => {
          const da = a.dob ? new Date(a.dob).getDate() : 99;
          const db = b.dob ? new Date(b.dob).getDate() : 99;
          if (da !== db) return da - db;
          return tieBreak(a, b);
        });
      }
    } else {
      // Default sort: dob ascending, then tieBreak — same reasoning; rows with
      // no parsable dob all collapse onto 0 and would otherwise be unordered.
      rows.sort((a, b) => {
        const ta = a.dob ? new Date(a.dob).getTime() : 0;
        const tb = b.dob ? new Date(b.dob).getTime() : 0;
        if (ta !== tb) return ta - tb;
        return tieBreak(a, b);
      });
    }

    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    const data = await hydrate(paged);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, data, 'Birthdays retrieved successfully', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get birthdays', error);
  }
}

/** GET /api/birthdays/today */
export async function getTodayBirthdays(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    const rows = await collectBirthdaySources();
    const matched = rows
      .filter((r) => {
        if (!r.dob) return false;
        const d = new Date(r.dob);
        return d.getMonth() + 1 === month && d.getDate() === day;
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    const data = await hydrate(matched);
    sendSuccess(res, data, "Today's birthdays retrieved successfully");
  } catch (error) {
    sendServerError(res, 'Failed to get birthdays', error);
  }
}

/** GET /api/birthdays/upcoming — next 7 days, capped at 10. */
export async function getUpcomingBirthdays(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const today = new Date();
    const todayMD = today.getMonth() * 100 + today.getDate(); // sortable composite
    // Build 7 day-of-year keys we want (looping over month boundary)
    const wanted = new Set<number>();
    for (let i = 0; i <= 7; i++) {
      const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      wanted.add(d.getMonth() * 100 + d.getDate());
    }

    const rows = await collectBirthdaySources();
    const matched = rows.filter((r) => {
      if (!r.dob) return false;
      const d = new Date(r.dob);
      return wanted.has(d.getMonth() * 100 + d.getDate());
    });

    // Sort by days-until-birthday ascending
    function daysUntil(b: CatalystRow): number {
      if (!b.dob) return 999;
      const d = new Date(b.dob);
      const md = d.getMonth() * 100 + d.getDate();
      // wraparound: if md < todayMD, add 12*100 + 31 ish to push to next year
      return md >= todayMD ? md - todayMD : md + 1300 - todayMD;
    }
    // days-until has 8 distinct values here and the result is then sliced to
    // 10, so the cut lands inside a tie group nearly every time — the same
    // duplicate/skip hazard as the list sorts, hence the same tiebreaker.
    matched.sort((a, b) => {
      const diff = daysUntil(a) - daysUntil(b);
      return diff !== 0 ? diff : tieBreak(a, b);
    });

    const data = await hydrate(matched.slice(0, 10));
    sendSuccess(res, data, 'Upcoming birthdays retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get upcoming birthdays', error);
  }
}

/** GET /api/birthdays/:id */
export async function getBirthdayById(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const row = await getRow(BIRTHDAY_TABLE, id);
    if (!row) {
      sendNotFound(res, 'Birthday entry not found');
      return;
    }
    const [shaped] = await hydrate([row]);
    sendSuccess(res, shaped, 'Birthday entry retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get birthday entry', error);
  }
}

/** PUT /api/birthdays/:id */
export async function updateBirthday(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { name, phone, dob, relation, notes, designation, constituency, wardVillage } = req.body;

    const existing = await getRow(BIRTHDAY_TABLE, id);
    if (!existing) {
      sendNotFound(res, 'Birthday entry not found');
      return;
    }

    const updateData: Record<string, unknown> = { ROWID: id };
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (dob !== undefined) updateData.dob = toCatalystDate(dob);
    if (relation !== undefined) updateData.relation = relation;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (designation !== undefined)
      updateData.designation = designation?.trim() || null;
    if (constituency !== undefined)
      updateData.constituency = constituency?.trim() || null;
    if (wardVillage !== undefined)
      updateData.wardVillage = wardVillage?.trim() || null;

    // Edit audit — stamp who edited and when. Never let the client override it.
    if (req.user) {
      const _audit = { lastEditedById: req.user.id, lastEditedAt: nowCatalystIST() };
      Object.assign(updateData, _audit);
    }

    const updated = await updateRowTolerant(
      BIRTHDAY_TABLE,
      updateData as any,
      ['lastEditedById', 'lastEditedAt']
    );
    invalidateBirthdaySources(); // edited row must not linger in the snapshot
    const [shaped] = await hydrate([updated]);
    sendSuccess(res, shaped, 'Birthday entry updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update birthday entry', error);
  }
}

/** DELETE /api/birthdays/:id */
export async function deleteBirthday(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const existing = await getRow(BIRTHDAY_TABLE, id);
    if (!existing) {
      sendNotFound(res, 'Birthday entry not found');
      return;
    }
    await deleteRow(BIRTHDAY_TABLE, id);
    invalidateBirthdaySources(); // deleted row must not linger in the snapshot
    sendSuccess(res, null, 'Birthday entry deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete birthday entry', error);
  }
}

/** Used by stats controller — count today's birthdays. */
export async function getTodayBirthdayCount(): Promise<number> {
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  try {
    const rows = await collectBirthdaySources();
    return rows.filter((r) => {
      if (!r.dob) return false;
      const d = new Date(r.dob);
      return d.getMonth() + 1 === month && d.getDate() === day;
    }).length;
  } catch {
    return 0;
  }
}
