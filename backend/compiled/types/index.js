"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRole = void 0;
/**
 * User role — declared locally so the codebase is decoupled from Prisma.
 * Provides both a runtime const (for `UserRole.STAFF` style usage) and a
 * type alias (for `role: UserRole` in interfaces / function signatures).
 */
exports.UserRole = {
    STAFF: 'STAFF',
    ADMIN: 'ADMIN',
    SUPER_ADMIN: 'SUPER_ADMIN',
};
//# sourceMappingURL=index.js.map