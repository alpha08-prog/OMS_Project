import { Response } from 'express';
import { Prisma, TrainRequestStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import config from '../config';
import { sendSuccess, sendError, sendNotFound, sendServerError } from '../utils/response';
import { parsePagination, calculatePaginationMeta } from '../utils/pagination';
import type { AuthenticatedRequest, TrainRequestFilters } from '../types';

const trainRequestSelect = {
  id: true,
  passengerName: true,
  pnrNumber: true,
  contactNumber: true,
  trainName: true,
  trainNumber: true,
  journeyClass: true,
  dateOfJourney: true,
  fromStation: true,
  toStation: true,
  route: true,
  referencedBy: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  approvedById: true,
  createdBy: {
    select: { id: true, name: true, email: true },
  },
  approvedBy: {
    select: { id: true, name: true, email: true },
  },
} satisfies Prisma.TrainRequestSelect;

const PASSENGER_NAME_PLACEHOLDER = 'Passenger details unavailable';

type TrainRequestRecord = Prisma.TrainRequestGetPayload<{
  select: typeof trainRequestSelect;
}>;

function hasMissingPassengerName(passengerName: string | null | undefined): boolean {
  return !passengerName || passengerName.trim() === '' || passengerName.trim() === PASSENGER_NAME_PLACEHOLDER;
}

function extractPassengerNameFromTask(
  title?: string | null,
  description?: string | null
): string | null {
  const descriptionMatch = description?.match(/^Passenger:\s*(.+)$/m);
  if (descriptionMatch?.[1]) {
    const name = descriptionMatch[1].trim();
    if (name && !hasMissingPassengerName(name)) {
      return name;
    }
  }

  const titleMatch = title?.match(/^Train EQ:\s*(.+?)\s*-\s*PNR\b/i);
  if (titleMatch?.[1]) {
    const name = titleMatch[1].trim();
    if (name && !hasMissingPassengerName(name)) {
      return name;
    }
  }

  return null;
}

function buildPassengerNameFallback(trainRequest: TrainRequestRecord): string {
  const trainName = trainRequest.trainName?.trim();
  if (trainName) {
    return `${trainName} passenger`;
  }

  return `PNR ${trainRequest.pnrNumber}`;
}

async function resolvePassengerNames(
  trainRequests: TrainRequestRecord[]
): Promise<TrainRequestRecord[]> {
  const requestsNeedingNames = trainRequests.filter((request) =>
    hasMissingPassengerName(request.passengerName)
  );

  if (requestsNeedingNames.length === 0) {
    return trainRequests;
  }

  const taskAssignments = await prisma.taskAssignment.findMany({
    where: {
      referenceType: 'TRAIN_REQUEST',
      referenceId: {
        in: requestsNeedingNames.map((request) => request.id),
      },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      referenceId: true,
      title: true,
      description: true,
    },
  });

  const recoveredNames = new Map<string, string>();

  for (const taskAssignment of taskAssignments) {
    if (!taskAssignment.referenceId || recoveredNames.has(taskAssignment.referenceId)) {
      continue;
    }

    const recoveredName = extractPassengerNameFromTask(
      taskAssignment.title,
      taskAssignment.description
    );

    if (recoveredName) {
      recoveredNames.set(taskAssignment.referenceId, recoveredName);
    }
  }

  return trainRequests.map((trainRequest) => {
    if (!hasMissingPassengerName(trainRequest.passengerName)) {
      return trainRequest;
    }

    return {
      ...trainRequest,
      passengerName:
        recoveredNames.get(trainRequest.id) || buildPassengerNameFallback(trainRequest),
    };
  });
}

function buildMockPnrStatus(pnr: string, reason?: string) {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return {
    pnrNumber: pnr,
    trainNumber: '12301',
    trainName: 'Rajdhani Express',
    dateOfJourney: futureDate.toISOString().split('T')[0],
    from: 'NDLS (New Delhi)',
    to: 'HWH (Howrah)',
    class: '2A',
    passengers: [
      {
        name: 'Passenger 1',
        bookingStatus: 'CNF/A1/23',
        currentStatus: 'CNF/A1/23',
      },
    ],
    chartStatus: 'CHART NOT PREPARED',
    isMock: true,
    reason,
  };
}

/**
 * Create train EQ request
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

    console.log('CREATE TRAIN REQUEST BODY:', req.body);

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
      referencedBy,
      contactNumber,
    } = req.body;

    const trainRequest = await prisma.trainRequest.create({
      data: {
        passengerName,
        pnrNumber,
        trainName,
        trainNumber,
        journeyClass,
        dateOfJourney: new Date(dateOfJourney),
        fromStation,
        toStation,
        route,
        referencedBy,
        contactNumber,
        createdById: req.user.id,
      },
      select: trainRequestSelect,
    });

    sendSuccess(res, trainRequest, 'Train request created successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to create train request', error);
  }
}

/**
 * Get all train requests with pagination and filters
 * GET /api/train-requests
 */
export async function getTrainRequests(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(req.query as { page?: string; limit?: string });
    const filters = req.query as TrainRequestFilters;

    // Build where clause
    const where: any = {};

    // Staff can only see train requests they submitted
    if (req.user?.role === 'STAFF') {
      where.createdById = req.user.id;
    }

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.search) {
      where.OR = [
        { passengerName: { contains: filters.search, mode: 'insensitive' } },
        { pnrNumber: { contains: filters.search } },
        { trainName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.startDate || filters.endDate) {
      where.dateOfJourney = {};
      if (filters.startDate) where.dateOfJourney.gte = new Date(filters.startDate);
      if (filters.endDate) where.dateOfJourney.lte = new Date(filters.endDate);
    }

    const [total, trainRequests] = await Promise.all([
      prisma.trainRequest.count({ where }),
      prisma.trainRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: trainRequestSelect,
      }),
    ]);

    const hydratedTrainRequests = await resolvePassengerNames(trainRequests);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, hydratedTrainRequests, 'Train requests retrieved successfully', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get train requests', error);
  }
}

/**
 * Get single train request by ID
 * GET /api/train-requests/:id
 */
export async function getTrainRequestById(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    const trainRequest = await prisma.trainRequest.findUnique({
      where: { id },
      select: trainRequestSelect,
    });

    if (!trainRequest) {
      sendNotFound(res, 'Train request not found');
      return;
    }

    const [hydratedTrainRequest] = await resolvePassengerNames([trainRequest]);

    sendSuccess(res, hydratedTrainRequest, 'Train request retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get train request', error);
  }
}

/**
 * Update train request
 * PUT /api/train-requests/:id
 */
export async function updateTrainRequest(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const updateData = req.body;

    delete updateData.id;
    delete updateData.createdById;
    delete updateData.createdAt;

    if (updateData.dateOfJourney) {
      updateData.dateOfJourney = new Date(updateData.dateOfJourney);
    }

    const trainRequest = await prisma.trainRequest.update({
      where: { id },
      data: updateData,
      select: trainRequestSelect,
    });

    sendSuccess(res, trainRequest, 'Train request updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update train request', error);
  }
}

/**
 * Approve train request (Admin only)
 * PATCH /api/train-requests/:id/approve
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

    const existing = await prisma.trainRequest.findUnique({ where: { id } });
    if (!existing) {
      sendNotFound(res, 'Train request not found');
      return;
    }
    if (existing.status !== TrainRequestStatus.PENDING) {
      sendError(res, 'Only pending train requests can be approved', 400);
      return;
    }

    const trainRequest = await prisma.trainRequest.update({
      where: { id },
      data: {
        status: TrainRequestStatus.APPROVED,
        approvedById: req.user.id,
        approvedAt: new Date(),
      },
      select: trainRequestSelect,
    });

    sendSuccess(res, trainRequest, 'Train request approved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to approve train request', error);
  }
}

/**
 * Reject train request (Admin only)
 * PATCH /api/train-requests/:id/reject
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

    const existing = await prisma.trainRequest.findUnique({ where: { id } });
    if (!existing) {
      sendNotFound(res, 'Train request not found');
      return;
    }
    if (existing.status !== TrainRequestStatus.PENDING) {
      sendError(res, 'Only pending train requests can be rejected', 400);
      return;
    }

    const trainRequest = await prisma.trainRequest.update({
      where: { id },
      data: {
        status: TrainRequestStatus.REJECTED,
        rejectionReason: reason,
        approvedById: req.user.id,
      },
      select: trainRequestSelect,
    });

    sendSuccess(res, trainRequest, 'Train request rejected');
  } catch (error) {
    sendServerError(res, 'Failed to reject train request', error);
  }
}

/**
 * Mark approved train request as resolved (Admin only)
 * PATCH /api/train-requests/:id/resolve
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

    const existing = await prisma.trainRequest.findUnique({ where: { id } });
    if (!existing) {
      sendNotFound(res, 'Train request not found');
      return;
    }
    if (existing.status !== TrainRequestStatus.APPROVED) {
      sendError(res, 'Only accepted (approved) train requests can be marked resolved', 400);
      return;
    }

    const trainRequest = await prisma.trainRequest.update({
      where: { id },
      data: {
        status: TrainRequestStatus.RESOLVED,
      },
      select: trainRequestSelect,
    });

    sendSuccess(res, trainRequest, 'Train request marked as resolved');
  } catch (error) {
    sendServerError(res, 'Failed to resolve train request', error);
  }
}

/**
 * Delete train request
 * DELETE /api/train-requests/:id
 */
export async function deleteTrainRequest(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    await prisma.trainRequest.delete({
      where: { id },
    });

    sendSuccess(res, null, 'Train request deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete train request', error);
  }
}

/**
 * Get pending train requests queue
 * GET /api/train-requests/queue/pending
 */
export async function getPendingQueue(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(req.query as { page?: string; limit?: string });

    const where = {
      status: TrainRequestStatus.PENDING,
    };

    const [total, trainRequests] = await Promise.all([
      prisma.trainRequest.count({ where }),
      prisma.trainRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { dateOfJourney: 'asc' }, // Earliest journey date first
        select: trainRequestSelect,
      }),
    ]);

    const hydratedTrainRequests = await resolvePassengerNames(trainRequests);

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, hydratedTrainRequests, 'Pending queue retrieved', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get pending queue', error);
  }
}

/**
 * Check PNR status using IRCTC RapidAPI
 * GET /api/train-requests/pnr/:pnr
 */
export async function checkPNRStatus(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { pnr } = req.params;

    // Validate PNR format (10 digits)
    if (!/^\d{10}$/.test(pnr)) {
      sendError(res, 'Invalid PNR number. Must be 10 digits.', 400);
      return;
    }

    // Check if RapidAPI key is configured
    if (!config.rapidApi.key) {
      const mockStatus = buildMockPnrStatus(pnr, 'RAPIDAPI_KEY is not configured');
      sendSuccess(res, mockStatus, 'PNR status retrieved (mock data - API key not configured)');
      return;
    }

    // Call IRCTC RapidAPI
    const response = await fetch(`${config.rapidApi.pnrUrl}/${pnr}`, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': config.rapidApi.host,
        'x-rapidapi-key': config.rapidApi.key,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        sendError(res, 'PNR not found or invalid', 404);
        return;
      }

      if (response.status === 429 || response.status === 401 || response.status === 403 || response.status >= 500) {
        const mockStatus = buildMockPnrStatus(pnr, `RapidAPI unavailable (${response.status})`);
        sendSuccess(res, mockStatus, 'PNR status retrieved (mock data - RapidAPI unavailable)');
        return;
      }

      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json() as Record<string, any>;

    // Log the raw response for debugging
    console.log('IRCTC API Raw Response:', JSON.stringify(data, null, 2));

    // Extract data from various possible response structures
    const apiData = data.data || data;

    // Transform the response to a consistent format
    const pnrStatus = {
      pnrNumber: pnr,
      trainNumber: apiData.trainNo || apiData.trainNumber || apiData.train_no || 'N/A',
      trainName: apiData.trainName || apiData.train_name || 'N/A',
      dateOfJourney: apiData.doj || apiData.dateOfJourney || apiData.date_of_journey || apiData.journeyDate || 'N/A',
      from: apiData.boardingPoint || apiData.sourceStation || apiData.from || apiData.source || 'N/A',
      to: apiData.reservationUpto || apiData.destinationStation || apiData.to || apiData.destination || 'N/A',
      class: apiData.journeyClass || apiData.class || apiData.className || apiData.travel_class || 'N/A',
      boardingPoint: apiData.boardingPoint || apiData.boarding_point || 'N/A',
      reservationUpto: apiData.reservationUpto || apiData.reservation_upto || 'N/A',
      passengers: apiData.passengerList || apiData.passengers || apiData.passenger_list || [],
      chartStatus: apiData.chartStatus || apiData.chart_status || apiData.chartPrepared || 'N/A',
      bookingFare: apiData.bookingFare || apiData.fare || 'N/A',
      quota: apiData.quota || 'N/A',
      isMock: false,
      rawResponse: data, // Include raw response for debugging
    };

    sendSuccess(res, pnrStatus, 'PNR status retrieved successfully');
  } catch (error) {
    console.error('PNR API Error:', error);
    const mockStatus = buildMockPnrStatus(req.params.pnr, 'RapidAPI request failed');
    sendSuccess(res, mockStatus, 'PNR status retrieved (mock data - external API request failed)');
  }
}
