"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const response_1 = require("./response");
function createMockRes() {
    const res = {};
    res.status = vitest_1.vi.fn().mockReturnValue(res);
    res.json = vitest_1.vi.fn().mockReturnValue(res);
    return res;
}
(0, vitest_1.describe)('Response Utils', () => {
    (0, vitest_1.describe)('sendSuccess', () => {
        (0, vitest_1.it)('should send 200 with success true and data', () => {
            const res = createMockRes();
            (0, response_1.sendSuccess)(res, { foo: 'bar' }, 'OK');
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
            (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({
                success: true,
                message: 'OK',
                data: { foo: 'bar' },
            });
        });
        (0, vitest_1.it)('should include meta when provided', () => {
            const res = createMockRes();
            const meta = { page: 1, limit: 10, total: 50, totalPages: 5 };
            (0, response_1.sendSuccess)(res, [], 'OK', 200, meta);
            (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ meta }));
        });
        (0, vitest_1.it)('should allow custom status code', () => {
            const res = createMockRes();
            (0, response_1.sendSuccess)(res, null, 'Created', 201);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(201);
        });
    });
    (0, vitest_1.describe)('sendError', () => {
        (0, vitest_1.it)('should send 400 with success false', () => {
            const res = createMockRes();
            (0, response_1.sendError)(res, 'Bad request');
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(400);
            (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Bad request',
                error: 'Bad request',
            });
        });
        (0, vitest_1.it)('should allow custom status code', () => {
            const res = createMockRes();
            (0, response_1.sendError)(res, 'Conflict', 409);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(409);
        });
    });
    (0, vitest_1.describe)('sendUnauthorized', () => {
        (0, vitest_1.it)('should send 401', () => {
            const res = createMockRes();
            (0, response_1.sendUnauthorized)(res);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(401);
        });
    });
    (0, vitest_1.describe)('sendForbidden', () => {
        (0, vitest_1.it)('should send 403', () => {
            const res = createMockRes();
            (0, response_1.sendForbidden)(res, 'No access');
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(403);
        });
    });
    (0, vitest_1.describe)('sendNotFound', () => {
        (0, vitest_1.it)('should send 404', () => {
            const res = createMockRes();
            (0, response_1.sendNotFound)(res);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(404);
        });
    });
    (0, vitest_1.describe)('sendServerError', () => {
        (0, vitest_1.it)('should send 500', () => {
            const res = createMockRes();
            const consoleSpy = vitest_1.vi.spyOn(console, 'error').mockImplementation(() => { });
            (0, response_1.sendServerError)(res, 'Boom', new Error('fail'));
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(500);
            consoleSpy.mockRestore();
        });
    });
    (0, vitest_1.describe)('sendValidationError', () => {
        (0, vitest_1.it)('should send 422 with errors array', () => {
            const res = createMockRes();
            (0, response_1.sendValidationError)(res, [{ field: 'email', message: 'Required' }]);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(422);
            (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Validation failed',
                errors: [{ field: 'email', message: 'Required' }],
            });
        });
    });
});
//# sourceMappingURL=response.test.js.map