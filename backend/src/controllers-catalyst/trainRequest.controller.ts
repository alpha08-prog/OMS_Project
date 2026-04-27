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
  CatalystRow,
} from '../lib/catalyst-client';
import prisma from '../lib/prisma';
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
  'TATKAL',
  'PREMIUM_TATKAL',
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

async function lookupUsers(
  ids: Iterable<string>
): Promise<Map<string, { id: string; name: string; email: string }>> {
  const map = new Map<string, { id: string; name: string; email: string }>();
  const list = Array.from(ids).filter(Boolean);
  if (list.length === 0) return map;
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: list } },
      select: { id: true, name: true, email: true },
    });
    for (const u of users) map.set(u.id, u);
  } catch {
    /* ignore */
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

/** Validate + write a list of passengers tied to a parent ROWID. */
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
    if (gender && !VALID_GENDERS.has(gender)) {
      throw new Error(`Invalid gender for passenger ${name}: ${gender}`);
    }
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

    const row = await insertRow(TRAIN_TABLE, {
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
      status: 'PENDING',
      approvedAt: null,
      rejectionReason: null,
      signatureData: null,
      createdById: req.user.id,
      approvedById: null,
    });

    if (Array.isArray(passengers) && passengers.length > 0) {
      try {
        await writePassengers(String(row.ROWID), passengers);
      } catch (err: any) {
        // Roll back the parent if passengers fail validation
        await deleteRow(TRAIN_TABLE, String(row.ROWID));
        sendError(res, err?.message || 'Failed to create passengers');
        return;
      }
    }

    const [shaped] = await hydrate([row]);
    sendSuccess(res, shaped, 'Train request created successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to create train request', error);
  }
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

    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    const data = await hydrate(paged);

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

    // If passengers array provided, replace all existing passengers (delete + reinsert).
    if (Array.isArray(body.passengers)) {
      await deletePassengersFor(id);
      try {
        await writePassengers(id, body.passengers);
      } catch (err: any) {
        sendError(res, err?.message || 'Failed to update passengers');
        return;
      }
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
