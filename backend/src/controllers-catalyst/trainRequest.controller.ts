/**
 * Train Request controller — backed by Catalyst Data Store via custom REST client.
 *
 * Notes:
 *   - The RapidAPI PNR-status endpoint is NOT wired here. Frontend collects all
 *     fields manually instead of auto-filling from PNR.
 *   - Catalyst column `journeyRoute` ↔ frontend `route` mapping (route is a
 *     reserved word in some SQL engines).
 *   - Optional nested `passengers` array writes rows to TrainPassenger and
 *     cascade-deletes them when the parent is removed.
 *   - Status machine enforced: PENDING → APPROVED|REJECTED → RESOLVED.
 */
import { Response } from 'express';
import {
  insertRow,
  listAllRows,
  getRow,
  updateRow,
  deleteRow,
  toCatalystDate,
  nowCatalystIST,
  updateRowTolerant,
  executeZCQL,
  zcqlEscapeValue,
  zcqlAnyOf,
  zcqlLike,
  zcqlLikeAny,

  // zcqlSafeLimit is intentionally not used in this controller: it clamps
  // silently, which is how rows went missing here. Use assertZcqlLimit and
  // compute a legal page size instead.
  assertZcqlLimit,
  countRows,
  fetchOffsetWindow,
  columnExists,
  dateRangeClauses,
  countZcqlConditions,
  zcqlSearchWithinBudget,
  fetchChildrenByParentIds,
  ZCQL_MAX_LIMIT,
  CatalystRow,
} from '../lib/catalyst-client';
import {
  decodeCursor,
  encodeCursor,
  keysetOrderBy,
  keysetPredicate,
  type ListCursor,
} from '../lib/keyset';
import { parseKeysetQuery, DEFAULT_KEYSET_LIMIT } from '../utils/keyset-query';
import { cacheSWR } from '../lib/cache';
import { useZCQL } from '../config/feature-flags';
import { getCachedTableList, getUserIdAliases } from '../lib/catalyst-user-lookup';
import { autoCreateSelfTask } from './task.controller';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendServerError,
} from '../utils/response';
// calculatePaginationMeta is deliberately NOT imported here any more: it takes
// a `total` as a required argument, which is what pushed this controller into
// fabricating one. parsePagination stays for the legacy page= shim.
import { parsePagination } from '../utils/pagination';
import type { AuthenticatedRequest, TrainRequestFilters } from '../types';

const TRAIN_TABLE = 'TrainRequest';
const PASSENGER_TABLE = 'TrainPassenger';

const VALID_BOOKING_TYPES = new Set([
  'GENERAL',
  'LADIES',
  'LOWER_BERTH',
  'DUTY_PASS',
]);
const VALID_STATUSES = new Set(['PENDING', 'APPROVED', 'REJECTED', 'RESOLVED']);
const VALID_GENDERS = new Set(['MALE', 'FEMALE', 'OTHER']);

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Best-effort sequential reference number: TREQ-<IST year>-NNNN. Returns
 * max+1 for the current year. Still NOT transaction-safe — two concurrent
 * creates can race to the same number, which is pre-existing and adequate for
 * office-scale concurrency. Mirrors nextGrievanceNumber().
 *
 * One query, not a full-table scan: the sequence is zero-padded to 4 digits
 * (see the padStart below), so lexical DESC equals numeric DESC up to 9999 and
 * the highest existing number is simply the first row. Previously this read
 * every train request ever created just to issue the next number — meaning the
 * cost of creating request 2001 was proportional to the 2000 before it.
 */
async function nextTrainRequestNumber(): Promise<string> {
  const istYear = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCFullYear();
  const prefix = `TREQ-${istYear}-`;
  let maxSeq = 0;
  // Skip the query entirely when the column is absent (as it is in
  // Development) — querying it would 400 on every create.
  if (!(await hasRefNumberColumn())) return `${prefix}0001`;
  try {
    const rows = await executeZCQL<CatalystRow>(
      `SELECT trainRequestNumber FROM ${TRAIN_TABLE} ` +
        `WHERE ${zcqlLike('trainRequestNumber', prefix, 'prefix')} ` +
        `ORDER BY trainRequestNumber DESC LIMIT 1`
    );
    const num = String(rows[0]?.trainRequestNumber ?? '');
    if (num.startsWith(prefix)) {
      const seq = parseInt(num.slice(prefix.length), 10);
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    }
  } catch {
    /* table unreadable — fall back to 1 */
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

function parseInt0(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return isNaN(n) ? 0 : Math.trunc(n);
}

/** Reshape a Catalyst Train row into the JSON shape the frontend expects. */
function shapeTrainRequest(
  row: CatalystRow,
  createdBy?: { id: string; name: string; email: string } | null,
  approvedBy?: { id: string; name: string; email: string } | null,
  passengers: any[] = [],
  lastEditedBy?: { id: string; name: string; email: string } | null
) {
  return {
    id: String(row.ROWID),
    // Human-friendly reference: the stored sequential number (TREQ-YYYY-NNNN)
    // when present, else a ROWID-based fallback (TREQ-<rowid>) for legacy rows
    // / before the `trainRequestNumber` column is added in Catalyst.
    referenceNo: row.trainRequestNumber
      ? String(row.trainRequestNumber)
      : `TREQ-${String(row.ROWID)}`,
    pnrNumber: row.pnrNumber,
    passengerName: row.passengerName,
    journeyClass: row.journeyClass,
    dateOfJourney: row.dateOfJourney,
    fromStation: row.fromStation,
    toStation: row.toStation,
    route: row.journeyRoute ?? null, // Catalyst → frontend mapping
    trainName: row.trainName ?? null,
    trainNumber: row.trainNumber ?? null,
    boardingPoint: row.boardingPoint ?? null,
    bookingType: row.bookingType,
    referencedBy: row.referencedBy ?? null,
    contactNumber: row.contactNumber ?? null,
    remarks: row.remarks ?? null,
    status: row.status,
    approvedAt: row.approvedAt ?? null,
    rejectionReason: row.rejectionReason ?? null,
    signatureData: row.signatureData ?? null,
    createdById: row.createdById ?? null,
    approvedById: row.approvedById ?? null,
    createdAt: row.CREATEDTIME,
    updatedAt: row.MODIFIEDTIME,
    createdBy: createdBy ?? null,
    approvedBy: approvedBy ?? null,
    train_passengers: passengers,
    // Edit audit — who last edited this train request and when (security trail).
    lastEditedById: row.lastEditedById ?? null,
    lastEditedAt: row.lastEditedAt ?? null,
    lastEditedBy: lastEditedBy ?? null,
  };
}

function shapePassenger(row: CatalystRow) {
  return {
    id: String(row.ROWID),
    trainRequestId: row.trainRequestId,
    name: row.passengerName,
    age: parseInt0(row.age),
    gender: row.gender,
    dob: row.dob ?? null,
    berthPreference: row.berthPreference ?? null,
    seatNumber: row.seatNumber ?? null,
    coachNumber: row.coachNumber ?? null,
    bookingStatus: row.bookingStatus ?? null,
    currentStatus: row.currentStatus ?? null,
    createdAt: row.CREATEDTIME,
    updatedAt: row.MODIFIEDTIME,
  };
}

/** Look up users from cached Catalyst AppUser. Best-effort. */
async function lookupUsers(
  ids: Iterable<string>
): Promise<Map<string, { id: string; name: string; email: string }>> {
  const map = new Map<string, { id: string; name: string; email: string }>();
  const list = Array.from(ids).filter(Boolean);
  if (list.length === 0) return map;
  try {
    const users = await getCachedTableList('AppUser');
    const wanted = new Set(list.map(String));
    for (const u of users) {
      const rowId = String(u.ROWID);
      const legacyId = u.legacyId ? String(u.legacyId) : null;
      // Two INDEPENDENT ifs, not if/else: one user can be referenced by their
      // Catalyst ROWID on some rows and their pre-migration legacy UUID on
      // others. With `else if`, a page containing both forms resolved only the
      // ROWID and rendered "Created By" blank for the legacy rows — and bigger
      // pages make that collision more likely, so it would have worsened
      // exactly as we raise the row count.
      if (wanted.has(rowId)) {
        map.set(rowId, { id: rowId, name: String(u.name), email: String(u.email) });
      }
      if (legacyId && wanted.has(legacyId)) {
        map.set(legacyId, { id: legacyId, name: String(u.name), email: String(u.email) });
      }
    }
  } catch {
    /* Catalyst unreachable — return empty map */
  }
  return map;
}

/**
 * Fetch passengers for a set of train request IDs, scoped to just those IDs.
 *
 * This used to call `listAllRows(PASSENGER_TABLE)` and filter in JS, i.e. read
 * EVERY passenger row in the database to answer a question about (at most) one
 * page of parents. At 6000 passenger rows that was ~20 sequential round-trips
 * per list render, and it grew forever. Now each chunk is one scoped query and
 * the chunks run in parallel, so the cost tracks page size, not table size.
 */
async function passengersByRequestId(
  requestIds: string[]
): Promise<Map<string, any[]>> {
  const out = new Map<string, any[]>();
  if (requestIds.length === 0) return out;

  // Chunking is handled by the shared helper, which caps each OR-chain at the
  // ZCQL 10-condition ceiling. An earlier version chunked by 25, which made
  // every chunk a 400 that was then swallowed — passengers vanished from
  // pages larger than a handful of rows, with no error anywhere.
  const rows = await fetchChildrenByParentIds(
    PASSENGER_TABLE,
    'trainRequestId',
    requestIds,
    { orderBy: 'ORDER BY ROWID ASC' }
  );

  for (const p of rows) {
    if (!p.trainRequestId) continue;
    const tid = String(p.trainRequestId);
    if (!out.has(tid)) out.set(tid, []);
    out.get(tid)!.push(shapePassenger(p));
  }
  return out;
}

/**
 * Attach createdBy + approvedBy (+ optionally nested passengers) to rows.
 *
 * Passengers are OPT-IN because no list screen renders them — the list shows
 * the scalar `numberOfPassengers`, and PDF letters load their own passengers
 * separately. Fetching them for every list row was pure waste on the hottest
 * path in the module.
 */
async function hydrate(
  rows: CatalystRow[],
  opts: { passengers?: boolean } = {}
): Promise<any[]> {
  const safe = rows.filter((r): r is CatalystRow => Boolean(r));
  if (safe.length === 0) return [];

  const userIds = new Set<string>();
  for (const r of safe) {
    if (r.createdById) userIds.add(String(r.createdById));
    if (r.approvedById) userIds.add(String(r.approvedById));
    if (r.lastEditedById) userIds.add(String(r.lastEditedById));
  }
  // Independent reads — run in parallel instead of two serial round-trips.
  const [users, passengersMap] = await Promise.all([
    lookupUsers(userIds),
    opts.passengers
      ? passengersByRequestId(safe.map((r) => String(r.ROWID)))
      : Promise.resolve(new Map<string, any[]>()),
  ]);

  return safe.map((r) =>
    shapeTrainRequest(
      r,
      users.get(String(r.createdById)) ?? null,
      r.approvedById ? users.get(String(r.approvedById)) ?? null : null,
      passengersMap.get(String(r.ROWID)) ?? [],
      r.lastEditedById ? users.get(String(r.lastEditedById)) ?? null : null
    )
  );
}

/**
 * Validate the passenger payload up-front (cheap, synchronous). Throw on
 * input errors here so the caller can return a 400 *before* creating the
 * parent train request and avoid rolling back. Catalyst-side write failures
 * are handled separately in writePassengers.
 */
function validatePassengers(passengers: any[] | undefined): void {
  if (!Array.isArray(passengers)) return;
  for (const p of passengers) {
    if (!p) continue;
    const name = (p.name ?? p.passengerName ?? '').toString().trim();
    if (!name) continue;
    const gender = (p.gender ?? '').toString().toUpperCase();
    if (gender && !VALID_GENDERS.has(gender)) {
      throw new Error(`Invalid gender for passenger ${name}: ${gender}`);
    }
  }
}

/**
 * Write passengers tied to a parent ROWID. Best-effort: if the
 * TrainPassenger table is missing or a single insert fails, we log and skip
 * that row rather than aborting the whole request — the parent train request
 * has already been created and is valid on its own. Per-row Sex/Age/W/L
 * data can be re-entered once the table/schema is in place.
 */
async function writePassengers(
  trainRequestId: string,
  passengers: any[] | undefined
): Promise<void> {
  if (!Array.isArray(passengers) || passengers.length === 0) return;
  for (const p of passengers) {
    if (!p) continue;
    const name = (p.name ?? p.passengerName ?? '').toString().trim();
    if (!name) continue;
    const gender = (p.gender ?? '').toString().toUpperCase();
    try {
      await insertRow(PASSENGER_TABLE, {
        trainRequestId,
        passengerName: name,
        age: parseInt0(p.age),
        gender: gender || 'OTHER',
        // DOB of the (primary) passenger — feeds the shared birthday module.
        dob: p.dob ? toCatalystDate(p.dob) : null,
        berthPreference: p.berthPreference ?? null,
        seatNumber: p.seatNumber ?? null,
        coachNumber: p.coachNumber ?? null,
        bookingStatus: p.bookingStatus ?? null,
        currentStatus: p.currentStatus ?? null,
      });
    } catch (err) {
      console.warn(
        `[trainRequest] Failed to persist TrainPassenger row "${name}" for trainRequest ${trainRequestId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
}

/** Delete all TrainPassenger rows for a parent. Best-effort; logs failures. */
async function deletePassengersFor(trainRequestId: string): Promise<void> {
  try {
    // Scoped lookup — reading the whole passenger table to find one parent's
    // children was the same full-scan pattern as the list path.
    const matches = (
      await executeZCQL<CatalystRow>(
        `SELECT ROWID FROM ${PASSENGER_TABLE} ` +
          `WHERE trainRequestId = '${zcqlEscapeValue(trainRequestId)}'`
      )
    ).map((p) => String(p.ROWID));
    // Parallel best-effort delete — allSettled keeps the "ignore individual
    // failures" semantics while collapsing N serial round-trips into one batch.
    await Promise.allSettled(matches.map((id) => deleteRow(PASSENGER_TABLE, id)));
  } catch {
    /* TrainPassenger table missing — nothing to cascade */
  }
}

/**
 * Catalyst Data Store has no composite unique constraints. Two concurrent
 * createTrainRequest calls with the same PNR can both pass the duplicate
 * check before either INSERT lands → two rows for the same PNR.
 *
 * Strategy: after our INSERT, query ALL rows with this PNR. The lowest ROWID
 * wins (earliest insert). If our just-inserted row is NOT the winner, we
 * delete it and surface 409 to the loser. The winner gets its normal
 * success response.
 */
async function deduplicateByPnr(
  pnr: string,
  newRowId: string
): Promise<{ kept: boolean; canonical: CatalystRow | null }> {
  try {
    const rows = await executeZCQL<CatalystRow>(
      `SELECT * FROM ${TRAIN_TABLE} WHERE pnrNumber = '${zcqlEscapeValue(pnr)}' LIMIT 50`
    );
    if (rows.length <= 1) return { kept: true, canonical: rows[0] ?? null };
    rows.sort((a, b) => Number(a.ROWID ?? 0) - Number(b.ROWID ?? 0));
    const [keep, ...extras] = rows;
    for (const dupe of extras) {
      deleteRow(TRAIN_TABLE, String(dupe.ROWID)).catch((err) => {
        console.warn(
          `[trainRequest] Failed to delete duplicate row ${dupe.ROWID} (PNR ${pnr})`,
          err
        );
      });
    }
    return { kept: String(keep.ROWID) === newRowId, canonical: keep };
  } catch (err) {
    console.warn('[trainRequest] PNR dedupe query failed', err);
    return { kept: true, canonical: null };
  }
}

/**
 * Look up an existing TrainRequest by PNR. Returns the first match (any status)
 * or null if none exist. Used to enforce PNR uniqueness on create.
 * Prefers ZCQL push-down filter when enabled; falls back to in-memory scan
 * so duplicate detection still works when the ZCQL flag is off.
 */
async function findTrainRequestByPnr(pnr: string): Promise<CatalystRow | null> {
  if (!pnr) return null;
  if (useZCQL()) {
    try {
      const rows = await executeZCQL<CatalystRow>(
        `SELECT * FROM ${TRAIN_TABLE} WHERE pnrNumber = '${zcqlEscapeValue(pnr)}' LIMIT 1`
      );
      return rows[0] ?? null;
    } catch (err) {
      console.warn(
        '[trainRequest] ZCQL PNR lookup failed, falling back to listAllRows:',
        err instanceof Error ? err.message : err
      );
    }
  }
  try {
    const all = await listAllRows(TRAIN_TABLE);
    return all.find((r) => (r.pnrNumber ?? '').toString().trim() === pnr) ?? null;
  } catch {
    return null;
  }
}

// ── Endpoints ─────────────────────────────────────────────────────────────

/**
 * POST /api/train-requests
 */
export async function createTrainRequest(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const {
      passengerName,
      pnrNumber,
      trainName,
      trainNumber,
      journeyClass,
      dateOfJourney,
      fromStation,
      toStation,
      route,
      boardingPoint,
      bookingType,
      referencedBy,
      contactNumber,
      remarks,
      passengers,
      numberOfPassengers,
    } = req.body;

    const bType = (bookingType || 'GENERAL').toString().toUpperCase();
    if (!VALID_BOOKING_TYPES.has(bType)) {
      sendError(res, `Invalid bookingType: ${bookingType}`);
      return;
    }

    // Validate passengers BEFORE creating the parent so we never have to
    // roll back on input errors. Catalyst-side failures inside the actual
    // write are tolerated separately (see writePassengers).
    try {
      validatePassengers(passengers);
    } catch (err: any) {
      sendError(res, err?.message || 'Invalid passengers payload');
      return;
    }

    // Enforce PNR uniqueness — same PNR cannot be re-registered.
    // 409 Conflict so the frontend can branch on status if needed.
    const pnrTrim = (pnrNumber ?? '').toString().trim();
    if (pnrTrim) {
      const duplicate = await findTrainRequestByPnr(pnrTrim);
      if (duplicate) {
        sendError(
          res,
          `A Train EQ request with PNR ${pnrTrim} already exists. Each PNR can only be registered once.`,
          409
        );
        return;
      }
    }

    // Train EQ entries are now self-service: staff submission auto-approves
    // so the staff member can print the letter immediately. Admin sees
    // entries in a read-only list — no separate approval step.
    const nowIso = new Date().toISOString();
    let row: CatalystRow;
    try {
      const passengerCount = Number(numberOfPassengers);
      row = await insertRow(TRAIN_TABLE, {
        pnrNumber,
        passengerName,
        journeyClass,
        dateOfJourney: toCatalystDate(dateOfJourney) || nowCatalystIST(),
        fromStation,
        toStation,
        journeyRoute: route ?? null, // frontend `route` → Catalyst `journeyRoute`
        trainName: trainName ?? null,
        trainNumber: trainNumber ?? null,
        boardingPoint: boardingPoint ?? null,
        bookingType: bType,
        referencedBy: referencedBy ?? null,
        contactNumber: contactNumber ?? null,
        remarks: remarks ?? null,
        numberOfPassengers:
          Number.isFinite(passengerCount) && passengerCount > 0 ? passengerCount : null,
        status: 'APPROVED',
        approvedAt: toCatalystDate(nowIso),
        rejectionReason: null,
        signatureData: null,
        createdById: req.user.id,
        approvedById: req.user.id,
      });
    } catch (err) {
      // Surface the underlying Catalyst error message in the response so
      // the cause (column mismatch / size limit / etc.) is visible in
      // DevTools without having to dig through the backend terminal.
      const detail = err instanceof Error ? err.message : String(err);
      console.error('[trainRequest] Parent insert failed:', err);
      sendError(res, `Failed to create train request: ${detail}`, 500, detail);
      return;
    }

    // Race-safety: another request with the same PNR may have inserted
    // concurrently between our findTrainRequestByPnr check and the insert
    // above. Run dedupe — if WE'RE the loser, undo our work and return 409.
    if (pnrTrim) {
      const dedupe = await deduplicateByPnr(pnrTrim, String(row.ROWID));
      if (!dedupe.kept) {
        // Clean up our orphan parent row (passenger rows haven't been written
        // yet, so no further cleanup needed).
        deleteRow(TRAIN_TABLE, String(row.ROWID)).catch((err) => {
          console.warn(`[trainRequest] Failed to roll back lost-race row ${row.ROWID}`, err);
        });
        sendError(
          res,
          `A Train EQ request with PNR ${pnrTrim} already exists. Each PNR can only be registered once.`,
          409
        );
        return;
      }
    }

    // Assign a short sequential reference number (TREQ-YYYY-NNNN). Best-effort,
    // post-insert update so creation still succeeds if the `trainRequestNumber`
    // column isn't in Catalyst yet — the reference then falls back to the ROWID
    // form (TREQ-<rowid>) at the read layer until the column is added. Done
    // after dedupe so a lost-race row never burns a sequence number.
    try {
      const trainRequestNumber = await nextTrainRequestNumber();
      await updateRow(TRAIN_TABLE, { ROWID: String(row.ROWID), trainRequestNumber });
      row.trainRequestNumber = trainRequestNumber;
    } catch (err) {
      console.warn('[trainRequest] Could not assign trainRequestNumber (column missing?)', err);
    }

    // Best-effort passenger persistence. Schema/table issues are logged
    // inside writePassengers and don't fail the request; the train request
    // itself was already created above.
    if (Array.isArray(passengers) && passengers.length > 0) {
      await writePassengers(String(row.ROWID), passengers);
    }

    // Auto self-assign: the train EQ request becomes a task owned by its
    // creator so it shows on the Tasks board / Task Tracker as PENDING
    // (ASSIGNED). It moves to In Progress when forwarded, and to Completed when
    // the EQ letter is printed (see generateTrainEQPDF). Best-effort.
    const trainRefNo = row.trainRequestNumber
      ? String(row.trainRequestNumber)
      : `TREQ-${String(row.ROWID)}`;
    await autoCreateSelfTask({
      userId: req.user.id,
      title: `Train EQ ${trainRefNo}: ${passengerName} (PNR ${pnrNumber})`,
      taskType: 'TRAIN_REQUEST',
      referenceId: String(row.ROWID),
      referenceType: 'TRAIN_REQUEST',
      description: remarks ? String(remarks).slice(0, 500) : null,
    });

    const [shaped] = await hydrate([row], { passengers: true });
    sendSuccess(res, shaped, 'Train request created successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to create train request', error);
  }
}

/**
 * Turn a free-text search box into the most selective predicate its SHAPE
 * allows.
 *
 * The point is that most real searches here are identifiers, not prose: staff
 * hunting an old letter hold a PNR or a printed TREQ- reference. Recognising
 * those shapes turns the query into an equality match the datastore can
 * satisfy directly, instead of an unanchored contains-match that can't use an
 * index. Only a genuine name fragment falls through to the slow form — and
 * even that is now ONE server-side query rather than reading the whole table
 * into Node and filtering it there.
 *
 * All LIKE conditions go through zcqlLike() because the Catalyst wildcard is
 * `*`, not `%`, and getting that wrong matches zero rows without erroring.
 */
/**
 * Is the optional `trainRequestNumber` column present in this datastore?
 *
 * VERIFIED ABSENT in Development — ZCQL answers "Unkown Table TrainRequest or
 * Unkown Column trainRequestNumber". ZCQL rejects the ENTIRE query when it
 * references an unknown column, so a single unguarded mention of this column
 * would 400 the whole search and show the user an error instead of results.
 * Every query below that touches it must be gated on this.
 */
function hasRefNumberColumn(): Promise<boolean> {
  return columnExists(TRAIN_TABLE, 'trainRequestNumber');
}

function classifySearch(raw: string, hasRefNo: boolean, usedConditions = 0): string {
  const t = raw.trim();
  const q = zcqlEscapeValue(t);

  // Issued reference number: TREQ-YYYY-NNNN
  if (hasRefNo && /^TREQ-\d{4}-\d{1,6}$/i.test(t)) {
    return `trainRequestNumber = '${q}'`;
  }
  // "TREQ-<rowid>" — the reference the UI displays for rows that predate the
  // trainRequestNumber column. The prefix makes it unambiguous.
  const prefixed = t.match(/^TREQ-(\d+)$/i);
  if (prefixed) {
    return `ROWID = ${prefixed[1]}`;
  }
  // A BARE number is ambiguous, and the disambiguator is length. Catalyst
  // ROWIDs are ~17 digits (e.g. 37719000000744038) while a PNR is 10. An
  // earlier `\d{6,}` threshold classified every PNR as a ROWID, so searching a
  // PNR returned nothing — the exact false-negative this rewrite exists to
  // kill. Anything shorter than a ROWID is treated as a PNR prefix.
  if (/^\d{15,}$/.test(t)) {
    return `ROWID = ${t}`;
  }
  if (/^\d{3,14}$/.test(t)) {
    return zcqlLike('pnrNumber', t, 'prefix');
  }
  // A TREQ- reference we can't match as a column: with no such column, the
  // only rows that could match are ones whose displayed reference is the
  // ROWID fallback, and that shape was handled above. Match nothing rather
  // than returning every row.
  if (/^TREQ-/i.test(t)) {
    return `ROWID = 0`;
  }
  // Most-identifying first: if the condition budget forces columns to be
  // dropped, the ones people actually search must survive.
  const columns = ['passengerName', 'pnrNumber', 'trainName'];
  if (hasRefNo) columns.splice(2, 0, 'trainRequestNumber');
  const { clause } = zcqlSearchWithinBudget(columns, t, usedConditions);
  // No budget left for search at all — match nothing rather than silently
  // ignoring the search box and returning the unfiltered list.
  return clause ?? 'ROWID = 0';
}

/**
 * Inclusive end-of-day bound for a date filter.
 *
 * `toCatalystDate('2026-08-07')` yields a midnight timestamp, so using it as a
 * `<=` bound excludes every row ON the end date — the filter silently drops a
 * day. Pin the bound to 23:59:59 of that date instead.
 */
function endOfDayBound(value: string): string | null {
  const formatted = toCatalystDate(value);
  if (!formatted) return null;
  return `${formatted.slice(0, 10)} 23:59:59`;
}

/**
 * WHERE clauses only — no ORDER BY, no LIMIT. Kept separate so the page query,
 * the COUNT query and the CSV export all derive from the SAME predicate. A
 * total that disagrees with the rows on screen is its own bug.
 */
function buildTrainWhere(
  staffIds: string[] | null,
  filters: TrainRequestFilters,
  hasRefNo: boolean
): string[] {
  // Build every NON-search clause first, then give the search box whatever is
  // left of the 10-condition budget. Search is the only variable-width clause,
  // so it is the one that must yield — and it yields visibly (a warning names
  // the dropped columns) rather than 400-ing the whole query.
  const conditions: string[] = [];
  // STAFF scoping — match ALL identity aliases (ROWID + legacy UUID), since
  // rows written in different eras carry different forms of the same user.
  if (staffIds && staffIds.length > 0) {
    conditions.push(zcqlAnyOf('createdById', staffIds));
  }
  if (filters.status) {
    conditions.push(`status = '${zcqlEscapeValue(String(filters.status))}'`);
  }
  conditions.push(
    ...dateRangeClauses(
      'dateOfJourney',
      filters.startDate as unknown as string,
      filters.endDate as unknown as string
    )
  );

  if (filters.search && String(filters.search).trim()) {
    // +1 leaves headroom for the keyset predicate the page query appends.
    const used = countZcqlConditions(conditions) + 3;
    conditions.push(classifySearch(String(filters.search), hasRefNo, used));
  }
  return conditions;
}

function whereSql(clauses: string[]): string {
  return clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
}

/**
 * Fetch `want` rows starting at `skip`, in ZCQL-legal chunks.
 *
 * Exists only for the legacy page/limit contract, which permits limits up to
 * 1000 while ZCQL rejects LIMIT > 300. The old code clamped to 299 and echoed
 * the requested limit back in the meta, so at limit=1000 page 1 returned rows
 * 0-298 and page 2 (skip=1000) returned rows 1000-1298 — rows 299-999 were
 * returned by no page at all, with no error. Chunking serves the window the
 * caller actually asked for.
 *
 * New callers should use cursor pagination; this is a compatibility path.
 */
async function fetchTrainWindow(
  filterWhere: string,
  skip: number,
  want: number
): Promise<CatalystRow[]> {
  // Delegates to the shared KEYSET walk. The obvious implementation — LIMIT 299
  // with a marching OFFSET — silently DUPLICATES rows at chunk boundaries:
  // measured on a 2067-row table with a full total order and no concurrent
  // writes, the OFFSET walk returned 2068 rows / 2067 unique while the keyset
  // walk returned exactly 2067. Catalyst's OFFSET is not stable, and a
  // tiebreaker in ORDER BY does not fix it.
  return fetchOffsetWindow(TRAIN_TABLE, filterWhere, 'CREATEDTIME', 'newest', skip, want);
}

/**
 * Resolve STAFF identity aliases, or null for admin-level roles.
 *
 * Returns an empty array when a staff user resolves to no aliases at all —
 * callers MUST treat that as "match nothing", never as "no filter". Dropping
 * an empty scope would hand one staffer the whole table.
 */
async function resolveStaffScope(
  req: AuthenticatedRequest
): Promise<string[] | null> {
  if (req.user?.role !== 'STAFF') return null;
  return getUserIdAliases(req.user.id);
}

/**
 * GET /api/train-requests
 *
 * Cursor-paged (keyset). Query params:
 *   limit   1-100, default 25
 *   cursor  opaque; omit for the first page
 *   sort    'newest' (default) | 'oldest'
 *   status, search, startDate, endDate
 *   include=passengers  opt into nested passenger rows (list screens don't need them)
 *
 * `sort=oldest` is not decoration: it is how you reach the far end of the
 * table. The oldest record is row 1 of an oldest-first list, so "jump to the
 * end" costs exactly one query no matter how many rows exist. That is why
 * there is no OFFSET anywhere on this path.
 *
 * Legacy `page=` callers still work — see the shim below — but new callers
 * should use cursors.
 */
export async function getTrainRequests(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const filters = req.query as TrainRequestFilters;
    const wantPassengers = String(req.query.include ?? '')
      .split(',')
      .includes('passengers');

    const staffIds = await resolveStaffScope(req);
    if (staffIds && staffIds.length === 0) {
      sendSuccess(res, [], 'Train requests retrieved successfully', 200, {
        limit: DEFAULT_KEYSET_LIMIT,
        count: 0,
        total: 0,
        totalKnown: true,
        hasMore: false,
        nextCursor: null,
        sort: 'newest',
      });
      return;
    }

    const filterClauses = buildTrainWhere(staffIds, filters, await hasRefNumberColumn());
    const filterWhere = whereSql(filterClauses);

    // Count is display-only and runs in PARALLEL with the page query, only on
    // the first page, behind a stale-while-revalidate cache. Scoping the cache
    // key by role + user id is mandatory: STAFF results are per-identity, and a
    // shared key would leak one staffer's row count to another.
    const countKey =
      `traineq:count:${req.user?.role}:${req.user?.id}:` + JSON.stringify(filterClauses);
    const countPromise = () =>
      cacheSWR(countKey, 30, 120, () => countRows(TRAIN_TABLE, filterWhere));

    // ── Legacy page/limit path ──────────────────────────────────────────────
    // A caller opts into cursor pagination by sending `cursor` or `sort`;
    // everything else keeps the old page/limit contract exactly, including
    // limits above the keyset page cap (PrintCenter asks for 200 in one go).
    // Silently clamping those callers would have been the same class of bug
    // this change exists to remove.
    const usesCursorApi =
      req.query.cursor !== undefined || req.query.sort !== undefined;

    if (!usesCursorApi) {
      const { page, limit, skip } = parsePagination(
        req.query as { page?: string; limit?: string }
      );
      const [fetched, total] = await Promise.all([
        // ZCQL caps LIMIT at 300, but the legacy contract allows up to 1000,
        // so satisfy the window in chunks instead of quietly truncating it.
        fetchTrainWindow(filterWhere, skip, limit + 1),
        countPromise(),
      ]);
      const hasMore = fetched.length > limit;
      const rows = hasMore ? fetched.slice(0, limit) : fetched;
      const data = await hydrate(rows, { passengers: wantPassengers });
      sendSuccess(res, data, 'Train requests retrieved successfully', 200, {
        page,
        limit,
        count: rows.length,
        hasMore,
        ...(total !== null
          ? { total, totalKnown: true, totalPages: Math.ceil(total / limit) }
          : { totalKnown: false }),
      });
      return;
    }

    // ── Keyset path ─────────────────────────────────────────────────────────
    const { limit, cursor: cursorRaw, sort } = parseKeysetQuery(req.query);
    const cursor = decodeCursor(cursorRaw);

    const pageClauses = [...filterClauses];
    if (cursor) pageClauses.push(keysetPredicate('CREATEDTIME', cursor, sort));

    const [fetched, total] = await Promise.all([
      executeZCQL<CatalystRow>(
        `SELECT * FROM ${TRAIN_TABLE}${whereSql(pageClauses)} ` +
          `${keysetOrderBy('CREATEDTIME', sort)} LIMIT ${assertZcqlLimit(limit + 1)}`
      ),
      // Only page 1 pays for the count; later pages reuse what the client has.
      cursor ? Promise.resolve(null) : countPromise(),
    ]);

    const hasMore = fetched.length > limit;
    const pageRows = hasMore ? fetched.slice(0, limit) : fetched;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ t: String(last.CREATEDTIME), r: String(last.ROWID) })
        : null;

    const data = await hydrate(pageRows, { passengers: wantPassengers });

    sendSuccess(res, data, 'Train requests retrieved successfully', 200, {
      limit,
      count: pageRows.length,
      hasMore,
      nextCursor,
      sort,
      // `total` is present ONLY when it is real. It is never derived from the
      // page contents — a count computed as skip + rows.length + hasMore is a
      // fabrication that can never exceed currentPage + 1.
      ...(total !== null && total !== undefined
        ? { total, totalKnown: true, totalPages: Math.ceil(total / limit) }
        : { totalKnown: false }),
    });
  } catch (error) {
    sendServerError(res, 'Failed to get train requests', error);
  }
}

/**
 * GET /api/train-requests/:id
 */
export async function getTrainRequestById(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const row = await getRow(TRAIN_TABLE, id);
    if (!row) {
      sendNotFound(res, 'Train request not found');
      return;
    }
    if (req.user?.role === 'STAFF') {
      const aliases = await getUserIdAliases(req.user.id);
      if (!aliases.includes(String(row.createdById))) {
        sendError(res, 'Forbidden', 403);
        return;
      }
    }
    const [shaped] = await hydrate([row], { passengers: true });
    sendSuccess(res, shaped, 'Train request retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get train request', error);
  }
}

/**
 * PUT /api/train-requests/:id
 */
export async function updateTrainRequest(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    // Corrections: staff may only edit their OWN train EQ requests (matched
    // against all identity aliases). Admins can edit any.
    const existing = await getRow(TRAIN_TABLE, id);
    if (!existing) {
      sendNotFound(res, 'Train request not found');
      return;
    }
    if (req.user?.role === 'STAFF') {
      const aliases = await getUserIdAliases(req.user.id);
      if (!aliases.includes(String(existing.createdById))) {
        sendError(res, 'You can only edit your own train EQ requests', 403);
        return;
      }
    }

    const body = { ...req.body };
    delete body.id;
    delete body.createdById;
    delete body.createdAt;
    delete body.updatedAt;
    delete body.ROWID;
    delete body.CREATEDTIME;
    delete body.MODIFIEDTIME;
    delete body.CREATORID;

    const updateData: Record<string, unknown> = { ROWID: id };

    if (body.pnrNumber !== undefined) updateData.pnrNumber = body.pnrNumber;
    if (body.passengerName !== undefined) updateData.passengerName = body.passengerName;
    if (body.journeyClass !== undefined) updateData.journeyClass = body.journeyClass;
    if (body.dateOfJourney !== undefined) {
      updateData.dateOfJourney = toCatalystDate(body.dateOfJourney);
    }
    if (body.fromStation !== undefined) updateData.fromStation = body.fromStation;
    if (body.toStation !== undefined) updateData.toStation = body.toStation;
    if (body.route !== undefined) updateData.journeyRoute = body.route; // mapping
    if (body.trainName !== undefined) updateData.trainName = body.trainName;
    if (body.trainNumber !== undefined) updateData.trainNumber = body.trainNumber;
    if (body.boardingPoint !== undefined) updateData.boardingPoint = body.boardingPoint;
    if (body.bookingType !== undefined) {
      const bt = String(body.bookingType).toUpperCase();
      if (!VALID_BOOKING_TYPES.has(bt)) {
        sendError(res, `Invalid bookingType: ${body.bookingType}`);
        return;
      }
      updateData.bookingType = bt;
    }
    if (body.referencedBy !== undefined) updateData.referencedBy = body.referencedBy;
    if (body.contactNumber !== undefined) updateData.contactNumber = body.contactNumber;
    if (body.remarks !== undefined) updateData.remarks = body.remarks;
    if (body.numberOfPassengers !== undefined) {
      const n = Number(body.numberOfPassengers);
      updateData.numberOfPassengers = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    }
    if (body.status !== undefined) {
      if (!VALID_STATUSES.has(body.status)) {
        sendError(res, `Invalid status: ${body.status}`);
        return;
      }
      updateData.status = body.status;
    }

    // Edit audit — stamp who edited and when. Never let the client override it.
    // Written via updateRowTolerant so it still succeeds on a Catalyst schema
    // that doesn't have the audit columns yet.
    if (req.user) {
      updateData.lastEditedById = req.user.id;
      updateData.lastEditedAt = nowCatalystIST();
    }

    const updated = await updateRowTolerant(TRAIN_TABLE, updateData as any, [
      'lastEditedById',
      'lastEditedAt',
    ]);

    // If passengers array provided, replace all existing passengers
    // (delete + reinsert). Validation runs synchronously up-front;
    // Catalyst-side write issues inside writePassengers are logged.
    if (Array.isArray(body.passengers)) {
      try {
        validatePassengers(body.passengers);
      } catch (err: any) {
        sendError(res, err?.message || 'Invalid passengers payload');
        return;
      }
      await deletePassengersFor(id);
      await writePassengers(id, body.passengers);
    }

    const [shaped] = await hydrate([updated], { passengers: true });
    sendSuccess(res, shaped, 'Train request updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update train request', error);
  }
}

/**
 * PATCH /api/train-requests/:id/approve
 * Admin-only. Only PENDING → APPROVED.
 */
export async function approveTrainRequest(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const { id } = req.params;
    const existing = await getRow(TRAIN_TABLE, id);
    if (!existing) {
      sendNotFound(res, 'Train request not found');
      return;
    }
    if (existing.status !== 'PENDING') {
      sendError(res, 'Only pending train requests can be approved');
      return;
    }
    const updated = await updateRow(TRAIN_TABLE, {
      ROWID: id,
      status: 'APPROVED',
      approvedById: req.user.id,
      approvedAt: nowCatalystIST(),
    });
    const [shaped] = await hydrate([updated], { passengers: true });
    sendSuccess(res, shaped, 'Train request approved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to approve train request', error);
  }
}

/**
 * PATCH /api/train-requests/:id/reject
 * Admin-only. Only PENDING → REJECTED.
 */
export async function rejectTrainRequest(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const { id } = req.params;
    const { reason } = req.body;
    const existing = await getRow(TRAIN_TABLE, id);
    if (!existing) {
      sendNotFound(res, 'Train request not found');
      return;
    }
    if (existing.status !== 'PENDING') {
      sendError(res, 'Only pending train requests can be rejected');
      return;
    }
    const updated = await updateRow(TRAIN_TABLE, {
      ROWID: id,
      status: 'REJECTED',
      rejectionReason: reason || null,
      approvedById: req.user.id,
    });
    const [shaped] = await hydrate([updated], { passengers: true });
    sendSuccess(res, shaped, 'Train request rejected');
  } catch (error) {
    sendServerError(res, 'Failed to reject train request', error);
  }
}

/**
 * PATCH /api/train-requests/:id/resolve
 * Admin-only. Only APPROVED → RESOLVED.
 */
export async function resolveTrainRequest(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }
    const { id } = req.params;
    const existing = await getRow(TRAIN_TABLE, id);
    if (!existing) {
      sendNotFound(res, 'Train request not found');
      return;
    }
    if (existing.status !== 'APPROVED') {
      sendError(
        res,
        'Only accepted (approved) train requests can be marked resolved'
      );
      return;
    }
    const updated = await updateRow(TRAIN_TABLE, {
      ROWID: id,
      status: 'RESOLVED',
    });
    const [shaped] = await hydrate([updated], { passengers: true });
    sendSuccess(res, shaped, 'Train request marked as resolved');
  } catch (error) {
    sendServerError(res, 'Failed to resolve train request', error);
  }
}

/**
 * DELETE /api/train-requests/:id — admin. Cascades passengers.
 */
export async function deleteTrainRequest(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    await deletePassengersFor(id);
    await deleteRow(TRAIN_TABLE, id);
    sendSuccess(res, null, 'Train request deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete train request', error);
  }
}

/**
 * GET /api/train-requests/queue/pending
 * Admin-only. Returns PENDING ordered by dateOfJourney ASC.
 */
export async function getPendingQueue(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    // Previously read the entire table and filtered `status === 'PENDING'` in
    // JS — paying the full scan even though status is the most selective
    // column in the schema. Push it down instead.
    const { limit, cursor: cursorRaw } = parseKeysetQuery(_req.query);
    const cursor = decodeCursor(cursorRaw);

    const clauses = [`status = 'PENDING'`];
    const filterWhere = whereSql(clauses);
    if (cursor) clauses.push(keysetPredicate('dateOfJourney', cursor, 'oldest'));

    const [fetched, total] = await Promise.all([
      executeZCQL<CatalystRow>(
        `SELECT * FROM ${TRAIN_TABLE}${whereSql(clauses)} ` +
          `${keysetOrderBy('dateOfJourney', 'oldest')} LIMIT ${assertZcqlLimit(limit + 1)}`
      ),
      cursor
        ? Promise.resolve(null)
        : cacheSWR('traineq:count:pending', 30, 120, () =>
            countRows(TRAIN_TABLE, filterWhere)
          ),
    ]);

    const hasMore = fetched.length > limit;
    const rows = hasMore ? fetched.slice(0, limit) : fetched;
    const last = rows[rows.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ t: String(last.dateOfJourney), r: String(last.ROWID) })
        : null;

    const data = await hydrate(rows);

    sendSuccess(res, data, 'Pending queue retrieved', 200, {
      limit,
      count: rows.length,
      hasMore,
      nextCursor,
      ...(total !== null && total !== undefined
        ? { total, totalKnown: true, totalPages: Math.ceil(total / limit) }
        : { totalKnown: false }),
    });
  } catch (error) {
    sendServerError(res, 'Failed to get pending queue', error);
  }
}

// ── CSV export ─────────────────────────────────────────────────────────────

const CSV_COLUMNS: Array<[string, (r: CatalystRow, creator: string) => string]> = [
  ['Reference No', (r) => String(r.trainRequestNumber ?? `TREQ-${r.ROWID}`)],
  ['Passenger', (r) => String(r.passengerName ?? '')],
  ['PNR', (r) => String(r.pnrNumber ?? '')],
  ['Contact', (r) => String(r.contactNumber ?? '')],
  ['Train Name', (r) => String(r.trainName ?? '')],
  ['Train No', (r) => String(r.trainNumber ?? '')],
  ['Class', (r) => String(r.journeyClass ?? '')],
  ['Journey Date', (r) => String(r.dateOfJourney ?? '')],
  ['From', (r) => String(r.fromStation ?? '')],
  ['To', (r) => String(r.toStation ?? '')],
  ['Passengers', (r) => String(r.numberOfPassengers ?? '')],
  ['Status', (r) => String(r.status ?? '')],
  ['Created By', (_r, creator) => creator],
  ['Created', (r) => String(r.CREATEDTIME ?? '')],
];

function csvCell(value: string): string {
  // Quote always — simpler than deciding, and immune to embedded , " or newline.
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * GET /api/train-requests/export.csv
 *
 * Streams every row matching the SAME filters as the list. Exists because
 * server-side pagination would otherwise silently downgrade the export button
 * from "the 200 rows we happened to load" to "the 25 on screen" — the bulk
 * need is real, it just doesn't belong on the interactive path.
 *
 * Walks with a keyset cursor rather than OFFSET, so memory and per-batch cost
 * stay flat regardless of how many rows are exported, and writes each batch
 * straight to the socket instead of buffering the whole file.
 */
export async function exportTrainRequests(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const filters = req.query as TrainRequestFilters;
    const staffIds = await resolveStaffScope(req);
    // Same guard as the list: an empty staff scope must match nothing.
    if (staffIds && staffIds.length === 0) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="train-eq.csv"');
      res.end('﻿' + CSV_COLUMNS.map(([h]) => csvCell(h)).join(',') + '\n');
      return;
    }

    const filterClauses = buildTrainWhere(staffIds, filters, await hasRefNumberColumn());

    // Resolve creator names once — the AppUser list is cached, so naming
    // 30,000 rows costs no extra round-trips.
    const userMap = new Map<string, string>();
    try {
      for (const u of await getCachedTableList('AppUser')) {
        const name = String(u.name ?? '');
        userMap.set(String(u.ROWID), name);
        if (u.legacyId) userMap.set(String(u.legacyId), name);
      }
    } catch {
      /* names are cosmetic — export without them rather than failing */
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="train-eq-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    // BOM so Excel reads it as UTF-8 and renders Indian-language names.
    res.write('﻿' + CSV_COLUMNS.map(([h]) => csvCell(h)).join(',') + '\n');

    const PAGE = ZCQL_MAX_LIMIT;
    const MAX_BATCHES = 120; // ~35k rows — a ceiling, but a LOUD one (see below)
    let cursor: ListCursor | null = null;
    let truncated = false;

    for (let i = 0; i < MAX_BATCHES; i++) {
      const clauses = [...filterClauses];
      if (cursor) clauses.push(keysetPredicate('CREATEDTIME', cursor, 'newest'));

      const rows = await executeZCQL<CatalystRow>(
        `SELECT * FROM ${TRAIN_TABLE}${whereSql(clauses)} ` +
          `ORDER BY CREATEDTIME DESC, ROWID DESC LIMIT ${assertZcqlLimit(PAGE)}`
      );
      if (rows.length === 0) break;

      for (const r of rows) {
        const creator = userMap.get(String(r.createdById)) ?? '';
        res.write(CSV_COLUMNS.map(([, get]) => csvCell(get(r, creator))).join(',') + '\n');
      }

      if (rows.length < PAGE) break;
      const last = rows[rows.length - 1];
      cursor = { t: String(last.CREATEDTIME), r: String(last.ROWID) };
      truncated = i === MAX_BATCHES - 1;
    }

    // Never let a cap masquerade as a complete export.
    if (truncated) {
      res.write(csvCell('-- truncated at the export limit; narrow the date range --') + '\n');
    }
    res.end();
  } catch (error) {
    // Headers may already be sent mid-stream; only send an error body if not.
    if (res.headersSent) {
      res.end('\n"-- export failed partway through; retry --"\n');
      return;
    }
    sendServerError(res, 'Failed to export train requests', error);
  }
}

/**
 * GET /api/train-requests/pnr/:pnr
 *
 * RapidAPI integration is dropped. This stub returns a 410 Gone so the
 * frontend stops calling it.
 */
export async function checkPNRStatus(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  sendError(
    res,
    'PNR auto-fetch has been disabled. Please enter train details manually.',
    410
  );
}
