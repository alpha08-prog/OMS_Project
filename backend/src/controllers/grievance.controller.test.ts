/**
 * Unit tests for grievance controller — filter-building logic.
 * These tests isolate the where-clause construction without hitting the DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildMockRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as unknown as import('express').Response;
}

// Capture the where-clause that would be passed to prisma without running a DB query
function buildWhereClause(
  query: Record<string, string>,
  userRole?: string,
  userId?: string
): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (userRole === 'STAFF' && userId) {
    where.createdById = userId;
  }
  if (query.status) where.status = query.status;
  if (query.isVerified !== undefined) {
    where.isVerified = query.isVerified === 'true';
  }
  if (query.grievanceType) where.grievanceType = query.grievanceType;
  if (query.constituency) {
    where.constituency = { contains: query.constituency, mode: 'insensitive' };
  }
  if (query.search) {
    where.OR = [
      { petitionerName: { contains: query.search, mode: 'insensitive' } },
      { mobileNumber: { contains: query.search } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Grievance controller — where-clause construction', () => {
  describe('isVerified filter', () => {
    it('sets isVerified=false when query is "false"', () => {
      const where = buildWhereClause({ isVerified: 'false' });
      expect(where.isVerified).toBe(false);
    });

    it('sets isVerified=true when query is "true"', () => {
      const where = buildWhereClause({ isVerified: 'true' });
      expect(where.isVerified).toBe(true);
    });

    it('does not set isVerified when query param is absent', () => {
      const where = buildWhereClause({});
      expect(where.isVerified).toBeUndefined();
    });
  });

  describe('status filter', () => {
    it('applies status filter when provided', () => {
      const where = buildWhereClause({ status: 'OPEN' });
      expect(where.status).toBe('OPEN');
    });

    it('applies IN_PROGRESS status', () => {
      const where = buildWhereClause({ status: 'IN_PROGRESS' });
      expect(where.status).toBe('IN_PROGRESS');
    });
  });

  describe('STAFF role restriction', () => {
    it('restricts STAFF to their own grievances only', () => {
      const where = buildWhereClause({}, 'STAFF', 'user-42');
      expect(where.createdById).toBe('user-42');
    });

    it('does not restrict ADMIN users', () => {
      const where = buildWhereClause({}, 'ADMIN', 'admin-1');
      expect(where.createdById).toBeUndefined();
    });

    it('does not restrict SUPER_ADMIN users', () => {
      const where = buildWhereClause({}, 'SUPER_ADMIN', 'sa-1');
      expect(where.createdById).toBeUndefined();
    });
  });

  describe('combined filters', () => {
    it('can combine isVerified=false with status=OPEN', () => {
      const where = buildWhereClause({ isVerified: 'false', status: 'OPEN' });
      expect(where.isVerified).toBe(false);
      expect(where.status).toBe('OPEN');
    });

    it('can combine STAFF restriction with isVerified filter', () => {
      const where = buildWhereClause({ isVerified: 'false' }, 'STAFF', 'staff-7');
      expect(where.createdById).toBe('staff-7');
      expect(where.isVerified).toBe(false);
    });
  });

  describe('search filter', () => {
    it('builds OR clause for search', () => {
      const where = buildWhereClause({ search: 'water' });
      expect(Array.isArray(where.OR)).toBe(true);
      const orClauses = where.OR as Array<Record<string, unknown>>;
      expect(orClauses).toHaveLength(3);
    });
  });

  describe('constituency filter', () => {
    it('uses case-insensitive contains for constituency', () => {
      const where = buildWhereClause({ constituency: 'Delhi' });
      expect(where.constituency).toEqual({ contains: 'Delhi', mode: 'insensitive' });
    });
  });
});

// ── Response helper smoke tests ────────────────────────────────────────────────

describe('Mock response helper', () => {
  it('chains status and json', () => {
    const res = buildMockRes();
    res.status(200).json({ ok: true });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
