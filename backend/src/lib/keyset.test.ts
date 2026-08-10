import { describe, it, expect } from 'vitest';
import {
  encodeCursor,
  decodeCursor,
  keysetPredicate,
  keysetOrderBy,
} from './keyset';

describe('keyset cursors', () => {
  describe('encode/decode round-trip', () => {
    // REGRESSION: this is the REAL CREATEDTIME format, read off a live row —
    // milliseconds after a COLON. The first version of the validator assumed
    // plain 'HH:mm:ss' and rejected every genuine cursor, silently pinning
    // every list to page 1. Do not "simplify" this fixture.
    it('round-trips the real Catalyst CREATEDTIME format (ms after a colon)', () => {
      const c = { t: '2026-07-13 15:41:05:801', r: '37719000000507137' };
      expect(decodeCursor(encodeCursor(c))).toEqual(c);
    });

    it('round-trips a datetime cursor without milliseconds', () => {
      const c = { t: '2026-08-07 14:30:00', r: '37719000000049102' };
      expect(decodeCursor(encodeCursor(c))).toEqual(c);
    });

    it('round-trips a dot-separated millisecond form', () => {
      const c = { t: '2026-08-07 14:30:00.123', r: '999' };
      expect(decodeCursor(encodeCursor(c))).toEqual(c);
    });

    it('round-trips a date-only cursor', () => {
      const c = { t: '2026-08-07', r: '12345678' };
      expect(decodeCursor(encodeCursor(c))).toEqual(c);
    });

    // dateOfJourney stores midnight timestamps, verified on a live row.
    it('round-trips the dateOfJourney format used by the pending queue', () => {
      const c = { t: '2026-07-15 00:00:00', r: '37719000000507137' };
      expect(decodeCursor(encodeCursor(c))).toEqual(c);
    });

    it('normalises the ISO T separator so it matches stored rows', () => {
      const encoded = encodeCursor({ t: '2026-08-07T14:30:00', r: '999999' });
      expect(decodeCursor(encoded)).toEqual({ t: '2026-08-07 14:30:00', r: '999999' });
    });

    it('preserves ROWIDs beyond Number.MAX_SAFE_INTEGER as strings', () => {
      const big = '37719000000049102';
      const decoded = decodeCursor(encodeCursor({ t: '2026-01-01 00:00:00', r: big }));
      expect(decoded?.r).toBe(big);
    });
  });

  // A cursor is client-supplied and outlives deploys, so anything unparseable
  // must degrade to "first page" rather than throwing a 500 at the user.
  describe('rejects bad input by returning null', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['empty string', ''],
      ['not base64', '!!!not-base64!!!'],
      ['base64 of non-JSON', Buffer.from('hello').toString('base64url')],
      ['JSON array', Buffer.from('[1,2]').toString('base64url')],
      ['missing r', Buffer.from(JSON.stringify({ t: '2026-08-07 00:00:00' })).toString('base64url')],
      ['missing t', Buffer.from(JSON.stringify({ r: '123' })).toString('base64url')],
      ['numeric r instead of string', Buffer.from(JSON.stringify({ t: '2026-08-07 00:00:00', r: 123 })).toString('base64url')],
      ['malformed date', Buffer.from(JSON.stringify({ t: 'yesterday', r: '123' })).toString('base64url')],
    ])('%s → null', (_label, input) => {
      expect(decodeCursor(input as string | undefined)).toBeNull();
    });

    // `r` is interpolated into ZCQL as a BARE numeric literal (ZCQL has no
    // parameter binding), so this regex is the injection control, not a
    // formatting nicety. These must never round-trip.
    it.each([
      "1 OR 1=1",
      "1; DROP TABLE TrainRequest",
      "1' OR '1'='1",
      "-1",
      "1e5",
      "0x10",
      " 123 ",
    ])('rejects injection-shaped ROWID %j', (rowid) => {
      const encoded = Buffer.from(
        JSON.stringify({ t: '2026-08-07 00:00:00', r: rowid })
      ).toString('base64url');
      expect(decodeCursor(encoded)).toBeNull();
    });
  });

  describe('keysetPredicate', () => {
    const cursor = { t: '2026-08-07 14:30:00', r: '500' };

    it('seeks strictly backwards for newest-first', () => {
      expect(keysetPredicate('CREATEDTIME', cursor, 'newest')).toBe(
        "(CREATEDTIME < '2026-08-07 14:30:00' OR (CREATEDTIME = '2026-08-07 14:30:00' AND ROWID < 500))"
      );
    });

    it('seeks strictly forwards for oldest-first', () => {
      expect(keysetPredicate('CREATEDTIME', cursor, 'oldest')).toBe(
        "(CREATEDTIME > '2026-08-07 14:30:00' OR (CREATEDTIME = '2026-08-07 14:30:00' AND ROWID > 500))"
      );
    });

    // The tie half is what carries paging through a group of rows sharing one
    // timestamp — without it, a tie group spanning a page boundary drops rows.
    it('always includes the ROWID tiebreaker', () => {
      const sql = keysetPredicate('CREATEDTIME', cursor, 'newest');
      expect(sql).toContain('AND ROWID');
    });
  });

  describe('keysetOrderBy', () => {
    it('matches the predicate direction', () => {
      expect(keysetOrderBy('CREATEDTIME', 'newest')).toBe(
        'ORDER BY CREATEDTIME DESC, ROWID DESC'
      );
      expect(keysetOrderBy('CREATEDTIME', 'oldest')).toBe(
        'ORDER BY CREATEDTIME ASC, ROWID ASC'
      );
    });

    it('uses the same ROWID tiebreaker as the predicate, so ordering is total', () => {
      for (const sort of ['newest', 'oldest'] as const) {
        expect(keysetOrderBy('CREATEDTIME', sort)).toContain('ROWID');
      }
    });
  });
});
