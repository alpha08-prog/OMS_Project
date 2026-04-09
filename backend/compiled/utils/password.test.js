"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const password_1 = require("./password");
(0, vitest_1.describe)('Password Utils', () => {
    (0, vitest_1.describe)('hashPassword', () => {
        (0, vitest_1.it)('should return a hashed string different from input', async () => {
            const hash = await (0, password_1.hashPassword)('Test@1234');
            (0, vitest_1.expect)(hash).not.toBe('Test@1234');
            (0, vitest_1.expect)(hash.length).toBeGreaterThan(20);
        });
        (0, vitest_1.it)('should produce different hashes for same input (salted)', async () => {
            const hash1 = await (0, password_1.hashPassword)('Test@1234');
            const hash2 = await (0, password_1.hashPassword)('Test@1234');
            (0, vitest_1.expect)(hash1).not.toBe(hash2);
        });
    });
    (0, vitest_1.describe)('comparePassword', () => {
        (0, vitest_1.it)('should return true for matching password', async () => {
            const hash = await (0, password_1.hashPassword)('Test@1234');
            const result = await (0, password_1.comparePassword)('Test@1234', hash);
            (0, vitest_1.expect)(result).toBe(true);
        });
        (0, vitest_1.it)('should return false for wrong password', async () => {
            const hash = await (0, password_1.hashPassword)('Test@1234');
            const result = await (0, password_1.comparePassword)('WrongPass@1', hash);
            (0, vitest_1.expect)(result).toBe(false);
        });
    });
    (0, vitest_1.describe)('validatePasswordStrength', () => {
        (0, vitest_1.it)('should accept a strong password', () => {
            const result = (0, password_1.validatePasswordStrength)('Test@1234');
            (0, vitest_1.expect)(result.isValid).toBe(true);
            (0, vitest_1.expect)(result.errors).toHaveLength(0);
        });
        (0, vitest_1.it)('should reject password shorter than 8 chars', () => {
            const result = (0, password_1.validatePasswordStrength)('T@1a');
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(result.errors).toContain('Password must be at least 8 characters long');
        });
        (0, vitest_1.it)('should reject password without uppercase', () => {
            const result = (0, password_1.validatePasswordStrength)('test@1234');
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(result.errors).toContain('Password must contain at least one uppercase letter');
        });
        (0, vitest_1.it)('should reject password without lowercase', () => {
            const result = (0, password_1.validatePasswordStrength)('TEST@1234');
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(result.errors).toContain('Password must contain at least one lowercase letter');
        });
        (0, vitest_1.it)('should reject password without number', () => {
            const result = (0, password_1.validatePasswordStrength)('Test@abcd');
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(result.errors).toContain('Password must contain at least one number');
        });
        (0, vitest_1.it)('should reject password without special character', () => {
            const result = (0, password_1.validatePasswordStrength)('Test12345');
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(result.errors).toContain('Password must contain at least one special character');
        });
        (0, vitest_1.it)('should return multiple errors for very weak password', () => {
            const result = (0, password_1.validatePasswordStrength)('abc');
            (0, vitest_1.expect)(result.isValid).toBe(false);
            (0, vitest_1.expect)(result.errors.length).toBeGreaterThanOrEqual(3);
        });
    });
});
//# sourceMappingURL=password.test.js.map