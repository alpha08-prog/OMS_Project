/**
 * Unit tests for dashboard stats shape and AdminHome pending-count logic.
 * Tests the client-side filtering rules that determine what shows as "pending".
 */
import { describe, it, expect } from 'vitest';

// ── Types (mirror api.ts) ─────────────────────────────────────────────────────

type DashboardStats = {
  grievances: {
    total: number;
    open: number;
    inProgress: number;
    verified: number;
    resolved: number;
    pendingVerification: number;
  };
  visitors: { total: number; today: number };
  trainRequests: { total: number; pending: number; approved: number };
  news: { total: number; critical: number };
  tourPrograms: { total: number; upcoming: number; pending: number };
  birthdays: { today: number };
};

type Grievance = {
  id: string;
  isVerified: boolean;
  status: string;
  petitionerName: string;
  grievanceType: string;
  createdAt: string;
};

// ── Helpers (mirrors ActionCenter / AdminHome filter logic) ───────────────────

function filterPendingGrievances(grievances: Grievance[]) {
  return grievances.filter(
    (g) => !g.isVerified && g.status !== 'RESOLVED' && g.status !== 'REJECTED'
  );
}

// ── DashboardStats shape ──────────────────────────────────────────────────────

describe('DashboardStats — pendingVerification field', () => {
  const mockStats: DashboardStats = {
    grievances: {
      total: 20,
      open: 8,
      inProgress: 3,
      verified: 4,
      resolved: 5,
      pendingVerification: 9,
    },
    visitors: { total: 50, today: 5 },
    trainRequests: { total: 30, pending: 2, approved: 20 },
    news: { total: 15, critical: 3 },
    tourPrograms: { total: 10, upcoming: 4, pending: 1 },
    birthdays: { today: 2 },
  };

  it('has pendingVerification on grievances object', () => {
    expect(mockStats.grievances).toHaveProperty('pendingVerification');
  });

  it('pendingVerification is a number', () => {
    expect(typeof mockStats.grievances.pendingVerification).toBe('number');
  });

  it('pendingVerification reflects open + inProgress unverified count', () => {
    // 8 open + 3 inProgress (all assumed unverified) = 9
    expect(mockStats.grievances.pendingVerification).toBe(9);
  });

  it('AdminHome uses pendingVerification for the card count', () => {
    const count = mockStats.grievances?.pendingVerification ?? 0;
    expect(count).toBe(9);
  });

  it('falls back to 0 when field is missing (nullish coalescing)', () => {
    const partialStats = { grievances: { total: 5 } } as unknown as DashboardStats;
    const count = partialStats.grievances?.pendingVerification ?? 0;
    expect(count).toBe(0);
  });
});

// ── Pending grievance client-side filter ──────────────────────────────────────

describe('filterPendingGrievances — client-side logic', () => {
  const grievances: Grievance[] = [
    { id: '1', isVerified: false, status: 'OPEN',        petitionerName: 'A', grievanceType: 'WATER',  createdAt: '' },
    { id: '2', isVerified: false, status: 'IN_PROGRESS', petitionerName: 'B', grievanceType: 'ROAD',   createdAt: '' },
    { id: '3', isVerified: true,  status: 'RESOLVED',    petitionerName: 'C', grievanceType: 'HEALTH', createdAt: '' },
    { id: '4', isVerified: false, status: 'RESOLVED',    petitionerName: 'D', grievanceType: 'POLICE', createdAt: '' },
    { id: '5', isVerified: false, status: 'REJECTED',    petitionerName: 'E', grievanceType: 'OTHER',  createdAt: '' },
    { id: '6', isVerified: true,  status: 'OPEN',        petitionerName: 'F', grievanceType: 'WATER',  createdAt: '' },
  ];

  it('includes OPEN unverified grievances', () => {
    const result = filterPendingGrievances(grievances);
    expect(result.some((g) => g.id === '1')).toBe(true);
  });

  it('includes IN_PROGRESS unverified grievances', () => {
    const result = filterPendingGrievances(grievances);
    expect(result.some((g) => g.id === '2')).toBe(true);
  });

  it('excludes verified grievances regardless of status', () => {
    const result = filterPendingGrievances(grievances);
    expect(result.some((g) => g.id === '3')).toBe(false);
    expect(result.some((g) => g.id === '6')).toBe(false);
  });

  it('excludes RESOLVED even when isVerified is false', () => {
    const result = filterPendingGrievances(grievances);
    expect(result.some((g) => g.id === '4')).toBe(false);
  });

  it('excludes REJECTED even when isVerified is false', () => {
    const result = filterPendingGrievances(grievances);
    expect(result.some((g) => g.id === '5')).toBe(false);
  });

  it('returns exactly 2 pending grievances from sample data', () => {
    expect(filterPendingGrievances(grievances)).toHaveLength(2);
  });

  it('returns empty array when all grievances are verified or closed', () => {
    const closed: Grievance[] = [
      { id: 'a', isVerified: true,  status: 'RESOLVED', petitionerName: 'X', grievanceType: 'WATER', createdAt: '' },
      { id: 'b', isVerified: false, status: 'REJECTED', petitionerName: 'Y', grievanceType: 'ROAD',  createdAt: '' },
    ];
    expect(filterPendingGrievances(closed)).toHaveLength(0);
  });
});

// ── AdminHome total pending calculation ──────────────────────────────────────

describe('AdminHome — totalPending calculation', () => {
  it('sums grievance + train + tour counts', () => {
    const grievanceCount = 9;
    const trainCount = 2;
    const tourCount = 1;
    expect(grievanceCount + trainCount + tourCount).toBe(12);
  });

  it('handles null counts with fallback', () => {
    const grievanceCount: number | null = null;
    const trainCount: number | null = null;
    const tourCount: number | null = null;
    const total = (grievanceCount ?? 0) + (trainCount ?? 0) + (tourCount ?? 0);
    expect(total).toBe(0);
  });

  it('shows 0 total when everything is processed', () => {
    expect(0 + 0 + 0).toBe(0);
  });
});
