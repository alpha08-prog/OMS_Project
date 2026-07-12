/**
 * User lookup helper — Catalyst.
 *
 * User identifiers come in two forms:
 *   - Numeric ROWID  (e.g. "37719000000076188") — Catalyst AppUser primary key
 *   - UUID           (e.g. "cc4afe35-c39a-...") — preserved as legacyId for
 *     rows that originated in the pre-migration database
 *
 * Lookup strategy per id:
 *   1. If id is numeric → fetch from Catalyst AppUser by ROWID
 *   2. If id is UUID format → fetch from Catalyst AppUser by legacyId
 *   3. Otherwise → unresolved (treated as not authenticated by callers)
 */
import {
  listAllRows,
  getRow,
  executeZCQL,
  zcqlEscapeValue,
  CatalystRow,
} from './catalyst-client';
import { cacheGet, cacheSet, cacheDelete } from './cache';
import { useZCQL } from '../config/feature-flags';

const APPUSER_TABLE = 'AppUser';
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Set of seed/test account emails that should be hidden from UI lists.
 * These accounts can still log in and use the app for development /
 * acceptance testing, but they're omitted from dropdowns, user lists,
 * staff-picker chips, and "assigned-by" badges that real (real-world)
 * users see — so production traffic stays clean while developers retain
 * working credentials.
 */
export const HIDDEN_TEST_EMAILS: ReadonlySet<string> = new Set([
  'staff@oms.gov.in',
  'admin@oms.gov.in',
  'superadmin@oms.gov.in',
]);

/** Return true if the row's email is one of the dev/test accounts. */
export function isHiddenTestUser(row: CatalystRow | { email?: unknown }): boolean {
  const email = String((row as { email?: unknown }).email ?? '').trim().toLowerCase();
  return HIDDEN_TEST_EMAILS.has(email);
}

// Auth runs on every API call and previously paid a full AppUser table scan
// per request when the JWT subject was a UUID (legacy id). 5 minutes is
// short enough that role / isActive flips become visible quickly, long enough
// to absorb the burst of calls a single page load triggers.
const AUTH_CACHE_TTL_SECONDS = 5 * 60;
const authCacheKey = (id: string) => `auth:user:${id}`;

/** Invalidate cached auth resolution for a user (call after role/active changes). */
export function invalidateAuthUser(id: string): void {
  cacheDelete(authCacheKey(id));
}

// Cache for full-table user reads. Multiple controllers do `listAllRows(User)`
// or `listAllRows(AppUser)` on every list/create/update — once cached here,
// they all share it. 60s is short enough that a newly-created AppUser shows up
// quickly without forcing a scan on every request.
//
// SCOPE RULE — read this before adding a new table:
//   This cache is *global*, not keyed by req.user. It is ONLY safe for
//   reference / lookup tables whose contents should be visible to every
//   authenticated request (User, AppUser). NEVER use it for transactional
//   tables like Visitor, Grievance, Task — those are role-/user-filtered
//   and a global cache there would let one staff member see another staff
//   member's data. For per-user list caching, build a key that includes
//   user id + role + filters, e.g.
//     `visitors:${userId}:${role}:${JSON.stringify(filters)}`
//   so staff-A's cached page is never served to staff-B.
const TABLE_LIST_TTL_SECONDS = 60;
const tableListCacheKey = (table: string) => `catalyst:list:${table}`;

// Whitelist of tables that may be cached globally. Throw on misuse so the
// rule above is enforced at runtime, not just by code review.
const GLOBAL_CACHE_TABLE_WHITELIST = new Set(['User', 'AppUser']);

/** Cached `listAllRows(table)` — global lookup tables only. */
export async function getCachedTableList(
  tableName: string,
  pageSize?: number
): Promise<CatalystRow[]> {
  if (!GLOBAL_CACHE_TABLE_WHITELIST.has(tableName)) {
    throw new Error(
      `getCachedTableList('${tableName}') is not allowed — only User/AppUser ` +
      `may be cached globally. See SCOPE RULE in catalyst-user-lookup.ts.`
    );
  }
  const key = tableListCacheKey(tableName);
  const cached = cacheGet<CatalystRow[]>(key);
  // Return a shallow copy so callers that sort/mutate the list in place can't
  // corrupt the shared cached array for every other request in the TTL window.
  // Rows are still shared by reference (cheap) — only the array order is private.
  if (cached) return cached.slice();
  const fresh = await listAllRows(tableName, pageSize);
  cacheSet(key, fresh, TABLE_LIST_TTL_SECONDS);
  return fresh.slice();
}

/** Invalidate the cached list for a table (call after insert/update/delete). */
export function invalidateTableList(tableName: string): void {
  cacheDelete(tableListCacheKey(tableName));
}

/**
 * All identifier forms a user may appear as in `*ById` columns
 * (createdById / assignedToId / recipientId): the Catalyst AppUser ROWID
 * and — for accounts that predate the Prisma→Catalyst migration — the
 * preserved legacy UUID.
 *
 * Which form a row carries depends on WHEN it was written: pre-migration
 * rows reference the UUID, rows written after an account lost (or gained)
 * its legacyId reference the other form. Ownership filters must therefore
 * match the FULL alias set — matching only `req.user.id` makes a staff
 * member's older submissions invisible (the "My History / Print Center /
 * Train EQ list shows 0" bug).
 *
 * Best-effort: if Catalyst is unreachable, falls back to just the id passed
 * in. Reads the 60s-cached AppUser list, so no extra round-trip on hot paths.
 */
export async function getUserIdAliases(id: string): Promise<string[]> {
  const wanted = String(id);
  const aliases = new Set<string>([wanted]);
  try {
    const users = await getCachedTableList(APPUSER_TABLE);
    for (const row of users) {
      const rowId = row.ROWID ? String(row.ROWID) : null;
      const legacyId = row.legacyId ? String(row.legacyId) : null;
      if (rowId === wanted || legacyId === wanted) {
        if (rowId) aliases.add(rowId);
        if (legacyId) aliases.add(legacyId);
        break;
      }
    }
  } catch {
    /* Catalyst unreachable — fall back to the raw id */
  }
  return [...aliases];
}

export interface ResolvedUser {
  id: string;
  name: string;
  email: string;
}

/** Reshape a Catalyst AppUser row to the trimmed shape callers expect. */
function shape(row: CatalystRow): ResolvedUser {
  return {
    id: row.legacyId ? String(row.legacyId) : String(row.ROWID),
    name: String(row.name),
    email: String(row.email),
  };
}

/**
 * Look up users by a list of identifiers (mix of UUIDs and ROWIDs).
 * Returns a Map keyed by the ORIGINAL identifier the caller passed.
 */
export async function lookupUsers(
  ids: Iterable<string>
): Promise<Map<string, ResolvedUser>> {
  const out = new Map<string, ResolvedUser>();
  const list = Array.from(ids).filter(Boolean);
  if (list.length === 0) return out;

  // Split into numeric (Catalyst ROWIDs) and UUID buckets
  const numeric: string[] = [];
  const uuids: string[] = [];
  for (const id of list) {
    if (UUID_RE.test(id)) uuids.push(id);
    else if (/^\d+$/.test(id)) numeric.push(id);
    else uuids.push(id); // unknown format → try as legacyId
  }

  // Catalyst lookup — fetch all once and partition (cheap for our scale).
  // Cached: AppUser table is read on nearly every list/create call across
  // controllers, so caching here saves one Catalyst round-trip per request.
  let allCatalyst: CatalystRow[] = [];
  try {
    allCatalyst = await getCachedTableList(APPUSER_TABLE);
  } catch {
    // Table not reachable → leave allCatalyst empty; ids stay unresolved.
  }

  const byROWID = new Map<string, CatalystRow>();
  const byLegacy = new Map<string, CatalystRow>();
  for (const row of allCatalyst) {
    if (row.ROWID) byROWID.set(String(row.ROWID), row);
    if (row.legacyId) byLegacy.set(String(row.legacyId), row);
  }

  const stillMissing: string[] = [];

  for (const id of numeric) {
    const row = byROWID.get(id);
    if (row) out.set(id, shape({ ...row, legacyId: id }));
    else stillMissing.push(id);
  }
  for (const id of uuids) {
    const row = byLegacy.get(id);
    if (row) out.set(id, shape({ ...row, legacyId: id }));
    else stillMissing.push(id);
  }

  // Catalyst is the only source of truth — anything not in AppUser stays
  // unresolved (caller treats missing as null user, which is correct).
  void stillMissing;
  return out;
}

/**
 * Resolve a single user id to the Catalyst row (or null).
 * Used by the auth middleware to validate JWTs.
 */
export async function findUserForAuth(
  id: string
): Promise<{
  source: 'catalyst' | null;
  user: { id: string; email: string; name: string; role: string; isActive: boolean } | null;
}> {
  const cached = cacheGet<{
    source: 'catalyst' | null;
    user: { id: string; email: string; name: string; role: string; isActive: boolean } | null;
  }>(authCacheKey(id));
  if (cached) return cached;

  const result = await resolveUserForAuth(id);
  // Only cache positive resolutions — negative ones might just be a transient
  // Catalyst hiccup, and we don't want to lock a real user out for 5 minutes.
  if (result.user) cacheSet(authCacheKey(id), result, AUTH_CACHE_TTL_SECONDS);
  return result;
}

async function resolveUserForAuth(
  id: string
): Promise<{
  source: 'catalyst' | null;
  user: { id: string; email: string; name: string; role: string; isActive: boolean } | null;
}> {
  // Numeric → Catalyst by ROWID
  if (/^\d+$/.test(id)) {
    try {
      const row = await getRow(APPUSER_TABLE, id);
      if (row) {
        return {
          source: 'catalyst',
          user: {
            id: String(row.ROWID),
            email: String(row.email),
            name: String(row.name),
            role: String(row.role),
            isActive: row.isActive === true || row.isActive === 'true',
          },
        };
      }
    } catch {
      /* fall through */
    }
  }

  // UUID → Catalyst by legacyId. With ZCQL on, this is a direct indexed
  // lookup (~30ms) instead of a full-table scan (~300ms).
  if (UUID_RE.test(id)) {
    try {
      let row: CatalystRow | undefined;
      if (useZCQL()) {
        const q = zcqlEscapeValue(id);
        const rows = await executeZCQL<CatalystRow>(
          `SELECT * FROM ${APPUSER_TABLE} WHERE legacyId = '${q}' LIMIT 1`
        );
        row = rows[0];
      } else {
        const all = await getCachedTableList(APPUSER_TABLE);
        row = all.find((r) => r.legacyId === id);
      }
      if (row) {
        return {
          source: 'catalyst',
          user: {
            // Keep id as the UUID so JWT subject stays stable for legacy tokens
            id,
            email: String(row.email),
            name: String(row.name),
            role: String(row.role),
            isActive: row.isActive === true || row.isActive === 'true',
          },
        };
      }
    } catch {
      /* fall through */
    }
  }

  // If the user isn't in AppUser, treat as not authenticated.
  return { source: null, user: null };
}
