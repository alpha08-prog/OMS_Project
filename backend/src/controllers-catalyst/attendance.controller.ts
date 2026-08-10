/**
 * Attendance controller — Catalyst Data Store.
 *
 * Table: `Attendance` with columns:
 *   userId   (text)    — staff ROWID
 *   userName (text)
 *   userRole (text)    — STAFF / ADMIN
 *   dates    (date)    — YYYY-MM-DD in IST; column named `dates` (plural)
 *                        because `date` is reserved in ZCQL
 *   status   (text)    — PRESENT / HALF_DAY / LEAVE
 *   reason   (text)    — optional, populated when status = LEAVE
 *   markedAt (datetime) — check-in: when the user marked themselves present
 *   checkOutAt (datetime) — check-out: when the user left for the day (optional)
 *
 * Absent is *auto-derived*: total active STAFF − (PRESENT + HALF_DAY + LEAVE)
 * for a given date. There is no ABSENT row.
 *
 * Marking is *upsert by (userId, dates)* — staff can correct themselves
 * (PRESENT → HALF_DAY) without producing duplicate rows.
 */
import { Response } from 'express';
import {
  insertRow,
  updateRow,
  deleteRow,
  executeZCQL,
  walkRowsByRowId,
  zcqlEscapeValue,
  zcqlAnyOf,
  assertZcqlLimit,
  assertConditionBudget,
  ZCQL_MAX_LIMIT,
  nowCatalystIST,
  CatalystRow,
} from '../lib/catalyst-client';
import { getCachedTableList, getUserIdAliases } from '../lib/catalyst-user-lookup';
import {
  sendSuccess,
  sendError,
  sendServerError,
} from '../utils/response';
import type { AuthenticatedRequest } from '../types';

const ATTENDANCE_TABLE = 'Attendance';
const APPUSER_TABLE = 'AppUser';

const VALID_STATUSES = ['PRESENT', 'HALF_DAY', 'LEAVE'] as const;
type AttendanceStatus = (typeof VALID_STATUSES)[number];

/** Today's date in IST as `YYYY-MM-DD`. Server may run UTC; offset explicitly. */
function todayIST(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const yyyy = ist.getUTCFullYear();
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * WHERE clauses for a `dates` range.
 *
 * Deliberately NOT dateRangeClauses(): that helper emits DATETIME bounds
 * (`>= 'YYYY-MM-DD 00:00:00'` … `< next-day 00:00:00`) because CREATEDTIME-style
 * columns carry a time component with milliseconds after a colon. `dates` is
 * date-only — markAttendance writes a bare 'YYYY-MM-DD' and the frontend
 * compares it with `row.date === todayStr` — and comparison here is
 * lexicographic, where '2026-08-07' < '2026-08-07 00:00:00'. A datetime lower
 * bound would therefore silently drop every row ON the start date. Date-only
 * values need date-only bounds; both ends are inclusive and exact.
 */
function attendanceDateClauses(startDate?: string, endDate?: string): string[] {
  const clauses: string[] = [];
  if (startDate) clauses.push(`dates >= '${zcqlEscapeValue(startDate)}'`);
  if (endDate) clauses.push(`dates <= '${zcqlEscapeValue(endDate)}'`);
  return clauses;
}

/**
 * Thrown when a window genuinely cannot be read in one request. Callers turn it
 * into an actionable 400 — the point is that a range this big NEVER comes back
 * as a short, plausible-looking list.
 */
class AttendanceWindowTooLargeError extends Error {}

/** 40 × 299 ≈ 12k rows per window — a ceiling no real office reaches. */
const MAX_ATTENDANCE_PAGES = 40;

/**
 * Read EVERY Attendance row matching `where`, paging until a short page proves
 * we reached the end.
 *
 * The previous version took ONE page per query and justified it with a
 * headcount guess ("7 days × ≤40 staff = 280 rows, safely under the 299 cap").
 * That guess is load-bearing and invisible: the day the office grows past it,
 * or one staffer double-marks, the query comes back exactly full and the extra
 * rows are dropped with nothing in the logs — an aggregate that is quietly
 * wrong. Page instead of guessing, and if even the ceiling is hit, fail LOUD.
 *
 * `orderBy` must be deterministic (carry a ROWID tiebreaker), or OFFSET paging
 * can repeat and skip rows across page boundaries when values tie.
 */
async function fetchAttendanceWhere(
  where: string,
  orderBy: string
): Promise<CatalystRow[]> {
  // Walks by ROWID, not OFFSET. Catalyst's OFFSET duplicates rows at chunk
  // boundaries even under a total order (measured: 2068 returned / 2067 unique
  // on a 2067-row table) — and here a duplicated row means a staff member
  // counted present twice in the aggregate.
  //
  // ROWID order is fine because every caller re-sorts the result: this is a
  // "read everything matching" primitive, not a paged read. `orderBy` is kept
  // in the signature for call-site clarity but the walk imposes ROWID ASC.
  void orderBy;
  const { rows, truncated } = await walkRowsByRowId(ATTENDANCE_TABLE, where, {
    maxPages: MAX_ATTENDANCE_PAGES,
  });
  if (truncated) {
    throw new AttendanceWindowTooLargeError(
      `Too many attendance records in this range (over ${
        MAX_ATTENDANCE_PAGES * ZCQL_MAX_LIMIT
      }). Please narrow the date range.`
    );
  }
  return rows;
}

/**
 * All attendance rows in an inclusive date range.
 *
 * Chunked by week so each chunk is a bounded, parallel read — latency scales
 * with one round-trip rather than N — and each chunk is read to completion by
 * fetchAttendanceWhere, so chunk size is now a latency knob rather than a
 * silent correctness limit.
 */
async function fetchAttendanceRange(
  startDate: string,
  endDate: string
): Promise<CatalystRow[]> {
  const CHUNK_DAYS = 7;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const start = Date.UTC(
    Number(startDate.slice(0, 4)),
    Number(startDate.slice(5, 7)) - 1,
    Number(startDate.slice(8, 10))
  );
  const end = Date.UTC(
    Number(endDate.slice(0, 4)),
    Number(endDate.slice(5, 7)) - 1,
    Number(endDate.slice(8, 10))
  );
  if (isNaN(start) || isNaN(end) || start > end) return [];

  const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const promises: Promise<CatalystRow[]>[] = [];
  for (let t = start; t <= end; t += CHUNK_DAYS * DAY_MS) {
    const chunkStart = toIso(t);
    const chunkEnd = toIso(Math.min(t + (CHUNK_DAYS - 1) * DAY_MS, end));
    promises.push(
      fetchAttendanceWhere(
        attendanceDateClauses(chunkStart, chunkEnd).join(' AND '),
        // Deterministic order — OFFSET paging inside the chunk depends on it.
        'ORDER BY dates ASC, ROWID ASC'
      )
    );
  }
  const chunks = await Promise.all(promises);
  return chunks.flat();
}

/** Recency of a row: MODIFIEDTIME, else CREATEDTIME, else ROWID order. */
function rowRecency(row: CatalystRow): number {
  const stamp = row.MODIFIEDTIME ?? row.CREATEDTIME;
  const t = stamp ? new Date(String(stamp)).getTime() : NaN;
  return Number.isFinite(t) ? t : Number(row.ROWID ?? 0);
}

/**
 * Resolve the single canonical row for (userId, dates) — and delete any
 * duplicates that slipped in (e.g., two browser tabs racing on the same
 * upsert). Catalyst Data Store has no composite unique constraint, so the
 * race window between SELECT and INSERT can leave dupes; this helper makes
 * the system self-heal on the next read/write.
 *
 * Returns the newest row (by MODIFIEDTIME, then CREATEDTIME, then ROWID), or
 * null if none exists. The losers are deleted asynchronously — failures are
 * logged but never block the caller.
 */
async function resolveAttendanceRow(
  userId: string,
  targetDate: string
): Promise<CatalystRow | null> {
  // Match EVERY identity form this user can be stored under (Catalyst ROWID and
  // pre-migration legacy UUID). The JWT `id` claim prefers legacyId, so a single
  // -form predicate missed the row a migrated user had already written under the
  // other alias — and this helper is the upsert probe, so a miss did not just
  // hide the row: it INSERTED a second one for the same day, which then showed
  // the staffer as both present and absent. Matching all aliases makes the
  // upsert an upsert again and lets the dedupe below collapse existing pairs.
  const aliases = await getUserIdAliases(userId);
  const rows = await executeZCQL<CatalystRow>(
    `SELECT * FROM ${ATTENDANCE_TABLE} WHERE ${zcqlAnyOf('userId', aliases)} ` +
      `AND dates = '${zcqlEscapeValue(targetDate)}' LIMIT 50`
  );
  if (rows.length === 0) return null;

  rows.sort((a, b) => {
    const ta = rowRecency(a);
    const tb = rowRecency(b);
    if (tb !== ta) return tb - ta;
    return Number(b.ROWID ?? 0) - Number(a.ROWID ?? 0);
  });

  const [keep, ...extras] = rows;
  for (const dupe of extras) {
    deleteRow(ATTENDANCE_TABLE, String(dupe.ROWID)).catch((err) => {
      console.warn(
        `[attendance] Failed to delete duplicate row ${dupe.ROWID} for ${userId}/${targetDate}`,
        err
      );
    });
  }
  return keep;
}

/** Reshape a Catalyst Attendance row → JSON for the frontend. */
function shapeAttendance(row: CatalystRow) {
  return {
    id: String(row.ROWID),
    userId: String(row.userId ?? ''),
    userName: row.userName ?? '',
    userRole: row.userRole ?? '',
    date: row.dates ?? '',
    status: row.status as AttendanceStatus,
    reason: row.reason ?? null,
    markedAt: row.markedAt ?? row.CREATEDTIME ?? null,
    checkOutAt: row.checkOutAt ?? null,
    createdAt: row.CREATEDTIME ?? null,
    updatedAt: row.MODIFIEDTIME ?? null,
  };
}

/** POST /api/attendance — staff marks today's attendance (upsert). */
export async function markAttendance(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const { status, reason, date: dateInput } = req.body as {
      status?: string;
      reason?: string;
      date?: string;
    };
    if (!status || !VALID_STATUSES.includes(status as AttendanceStatus)) {
      sendError(
        res,
        `status must be one of: ${VALID_STATUSES.join(', ')}`,
        400
      );
      return;
    }
    const trimmedReason = (reason ?? '').trim();
    if (status === 'LEAVE' && !trimmedReason) {
      sendError(res, 'reason is required when status is LEAVE', 400);
      return;
    }

    const today = todayIST();
    // Date rules:
    //   - PRESENT → must be today (no marking yourself present for a different
    //     day — you can only confirm presence in the moment).
    //   - HALF_DAY / LEAVE → today or any future date (you can plan ahead).
    const targetDate = (dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput))
      ? dateInput
      : today;
    if (status === 'PRESENT' && targetDate !== today) {
      sendError(res, 'PRESENT can only be marked for today', 400);
      return;
    }
    if ((status === 'HALF_DAY' || status === 'LEAVE') && targetDate < today) {
      sendError(res, `${status} cannot be marked for a past date`, 400);
      return;
    }

    const userId = req.user.id;
    const nowIso = nowCatalystIST();

    // Resolve to one canonical row (auto-deleting any race-induced dupes).
    const existing = await resolveAttendanceRow(userId, targetDate);
    if (existing) {
      const updated = await updateRow(ATTENDANCE_TABLE, {
        ROWID: String(existing.ROWID),
        status,
        reason: status === 'LEAVE' ? trimmedReason : null,
        markedAt: nowIso,
        // A leave day has no check-out; clear any stale value from a prior mark.
        ...(status === 'LEAVE' ? { checkOutAt: null } : {}),
      });
      sendSuccess(res, shapeAttendance(updated), 'Attendance updated');
      return;
    }

    const inserted = await insertRow(ATTENDANCE_TABLE, {
      userId,
      userName: req.user.name,
      userRole: req.user.role,
      dates: targetDate,
      status,
      reason: status === 'LEAVE' ? trimmedReason : null,
      markedAt: nowIso,
    });
    sendSuccess(res, shapeAttendance(inserted), 'Attendance marked', 201);
  } catch (error) {
    sendServerError(res, 'Failed to mark attendance', error);
  }
}

/**
 * POST /api/attendance/checkout — record that the user is leaving for the day.
 *
 * Stamps `checkOutAt` on today's row. Requires the user to have already marked
 * themselves present/half-day today (you can't check out of a day you never
 * checked into). LEAVE days have no check-out. Idempotent-ish: re-tapping just
 * refreshes the timestamp to the latest tap.
 */
export async function checkOutAttendance(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const today = todayIST();
    const existing = await resolveAttendanceRow(req.user.id, today);
    if (!existing) {
      sendError(res, 'Mark your attendance before checking out', 400);
      return;
    }
    if (existing.status === 'LEAVE') {
      sendError(res, 'Cannot check out on a leave day', 400);
      return;
    }

    const updated = await updateRow(ATTENDANCE_TABLE, {
      ROWID: String(existing.ROWID),
      checkOutAt: nowCatalystIST(),
    });
    sendSuccess(res, shapeAttendance(updated), 'Checked out for the day');
  } catch (error) {
    sendServerError(res, 'Failed to check out', error);
  }
}

/**
 * POST /api/attendance/leave-range — apply LEAVE for an inclusive date range.
 *
 * One LEAVE row per day is upserted (so the existing per-day aggregates, ABSENT
 * auto-fill, and history queries keep working unchanged). Days where the user
 * already has PRESENT or HALF_DAY are *skipped* rather than overwritten — you
 * shouldn't be able to wipe out a day you already showed up for by applying a
 * vacation that overlaps it.
 *
 * Caps the range at 90 days to keep one request bounded and to stay well under
 * Catalyst's per-call limits.
 */
const MAX_LEAVE_RANGE_DAYS = 90;

export async function markLeaveRange(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const { startDate, endDate, reason } = req.body as {
      startDate?: string;
      endDate?: string;
      reason?: string;
    };
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!startDate || !dateRe.test(startDate)) {
      sendError(res, 'startDate must be in YYYY-MM-DD format', 400);
      return;
    }
    if (!endDate || !dateRe.test(endDate)) {
      sendError(res, 'endDate must be in YYYY-MM-DD format', 400);
      return;
    }
    const trimmedReason = (reason ?? '').trim();
    if (!trimmedReason) {
      sendError(res, 'reason is required for leave', 400);
      return;
    }
    if (endDate < startDate) {
      sendError(res, 'endDate cannot be before startDate', 400);
      return;
    }
    const today = todayIST();
    if (startDate < today) {
      sendError(res, 'Leave cannot start in the past', 400);
      return;
    }

    // Build the inclusive list of dates in the range, capped.
    const DAY_MS = 24 * 60 * 60 * 1000;
    const startMs = Date.UTC(
      Number(startDate.slice(0, 4)),
      Number(startDate.slice(5, 7)) - 1,
      Number(startDate.slice(8, 10))
    );
    const endMs = Date.UTC(
      Number(endDate.slice(0, 4)),
      Number(endDate.slice(5, 7)) - 1,
      Number(endDate.slice(8, 10))
    );
    const totalDays = Math.floor((endMs - startMs) / DAY_MS) + 1;
    if (totalDays > MAX_LEAVE_RANGE_DAYS) {
      sendError(
        res,
        `Leave range cannot exceed ${MAX_LEAVE_RANGE_DAYS} days`,
        400
      );
      return;
    }
    const dates: string[] = [];
    for (let t = startMs; t <= endMs; t += DAY_MS) {
      dates.push(new Date(t).toISOString().slice(0, 10));
    }

    const userId = req.user.id;
    const nowIso = nowCatalystIST();

    // Process days with small parallelism. resolveAttendanceRow + insert/update
    // is one round-trip per day; chunked Promise.all keeps the total wall time
    // close to a single round-trip while not flooding Catalyst.
    const CONCURRENCY = 5;
    const records: ReturnType<typeof shapeAttendance>[] = [];
    const skipped: { date: string; status: string }[] = [];

    for (let i = 0; i < dates.length; i += CONCURRENCY) {
      const slice = dates.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        slice.map(async (targetDate) => {
          const existing = await resolveAttendanceRow(userId, targetDate);
          if (existing && existing.status && existing.status !== 'LEAVE') {
            return {
              kind: 'skipped' as const,
              date: targetDate,
              status: String(existing.status),
            };
          }
          if (existing) {
            const updated = await updateRow(ATTENDANCE_TABLE, {
              ROWID: String(existing.ROWID),
              status: 'LEAVE',
              reason: trimmedReason,
              markedAt: nowIso,
            });
            return { kind: 'record' as const, row: updated };
          }
          const inserted = await insertRow(ATTENDANCE_TABLE, {
            userId,
            userName: req.user!.name,
            userRole: req.user!.role,
            dates: targetDate,
            status: 'LEAVE',
            reason: trimmedReason,
            markedAt: nowIso,
          });
          return { kind: 'record' as const, row: inserted };
        })
      );
      for (const r of results) {
        if (r.kind === 'record') records.push(shapeAttendance(r.row));
        else skipped.push({ date: r.date, status: r.status });
      }
    }

    sendSuccess(
      res,
      {
        startDate,
        endDate,
        count: records.length,
        records,
        skipped,
      },
      records.length > 0
        ? `Leave marked for ${records.length} day${records.length === 1 ? '' : 's'}${skipped.length ? ` (${skipped.length} day${skipped.length === 1 ? '' : 's'} skipped)` : ''}`
        : 'No new leave days marked',
      201
    );
  } catch (error) {
    sendServerError(res, 'Failed to mark leave range', error);
  }
}

/** GET /api/attendance/me/today — current user's today mark, or null. */
export async function getMyToday(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const today = todayIST();
    const row = await resolveAttendanceRow(req.user.id, today);
    sendSuccess(
      res,
      row ? shapeAttendance(row) : null,
      "Today's attendance retrieved"
    );
  } catch (error) {
    sendServerError(res, 'Failed to fetch today attendance', error);
  }
}

/**
 * GET /api/attendance/me — current user's attendance history.
 *
 * Keyset pagination (cursor on `dates DESC, ROWID DESC`):
 *   - `limit` (default 50, max 200)
 *   - `cursor` (opaque base64 of `{date, rowId}` returned from a previous page)
 *   - `startDate` / `endDate` (optional range filter)
 *
 * Response includes `meta.nextCursor` — null when the last page is reached.
 * Keyset (not LIMIT/OFFSET) so it works regardless of how many rows the user
 * accumulates over years of service.
 */
type HistoryCursor = { date: string; rowId: string };

function encodeCursor(c: HistoryCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

function decodeCursor(s: string | undefined): HistoryCursor | null {
  if (!s) return null;
  try {
    const parsed = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    if (
      parsed &&
      typeof parsed.date === 'string' &&
      typeof parsed.rowId === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) &&
      /^\d+$/.test(parsed.rowId)
    ) {
      return parsed;
    }
  } catch {
    /* ignore — treat as no cursor */
  }
  return null;
}

export async function getMyHistory(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const {
      startDate,
      endDate,
      limit: limitRaw,
      cursor: cursorRaw,
    } = req.query as {
      startDate?: string;
      endDate?: string;
      limit?: string;
      cursor?: string;
    };

    const requested = Number(limitRaw);
    // Floor it: assertZcqlLimit below (rightly) rejects a fractional LIMIT, and
    // `?limit=50.5` is a client typo, not a reason to fail the request.
    const pageSize = Math.floor(
      Math.min(
        Math.max(Number.isFinite(requested) && requested > 0 ? requested : 50, 1),
        200
      )
    );

    // Own-rows filter must match EVERY identity alias (ROWID + legacy UUID).
    // Matching the single form carried in the JWT made a migrated user's older
    // marks invisible to their own history — the rows exist, they are just keyed
    // by the other alias. Costs one condition per alias (2 in practice), which
    // with the date bounds (2) and the keyset predicate (3) stays inside the
    // 10-condition ZCQL budget; assertConditionBudget below keeps it honest.
    const aliases = await getUserIdAliases(req.user.id);
    const clauses: string[] = [zcqlAnyOf('userId', aliases)];
    clauses.push(...attendanceDateClauses(startDate, endDate));

    const cursor = decodeCursor(cursorRaw);
    if (cursor) {
      // Compound keyset predicate: strictly older than cursor, with ROWID as
      // tiebreaker for same-day rows (shouldn't happen post-dedupe, but safe).
      clauses.push(
        `(dates < '${zcqlEscapeValue(cursor.date)}' OR (dates = '${zcqlEscapeValue(cursor.date)}' AND ROWID < ${zcqlEscapeValue(cursor.rowId)}))`
      );
    }

    const where = assertConditionBudget(clauses, 'attendance history').join(' AND ');
    // Fetch pageSize + 1 to detect whether more rows exist after this page.
    // pageSize is capped at 200 above, so +1 is always a legal ZCQL limit —
    // assert rather than clamp, because a silent clamp is how rows vanish.
    const fetched = await executeZCQL<CatalystRow>(
      `SELECT * FROM ${ATTENDANCE_TABLE} WHERE ${where} ` +
        `ORDER BY dates DESC, ROWID DESC LIMIT ${assertZcqlLimit(pageSize + 1)}`
    );

    const hasMore = fetched.length > pageSize;
    const page = hasMore ? fetched.slice(0, pageSize) : fetched;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ date: String(last.dates), rowId: String(last.ROWID) })
        : null;

    sendSuccess(
      res,
      page.map(shapeAttendance),
      'Attendance history retrieved',
      200,
      // No `total`: this is a keyset walk and there is no honest count to give
      // without a second query nobody asked for. `count` and `hasMore` describe
      // what was actually returned, which is the part a client can trust.
      { limit: pageSize, count: page.length, hasMore, nextCursor }
    );
  } catch (error) {
    sendServerError(res, 'Failed to fetch attendance history', error);
  }
}

/** GET /api/attendance — admin lists all attendance (date filter). */
export async function getAllAttendance(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { date, startDate, endDate } = req.query as {
      date?: string;
      startDate?: string;
      endDate?: string;
    };

    const clauses: string[] = [];
    if (date) clauses.push(`dates = '${zcqlEscapeValue(date)}'`);
    clauses.push(...attendanceDateClauses(startDate, endDate));
    // Default: today only
    if (clauses.length === 0) clauses.push(`dates = '${todayIST()}'`);

    // Read the whole match, not one 300-row page: a multi-day range over a full
    // team blows past 300 easily, and the old single-page query dropped the
    // remainder with no error — the admin saw a short list that looked complete.
    // ROWID tiebreaker because names tie, and OFFSET paging over a non-total
    // order repeats and skips rows at the page boundary.
    const rows = await fetchAttendanceWhere(
      clauses.join(' AND '),
      'ORDER BY userName ASC, ROWID ASC'
    );

    // Pad with "ABSENT" entries: every active STAFF with no row for the queried
    // date counts as absent. Only valid when the caller asked for a *single*
    // date — otherwise absent windows are ambiguous.
    type AttendanceRecord = Omit<ReturnType<typeof shapeAttendance>, 'status'> & {
      status: AttendanceStatus | 'ABSENT';
    };
    let augmented: AttendanceRecord[] = rows.map(shapeAttendance);
    const singleDate =
      date && !startDate && !endDate
        ? date
        : !date && !startDate && !endDate
        ? todayIST()
        : null;
    if (singleDate) {
      const users = await getCachedTableList(APPUSER_TABLE);
      const markedIds = new Set(augmented.map((a) => a.userId));
      const absentees: AttendanceRecord[] = users
        .filter((u) => {
          const role = String(u.role ?? '');
          const isActive = u.isActive === true || u.isActive === 'true' || u.isActive === undefined;
          // Match against EVERY identity form this user can be stored under.
          // The JWT `id` claim prefers legacyId (auth.controller jwtIdFor), so a
          // migrated user's attendance row is keyed by their legacy UUID while
          // this list is keyed by ROWID. Comparing ROWID alone made a staffer
          // who HAD marked present also appear in the absentee list — counted
          // both present and absent on the same day.
          const forms = [String(u.ROWID), u.legacyId ? String(u.legacyId) : null]
            .filter(Boolean) as string[];
          return role === 'STAFF' && isActive && !forms.some((f) => markedIds.has(f));
        })
        .map((u) => ({
          id: `absent-${u.ROWID}`,
          userId: String(u.ROWID),
          userName: String(u.name ?? ''),
          userRole: 'STAFF',
          date: singleDate,
          status: 'ABSENT',
          reason: null,
          markedAt: null,
          checkOutAt: null,
          createdAt: null,
          updatedAt: null,
        }));
      augmented = [...augmented, ...absentees].sort((a, b) =>
        a.userName.localeCompare(b.userName)
      );
    }

    sendSuccess(res, augmented, 'Attendance retrieved');
  } catch (error) {
    // A range too big to read completely is a caller problem with a fix the
    // caller can act on — say so instead of returning a truncated 200.
    if (error instanceof AttendanceWindowTooLargeError) {
      sendError(res, error.message, 400);
      return;
    }
    sendServerError(res, 'Failed to fetch attendance', error);
  }
}

/**
 * GET /api/attendance/aggregate?startDate&endDate
 * Per-staff totals across a date range — used by the admin monthly/yearly view.
 *
 * Returns one entry per *active STAFF* (not just those who marked), so the
 * admin can spot anyone with zero entries for the period. ABSENT is not
 * computed here because "working day" is policy-dependent (Sundays? holidays?)
 * — the UI shows `totalMarked` and lets the admin infer absences against
 * whatever working-day convention they use.
 */
export async function getAggregate(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };
    if (!startDate || !endDate) {
      sendError(res, 'startDate and endDate are required', 400);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      sendError(res, 'startDate / endDate must be YYYY-MM-DD', 400);
      return;
    }

    const [rows, users] = await Promise.all([
      // Chunked: a single ZCQL page caps at 299 rows, which a year × multiple
      // staff easily blows past. fetchAttendanceRange splits the range into
      // week-long windows, runs them in parallel, and reads each to completion.
      fetchAttendanceRange(startDate, endDate),
      getCachedTableList(APPUSER_TABLE),
    ]);

    type Counters = {
      userId: string;
      userName: string;
      present: number;
      halfDay: number;
      leave: number;
      totalMarked: number;
    };
    const perStaff = new Map<string, Counters>();

    // Every identity form (ROWID and legacy UUID) → the canonical ROWID, so a
    // user whose rows were written under one form and whose seed entry uses the
    // other lands in ONE bucket instead of being counted as two people.
    const aliasToCanonical = new Map<string, string>();

    // Seed with every active STAFF so zeros show up.
    for (const u of users) {
      // The alias map is built for EVERY user, before the active-STAFF gate.
      // Rows from a demoted/deactivated staffer still land in the output (see
      // the edge case below), and mapping only active staff left those rows
      // keyed by their raw id — so someone holding rows under both their ROWID
      // and their legacy UUID landed in two buckets and was reported as two
      // people, which is exactly the duplicate this collapse exists to kill.
      const canonical = String(u.ROWID);
      aliasToCanonical.set(canonical, canonical);
      if (u.legacyId) aliasToCanonical.set(String(u.legacyId), canonical);

      const role = String(u.role ?? '');
      const isActive = u.isActive === true || u.isActive === 'true' || u.isActive === undefined;
      if (role !== 'STAFF' || !isActive) continue;
      perStaff.set(canonical, {
        userId: canonical,
        userName: String(u.name ?? ''),
        present: 0,
        halfDay: 0,
        leave: 0,
        totalMarked: 0,
      });
    }

    for (const r of rows) {
      if (String(r.userRole ?? '') !== 'STAFF') continue;
      const id = aliasToCanonical.get(String(r.userId)) ?? String(r.userId);
      let entry = perStaff.get(id);
      if (!entry) {
        // Edge case: staff was demoted/deactivated but had records in range —
        // still surface them so the totals add up.
        entry = {
          userId: id,
          userName: String(r.userName ?? ''),
          present: 0,
          halfDay: 0,
          leave: 0,
          totalMarked: 0,
        };
        perStaff.set(id, entry);
      }
      if (r.status === 'PRESENT') entry.present++;
      else if (r.status === 'HALF_DAY') entry.halfDay++;
      else if (r.status === 'LEAVE') entry.leave++;
      entry.totalMarked++;
    }

    const staff = Array.from(perStaff.values()).sort((a, b) =>
      a.userName.localeCompare(b.userName)
    );

    sendSuccess(
      res,
      {
        startDate,
        endDate,
        totalStaff: staff.length,
        staff,
      },
      'Attendance aggregate retrieved'
    );
  } catch (error) {
    if (error instanceof AttendanceWindowTooLargeError) {
      sendError(res, error.message, 400);
      return;
    }
    sendServerError(res, 'Failed to fetch attendance aggregate', error);
  }
}

/** GET /api/attendance/stats — admin dashboard today's totals. */
export async function getTodayStats(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const today = todayIST();
    const [rows, users] = await Promise.all([
      // Explicit, complete read. The bare query relied on whatever default page
      // size ZCQL applies, which is a silent cap the day the team outgrows it.
      fetchAttendanceWhere(`dates = '${today}'`, 'ORDER BY ROWID ASC'),
      getCachedTableList(APPUSER_TABLE),
    ]);

    const totalStaff = users.filter((u) => {
      const isActive = u.isActive === true || u.isActive === 'true' || u.isActive === undefined;
      return String(u.role ?? '') === 'STAFF' && isActive;
    }).length;

    // Same identity duality as the absentee list and the per-staff aggregate:
    // one person can hold rows under their ROWID and their legacy UUID. Counting
    // raw ids let a pre-existing duplicate pair count that staffer twice —
    // inflating `present` and shrinking `absent` past what the headcount allows.
    // Collapse to one row per canonical person (the newest wins, matching the
    // upsert semantics resolveAttendanceRow enforces) before tallying.
    const aliasToCanonical = new Map<string, string>();
    for (const u of users) {
      const canonical = String(u.ROWID);
      aliasToCanonical.set(canonical, canonical);
      if (u.legacyId) aliasToCanonical.set(String(u.legacyId), canonical);
    }

    const latestPerStaff = new Map<string, CatalystRow>();
    for (const r of rows) {
      if (String(r.userRole ?? '') !== 'STAFF') continue;
      const id = aliasToCanonical.get(String(r.userId)) ?? String(r.userId);
      const prev = latestPerStaff.get(id);
      if (!prev || rowRecency(r) >= rowRecency(prev)) latestPerStaff.set(id, r);
    }

    let present = 0;
    let halfDay = 0;
    let leave = 0;
    for (const r of latestPerStaff.values()) {
      if (r.status === 'PRESENT') present++;
      else if (r.status === 'HALF_DAY') halfDay++;
      else if (r.status === 'LEAVE') leave++;
    }
    const absent = Math.max(0, totalStaff - latestPerStaff.size);

    sendSuccess(
      res,
      {
        date: today,
        totalStaff,
        present,
        halfDay,
        leave,
        absent,
      },
      "Today's attendance stats"
    );
  } catch (error) {
    // Same contract as the other two fetchAttendanceWhere callers: a window we
    // cannot read completely is a 400 with a fix, never a truncated 200 or an
    // opaque 500.
    if (error instanceof AttendanceWindowTooLargeError) {
      sendError(res, error.message, 400);
      return;
    }
    sendServerError(res, 'Failed to fetch attendance stats', error);
  }
}
