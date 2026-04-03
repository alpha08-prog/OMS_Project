import { describe, it, expect, beforeEach } from 'vitest';

// Test the hasAuth and getUserRole logic (extracted from ProtectedRoute)
function hasAuth(): boolean {
  const sessionToken = sessionStorage.getItem('auth_token');
  const localToken = localStorage.getItem('auth_token');
  const localSession = localStorage.getItem('auth_session');
  const sessionSession = sessionStorage.getItem('auth_session');
  return Boolean(sessionToken || (localToken && (sessionSession || localSession)));
}

type UserRole = 'STAFF' | 'ADMIN' | 'SUPER_ADMIN';

function getUserRole(): UserRole | null {
  let role = sessionStorage.getItem('user_role') as UserRole | null;
  if (!role) {
    role = localStorage.getItem('user_role') as UserRole | null;
  }
  if (!role) {
    const userStr = sessionStorage.getItem('user') || localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        role = user.role as UserRole;
      } catch {
        return null;
      }
    }
  }
  return role;
}

function getRoleBasedDashboard(role: UserRole | null): string {
  switch (role) {
    case 'STAFF': return '/staff/home';
    case 'ADMIN': return '/admin/home';
    case 'SUPER_ADMIN': return '/home';
    default: return '/auth/login';
  }
}

describe('Authentication Logic', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  describe('hasAuth', () => {
    it('should return false when no token exists', () => {
      expect(hasAuth()).toBe(false);
    });

    it('should return true when sessionStorage has token', () => {
      sessionStorage.setItem('auth_token', 'abc123');
      expect(hasAuth()).toBe(true);
    });

    it('should return true when localStorage has token and session flag', () => {
      localStorage.setItem('auth_token', 'abc123');
      localStorage.setItem('auth_session', 'true');
      expect(hasAuth()).toBe(true);
    });

    it('should return false when localStorage has token but no session flag', () => {
      localStorage.setItem('auth_token', 'abc123');
      expect(hasAuth()).toBe(false);
    });

    it('should survive OAuth redirect (localStorage persistence)', () => {
      // Simulate what handleConnect does before redirect
      localStorage.setItem('auth_token', 'my-jwt');
      localStorage.setItem('auth_session', 'true');
      localStorage.setItem('user_role', 'ADMIN');
      // After redirect, sessionStorage is empty but localStorage persists
      expect(hasAuth()).toBe(true);
    });
  });

  describe('getUserRole', () => {
    it('should return null when no role stored', () => {
      expect(getUserRole()).toBeNull();
    });

    it('should get role from sessionStorage', () => {
      sessionStorage.setItem('user_role', 'ADMIN');
      expect(getUserRole()).toBe('ADMIN');
    });

    it('should fall back to localStorage', () => {
      localStorage.setItem('user_role', 'STAFF');
      expect(getUserRole()).toBe('STAFF');
    });

    it('should extract role from user JSON', () => {
      sessionStorage.setItem('user', JSON.stringify({ role: 'SUPER_ADMIN' }));
      expect(getUserRole()).toBe('SUPER_ADMIN');
    });

    it('should return null for invalid JSON', () => {
      sessionStorage.setItem('user', 'not-json');
      expect(getUserRole()).toBeNull();
    });
  });

  describe('getRoleBasedDashboard', () => {
    it('should route STAFF to /staff/home', () => {
      expect(getRoleBasedDashboard('STAFF')).toBe('/staff/home');
    });

    it('should route ADMIN to /admin/home', () => {
      expect(getRoleBasedDashboard('ADMIN')).toBe('/admin/home');
    });

    it('should route SUPER_ADMIN to /home', () => {
      expect(getRoleBasedDashboard('SUPER_ADMIN')).toBe('/home');
    });

    it('should route null to /auth/login', () => {
      expect(getRoleBasedDashboard(null)).toBe('/auth/login');
    });
  });
});
