"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const jwt_1 = require("./jwt");
(0, vitest_1.describe)('JWT Utils', () => {
    const testPayload = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'ADMIN',
        name: 'Test User',
    };
    (0, vitest_1.describe)('generateToken', () => {
        (0, vitest_1.it)('should return a non-empty JWT string', () => {
            const token = (0, jwt_1.generateToken)(testPayload);
            (0, vitest_1.expect)(token).toBeTruthy();
            (0, vitest_1.expect)(typeof token).toBe('string');
            // JWT has 3 parts separated by dots
            (0, vitest_1.expect)(token.split('.').length).toBe(3);
        });
    });
    (0, vitest_1.describe)('verifyToken', () => {
        (0, vitest_1.it)('should decode a valid token and return the payload', () => {
            const token = (0, jwt_1.generateToken)(testPayload);
            const decoded = (0, jwt_1.verifyToken)(token);
            (0, vitest_1.expect)(decoded).not.toBeNull();
            (0, vitest_1.expect)(decoded.id).toBe(testPayload.id);
            (0, vitest_1.expect)(decoded.email).toBe(testPayload.email);
            (0, vitest_1.expect)(decoded.role).toBe(testPayload.role);
            (0, vitest_1.expect)(decoded.name).toBe(testPayload.name);
        });
        (0, vitest_1.it)('should return null for an invalid token', () => {
            const decoded = (0, jwt_1.verifyToken)('invalid.token.here');
            (0, vitest_1.expect)(decoded).toBeNull();
        });
        (0, vitest_1.it)('should return null for an empty string', () => {
            const decoded = (0, jwt_1.verifyToken)('');
            (0, vitest_1.expect)(decoded).toBeNull();
        });
        (0, vitest_1.it)('should return null for a tampered token', () => {
            const token = (0, jwt_1.generateToken)(testPayload);
            const tampered = token.slice(0, -5) + 'xxxxx';
            const decoded = (0, jwt_1.verifyToken)(tampered);
            (0, vitest_1.expect)(decoded).toBeNull();
        });
    });
    (0, vitest_1.describe)('extractToken', () => {
        (0, vitest_1.it)('should extract token from valid Bearer header', () => {
            const token = (0, jwt_1.extractToken)('Bearer my-jwt-token');
            (0, vitest_1.expect)(token).toBe('my-jwt-token');
        });
        (0, vitest_1.it)('should return null for missing header', () => {
            (0, vitest_1.expect)((0, jwt_1.extractToken)(undefined)).toBeNull();
        });
        (0, vitest_1.it)('should return null for non-Bearer header', () => {
            (0, vitest_1.expect)((0, jwt_1.extractToken)('Basic abc123')).toBeNull();
        });
        (0, vitest_1.it)('should return null for empty string', () => {
            (0, vitest_1.expect)((0, jwt_1.extractToken)('')).toBeNull();
        });
        (0, vitest_1.it)('should handle Bearer with long token', () => {
            const longToken = 'a'.repeat(500);
            const token = (0, jwt_1.extractToken)(`Bearer ${longToken}`);
            (0, vitest_1.expect)(token).toBe(longToken);
        });
    });
});
//# sourceMappingURL=jwt.test.js.map