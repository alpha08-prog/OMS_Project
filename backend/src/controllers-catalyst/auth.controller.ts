/**
 * Auth controller — backed by Catalyst Data Store (AppUser table).
 *
 * Catalyst-specific notes:
 *   - Table is named `AppUser` because `User` is reserved.
 *   - `email` is a Var Char with Unique constraint enforced at the DB level.
 *   - `legacyId` column preserves the pre-migration UUID for backward-compat.
 *     New users get null legacyId; seeded users get the UUID they had before.
 *   - JWT `id` claim:
 *       - For users seeded with legacyId, we sign with the UUID so old tokens
 *         keep working alongside new ones.
 *       - For users created fresh in Catalyst, we sign with the ROWID.
 *   - bcrypt + JWT helpers are unchanged — we just point them at AppUser rows.
 */
import { Request, Response } from 'express';
import {
  insertRow,
  getRow,
  updateRow,
  deleteRow,
  executeZCQL,
  zcqlEscapeValue,
  CatalystRow,
} from '../lib/catalyst-client';
import { useZCQL } from '../config/feature-flags';
import { hashPassword, comparePassword, validatePasswordStrength } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { sendSuccess, sendError, sendServerError } from '../utils/response';
import {
  getCachedTableList,
  invalidateTableList,
  invalidateAuthUser,
  isHiddenTestUser,
} from '../lib/catalyst-user-lookup';
import type { AuthenticatedRequest, LoginRequest, RegisterRequest } from '../types';

const APPUSER_TABLE = 'AppUser';
const VALID_ROLES = new Set(['STAFF', 'ADMIN', 'SUPER_ADMIN']);

/**
 * Race-safe duplicate guard. The pre-insert `getCachedTableList` check leaves
 * a window where two concurrent signups with the same email/phone can both
 * pass and both insert. After our INSERT, query Catalyst for ALL matching
 * rows: lowest ROWID wins (earliest writer). If we lost, the caller deletes
 * our row and returns 409.
 *
 * Returns `{ kept: true }` if our row is canonical (no race or we won),
 * `{ kept: false }` if we should clean up and reject.
 */
async function deduplicateAppUser(
  email: string,
  phone: string | null,
  newRowId: string
): Promise<{ kept: boolean }> {
  try {
    const filters: string[] = [`email = '${zcqlEscapeValue(email)}'`];
    if (phone) filters.push(`phone = '${zcqlEscapeValue(phone)}'`);
    const where = filters.length === 1 ? filters[0] : `(${filters.join(' OR ')})`;
    const rows = await executeZCQL<CatalystRow>(
      `SELECT * FROM ${APPUSER_TABLE} WHERE ${where} LIMIT 20`
    );
    if (rows.length <= 1) return { kept: true };
    rows.sort((a, b) => Number(a.ROWID ?? 0) - Number(b.ROWID ?? 0));
    const [keep, ...extras] = rows;
    for (const dupe of extras) {
      if (String(dupe.ROWID) === newRowId) continue; // we'll handle ourselves below
      deleteRow(APPUSER_TABLE, String(dupe.ROWID)).catch((err) => {
        console.warn(
          `[auth] Failed to delete duplicate AppUser ${dupe.ROWID} for ${email}`,
          err
        );
      });
    }
    return { kept: String(keep.ROWID) === newRowId };
  } catch (err) {
    console.warn('[auth] AppUser dedupe query failed', err);
    return { kept: true };
  }
}

function parseBool(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return fallback;
}

/** Reshape an AppUser row into the public-facing user shape. */
function shapeUser(row: CatalystRow, opts: { includePasswordPolicy?: boolean } = {}) {
  const base = {
    id: row.legacyId ? String(row.legacyId) : String(row.ROWID),
    name: String(row.name),
    email: String(row.email),
    phone: row.phone ?? null,
    role: String(row.role),
    isActive: parseBool(row.isActive, true),
    createdAt: row.CREATEDTIME,
  };
  if (opts.includePasswordPolicy) {
    return { ...base, passwordPolicy: getPasswordPolicy(row) };
  }
  return base;
}

// Self-service password changes are capped per calendar month so a leaked
// session can't be used to grind through a small dictionary; the legitimate
// owner can always reach an admin to reset on their behalf.
const MONTHLY_PASSWORD_CHANGE_LIMIT = 2;

/** "YYYY-MM" key for the calendar month a Date falls in (UTC). */
function currentMonthKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * ISO timestamp for 00:00 IST on the 1st of next month (in IST).
 *
 * The user-facing "Resets on …" label renders in en-IN (Asia/Kolkata).
 * If we did the +1-month math in UTC, then between 00:00 IST and 05:30
 * IST on the 1st of any month UTC is still on the prior day — so
 * `getUTCMonth() + 1` would point at the *current* IST month and the
 * label would read e.g. "Resets on 01 May" on May 1st itself. Compute
 * the boundary in IST to keep the label aligned with the user's clock.
 */
function nextMonthFirstDayISO(d: Date = new Date()): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  // Shift "now" into IST so getUTC* methods give IST calendar fields.
  const istNow = new Date(d.getTime() + IST_OFFSET_MS);
  // First-of-next-month at 00:00 IST, expressed back in UTC.
  const istFirstOfNextMonth = Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth() + 1,
    1
  );
  return new Date(istFirstOfNextMonth - IST_OFFSET_MS).toISOString();
}

/**
 * Project the AppUser row onto a stable password-policy view.
 * If the stored window-month is stale (a previous month), `used` is reported
 * as 0 -- the actual reset is committed only when the user next changes
 * their password.
 */
function getPasswordPolicy(row: CatalystRow): {
  used: number;
  allowed: number;
  windowMonth: string;
  resetsAt: string;
} {
  const currentMonth = currentMonthKey();
  const storedWindow = String(row.passwordChangeWindowMonth ?? '');
  const storedCount = Number(row.passwordChangeCount ?? 0);
  const used = storedWindow === currentMonth ? Math.max(0, storedCount) : 0;
  return {
    used,
    allowed: MONTHLY_PASSWORD_CHANGE_LIMIT,
    windowMonth: currentMonth,
    resetsAt: nextMonthFirstDayISO(),
  };
}

/** Choose the JWT `id` claim — prefer legacyId so old tokens keep validating. */
function jwtIdFor(row: CatalystRow): string {
  return row.legacyId ? String(row.legacyId) : String(row.ROWID);
}

/**
 * Find user by email (case-insensitive) OR phone. Returns the raw row or null.
 *
 * ZCQL fast path: direct WHERE-indexed lookup, no full table scan. Falls back
 * to the cached-list scan if USE_ZCQL is off — safe rollback path.
 *
 * Login is the slowest hot path because bcrypt costs ~100ms regardless. Killing
 * the table-scan portion (~200-400ms uncached) takes login from ~500ms to
 * ~150ms.
 */
async function findByIdentifier(identifier: string): Promise<CatalystRow | null> {
  const lower = identifier.toLowerCase();

  if (useZCQL()) {
    // Emails are stored lowercase by register, so lowercase the input and
    // compare directly — Catalyst ZCQL doesn't support LOWER().
    const lowerQ = zcqlEscapeValue(lower);
    const idQ = zcqlEscapeValue(identifier);
    const query = `SELECT * FROM ${APPUSER_TABLE} WHERE email = '${lowerQ}' OR phone = '${idQ}' LIMIT 1`;
    const rows = await executeZCQL<CatalystRow>(query);
    return rows[0] ?? null;
  }

  const all = await getCachedTableList(APPUSER_TABLE);
  return (
    all.find(
      (r) =>
        (r.email || '').toString().toLowerCase() === lower ||
        (r.phone || '').toString() === identifier
    ) ?? null
  );
}

// ── Endpoints ─────────────────────────────────────────────────────────────

/** POST /api/auth/register */
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { name, email, phone, password, role } = req.body as RegisterRequest;

    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      sendError(res, passwordValidation.errors.join('. '), 400);
      return;
    }

    // Duplicate-check against email or phone. Use cached read — cache is
    // invalidated below right after a successful insert, so a duplicate
    // submitted seconds later will still be detected.
    const all = await getCachedTableList(APPUSER_TABLE);
    const lowerEmail = email.toLowerCase();
    const dup = all.find(
      (r) =>
        (r.email || '').toString().toLowerCase() === lowerEmail ||
        (phone && (r.phone || '').toString() === phone)
    );
    if (dup) {
      sendError(res, 'User with this email or phone already exists', 409);
      return;
    }

    const hashedPassword = await hashPassword(password);
    // Public /auth/register always creates a STAFF account regardless of
    // any role value in the body, so an outsider can't self-promote to
    // ADMIN by tampering with the request. Admins use POST /auth/users
    // (admin-gated) to create users with elevated roles.
    void role;
    const finalRole = 'STAFF';

    const row = await insertRow(APPUSER_TABLE, {
      name,
      email: lowerEmail,
      phone: phone || null,
      password: hashedPassword,
      role: finalRole,
      isActive: true,
      legacyId: null,
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiry: null,
      calendarConnected: false,
    });
    invalidateTableList(APPUSER_TABLE);

    // Race-safety: a concurrent signup may have inserted the same email/phone.
    // Run dedupe — if we lost, undo our insert and return 409.
    const dedupe = await deduplicateAppUser(lowerEmail, phone || null, String(row.ROWID));
    if (!dedupe.kept) {
      deleteRow(APPUSER_TABLE, String(row.ROWID)).catch((err) => {
        console.warn(`[auth] Failed to roll back lost-race signup ${row.ROWID}`, err);
      });
      invalidateTableList(APPUSER_TABLE);
      sendError(res, 'User with this email or phone already exists', 409);
      return;
    }

    const user = shapeUser(row);
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role as any,
      name: user.name,
    });

    sendSuccess(res, { user, token }, 'User registered successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to register user', error);
  }
}

/** POST /api/auth/login */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { identifier, password } = req.body as LoginRequest;

    const row = await findByIdentifier(identifier);
    if (!row) {
      sendError(res, 'Invalid credentials', 401);
      return;
    }
    if (!parseBool(row.isActive, true)) {
      sendError(res, 'Account is deactivated. Contact administrator.', 403);
      return;
    }

    const ok = await comparePassword(password, String(row.password));
    if (!ok) {
      sendError(res, 'Invalid credentials', 401);
      return;
    }

    const user = shapeUser(row);
    const token = generateToken({
      id: jwtIdFor(row),
      email: user.email,
      role: user.role as any,
      name: user.name,
    });

    sendSuccess(
      res,
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
        token,
      },
      'Login successful'
    );
  } catch (error) {
    sendServerError(res, 'Login failed', error);
  }
}

/** GET /api/auth/me */
export async function getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    // req.user.id may be UUID (legacyId) or numeric (ROWID).
    let row: CatalystRow | null = null;
    if (/^\d+$/.test(req.user.id)) {
      row = await getRow(APPUSER_TABLE, req.user.id);
    } else {
      const all = await getCachedTableList(APPUSER_TABLE);
      row = all.find((r) => r.legacyId === req.user!.id) ?? null;
    }
    if (!row) {
      sendError(res, 'User not found', 404);
      return;
    }
    sendSuccess(res, shapeUser(row, { includePasswordPolicy: true }), 'User profile retrieved');
  } catch (error) {
    sendServerError(res, 'Failed to get user profile', error);
  }
}

/** PUT /api/auth/password */
export async function updatePassword(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const { currentPassword, newPassword } = req.body;

    let row: CatalystRow | null = null;
    if (/^\d+$/.test(req.user.id)) {
      row = await getRow(APPUSER_TABLE, req.user.id);
    } else {
      const all = await getCachedTableList(APPUSER_TABLE);
      row = all.find((r) => r.legacyId === req.user!.id) ?? null;
    }
    if (!row) {
      sendError(res, 'User not found', 404);
      return;
    }

    const ok = await comparePassword(currentPassword, String(row.password));
    if (!ok) {
      sendError(res, 'Current password is incorrect', 400);
      return;
    }

    const v = validatePasswordStrength(newPassword);
    if (!v.isValid) {
      sendError(res, v.errors.join('. '), 400);
      return;
    }

    // Enforce the per-month rate limit AFTER verifying the current password
    // so a brute-forcer can't probe the limit; checks happen before the
    // password actually changes so the count stays consistent on failure.
    const policy = getPasswordPolicy(row);
    if (policy.used >= policy.allowed) {
      const resetDate = new Date(policy.resetsAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
      sendError(
        res,
        `Password change limit reached. You can change your password ${policy.allowed} times per month. Try again on or after ${resetDate}, or contact your administrator.`,
        429
      );
      return;
    }

    const hashed = await hashPassword(newPassword);
    const newCount = policy.used + 1;
    await updateRow(APPUSER_TABLE, {
      ROWID: String(row.ROWID),
      password: hashed,
      passwordChangeCount: newCount,
      passwordChangeWindowMonth: policy.windowMonth,
    });
    invalidateTableList(APPUSER_TABLE);
    invalidateAuthUser(req.user.id);

    sendSuccess(
      res,
      { passwordPolicy: { ...policy, used: newCount } },
      'Password updated successfully'
    );
  } catch (error) {
    sendServerError(res, 'Failed to update password', error);
  }
}

/** GET /api/auth/users — admin only */
export async function getAllUsers(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const rows = await getCachedTableList(APPUSER_TABLE);
    // Copy before sort — getCachedTableList returns a shared array.
    // Filter dev/test accounts so the UI never lists them, even though
    // they remain functional for login.
    const sorted = rows.filter((r) => !isHiddenTestUser(r)).slice();
    sorted.sort((a, b) => {
      const ta = a.CREATEDTIME ? new Date(a.CREATEDTIME).getTime() : 0;
      const tb = b.CREATEDTIME ? new Date(b.CREATEDTIME).getTime() : 0;
      return tb - ta;
    });
    const users = sorted.map((r) => shapeUser(r));
    sendSuccess(res, users, 'Users retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get users', error);
  }
}

/**
 * GET /api/auth/users/directory — any authenticated user.
 *
 * A lean, read-only directory of active accounts used by pickers (e.g. the
 * forward-to dialog) where every user must be able to choose any colleague.
 * Returns id/name/email/role only — never password or policy fields — and
 * omits hidden test accounts and deactivated users. The admin-only
 * `GET /users` management endpoint is left untouched.
 */
export async function getUserDirectory(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const rows = await getCachedTableList(APPUSER_TABLE);
    const users = rows
      .filter((r) => !isHiddenTestUser(r) && parseBool(r.isActive, true))
      .map((r) => ({
        id: r.legacyId ? String(r.legacyId) : String(r.ROWID),
        name: String(r.name),
        email: String(r.email),
        role: String(r.role),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    sendSuccess(res, users, 'User directory retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get user directory', error);
  }
}

/**
 * POST /api/auth/users — admin only
 * Create a real user account with a chosen role and an initial password.
 * The admin types the password directly so they can hand it to the new
 * user via a secure channel; the user will rotate it via /profile.
 */
export async function createUser(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { name, email, phone, password, role } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      password?: string;
      role?: string;
    };

    if (!name || !email || !password || !role) {
      sendError(res, 'name, email, password, and role are required', 400);
      return;
    }
    if (!VALID_ROLES.has(role)) {
      sendError(res, `Invalid role: ${role}. Must be STAFF, ADMIN, or SUPER_ADMIN.`, 400);
      return;
    }

    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      sendError(res, passwordValidation.errors.join('. '), 400);
      return;
    }

    const lowerEmail = email.toLowerCase();
    const all = await getCachedTableList(APPUSER_TABLE);
    const dup = all.find(
      (r) =>
        (r.email || '').toString().toLowerCase() === lowerEmail ||
        (phone && (r.phone || '').toString() === phone)
    );
    if (dup) {
      sendError(res, 'A user with this email or phone already exists', 409);
      return;
    }

    const hashedPassword = await hashPassword(password);
    const row = await insertRow(APPUSER_TABLE, {
      name: name.trim(),
      email: lowerEmail,
      phone: phone || null,
      password: hashedPassword,
      role,
      isActive: true,
      legacyId: null,
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiry: null,
      calendarConnected: false,
    });
    invalidateTableList(APPUSER_TABLE);

    const dedupe = await deduplicateAppUser(lowerEmail, phone || null, String(row.ROWID));
    if (!dedupe.kept) {
      deleteRow(APPUSER_TABLE, String(row.ROWID)).catch((err) => {
        console.warn(`[auth] Failed to roll back lost-race createUser ${row.ROWID}`, err);
      });
      invalidateTableList(APPUSER_TABLE);
      sendError(res, 'A user with this email or phone already exists', 409);
      return;
    }

    sendSuccess(res, shapeUser(row), 'User created successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to create user', error);
  }
}

/** PATCH /api/auth/users/:id/role — admin only */
export async function updateUserRole(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!VALID_ROLES.has(role)) {
      sendError(res, `Invalid role: ${role}`);
      return;
    }

    let row: CatalystRow | null = null;
    if (/^\d+$/.test(id)) {
      row = await getRow(APPUSER_TABLE, id);
    } else {
      const all = await getCachedTableList(APPUSER_TABLE);
      row = all.find((r) => r.legacyId === id) ?? null;
    }
    if (!row) {
      sendError(res, 'User not found', 404);
      return;
    }

    const updated = await updateRow(APPUSER_TABLE, {
      ROWID: String(row.ROWID),
      role,
    });
    invalidateTableList(APPUSER_TABLE);
    invalidateAuthUser(id);
    sendSuccess(res, shapeUser(updated), 'User role updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update user role', error);
  }
}

/** PATCH /api/auth/users/:id/deactivate — admin only */
export async function deactivateUser(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    if (req.user?.id === id) {
      sendError(res, 'Cannot deactivate your own account');
      return;
    }

    let row: CatalystRow | null = null;
    if (/^\d+$/.test(id)) {
      row = await getRow(APPUSER_TABLE, id);
    } else {
      const all = await getCachedTableList(APPUSER_TABLE);
      row = all.find((r) => r.legacyId === id) ?? null;
    }
    if (!row) {
      sendError(res, 'User not found', 404);
      return;
    }

    await updateRow(APPUSER_TABLE, {
      ROWID: String(row.ROWID),
      isActive: false,
    });
    invalidateTableList(APPUSER_TABLE);
    invalidateAuthUser(id);
    sendSuccess(res, null, 'User deactivated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to deactivate user', error);
  }
}
