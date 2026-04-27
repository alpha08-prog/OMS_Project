/**
 * Dual-source user lookup helper.
 *
 * During the migration, user identifiers come in two forms:
 *   - Numeric ROWID  (e.g. "37719000000076188") — issued by Catalyst AppUser
 *   - UUID           (e.g. "cc4afe35-c39a-...") — issued by the original Prisma User table
 *
 * Existing rows in Visitor / Grievance / Task / etc. have createdById set to
 * UUIDs from Neon. New rows (after auth migrates) will have numeric ROWIDs.
 * Both must resolve to the same person.
 *
 * Lookup strategy per id:
 *   1. If id is numeric → fetch from Catalyst AppUser by ROWID
 *   2. If id is UUID format → fetch from Catalyst AppUser by legacyId
 *   3. If still not found → fall back to Prisma User table on Neon
 */
import {
  listAllRows,
  getRow,
  CatalystRow,
} from './catalyst-client';
import prisma from './prisma';

const APPUSER_TABLE = 'AppUser';
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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

  // Catalyst lookup — fetch all once and partition (cheap for our scale)
  let allCatalyst: CatalystRow[] = [];
  try {
    allCatalyst = await listAllRows(APPUSER_TABLE);
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

  // Prisma fallback for anything not found in Catalyst
  if (stillMissing.length > 0) {
    try {
      const users = await prisma.user.findMany({
        where: { id: { in: stillMissing } },
        select: { id: true, name: true, email: true },
      });
      for (const u of users) out.set(u.id, u);
    } catch {
      /* Neon may be unreachable — leave the entries unresolved */
    }
  }

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

  // UUID → Catalyst by legacyId (then Prisma fallback)
  if (UUID_RE.test(id)) {
    try {
      const all = await listAllRows(APPUSER_TABLE);
      const row = all.find((r) => r.legacyId === id);
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

  // Final fallback: Prisma
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    if (user) {
      return { source: 'prisma', user };
    }
  } catch {
    /* ignore */
  }

  return { source: null, user: null };
}
