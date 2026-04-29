/**
 * User lookup helper — Catalyst-only.
 *
 * User identifiers come in two forms:
 *   - Numeric ROWID  (e.g. "37719000000076188") — Catalyst AppUser primary key
 *   - UUID           (e.g. "cc4afe35-c39a-...") — preserved as legacyId for
 *     rows that originated in the pre-migration Prisma database
 *
 * Lookup strategy per id:
 *   1. If id is numeric → fetch from Catalyst AppUser by ROWID
 *   2. If id is UUID format → fetch from Catalyst AppUser by legacyId
 *   3. Otherwise → unresolved (treated as not authenticated by callers)
 *
 * No Prisma / Neon fallback — Catalyst is the sole source of truth.
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
 * Seed/test accounts that exist in the AppUser table for development &
 * automated testing but should never surface in any UI list or label.
 * Login still works for these accounts (auth lookup is by exact email),
 * they just don't appear in dropdowns, user lists, or assigned-by chips.
 *
 * If we ever onboard a real "office admin" using oms.gov.in, they should
 * use a different local-part to stay out of this list.
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
// per request when the JWT subject was a UUID (legacy Prisma id). 5 minutes is
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
  if (cached) return cached;
  const fresh = await listAllRows(tableName, pageSize);
  cacheSet(key, fresh, TABLE_LIST_TTL_SECONDS);
  return fresh;
}

/** Invalidate the cached list for a table (call after insert/update/delete). */
export function invalidateTableList(tableName: string): void {
  cacheDelete(tableListCacheKey(tableName));
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
    // Table not created yet → fall through to Prisma-only path
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
  source: 'catalyst' | 'prisma' | null;
  user: { id: string; email: string; name: string; role: string; isActive: boolean } | null;
}> {
  const cached = cacheGet<{
    source: 'catalyst' | 'prisma' | null;
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
  source: 'catalyst' | 'prisma' | null;
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

  // UUID → Catalyst by legacyId (then Prisma fallback). With ZCQL on, this is
  // a direct indexed lookup (~30ms) instead of a full-table scan (~300ms).
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

  // Catalyst is the only source — no Prisma fallback. If the user isn't in
  // AppUser, treat as not authenticated.
  return { source: null, user: null };
}
