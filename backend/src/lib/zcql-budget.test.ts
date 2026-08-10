import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  MAX_ZCQL_CONDITIONS,
  countZcqlConditions,
  assertConditionBudget,
  zcqlSearchWithinBudget,
  dateRangeClauses,
  zcqlAnyOf,
} from './catalyst-client';

/**
 * REGRESSION SUITE for the ZCQL 10-condition ceiling.
 *
 * Catalyst rejects a WHERE clause with more than 10 leaf conditions:
 *   "More than 10 conditions are not allowed in the query"
 * VERIFIED live. OR and AND share ONE budget of 10; parentheses do not create
 * a new one. It is a hard 400, so an over-budget query returns NOTHING —
 * indistinguishable from "no matching records" unless something checks.
 *
 * This is what made a 25-id child fetch silently return zero rows.
 */
describe('ZCQL condition budget', () => {
  afterEach(() => vi.restoreAllMocks());

  it('documents the platform ceiling', () => {
    expect(MAX_ZCQL_CONDITIONS).toBe(10);
  });

  describe('countZcqlConditions', () => {
    it('counts a simple equality', () => {
      expect(countZcqlConditions([`status = 'OPEN'`])).toBe(1);
    });

    it('counts OR terms individually', () => {
      expect(countZcqlConditions([zcqlAnyOf('createdById', ['1', '2', '3'])])).toBe(3);
    });

    it('counts LIKE conditions', () => {
      expect(countZcqlConditions([`(a LIKE '*x*' OR b LIKE '*x*')`])).toBe(2);
    });

    it('counts across separate AND-ed clauses', () => {
      expect(
        countZcqlConditions([`status = 'OPEN'`, `a LIKE '*x*'`, `b >= '2026-01-01'`])
      ).toBe(3);
    });

    // REGRESSION: operators inside USER DATA must not be counted as structure.
    // A user searching for "like" or ">=" used to inflate their own query's
    // condition count — which both narrowed their search silently and, past the
    // budget, turned the search box into an HTTP 500.
    describe('ignores operators inside quoted literals', () => {
      it('does not count LIKE appearing in the search text', () => {
        expect(countZcqlConditions([`name LIKE '*like*'`])).toBe(1);
      });

      it('does not count comparison operators in the search text', () => {
        expect(countZcqlConditions([`name LIKE '*>= <= != <>*'`])).toBe(1);
      });

      it('handles escaped quotes in the literal', () => {
        // zcqlEscapeValue turns o'brien into o''brien.
        expect(countZcqlConditions([`name LIKE '*o''brien >= LIKE*'`])).toBe(1);
      });

      it('counts a multi-column search once per column, not per operator in the term', () => {
        const term = "o''brien * % _ LIKE >= AND OR";
        const clause =
          `(title LIKE '*${term}*' OR location LIKE '*${term}*' ` +
          `OR attendees LIKE '*${term}*' OR agenda LIKE '*${term}*')`;
        expect(countZcqlConditions([clause])).toBe(4);
      });

      // The exact request that produced a 500 before this fix.
      it('keeps a fully-filtered meeting query within budget', () => {
        const term = "o''brien * % _ LIKE >= AND OR";
        const clauses = [
          `(status = 'SCHEDULED' OR status IS NULL)`,
          `(dateTime >= '2026-01-01 00:00:00' OR dateTime IS NULL)`,
          ...dateRangeClauses('dateTime', '2024-01-01', '2026-12-31'),
          `(title LIKE '*${term}*' OR location LIKE '*${term}*' ` +
            `OR attendees LIKE '*${term}*' OR agenda LIKE '*${term}*')`,
        ];
        expect(countZcqlConditions(clauses)).toBeLessThanOrEqual(MAX_ZCQL_CONDITIONS);
        expect(() => assertConditionBudget(clauses, 'meeting list')).not.toThrow();
      });
    });

    // The exact shape that fails live: 7 search columns + status + 2 dates = 10,
    // and a single ownership alias tips it to 11.
    it('counts the real grievance search shape', () => {
      const search = [
        'petitionerName', 'mobileNumber', 'description', 'grievanceNumber',
        'constituency', 'wardVillage', 'grievanceType',
      ].map((c) => `${c} LIKE '*q*'`).join(' OR ');
      const clauses = [
        `(${search})`,
        `status = 'OPEN'`,
        ...dateRangeClauses('CREATEDTIME', '2026-01-01', '2026-12-31'),
      ];
      expect(countZcqlConditions(clauses)).toBe(10);
      clauses.push(zcqlAnyOf('createdById', ['abc']));
      expect(countZcqlConditions(clauses)).toBe(11);
      expect(countZcqlConditions(clauses)).toBeGreaterThan(MAX_ZCQL_CONDITIONS);
    });
  });

  describe('assertConditionBudget', () => {
    it('passes at exactly the limit', () => {
      const at = Array.from({ length: 10 }, (_, i) => `c${i} = '1'`);
      expect(() => assertConditionBudget(at)).not.toThrow();
    });

    it('throws one past the limit, naming the context', () => {
      const over = Array.from({ length: 11 }, (_, i) => `c${i} = '1'`);
      expect(() => assertConditionBudget(over, 'grievance list')).toThrow(/grievance list/);
      expect(() => assertConditionBudget(over)).toThrow(/11 conditions/);
    });
  });

  describe('zcqlSearchWithinBudget', () => {
    it('keeps every column when there is room', () => {
      const { clause, dropped } = zcqlSearchWithinBudget(['a', 'b', 'c'], 'q', 0);
      expect(dropped).toEqual([]);
      expect(clause).toContain('a LIKE');
      expect(clause).toContain('c LIKE');
    });

    // Shedding must be priority-ordered: callers list the most identifying
    // columns first precisely so those survive.
    it('drops lowest-priority columns to fit, keeping the leading ones', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cols = ['ref', 'name', 'phone', 'notes', 'extra'];
      const { clause, dropped } = zcqlSearchWithinBudget(cols, 'q', 7);
      expect(dropped).toEqual(['notes', 'extra']);
      expect(clause).toContain('ref LIKE');
      expect(clause).toContain('phone LIKE');
      expect(clause).not.toContain('notes LIKE');
    });

    it('warns when it sheds, so the narrowing is never silent', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      zcqlSearchWithinBudget(['a', 'b', 'c'], 'q', 9);
      expect(warn).toHaveBeenCalled();
      expect(String(warn.mock.calls[0][0])).toMatch(/not searching: b, c/);
    });

    it('returns a null clause when no budget remains', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { clause, dropped } = zcqlSearchWithinBudget(['a', 'b'], 'q', 10);
      expect(clause).toBeNull();
      expect(dropped).toEqual(['a', 'b']);
    });

    it('never emits a clause that would exceed the budget on its own', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      for (let used = 0; used <= 10; used++) {
        const cols = Array.from({ length: 15 }, (_, i) => `c${i}`);
        const { clause } = zcqlSearchWithinBudget(cols, 'q', used);
        const cost = clause ? countZcqlConditions([clause]) : 0;
        expect(used + cost).toBeLessThanOrEqual(MAX_ZCQL_CONDITIONS);
      }
    });
  });
});

/**
 * Date bounds. Two separate traps, both of which DROP rows silently:
 * a midnight `<=` bound excludes the whole end day, and a `23:59:59` bound
 * still excludes the final second because CREATEDTIME carries milliseconds
 * after a COLON ('2026-07-13 15:41:05:801' sorts after '...:59:59').
 */
describe('dateRangeClauses', () => {
  it('uses a half-open upper bound at the NEXT day midnight', () => {
    const c = dateRangeClauses('CREATEDTIME', '2026-08-07', '2026-08-07');
    expect(c).toEqual([
      "CREATEDTIME >= '2026-08-07 00:00:00'",
      "CREATEDTIME < '2026-08-08 00:00:00'",
    ]);
  });

  it('never emits a <= upper bound (that form drops the end day)', () => {
    const c = dateRangeClauses('CREATEDTIME', '2026-01-01', '2026-12-31');
    expect(c.join(' ')).not.toContain('<=');
    expect(c[1]).toBe("CREATEDTIME < '2027-01-01 00:00:00'");
  });

  it('rolls over month and year boundaries', () => {
    expect(dateRangeClauses('c', null, '2026-01-31')[0]).toBe("c < '2026-02-01 00:00:00'");
    expect(dateRangeClauses('c', null, '2024-02-28')[0]).toBe("c < '2024-02-29 00:00:00'"); // leap year
  });

  it('emits only the bounds it was given', () => {
    expect(dateRangeClauses('c', '2026-01-01', null)).toHaveLength(1);
    expect(dateRangeClauses('c', null, null)).toEqual([]);
  });

  it('costs exactly 2 conditions against the budget', () => {
    expect(countZcqlConditions(dateRangeClauses('c', '2026-01-01', '2026-12-31'))).toBe(2);
  });
});
