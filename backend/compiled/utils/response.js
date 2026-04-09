"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSuccess = sendSuccess;
exports.sendError = sendError;
exports.sendValidationError = sendValidationError;
exports.sendUnauthorized = sendUnauthorized;
exports.sendForbidden = sendForbidden;
exports.sendNotFound = sendNotFound;
exports.sendServerError = sendServerError;
/**
 * Send success response
 */
function sendSuccess(res, data, message = 'Success', statusCode = 200, meta) {
    const response = {
        success: true,
        message,
        data,
    };
    if (meta) {
        response.meta = meta;
    }
    return res.status(statusCode).json(response);
}
/**
 * Send error response
 */
function sendError(res, message, statusCode = 400, error) {
    const response = {
        success: false,
        message,
        error: error || message,
    };
    return res.status(statusCode).json(response);
}
/**
 * Send validation error response
 */
function sendValidationError(res, errors) {
    return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors,
    });
}
/**
 * Send unauthorized response
 */
function sendUnauthorized(res, message = 'Unauthorized access') {
    return sendError(res, message, 401);
}
/**
 * Send forbidden response
 */
function sendForbidden(res, message = 'Access forbidden') {
    return sendError(res, message, 403);
}
/**
 * Send not found response
 */
function sendNotFound(res, message = 'Resource not found') {
    return sendError(res, message, 404);
}
/**
 * Send server error response
 */
function sendServerError(res, message = 'Internal server error', error) {
    console.error('Server Error:', error);
    return sendError(res, message, 500);
}
//# sourceMappingURL=response.js.map