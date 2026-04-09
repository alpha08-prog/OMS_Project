import { Response } from 'express';
import type { ApiResponse } from '../types';
/**
 * Send success response
 */
export declare function sendSuccess<T>(res: Response, data: T, message?: string, statusCode?: number, meta?: ApiResponse['meta']): Response;
/**
 * Send error response
 */
export declare function sendError(res: Response, message: string, statusCode?: number, error?: string): Response;
/**
 * Send validation error response
 */
export declare function sendValidationError(res: Response, errors: Array<{
    field: string;
    message: string;
}>): Response;
/**
 * Send unauthorized response
 */
export declare function sendUnauthorized(res: Response, message?: string): Response;
/**
 * Send forbidden response
 */
export declare function sendForbidden(res: Response, message?: string): Response;
/**
 * Send not found response
 */
export declare function sendNotFound(res: Response, message?: string): Response;
/**
 * Send server error response
 */
export declare function sendServerError(res: Response, message?: string, error?: unknown): Response;
//# sourceMappingURL=response.d.ts.map