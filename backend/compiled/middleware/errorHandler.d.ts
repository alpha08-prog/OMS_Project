import { Request, Response, NextFunction } from 'express';
/**
 * Custom error class for API errors
 */
export declare class ApiError extends Error {
    statusCode: number;
    isOperational: boolean;
    constructor(message: string, statusCode?: number, isOperational?: boolean);
}
/**
 * Global error handler middleware
 */
export declare function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void;
/**
 * Handle 404 Not Found
 */
export declare function notFoundHandler(req: Request, res: Response): void;
//# sourceMappingURL=errorHandler.d.ts.map