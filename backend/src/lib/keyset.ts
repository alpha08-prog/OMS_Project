/**
 * Keyset (seek) pagination primitives.
 *
 * Why keyset and not LIMIT/OFFSET: OFFSET makes the database walk and discard
 * every row before the page, so the cost of page N grows with N — and under
 * concurrent inserts the window shifts, so rows get duplicated onto the next
 * page or skipped entirely. A keyset predicate anchors the page to the last
 * row the client actually saw, so every page costs the same and the walk is
 * stable no matter how many rows are inserted while the user is paging.
 *
 * The compound (timeColumn, ROWID) key is deliberate: CREATEDTIME alone is not
 * unique — bulk imports and same-second inserts produce ties, and a tie group
 * spanning a page boundary is exactly where rows silently vanish. ROWID breaks
 * the tie so the ordering is total.
 *
 * This pattern is already proven in production in this codebase — see
 * attendance.controller.ts getMyHistory(), which runs
 * `ORDER BY dates DESC, ROWID DESC` with the same compound predicate. These
 * helpers generalise it so other modules don't have to re-derive it.
 */

export type SortDir = 'newest' | 'oldest';

export type ListCursor = {
  /** Catalyst datetime, 'YYYY-MM-DD HH:mm:ss'. */
  t: string;
  /** ROWID of the last row on the page — the tiebreaker. */
  r: string;
};

/**
 * Catalyst datetime.
 *
 * VERIFIED against the live datastore — the real CREATEDTIME format is
 * `2026-07-13 15:41:05:801`: milliseconds separated by a COLON, not a dot.
 * An earlier version of this regex assumed `HH:mm:ss` with no fractional part
 * and silently rejected every genuine cursor, which made decodeCursor return
 * null on every page and pinned the list to page 1 forever. Widen with care,
 * and never assume this format — read a row.
 *
 * Also tolerates: the 'T' separator, a dot before the milliseconds, and the
 * date-only form (columns like `dateOfJourney` store `2026-07-15 00:00:00`,
 * and other tables may store bare dates).
 *
 * Comparison is lexicographic on the stored string, so a cursor is only ever
 * compared against the same column it was minted from.
 */
const T_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2}([:.]\d{1,6})?)?$/;
const R_RE = /^\d+$/;

export function encodeCursor(c: ListCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

/**
 * Decode a client-supplied cursor. Returns null for anything malformed,
 * expired-looking, or tampered with — a bad cursor degrades to "first page",
 * it never throws. Clients hold these across deploys, so being liberal here
 * is what keeps a stale bookmark from turning into a 500.
 *
 * SECURITY: `r` is interpolated into ZCQL as a bare numeric literal (ZCQL has
 * no parameter binding), so R_RE is an injection control, not just a format
 * check. Do not loosen it. `t` is quoted but still validated for the same
 * reason.
 */
export function decodeCursor(s: string | undefined | null): ListCursor | null {
  if (!s) return null;
  try {
    const parsed = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    if (
      parsed &&
      typeof parsed.t === 'string' &&
      typeof parsed.r === 'string' &&
      T_RE.test(parsed.t) &&
      R_RE.test(parsed.r)
    ) {
      // Catalyst compares datetimes as strings; normalise the separator so a
      // cursor minted from a 'T'-form response still matches stored rows.
      return { t: parsed.t.replace('T', ' '), r: parsed.r };
    }
  } catch {
    /* ignore — treat as no cursor */
  }
  return null;
}

/**
 * The seek predicate: "strictly past the cursor row in the sort direction".
 * Both halves are required — the second clause is what carries you correctly
 * through a group of rows sharing the same timestamp.
 */
export function keysetPredicate(
  timeColumn: string,
  cursor: ListCursor,
  sort: SortDir
): string {
  const op = sort === 'newest' ? '<' : '>';
  return `(${timeColumn} ${op} '${cursor.t}' OR (${timeColumn} = '${cursor.t}' AND ROWID ${op} ${cursor.r}))`;
}

/** ORDER BY matching the seek predicate. The two must always agree. */
export function keysetOrderBy(timeColumn: string, sort: SortDir): string {
  return sort === 'newest'
    ? `ORDER BY ${timeColumn} DESC, ROWID DESC`
    : `ORDER BY ${timeColumn} ASC, ROWID ASC`;
}

/**
 * Build the cursor for the next page from the last row of this one.
 * Returns null when there is no next page.
 */
export function nextCursorFrom(
  lastRow: { CREATEDTIME?: unknown; ROWID?: unknown } | undefined,
  timeValue: unknown,
  hasMore: boolean
): string | null {
  if (!hasMore || !lastRow) return null;
  const t = String(timeValue ?? '');
  const r = String(lastRow.ROWID ?? '');
  if (!t || !r) return null;
  return encodeCursor({ t, r });
}
