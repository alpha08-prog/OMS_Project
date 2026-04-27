import { Request, Response, NextFunction } from 'express';

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode = 400, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  console.error('Error:', err);

  // Default error values
  let statusCode = 500;
  let message = 'Internal server error';
  let error = err.message;

  // Handle ApiError
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
  }

  // Handle Catalyst REST errors (thrown by lib/catalyst-client.ts with
  // statusCode set on the Error instance).
  if (typeof err.statusCode === 'number' && err.statusCode >= 400) {
    statusCode = err.statusCode;
    if (statusCode === 409) message = 'A record with this value already exists';
    else if (statusCode === 404) message = 'Record not found';
    else if (statusCode === 400) message = err.message ?? 'Invalid data provided';
    else message = 'Database error';
    error = err.message;
  }

  // Handle validation errors from express-validator
  if (err.name === 'ValidationError') {
    statusCode = 422;
    message = 'Validation failed';
  }

  // Send response
  res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? error : undefined,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
}

/**
 * Handle 404 Not Found
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}
