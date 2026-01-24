import type { PaginationParams } from '../types';

/**
 * Safely extract a string from query/params (handles string | string[] | undefined)
 */
export function getQueryString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * Safely extract a required string from params (handles string | string[] | undefined)
 * Returns empty string if undefined
 */
export function getParamString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] || '';
  }
  return value || '';
}

/**
 * Parse pagination parameters from query string
 */
export function parsePagination(
  query: { page?: string | string[]; limit?: string | string[] }
): PaginationParams {
  const pageStr = getQueryString(query.page);
  const limitStr = getQueryString(query.limit);
  const page = Math.max(1, parseInt(pageStr || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(limitStr || '10', 10)));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

/**
 * Alias for parsePagination (for backward compatibility)
 */
export function getPagination(query: Record<string, any>): PaginationParams {
  return parsePagination({
    page: query.page,
    limit: query.limit,
  });
}

/**
 * Calculate pagination metadata
 */
export function calculatePaginationMeta(
  total: number,
  page: number,
  limit: number
) {
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
export function getPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
) {
  return {
    success: true,
    data,
    pagination: calculatePaginationMeta(total, page, limit),
  };
}
