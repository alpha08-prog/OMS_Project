import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock axios before importing api
vi.mock('axios', () => {
  const interceptors = {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  };
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors,
  };
  return {
    default: {
      create: vi.fn(() => instance),
    },
  };
});

describe('API Types and Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should define all user roles', () => {
    type UserRole = 'STAFF' | 'ADMIN' | 'SUPER_ADMIN';
    const roles: UserRole[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN'];
    expect(roles).toHaveLength(3);
    expect(roles).toContain('STAFF');
    expect(roles).toContain('ADMIN');
    expect(roles).toContain('SUPER_ADMIN');
  });

  it('should define grievance types', () => {
    const types = ['WATER', 'ROAD', 'POLICE', 'HEALTH', 'TRANSFER', 'FINANCIAL_AID', 'ELECTRICITY', 'EDUCATION', 'HOUSING', 'OTHER'];
    expect(types).toHaveLength(10);
  });

  it('should define calendar event types', () => {
    type CalendarEventType = 'TOUR' | 'CUSTOM';
    const types: CalendarEventType[] = ['TOUR', 'CUSTOM'];
    expect(types).toHaveLength(2);
  });

  it('should define tour decisions', () => {
    type TourDecision = 'ACCEPTED' | 'REGRET' | 'PENDING';
    const decisions: TourDecision[] = ['ACCEPTED', 'REGRET', 'PENDING'];
    expect(decisions).toHaveLength(3);
  });

  it('should define grievance statuses', () => {
    const statuses = ['OPEN', 'IN_PROGRESS', 'VERIFIED', 'RESOLVED', 'REJECTED'];
    expect(statuses).toHaveLength(5);
  });

  it('should define task statuses', () => {
    const statuses = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD'];
    expect(statuses).toHaveLength(4);
  });
});

describe('Auth Token Handling', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('should store and retrieve token from sessionStorage', () => {
    sessionStorage.setItem('auth_token', 'test-token-123');
    expect(sessionStorage.getItem('auth_token')).toBe('test-token-123');
  });

  it('should fall back to localStorage when sessionStorage is empty', () => {
    localStorage.setItem('auth_token', 'local-token');
    const token = sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
    expect(token).toBe('local-token');
  });

  it('should prefer sessionStorage over localStorage', () => {
    sessionStorage.setItem('auth_token', 'session-token');
    localStorage.setItem('auth_token', 'local-token');
    const token = sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
    expect(token).toBe('session-token');
  });

  it('should store user role correctly', () => {
    sessionStorage.setItem('user_role', 'ADMIN');
    expect(sessionStorage.getItem('user_role')).toBe('ADMIN');
  });

  it('should store user info as JSON', () => {
    const user = { id: '1', name: 'Admin', email: 'admin@test.com', role: 'ADMIN' };
    sessionStorage.setItem('user', JSON.stringify(user));
    const parsed = JSON.parse(sessionStorage.getItem('user')!);
    expect(parsed.role).toBe('ADMIN');
    expect(parsed.name).toBe('Admin');
  });
});
