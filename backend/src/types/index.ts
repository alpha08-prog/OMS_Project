import { Request, ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';

/**
 * User role — runtime const (for `UserRole.STAFF` style usage) plus
 * type alias (for `role: UserRole` in interfaces / function signatures).
 */
export const UserRole = {
  STAFF: 'STAFF',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// Custom params type that always returns string
interface StringParams extends ParamsDictionary {
  [key: string]: string;
}

// Custom query type that returns string | undefined
interface StringQuery extends ParsedQs {
  [key: string]: string | undefined;
}

// Extend Express Request to include user with properly typed params/query
export interface AuthenticatedRequest extends Request<StringParams, any, any, StringQuery> {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    name: string;
  };
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  meta?: {
    page?: number;
    limit?: number;
    /**
     * Total matching rows. Present ONLY when it is a real count.
     *
     * MUST NOT be derived from the page contents. The idiom
     * `total = skip + rows.length + (hasMore ? 1 : 0)` looks like a total but
     * can never exceed currentPage + 1, so any pager built on it caps itself
     * at two pages and hides the rest of the table. It is optional precisely
     * so that "unknown" is representable and the lie is not.
     */
    total?: number;
    /** False when the count could not be obtained — render without a total. */
    totalKnown?: boolean;
    totalPages?: number;
    /** Rows in THIS page. Always honest, unlike `total`. */
    count?: number;
    /** Whether another page exists after this one. */
    hasMore?: boolean;
    // For cursor-based pagination (keyset). Returned by endpoints whose result
    // set has no fixed total — `null` when the last page has been reached.
    nextCursor?: string | null;
    /** Sort direction the rows were returned in. */
    sort?: 'newest' | 'oldest';
  };
}

// Pagination
export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

// Auth types
export interface LoginRequest {
  identifier: string; // email or phone
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role?: UserRole;
}

export interface TokenPayload {
  id: string;
  email: string;
  role: UserRole;
  name: string;
}

// Stats types
export interface DashboardStats {
  grievances: {
    total: number;
    open: number;
    inProgress: number;
    verified: number;
    resolved: number;
    pendingVerification: number;
  };
  visitors: {
    total: number;
    today: number;
  };
  trainRequests: {
    total: number;
    pending: number;
    approved: number;
  };
  news: {
    total: number;
    critical: number;
  };
  tourPrograms: {
    total: number;
    upcoming: number;
    pending: number;
  };
  birthdays: {
    today: number;
  };
}

// Query filters
export interface GrievanceFilters {
  status?: string;
  grievanceType?: string;
  constituency?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  isVerified?: string;
  priority?: string;
  source?: string;
}

export interface VisitorFilters {
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

export interface NewsFilters {
  priority?: string;
  category?: string;
  region?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface TrainRequestFilters {
  status?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

export interface TourProgramFilters {
  decision?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

export interface EventFilters {
  search?: string;
  startDate?: string;
  endDate?: string;
  venue?: string;
  isCompleted?: string;
}
