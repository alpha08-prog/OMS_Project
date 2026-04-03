import { describe, it, expect, vi } from 'vitest';
import { sendSuccess, sendError, sendUnauthorized, sendForbidden, sendNotFound, sendServerError, sendValidationError } from './response';

function createMockRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as unknown as import('express').Response;
}

describe('Response Utils', () => {
  describe('sendSuccess', () => {
    it('should send 200 with success true and data', () => {
      const res = createMockRes();
      sendSuccess(res, { foo: 'bar' }, 'OK');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'OK',
        data: { foo: 'bar' },
      });
    });

    it('should include meta when provided', () => {
      const res = createMockRes();
      const meta = { page: 1, limit: 10, total: 50, totalPages: 5 };
      sendSuccess(res, [], 'OK', 200, meta);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ meta }));
    });

    it('should allow custom status code', () => {
      const res = createMockRes();
      sendSuccess(res, null, 'Created', 201);
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('sendError', () => {
    it('should send 400 with success false', () => {
      const res = createMockRes();
      sendError(res, 'Bad request');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Bad request',
        error: 'Bad request',
      });
    });

    it('should allow custom status code', () => {
      const res = createMockRes();
      sendError(res, 'Conflict', 409);
      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe('sendUnauthorized', () => {
    it('should send 401', () => {
      const res = createMockRes();
      sendUnauthorized(res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('sendForbidden', () => {
    it('should send 403', () => {
      const res = createMockRes();
      sendForbidden(res, 'No access');
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('sendNotFound', () => {
    it('should send 404', () => {
      const res = createMockRes();
      sendNotFound(res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('sendServerError', () => {
    it('should send 500', () => {
      const res = createMockRes();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      sendServerError(res, 'Boom', new Error('fail'));
      expect(res.status).toHaveBeenCalledWith(500);
      consoleSpy.mockRestore();
    });
  });

  describe('sendValidationError', () => {
    it('should send 422 with errors array', () => {
      const res = createMockRes();
      sendValidationError(res, [{ field: 'email', message: 'Required' }]);
      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Validation failed',
        errors: [{ field: 'email', message: 'Required' }],
      });
    });
  });
});
