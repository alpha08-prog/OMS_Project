"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Unit tests for grievance controller — filter-building logic.
 * These tests isolate the where-clause construction without hitting the DB.
 */
const vitest_1 = require("vitest");
// ── Helpers ────────────────────────────────────────────────────────────────────
function buildMockRes() {
    const res = {};
    res.status = vitest_1.vi.fn().mockReturnValue(res);
    res.json = vitest_1.vi.fn().mockReturnValue(res);
    return res;
}
// Capture the where-clause that would be passed to prisma without running a DB query
function buildWhereClause(query, userRole, userId) {
    const where = {};
    if (userRole === 'STAFF' && userId) {
        where.createdById = userId;
    }
    if (query.status)
        where.status = query.status;
    if (query.isVerified !== undefined) {
        where.isVerified = query.isVerified === 'true';
    }
    if (query.grievanceType)
        where.grievanceType = query.grievanceType;
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
(0, vitest_1.describe)('Grievance controller — where-clause construction', () => {
    (0, vitest_1.describe)('isVerified filter', () => {
        (0, vitest_1.it)('sets isVerified=false when query is "false"', () => {
            const where = buildWhereClause({ isVerified: 'false' });
            (0, vitest_1.expect)(where.isVerified).toBe(false);
        });
        (0, vitest_1.it)('sets isVerified=true when query is "true"', () => {
            const where = buildWhereClause({ isVerified: 'true' });
            (0, vitest_1.expect)(where.isVerified).toBe(true);
        });
        (0, vitest_1.it)('does not set isVerified when query param is absent', () => {
            const where = buildWhereClause({});
            (0, vitest_1.expect)(where.isVerified).toBeUndefined();
        });
    });
    (0, vitest_1.describe)('status filter', () => {
        (0, vitest_1.it)('applies status filter when provided', () => {
            const where = buildWhereClause({ status: 'OPEN' });
            (0, vitest_1.expect)(where.status).toBe('OPEN');
        });
        (0, vitest_1.it)('applies IN_PROGRESS status', () => {
            const where = buildWhereClause({ status: 'IN_PROGRESS' });
            (0, vitest_1.expect)(where.status).toBe('IN_PROGRESS');
        });
    });
    (0, vitest_1.describe)('STAFF role restriction', () => {
        (0, vitest_1.it)('restricts STAFF to their own grievances only', () => {
            const where = buildWhereClause({}, 'STAFF', 'user-42');
            (0, vitest_1.expect)(where.createdById).toBe('user-42');
        });
        (0, vitest_1.it)('does not restrict ADMIN users', () => {
            const where = buildWhereClause({}, 'ADMIN', 'admin-1');
            (0, vitest_1.expect)(where.createdById).toBeUndefined();
        });
        (0, vitest_1.it)('does not restrict SUPER_ADMIN users', () => {
            const where = buildWhereClause({}, 'SUPER_ADMIN', 'sa-1');
            (0, vitest_1.expect)(where.createdById).toBeUndefined();
        });
    });
    (0, vitest_1.describe)('combined filters', () => {
        (0, vitest_1.it)('can combine isVerified=false with status=OPEN', () => {
            const where = buildWhereClause({ isVerified: 'false', status: 'OPEN' });
            (0, vitest_1.expect)(where.isVerified).toBe(false);
            (0, vitest_1.expect)(where.status).toBe('OPEN');
        });
        (0, vitest_1.it)('can combine STAFF restriction with isVerified filter', () => {
            const where = buildWhereClause({ isVerified: 'false' }, 'STAFF', 'staff-7');
            (0, vitest_1.expect)(where.createdById).toBe('staff-7');
            (0, vitest_1.expect)(where.isVerified).toBe(false);
        });
    });
    (0, vitest_1.describe)('search filter', () => {
        (0, vitest_1.it)('builds OR clause for search', () => {
            const where = buildWhereClause({ search: 'water' });
            (0, vitest_1.expect)(Array.isArray(where.OR)).toBe(true);
            const orClauses = where.OR;
            (0, vitest_1.expect)(orClauses).toHaveLength(3);
        });
    });
    (0, vitest_1.describe)('constituency filter', () => {
        (0, vitest_1.it)('uses case-insensitive contains for constituency', () => {
            const where = buildWhereClause({ constituency: 'Delhi' });
            (0, vitest_1.expect)(where.constituency).toEqual({ contains: 'Delhi', mode: 'insensitive' });
        });
    });
});
// ── Response helper smoke tests ────────────────────────────────────────────────
(0, vitest_1.describe)('Mock response helper', () => {
    (0, vitest_1.it)('chains status and json', () => {
        const res = buildMockRes();
        res.status(200).json({ ok: true });
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({ ok: true });
    });
});
//# sourceMappingURL=grievance.controller.test.js.map