import type { TokenPayload } from '../types';
/**
 * Generate JWT token for authenticated user
 */
export declare function generateToken(payload: TokenPayload): string;
/**
 * Verify and decode JWT token
 */
export declare function verifyToken(token: string): TokenPayload | null;
/**
 * Extract token from Authorization header
 */
export declare function extractToken(authHeader: string | undefined): string | null;
//# sourceMappingURL=jwt.d.ts.map