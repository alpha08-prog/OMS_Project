import { Request, ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { UserRole } from '@prisma/client';
interface StringParams extends ParamsDictionary {
    [key: string]: string;
}
interface StringQuery extends ParsedQs {
    [key: string]: string | undefined;
}
export interface AuthenticatedRequest extends Request<StringParams, any, any, StringQuery> {
    user?: {
        id: string;
        email: string;
        role: UserRole;
        name: string;
    };
}
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
export interface PaginationParams {
    page: number;
    limit: number;
    skip: number;
}
export interface LoginRequest {
    identifier: string;
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
export interface GrievanceFilters {
    status?: string;
    grievanceType?: string;
    constituency?: string;
    startDate?: Date;
    endDate?: Date;
    search?: string;
    isVerified?: string;
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
export interface EventFilters {
    search?: string;
    startDate?: string;
    endDate?: string;
    venue?: string;
    isCompleted?: string;
}
export {};
//# sourceMappingURL=index.d.ts.map