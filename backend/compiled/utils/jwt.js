"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = generateToken;
exports.verifyToken = verifyToken;
exports.extractToken = extractToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = __importDefault(require("../config"));
/**
 * Generate JWT token for authenticated user
 */
function generateToken(payload) {
    return jsonwebtoken_1.default.sign(payload, config_1.default.jwtSecret, {
        expiresIn: config_1.default.jwtExpiresIn,
    });
}
/**
 * Verify and decode JWT token
 */
function verifyToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.default.jwtSecret);
        return decoded;
    }
    catch (error) {
        return null;
    }
}
/**
 * Extract token from Authorization header
 */
function extractToken(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.substring(7);
}
//# sourceMappingURL=jwt.js.map