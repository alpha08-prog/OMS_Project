import { Response } from 'express';
import type { ApiResponse } from '../types';

/**
 * Send success response
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Success',
  statusCode = 200,
  meta?: ApiResponse['meta']
): Response {
  const response: ApiResponse<T> = {
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
export function sendError(
  res: Response,
  message: string,
  statusCode = 400,
  error?: string
): Response {
  const response: ApiResponse = {
    success: false,
    message,
    error: error || message,
  };

  return res.status(statusCode).json(response);
}

/**
 * Send validation error response
 */
export function sendValidationError(
  res: Response,
  errors: Array<{ field: string; message: string }>
): Response {
  return res.status(422).json({
    success: false,
    message: 'Validation failed',
    errors,
  });
}

/**
 * Send unauthorized response
 */
export function sendUnauthorized(
  res: Response,
  message = 'Unauthorized access'
): Response {
  return sendError(res, message, 401);
}

/**
 * Send forbidden response
 */
export function sendForbidden(
  res: Response,
  message = 'Access forbidden'
): Response {
  return sendError(res, message, 403);
}

/**
 * Send not found response
 */
export function sendNotFound(
  res: Response,
  message = 'Resource not found'
): Response {
  return sendError(res, message, 404);
}

/**
 * Send server error response
 */
export function sendServerError(
  res: Response,
  message = 'Internal server error',
  error?: unknown
): Response {
  console.error('Server Error:', error);
  return sendError(res, message, 500);
}
