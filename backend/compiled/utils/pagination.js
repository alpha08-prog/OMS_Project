"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQueryString = getQueryString;
exports.getParamString = getParamString;
exports.parsePagination = parsePagination;
exports.getPagination = getPagination;
exports.calculatePaginationMeta = calculatePaginationMeta;
exports.getPaginatedResponse = getPaginatedResponse;
/**
 * Safely extract a string from query/params (handles string | string[] | undefined)
 */
function getQueryString(value) {
    if (Array.isArray(value)) {
        return value[0];
    }
    return value;
}
/**
 * Safely extract a required string from params (handles string | string[] | undefined)
 * Returns empty string if undefined
 */
function getParamString(value) {
    if (Array.isArray(value)) {
        return value[0] || '';
    }
    return value || '';
}
/**
 * Parse pagination parameters from query string
 */
function parsePagination(query) {
    const pageStr = getQueryString(query.page);
    const limitStr = getQueryString(query.limit);
    const parsedPage = parseInt(pageStr || '1', 10);
    const parsedLimit = parseInt(limitStr || '10', 10);
    const page = Math.max(1, isNaN(parsedPage) ? 1 : parsedPage);
    const limit = Math.min(1000, Math.max(1, isNaN(parsedLimit) ? 10 : parsedLimit));
    const skip = (page - 1) * limit;
    return { page, limit, skip };
}
/**
 * Alias for parsePagination (for backward compatibility)
 */
function getPagination(query) {
    return parsePagination({
        page: query.page,
        limit: query.limit,
    });
}
/**
 * Calculate pagination metadata
 */
function calculatePaginationMeta(total, page, limit) {
    return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
    };
}
/**
 * Get paginated response format
 */
function getPaginatedResponse(data, total, page, limit) {
    return {
        success: true,
        data,
        pagination: calculatePaginationMeta(total, page, limit),
    };
}
//# sourceMappingURL=pagination.js.map