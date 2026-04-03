import { describe, it, expect } from 'vitest';
import { generateToken, verifyToken, extractToken } from './jwt';

describe('JWT Utils', () => {
  const testPayload = {
    id: 'user-123',
    email: 'test@example.com',
    role: 'ADMIN' as const,
    name: 'Test User',
  };

  describe('generateToken', () => {
    it('should return a non-empty JWT string', () => {
      const token = generateToken(testPayload);
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      // JWT has 3 parts separated by dots
      expect(token.split('.').length).toBe(3);
    });
  });

  describe('verifyToken', () => {
    it('should decode a valid token and return the payload', () => {
      const token = generateToken(testPayload);
      const decoded = verifyToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded!.id).toBe(testPayload.id);
      expect(decoded!.email).toBe(testPayload.email);
      expect(decoded!.role).toBe(testPayload.role);
      expect(decoded!.name).toBe(testPayload.name);
    });

    it('should return null for an invalid token', () => {
      const decoded = verifyToken('invalid.token.here');
      expect(decoded).toBeNull();
    });

    it('should return null for an empty string', () => {
      const decoded = verifyToken('');
      expect(decoded).toBeNull();
    });

    it('should return null for a tampered token', () => {
      const token = generateToken(testPayload);
      const tampered = token.slice(0, -5) + 'xxxxx';
      const decoded = verifyToken(tampered);
      expect(decoded).toBeNull();
    });
  });

  describe('extractToken', () => {
    it('should extract token from valid Bearer header', () => {
      const token = extractToken('Bearer my-jwt-token');
      expect(token).toBe('my-jwt-token');
    });

    it('should return null for missing header', () => {
      expect(extractToken(undefined)).toBeNull();
    });

    it('should return null for non-Bearer header', () => {
      expect(extractToken('Basic abc123')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(extractToken('')).toBeNull();
    });

    it('should handle Bearer with long token', () => {
      const longToken = 'a'.repeat(500);
      const token = extractToken(`Bearer ${longToken}`);
      expect(token).toBe(longToken);
    });
  });
});
