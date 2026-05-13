/**
 * Train Request controller — backed by Catalyst Data Store via custom REST client.
 *
 * Mirrors backend/src/controllers/trainRequest.controller.ts with these differences:
 *   - The RapidAPI PNR-status endpoint is NOT migrated. Frontend now collects all
 *     fields manually instead of auto-filling from PNR. The Prisma version still
 *     handles `GET /pnr/:pnr` if needed.
 *   - Catalyst column `journeyRoute` ↔ frontend `route` mapping (route is a
 *     reserved word in some SQL engines).
 *   - Optional nested `passengers` array writes rows to TrainPassenger and
 *     cascade-deletes them when the parent is removed.
 *   - Status machine enforced: PENDING → APPROVED|REJECTED → RESOLVED.
 *   - Cross-DB user lookups (assignedTo equiv. createdBy/approvedBy) hit Neon
 *     since the User table still lives there.
 */
import { Response } from 'express';
import {
  insertRow,
  listAllRows,
  getRow,
  updateRow,
  deleteRow,
  toCatalystDate,
  executeZCQL,
  zcqlEscapeValue,
  zcqlSafeLimit,
  CatalystRow,
} from '../lib/catalyst-client';
import { useZCQL } from '../config/feature-flags';
import { getCachedTableList } from '../lib/catalyst-user-lookup';
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

function parseInt0(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return isNaN(n) ? 0 : Math.trunc(n);
}

/** Reshape a Catalyst Train row into the same JSON the Prisma controller returns. */
function shapeTrainRequest(
  row: CatalystRow,
  createdBy?: { id: string; name: string; email: string } | null,
  approvedBy?: { id: string; name: string; email: string } | null,
  passengers: any[] = []
) {
  return {
    id: String(row.ROWID),
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
    createdById: row.createdById,
    approvedById: row.approvedById ?? null,
    createdAt: row.CREATEDTIME,
    updatedAt: row.MODIFIEDTIME,
    createdBy: createdBy ?? null,
    approvedBy: approvedBy ?? null,
    train_passengers: passengers,
  };
}

function shapePassenger(row: CatalystRow) {
  return {
    id: String(row.ROWID),
    trainRequestId: row.trainRequestId,
    name: row.passengerName,
    age: parseInt0(row.age),
    gender: row.gender,
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
  }
  const users = await lookupUsers(userIds);
  const passengersMap = await passengersByRequestId(safe.map((r) => String(r.ROWID)));

  return safe.map((r) =>
    shapeTrainRequest(
      r,
      users.get(String(r.createdById)) ?? null,
      r.approvedById ? users.get(String(r.approvedById)) ?? null : null,
      passengersMap.get(String(r.ROWID)) ?? []
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
    for (const id of matches) {
      try {
        await deleteRow(PASSENGER_TABLE, id);
      } catch {
        /* keep going */
      }
    }
  } catch {
    /* TrainPassenger table missing — nothing to cascade */
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

    // Train EQ entries are now self-service: staff submission auto-approves
    // so the staff member can print the letter immediately. Admin sees
    // entries in a read-only list — no separate approval step.
    const nowIso = new Date().toISOString();
    let row: CatalystRow;
    try {
      row = await insertRow(TRAIN_TABLE, {
        pnrNumber,
        passengerName,
        journeyClass,
        dateOfJourney: toCatalystDate(dateOfJourney) || toCatalystDate(new Date()),
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

    // Best-effort passenger persistence. Schema/table issues are logged
    // inside writePassengers and don't fail the request; the train request
    // itself was already created above.
    if (Array.isArray(passengers) && passengers.length > 0) {
      await writePassengers(String(row.ROWID), passengers);
    }

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
    const q = zcqlEscapeValue(String(filters.search));
    conditions.push(
      `(passengerName LIKE '%${q}%' OR pnrNumber LIKE '%${q}%' OR trainName LIKE '%${q}%')`
    );
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

    if (useZCQL()) {
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
        const q = String(filters.search).toLowerCase();
        rows = rows.filter(
          (r) =>
            (r.passengerName || '').toLowerCase().includes(q) ||
            (r.pnrNumber || '').includes(q) ||
            (r.trainName || '').toLowerCase().includes(q)
        );
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

    const updated = await updateRow(TRAIN_TABLE, updateData as any);

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
      approvedAt: toCatalystDate(new Date()),
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
 * RapidAPI integration is dropped for the Catalyst migration. This stub returns
 * a 410 Gone so the frontend stops calling it. The Prisma version still has the
 * real handler for the legacy code path (USE_CATALYST_TRAIN=false).
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
