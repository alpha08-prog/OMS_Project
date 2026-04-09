/**
 * Hash a plain text password
 */
export declare function hashPassword(password: string): Promise<string>;
/**
 * Compare plain text password with hashed password
 */
export declare function comparePassword(password: string, hashedPassword: string): Promise<boolean>;
/**
 * Validate password strength
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export declare function validatePasswordStrength(password: string): {
    isValid: boolean;
    errors: string[];
};
//# sourceMappingURL=password.d.ts.map