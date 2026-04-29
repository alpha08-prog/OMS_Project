/**
 * Auth controller — backed by Catalyst Data Store (AppUser table).
 *
 * Mirrors backend/src/controllers/auth.controller.ts (the Prisma version).
 *
 * Catalyst-specific notes:
 *   - Table is named `AppUser` because `User` is reserved.
 *   - `email` is a Var Char with Unique constraint enforced at the DB level.
 *   - `legacyId` column preserves the old Neon UUID for backward-compat.
 *     New users get null legacyId; seeded users get the UUID they had on Neon.
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
} from '../lib/catalyst-user-lookup';
import type { AuthenticatedRequest, LoginRequest, RegisterRequest } from '../types';

const APPUSER_TABLE = 'AppUser';
const VALID_ROLES = new Set(['STAFF', 'ADMIN', 'SUPER_ADMIN']);

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

/** ISO timestamp for 00:00 UTC on the first of next month. */
function nextMonthFirstDayISO(d: Date = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
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
    const sorted = [...rows];
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
