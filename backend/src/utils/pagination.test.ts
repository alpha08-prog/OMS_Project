import { describe, it, expect } from 'vitest';
import { parsePagination, calculatePaginationMeta } from './pagination';

describe('parsePagination', () => {
  it('defaults to page 1 and limit 10', () => {
    const result = parsePagination({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.skip).toBe(0);
  });

  it('parses valid page and limit', () => {
    const result = parsePagination({ page: '3', limit: '25' });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(25);
    expect(result.skip).toBe(50);
  });

  it('clamps limit to max 1000', () => {
    const result = parsePagination({ limit: '9999' });
    expect(result.limit).toBe(1000);
  });

  it('clamps limit to min 1', () => {
    const result = parsePagination({ limit: '0' });
    expect(result.limit).toBe(1);
  });

  it('clamps page to min 1', () => {
    const result = parsePagination({ page: '-5' });
    expect(result.page).toBe(1);
  });

  it('handles non-numeric strings gracefully', () => {
    const result = parsePagination({ page: 'abc', limit: 'xyz' });
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it('accepts limit: 1000 exactly', () => {
    const result = parsePagination({ limit: '1000' });
    expect(result.limit).toBe(1000);
  });

  it('computes correct skip for page 2, limit 20', () => {
    const result = parsePagination({ page: '2', limit: '20' });
    expect(result.skip).toBe(20);
  });
});

describe('calculatePaginationMeta', () => {
  it('computes totalPages correctly', () => {
    const meta = calculatePaginationMeta(50, 1, 10);
    expect(meta.totalPages).toBe(5);
    expect(meta.total).toBe(50);
    expect(meta.page).toBe(1);
    expect(meta.limit).toBe(10);
  });

  it('rounds up for non-even totals', () => {
    const meta = calculatePaginationMeta(11, 1, 10);
    expect(meta.totalPages).toBe(2);
  });

  it('returns 0 totalPages for empty result', () => {
    const meta = calculatePaginationMeta(0, 1, 10);
    expect(meta.totalPages).toBe(0);
  });
});
