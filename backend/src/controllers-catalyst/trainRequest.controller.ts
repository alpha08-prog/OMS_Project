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
  zcqlSafeLimit,
  CatalystRow,
} from '../lib/catalyst-client';
import { useZCQL } from '../config/feature-flags';
import { getCachedTableList } from '../lib/catalyst-user-lookup';
import { autoCreateSelfTask } from './task.controller';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendServerError,
} from '../utils/response';
import { parsePagination, calculatePaginationMeta } from '../utils/pagination';
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
 * Best-effort sequential reference number: TREQ-<IST year>-NNNN. Scans existing
 * trainRequestNumber values for the current year and returns max+1. Not
 * transaction-safe — adequate for office-scale concurrency. Mirrors
 * nextGrievanceNumber().
 */
async function nextTrainRequestNumber(): Promise<string> {
  const istYear = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCFullYear();
  const prefix = `TREQ-${istYear}-`;
  let maxSeq = 0;
  try {
    const rows = await listAllRows(TRAIN_TABLE);
    for (const r of rows) {
      const num = String(r.trainRequestNumber ?? '');
      if (num.startsWith(prefix)) {
        const seq = parseInt(num.slice(prefix.length), 10);
        if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
      }
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
      if (wanted.has(rowId)) {
        map.set(rowId, { id: rowId, name: String(u.name), email: String(u.email) });
      } else if (legacyId && wanted.has(legacyId)) {
        map.set(legacyId, { id: legacyId, name: String(u.name), email: String(u.email) });
      }
    }
  } catch {
    /* Catalyst unreachable — return empty map */
  }
  return map;
}

/** Fetch passengers for a set of train request IDs (single Catalyst call). */
async function passengersByRequestId(
  requestIds: string[]
): Promise<Map<string, any[]>> {
  const out = new Map<string, any[]>();
  if (requestIds.length === 0) return out;
  const idSet = new Set(requestIds);
  let allPassengers: CatalystRow[] = [];
  try {
    allPassengers = await listAllRows(PASSENGER_TABLE);
  } catch {
    return out; // Table may not exist yet
  }
  for (const p of allPassengers) {
    if (!p.trainRequestId) continue;
    const tid = String(p.trainRequestId);
    if (!idSet.has(tid)) continue;
    (out.get(tid) || out.set(tid, []).get(tid))!.push(shapePassenger(p));
  }
  return out;
}

/** Attach createdBy + approvedBy + nested passengers to a list of train requests. */
async function hydrate(rows: CatalystRow[]): Promise<any[]> {
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
    passengersByRequestId(safe.map((r) => String(r.ROWID))),
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
    const all = await listAllRows(PASSENGER_TABLE);
    const matches = all
      .filter((p) => p.trainRequestId === trainRequestId)
      .map((p) => String(p.ROWID));
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

    const [shaped] = await hydrate([row]);
    sendSuccess(res, shaped, 'Train request created successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to create train request', error);
  }
}

function buildTrainZCQL(
  user: { id: string; role: string } | undefined,
  filters: TrainRequestFilters
): string {
  const conditions: string[] = [];
  if (user?.role === 'STAFF') {
    conditions.push(`createdById = '${zcqlEscapeValue(user.id)}'`);
  }
  if (filters.status) {
    conditions.push(`status = '${zcqlEscapeValue(String(filters.status))}'`);
  }
  if (filters.search) {
    const raw = String(filters.search).trim();
    const q = zcqlEscapeValue(raw);
    const clauses = [
      `passengerName LIKE '%${q}%'`,
      `pnrNumber LIKE '%${q}%'`,
      `trainName LIKE '%${q}%'`,
      `trainRequestNumber LIKE '%${q}%'`,
    ];
    // Legacy "TREQ-<rowid>" reference → match the ROWID directly.
    const m = raw.match(/^TREQ-(\d+)$/i);
    if (m) clauses.push(`ROWID = ${m[1]}`);
    conditions.push(`(${clauses.join(' OR ')})`);
  }
  if (filters.startDate) {
    const start = toCatalystDate(filters.startDate as unknown as string);
    if (start) conditions.push(`dateOfJourney >= '${start}'`);
  }
  if (filters.endDate) {
    const end = toCatalystDate(filters.endDate as unknown as string);
    if (end) conditions.push(`dateOfJourney <= '${end}'`);
  }
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  return `SELECT * FROM ${TRAIN_TABLE}${where} ORDER BY CREATEDTIME DESC`;
}

/**
 * GET /api/train-requests
 */
export async function getTrainRequests(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string }
    );
    const filters = req.query as TrainRequestFilters;

    let pageRows: CatalystRow[];
    let total: number;

    // Free-text search (incl. reference number / TREQ-<rowid>) always runs
    // through the JS path: it reliably matches trainRequestNumber + ROWID and
    // scans the whole table, sidestepping ZCQL quirks and a possibly-missing
    // trainRequestNumber column. ZCQL still handles the common list with no search.
    if (useZCQL() && !filters.search) {
      const baseQuery = buildTrainZCQL(req.user, filters);
      const safeLimit = zcqlSafeLimit(limit);
      const fetched = await executeZCQL<CatalystRow>(`${baseQuery} LIMIT ${safeLimit + 1} OFFSET ${skip}`);
      const hasMore = fetched.length > safeLimit;
      pageRows = hasMore ? fetched.slice(0, safeLimit) : fetched;
      total = skip + pageRows.length + (hasMore ? 1 : 0);
    } else {
      let rows = await listAllRows(TRAIN_TABLE);

      if (req.user?.role === 'STAFF') {
        rows = rows.filter((r) => r.createdById === req.user!.id);
      }
      if (filters.status) rows = rows.filter((r) => r.status === filters.status);
      if (filters.search) {
        const raw = String(filters.search).trim();
        const q = raw.toLowerCase();
        // "TREQ-<rowid>" or a bare ROWID search → the digits to match directly.
        const rowidMatch = raw.match(/^(?:TREQ-)?(\d{6,})$/i);
        rows = rows.filter((r) => {
          // The SAME human reference the UI shows: trainRequestNumber
          // (TREQ-YYYY-NNNN) when present, else the ROWID fallback (TREQ-<rowid>).
          const refNo = (r.trainRequestNumber
            ? String(r.trainRequestNumber)
            : `TREQ-${String(r.ROWID)}`
          ).toLowerCase();
          return (
            (r.passengerName || '').toLowerCase().includes(q) ||
            (r.pnrNumber || '').includes(q) ||
            (r.trainName || '').toLowerCase().includes(q) ||
            refNo.includes(q) ||
            (rowidMatch ? String(r.ROWID) === rowidMatch[1] : false)
          );
        });
      }
      if (filters.startDate) {
        const start = new Date(filters.startDate as unknown as string).getTime();
        rows = rows.filter(
          (r) => r.dateOfJourney && new Date(r.dateOfJourney).getTime() >= start
        );
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate as unknown as string).getTime();
        rows = rows.filter(
          (r) => r.dateOfJourney && new Date(r.dateOfJourney).getTime() <= end
        );
      }

      rows.sort((a, b) => {
        const ta = a.CREATEDTIME ? new Date(a.CREATEDTIME).getTime() : 0;
        const tb = b.CREATEDTIME ? new Date(b.CREATEDTIME).getTime() : 0;
        return tb - ta;
      });

      total = rows.length;
      pageRows = rows.slice(skip, skip + limit);
    }

    const data = await hydrate(pageRows);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, data, 'Train requests retrieved successfully', 200, meta);
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
    if (req.user?.role === 'STAFF' && row.createdById !== req.user.id) {
      sendError(res, 'Forbidden', 403);
      return;
    }
    const [shaped] = await hydrate([row]);
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

    const [shaped] = await hydrate([updated]);
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
    const [shaped] = await hydrate([updated]);
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
    const [shaped] = await hydrate([updated]);
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
    const [shaped] = await hydrate([updated]);
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
    const { page, limit, skip } = parsePagination(
      _req.query as { page?: string; limit?: string }
    );
    let rows = await listAllRows(TRAIN_TABLE);
    rows = rows.filter((r) => r.status === 'PENDING');
    rows.sort((a, b) => {
      const ta = a.dateOfJourney ? new Date(a.dateOfJourney).getTime() : Infinity;
      const tb = b.dateOfJourney ? new Date(b.dateOfJourney).getTime() : Infinity;
      return ta - tb;
    });

    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    const data = await hydrate(paged);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, data, 'Pending queue retrieved', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get pending queue', error);
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
