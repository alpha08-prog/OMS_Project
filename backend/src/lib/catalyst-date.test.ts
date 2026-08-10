import { describe, it, expect } from 'vitest';
import { toCatalystDate, nowCatalystIST } from './catalyst-client';

/**
 * REGRESSION SUITE for datetime writing.
 *
 * Catalyst datetime columns are timezone-naive, and Catalyst stamps its OWN
 * CREATEDTIME/MODIFIEDTIME in the project timezone (IST). Anything this app
 * writes must therefore also be IST, on every host.
 *
 * The original implementation used host-local getters, so an AppSail container
 * running UTC wrote UTC. Measured on real production rows:
 *     verifiedAt   = 2026-05-01 10:27:39   (ours, UTC)
 *     MODIFIEDTIME = 2026-05-01 15:57:39   (Catalyst, IST)
 * A silent 5h30m error on every action timestamp — which then sorted AND
 * displayed 5.5 hours early.
 *
 * These tests are written so they pass ONLY if the conversion is independent of
 * the machine's timezone.
 */
describe('toCatalystDate', () => {
  // The exact instant from the production row above.
  const INSTANT = new Date('2026-05-01T10:27:39.000Z');

  it('converts an instant to IST, not to host-local time', () => {
    // 10:27:39Z + 5:30 = 15:57:39. Must hold whether CI runs UTC or IST.
    expect(toCatalystDate(INSTANT)).toBe('2026-05-01 15:57:39');
  });

  it('gives the same answer for a Date and its ISO string', () => {
    expect(toCatalystDate(INSTANT)).toBe(toCatalystDate(INSTANT.toISOString()));
  });

  it('agrees with nowCatalystIST for "now"', () => {
    // Both stamp the current instant; they must not disagree by an offset.
    expect(toCatalystDate(new Date())).toBe(nowCatalystIST());
  });

  it('handles an explicit non-UTC offset by instant, not by wall clock', () => {
    // 2026-05-01T16:00:00+05:30 IS 10:30:00Z, i.e. 16:00:00 IST.
    expect(toCatalystDate('2026-05-01T16:00:00+05:30')).toBe('2026-05-01 16:00:00');
  });

  it('rolls the date over when the IST shift crosses midnight', () => {
    // 20:00Z + 5:30 = 01:30 the NEXT day.
    expect(toCatalystDate(new Date('2026-05-01T20:00:00.000Z'))).toBe('2026-05-02 01:30:00');
  });

  describe('date-only input means a DAY, not an instant', () => {
    // Regression: the old code parsed 'YYYY-MM-DD' as UTC midnight and then
    // applied the local offset, storing '2026-09-01 05:30:00' — a date field
    // carrying a spurious 5.5h time, wrong even on an IST host.
    it('keeps a bare date at midnight', () => {
      expect(toCatalystDate('2026-09-01')).toBe('2026-09-01 00:00:00');
    });

    it('never shifts a bare date into another day', () => {
      for (const d of ['2026-01-01', '2026-12-31', '2024-02-29']) {
        expect(toCatalystDate(d)).toBe(`${d} 00:00:00`);
      }
    });

    it('trims surrounding whitespace', () => {
      expect(toCatalystDate('  2026-09-01  ')).toBe('2026-09-01 00:00:00');
    });
  });

  describe('already-formatted values pass through unchanged', () => {
    // Re-parsing a zone-less string would shift it by the offset on every
    // round trip, so a row edited twice would drift 11 hours.
    it('passes through a Catalyst datetime', () => {
      expect(toCatalystDate('2026-09-01 07:15:00')).toBe('2026-09-01 07:15:00');
    });

    it('passes through Catalyst read-back form with colon-milliseconds', () => {
      expect(toCatalystDate('2026-07-13 15:41:05:801')).toBe('2026-07-13 15:41:05');
    });

    it('is idempotent — formatting twice equals formatting once', () => {
      const once = toCatalystDate(INSTANT) as string;
      expect(toCatalystDate(once)).toBe(once);
      expect(toCatalystDate(toCatalystDate(once) as string)).toBe(once);
    });
  });

  describe('rejects unusable input rather than inventing a date', () => {
    it.each([null, undefined, '', 'garbage', 'not-a-date'])('%s -> null', (v) => {
      expect(toCatalystDate(v as string | null)).toBeNull();
    });

    it('returns null for an Invalid Date', () => {
      expect(toCatalystDate(new Date('nope'))).toBeNull();
    });
  });

  it('always emits exactly `YYYY-MM-DD HH:mm:ss`', () => {
    const shape = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    for (const v of [INSTANT, '2026-09-01', '2026-09-01 07:15:00', new Date()]) {
      expect(toCatalystDate(v as Date | string)).toMatch(shape);
    }
  });
});
