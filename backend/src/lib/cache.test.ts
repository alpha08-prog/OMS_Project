import { describe, it, expect, beforeEach } from 'vitest';
import { cacheGet, cacheSet, cacheDelete, cacheClear } from './cache';

describe('In-Memory Cache', () => {
  beforeEach(() => {
    cacheClear();
  });

  it('should return null for missing key', () => {
    expect(cacheGet('nonexistent')).toBeNull();
  });

  it('should store and retrieve value', () => {
    cacheSet('key1', { name: 'test' }, 60);
    expect(cacheGet('key1')).toEqual({ name: 'test' });
  });

  it('should return null for expired entry', async () => {
    cacheSet('expiring', 'data', 0); // 0-second TTL = already expired
    // Small delay to ensure expiry
    await new Promise((r) => setTimeout(r, 10));
    expect(cacheGet('expiring')).toBeNull();
  });

  it('should delete a specific key', () => {
    cacheSet('a', 1, 60);
    cacheSet('b', 2, 60);
    cacheDelete('a');
    expect(cacheGet('a')).toBeNull();
    expect(cacheGet('b')).toBe(2);
  });

  it('should clear all keys', () => {
    cacheSet('x', 1, 60);
    cacheSet('y', 2, 60);
    cacheClear();
    expect(cacheGet('x')).toBeNull();
    expect(cacheGet('y')).toBeNull();
  });

  it('should clear keys by prefix', () => {
    cacheSet('calendar_events_user1', [1], 60);
    cacheSet('calendar_events_user2', [2], 60);
    cacheSet('dashboard_stats', {}, 60);
    cacheClear('calendar_events_');
    expect(cacheGet('calendar_events_user1')).toBeNull();
    expect(cacheGet('calendar_events_user2')).toBeNull();
    expect(cacheGet('dashboard_stats')).toEqual({});
  });

  it('should overwrite existing key', () => {
    cacheSet('key', 'old', 60);
    cacheSet('key', 'new', 60);
    expect(cacheGet('key')).toBe('new');
  });
});
