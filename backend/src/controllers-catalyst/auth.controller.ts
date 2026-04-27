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
  listAllRows,
  getRow,
  updateRow,
  CatalystRow,
} from '../lib/catalyst-client';
import { hashPassword, comparePassword, validatePasswordStrength } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { sendSuccess, sendError, sendServerError } from '../utils/response';
import type { AuthenticatedRequest, LoginRequest, RegisterRequest } from '../types';

const APPUSER_TABLE = 'AppUser';
const VALID_ROLES = new Set(['STAFF', 'ADMIN', 'SUPER_ADMIN']);

function parseBool(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return fallback;
}

/** Reshape an AppUser row into the public-facing user shape. */
function shapeUser(row: CatalystRow) {
  return {
    id: row.legacyId ? String(row.legacyId) : String(row.ROWID),
    name: String(row.name),
    email: String(row.email),
    phone: row.phone ?? null,
    role: String(row.role),
    isActive: parseBool(row.isActive, true),
    createdAt: row.CREATEDTIME,
  };
}

/** Choose the JWT `id` claim — prefer legacyId so old tokens keep validating. */
function jwtIdFor(row: CatalystRow): string {
  return row.legacyId ? String(row.legacyId) : String(row.ROWID);
}

/** Find user by email (case-insensitive) OR phone. Returns the raw row or null. */
async function findByIdentifier(identifier: string): Promise<CatalystRow | null> {
  const all = await listAllRows(APPUSER_TABLE);
  const lower = identifier.toLowerCase();
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

    // Duplicate-check against email or phone
    const all = await listAllRows(APPUSER_TABLE);
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
    const finalRole = role && VALID_ROLES.has(role) ? role : 'STAFF';

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
      const all = await listAllRows(APPUSER_TABLE);
      row = all.find((r) => r.legacyId === req.user!.id) ?? null;
    }
    if (!row) {
      sendError(res, 'User not found', 404);
      return;
    }
    sendSuccess(res, shapeUser(row), 'User profile retrieved');
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
      const all = await listAllRows(APPUSER_TABLE);
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

    const hashed = await hashPassword(newPassword);
    await updateRow(APPUSER_TABLE, {
      ROWID: String(row.ROWID),
      password: hashed,
    });

    sendSuccess(res, null, 'Password updated successfully');
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
    const rows = await listAllRows(APPUSER_TABLE);
    rows.sort((a, b) => {
      const ta = a.CREATEDTIME ? new Date(a.CREATEDTIME).getTime() : 0;
      const tb = b.CREATEDTIME ? new Date(b.CREATEDTIME).getTime() : 0;
      return tb - ta;
    });
    const users = rows.map(shapeUser);
    sendSuccess(res, users, 'Users retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get users', error);
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
      const all = await listAllRows(APPUSER_TABLE);
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
      const all = await listAllRows(APPUSER_TABLE);
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
    sendSuccess(res, null, 'User deactivated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to deactivate user', error);
  }
}
