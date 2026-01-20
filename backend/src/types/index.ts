import { Request } from 'express';
import { UserRole } from '@prisma/client';

// Extend Express Request to include user
export interface AuthenticatedRequest extends Request {
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
    total?: number;
    totalPages?: number;
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
