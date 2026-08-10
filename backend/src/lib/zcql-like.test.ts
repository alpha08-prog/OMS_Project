import { describe, it, expect } from 'vitest';
import { zcqlLike, zcqlLikeAny, zcqlLikeValue } from './catalyst-client';

/**
 * REGRESSION SUITE for the single most dangerous Catalyst ZCQL quirk.
 *
 * The wildcard is `*`, NOT `%`. Verified against the live datastore:
 *   passengerName LIKE 'ProbePax*'  -> 8 rows
 *   passengerName LIKE 'ProbePax%'  -> 0 rows, and NO error
 *
 * Because the wrong form fails silently, a broken search looks exactly like
 * "no matching records". Every LIKE condition must be built through these
 * helpers so the mistake cannot come back.
 */
describe('zcqlLike', () => {
  it('uses * as the wildcard, never %', () => {
    const sql = zcqlLike('passengerName', 'alice');
    expect(sql).toBe("passengerName LIKE '*alice*'");
    expect(sql).not.toContain('%');
  });

  it('anchors prefix mode on the left only', () => {
    expect(zcqlLike('pnrNumber', '8800', 'prefix')).toBe("pnrNumber LIKE '8800*'");
  });

  it('defaults to contains mode', () => {
    expect(zcqlLike('c', 'x')).toBe(zcqlLike('c', 'x', 'contains'));
  });

  // A '%' typed by a user is a LITERAL in ZCQL and must survive as one.
  it('passes a user-typed % through as a literal', () => {
    expect(zcqlLike('c', '50%')).toBe("c LIKE '*50%*'");
  });

  // '*' IS the wildcard and Catalyst offers no escape, so it must be stripped
  // or a user typing it silently turns their search into match-everything.
  it('strips user-supplied * so it cannot become a wildcard', () => {
    expect(zcqlLike('c', 'a*b')).toBe("c LIKE '*ab*'");
    expect(zcqlLike('c', '*')).toBe("c LIKE '**'");
    expect(zcqlLikeValue('***')).toBe('');
  });

  it('escapes single quotes (ZCQL has no parameter binding)', () => {
    expect(zcqlLike('c', "o'brien")).toBe("c LIKE '*o''brien*'");
  });

  it('escapes a quote-based injection attempt', () => {
    const sql = zcqlLike('name', "x' OR '1'='1");
    expect(sql).toBe("name LIKE '*x'' OR ''1''=''1*'");
  });
});

describe('zcqlLikeAny', () => {
  it('OR-chains and parenthesises multiple columns', () => {
    expect(zcqlLikeAny(['a', 'b'], 'q')).toBe("(a LIKE '*q*' OR b LIKE '*q*')");
  });

  it('omits the parens for a single column', () => {
    expect(zcqlLikeAny(['a'], 'q')).toBe("a LIKE '*q*'");
  });

  it('never emits a % wildcard for any column', () => {
    const sql = zcqlLikeAny(['a', 'b', 'c'], 'term');
    expect(sql).not.toContain('%');
    expect((sql.match(/\*/g) || []).length).toBe(6); // 2 per column
  });

  it('propagates prefix mode to every column', () => {
    expect(zcqlLikeAny(['a', 'b'], 'q', 'prefix')).toBe(
      "(a LIKE 'q*' OR b LIKE 'q*')"
    );
  });
});
