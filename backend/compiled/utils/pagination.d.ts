import type { PaginationParams } from '../types';
/**
 * Safely extract a string from query/params (handles string | string[] | undefined)
 */
export declare function getQueryString(value: string | string[] | undefined): string | undefined;
/**
 * Safely extract a required string from params (handles string | string[] | undefined)
 * Returns empty string if undefined
 */
export declare function getParamString(value: string | string[] | undefined): string;
/**
 * Parse pagination parameters from query string
 */
export declare function parsePagination(query: {
    page?: string | string[];
    limit?: string | string[];
}): PaginationParams;
/**
 * Alias for parsePagination (for backward compatibility)
 */
export declare function getPagination(query: Record<string, any>): PaginationParams;
/**
 * Calculate pagination metadata
 */
export declare function calculatePaginationMeta(total: number, page: number, limit: number): {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
};
/**
 * Get paginated response format
 */
export declare function getPaginatedResponse<T>(data: T[], total: number, page: number, limit: number): {
    success: boolean;
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
};
//# sourceMappingURL=pagination.d.ts.map