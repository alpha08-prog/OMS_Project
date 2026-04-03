import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword, validatePasswordStrength } from './password';

describe('Password Utils', () => {
  describe('hashPassword', () => {
    it('should return a hashed string different from input', async () => {
      const hash = await hashPassword('Test@1234');
      expect(hash).not.toBe('Test@1234');
      expect(hash.length).toBeGreaterThan(20);
    });

    it('should produce different hashes for same input (salted)', async () => {
      const hash1 = await hashPassword('Test@1234');
      const hash2 = await hashPassword('Test@1234');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('comparePassword', () => {
    it('should return true for matching password', async () => {
      const hash = await hashPassword('Test@1234');
      const result = await comparePassword('Test@1234', hash);
      expect(result).toBe(true);
    });

    it('should return false for wrong password', async () => {
      const hash = await hashPassword('Test@1234');
      const result = await comparePassword('WrongPass@1', hash);
      expect(result).toBe(false);
    });
  });

  describe('validatePasswordStrength', () => {
    it('should accept a strong password', () => {
      const result = validatePasswordStrength('Test@1234');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject password shorter than 8 chars', () => {
      const result = validatePasswordStrength('T@1a');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('should reject password without uppercase', () => {
      const result = validatePasswordStrength('test@1234');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should reject password without lowercase', () => {
      const result = validatePasswordStrength('TEST@1234');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should reject password without number', () => {
      const result = validatePasswordStrength('Test@abcd');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should reject password without special character', () => {
      const result = validatePasswordStrength('Test12345');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });

    it('should return multiple errors for very weak password', () => {
      const result = validatePasswordStrength('abc');
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});
