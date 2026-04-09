"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const pagination_1 = require("./pagination");
(0, vitest_1.describe)('parsePagination', () => {
    (0, vitest_1.it)('defaults to page 1 and limit 10', () => {
        const result = (0, pagination_1.parsePagination)({});
        (0, vitest_1.expect)(result.page).toBe(1);
        (0, vitest_1.expect)(result.limit).toBe(10);
        (0, vitest_1.expect)(result.skip).toBe(0);
    });
    (0, vitest_1.it)('parses valid page and limit', () => {
        const result = (0, pagination_1.parsePagination)({ page: '3', limit: '25' });
        (0, vitest_1.expect)(result.page).toBe(3);
        (0, vitest_1.expect)(result.limit).toBe(25);
        (0, vitest_1.expect)(result.skip).toBe(50);
    });
    (0, vitest_1.it)('clamps limit to max 1000', () => {
        const result = (0, pagination_1.parsePagination)({ limit: '9999' });
        (0, vitest_1.expect)(result.limit).toBe(1000);
    });
    (0, vitest_1.it)('clamps limit to min 1', () => {
        const result = (0, pagination_1.parsePagination)({ limit: '0' });
        (0, vitest_1.expect)(result.limit).toBe(1);
    });
    (0, vitest_1.it)('clamps page to min 1', () => {
        const result = (0, pagination_1.parsePagination)({ page: '-5' });
        (0, vitest_1.expect)(result.page).toBe(1);
    });
    (0, vitest_1.it)('handles non-numeric strings gracefully', () => {
        const result = (0, pagination_1.parsePagination)({ page: 'abc', limit: 'xyz' });
        (0, vitest_1.expect)(result.page).toBe(1);
        (0, vitest_1.expect)(result.limit).toBe(10);
    });
    (0, vitest_1.it)('accepts limit: 1000 exactly', () => {
        const result = (0, pagination_1.parsePagination)({ limit: '1000' });
        (0, vitest_1.expect)(result.limit).toBe(1000);
    });
    (0, vitest_1.it)('computes correct skip for page 2, limit 20', () => {
        const result = (0, pagination_1.parsePagination)({ page: '2', limit: '20' });
        (0, vitest_1.expect)(result.skip).toBe(20);
    });
});
(0, vitest_1.describe)('calculatePaginationMeta', () => {
    (0, vitest_1.it)('computes totalPages correctly', () => {
        const meta = (0, pagination_1.calculatePaginationMeta)(50, 1, 10);
        (0, vitest_1.expect)(meta.totalPages).toBe(5);
        (0, vitest_1.expect)(meta.total).toBe(50);
        (0, vitest_1.expect)(meta.page).toBe(1);
        (0, vitest_1.expect)(meta.limit).toBe(10);
    });
    (0, vitest_1.it)('rounds up for non-even totals', () => {
        const meta = (0, pagination_1.calculatePaginationMeta)(11, 1, 10);
        (0, vitest_1.expect)(meta.totalPages).toBe(2);
    });
    (0, vitest_1.it)('returns 0 totalPages for empty result', () => {
        const meta = (0, pagination_1.calculatePaginationMeta)(0, 1, 10);
        (0, vitest_1.expect)(meta.totalPages).toBe(0);
    });
});
//# sourceMappingURL=pagination.test.js.map