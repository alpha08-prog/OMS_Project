/**
 * PDF controller — Catalyst-backed.
 *
 * Mirrors backend/src/controllers/pdf.controller.ts (the Prisma version) so
 * the route layer can dispatch to either implementation via the
 * USE_CATALYST_PDF feature flag.
 *
 * Reads source data from the Catalyst Data Store (TrainRequest / Grievance /
 * TourProgram tables). The PDF generation utilities themselves are unchanged.
 *
 * IDs in this controller are numeric Catalyst ROWIDs (e.g. "37719000000076188").
 * Legacy UUID ids (from the pre-migration Prisma database) are not resolvable
 * in this path — the route should still be hit through the dispatcher with
 * the new ROWID-based ids that the frontend now receives.
 */
import { Response } from 'express';
import { getRow, listAllRows, CatalystRow } from '../lib/catalyst-client';
import {
  sendError,
  sendNotFound,
  sendServerError,
  sendForbidden,
} from '../utils/response';
import {
  generateTrainEQLetter,
  generateGrievanceLetter,
  generateTourProgramPDF,
} from '../utils/pdfGenerator';
import type { AuthenticatedRequest } from '../types';

const TRAIN_TABLE = 'TrainRequest';
const GRIEVANCE_TABLE = 'Grievance';
const TOUR_TABLE = 'TourProgram';

// ── helpers ────────────────────────────────────────────────────────────────

/** Format a Catalyst datetime string ("YYYY-MM-DD HH:mm:ss") as IN locale date. */
function formatDateIN(value: string | Date | null | undefined): string {
  if (!value) return 'N/A';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-IN');
}

/**
 * Build the suffix used in the reference number / document ID.
 * UUID ids (legacy) → first 8 hex chars. Numeric ROWIDs → last 8 digits.
 * Either way the resulting refNumber stays human-readable.
 */
function refSuffix(id: string): string {
  if (id.includes('-')) return id.slice(0, 8).toUpperCase();
  return id.slice(-8).toUpperCase();
}

/**
 * Map grievance type → recipient department block. Kept identical to the
 * Prisma version of this controller so the generated letters match.
 */
const DEPARTMENT_MAP: Record<
  string,
  { official: string; designation: string; department: string }
> = {
  WATER: {
    official: 'The Executive Engineer',
    designation: 'Water Supply Department',
    department: 'Municipal Corporation',
  },
  ROAD: {
    official: 'The Executive Engineer',
    designation: 'Roads & Bridges Division',
    department: 'Public Works Department (PWD)',
  },
  POLICE: {
    official: 'The Superintendent of Police',
    designation: 'Police Department',
    department: 'State Police Headquarters',
  },
  HEALTH: {
    official: 'The Chief Medical Officer',
    designation: 'Health Department',
    department: 'District Health Office',
  },
  ELECTRICITY: {
    official: 'The Executive Engineer',
    designation: 'Electrical Division',
    department: 'State Electricity Board',
  },
  EDUCATION: {
    official: 'The District Education Officer',
    designation: 'Education Department',
    department: 'District Education Office',
  },
  TRANSFER: {
    official: 'The Secretary',
    designation: 'Personnel Department',
    department: 'Government of India',
  },
  FINANCIAL_AID: {
    official: 'The District Collector',
    designation: 'Revenue Department',
    department: 'District Collectorate',
  },
  HOUSING: {
    official: 'The Commissioner',
    designation: 'Housing Department',
    department: 'Housing Board',
  },
  OTHER: {
    official: 'The District Collector',
    designation: 'Administration',
    department: 'District Administration',
  },
};

const ACTION_MAP: Record<string, string> = {
  GENERATE_LETTER: 'Please generate official letter and forward to concerned department',
  CALL_OFFICIAL: 'Please call the concerned official and follow up',
  FORWARD_TO_DEPT: 'Forward this grievance to the relevant department for action',
  SCHEDULE_MEETING: 'Schedule a meeting with the petitioner',
  NO_ACTION: 'For information only, no immediate action required',
};

// ── Train EQ ───────────────────────────────────────────────────────────────

/** GET /api/pdf/train-eq/:id */
export async function generateTrainEQPDF(
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

    if (
      req.user?.role === 'STAFF' &&
      String(row.createdById) !== req.user.id
    ) {
      sendForbidden(res, 'You can only download your own train EQ letters');
      return;
    }

    const refNumber = `EQ/${new Date().getFullYear()}/${refSuffix(id)}`;
    const documentId = `EQ${id.replace(/-/g, '').slice(-12).toUpperCase()}`;

    generateTrainEQLetter(
      {
        refNumber,
        date: new Date().toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }),
        passengerName: String(row.passengerName),
        pnrNumber: String(row.pnrNumber),
        trainNumber: row.trainNumber ? String(row.trainNumber) : 'N/A',
        trainName: row.trainName ? String(row.trainName) : 'N/A',
        journeyDate: formatDateIN(row.dateOfJourney),
        journeyClass: String(row.journeyClass),
        fromStation: String(row.fromStation),
        toStation: String(row.toStation),
        senderName: 'Shri Pralhad Joshi',
        senderDesignation: "Hon'ble Union Minister",
        documentId,
      },
      res
    );
  } catch (error) {
    sendServerError(res, 'Failed to generate Train EQ PDF', error);
  }
}

/** GET /api/pdf/train-eq/:id/preview */
export async function previewTrainEQ(
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

    if (
      req.user?.role === 'STAFF' &&
      String(row.createdById) !== req.user.id
    ) {
      sendForbidden(res, 'You can only preview your own train EQ letters');
      return;
    }

    const refNumber = `EQ/${new Date().getFullYear()}/${refSuffix(id)}`;
    const date = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 20px; }
    .letterhead { text-align: center; border-bottom: 3px solid; border-image: linear-gradient(to right, #FF9933, white, #138808) 1; padding-bottom: 20px; margin-bottom: 30px; }
    .letterhead h1 { color: #000080; margin: 5px 0; font-size: 16px; }
    .letterhead h2 { color: #000; margin: 10px 0; font-size: 20px; }
    .letterhead p { color: #666; margin: 5px 0; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .to { margin-bottom: 20px; }
    .subject { font-weight: bold; margin-bottom: 20px; }
    .body { line-height: 1.8; text-align: justify; }
    .signature { margin-top: 50px; }
    .footer { margin-top: 50px; text-align: center; border-top: 3px solid; border-image: linear-gradient(to right, #FF9933, white, #138808) 1; padding-top: 10px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="letterhead">
    <p style="font-size: 20px;">॥ सत्यमेव जयते ॥</p>
    <h1>GOVERNMENT OF INDIA</h1>
    <h1>MINISTRY OF CONSUMER AFFAIRS, FOOD AND PUBLIC DISTRIBUTION</h1>
    <h2>SHRI PRAHLAD JOSHI</h2>
    <p>Hon'ble Union Minister</p>
  </div>

  <div class="meta">
    <span>Ref No: ${refNumber}</span>
    <span>Date: ${date}</span>
  </div>

  <div class="to">
    <strong>To,</strong><br>
    The Station Master / TTI<br>
    ${String(row.fromStation)} Railway Station<br>
    Indian Railways
  </div>

  <div class="subject">
    Subject: Request for Emergency Quota Accommodation
  </div>

  <div class="body">
    <p>Sir/Madam,</p>
    <p>I am writing to request your kind consideration for emergency quota accommodation for the following passenger traveling under my recommendation.</p>

    <p><strong>Passenger Details:</strong></p>
    <ul>
      <li>Name: ${String(row.passengerName)}</li>
      <li>PNR Number: ${String(row.pnrNumber)}</li>
      <li>Train: ${row.trainNumber ? String(row.trainNumber) : 'N/A'} - ${row.trainName ? String(row.trainName) : 'N/A'}</li>
      <li>Date of Journey: ${formatDateIN(row.dateOfJourney)}</li>
      <li>Class: ${String(row.journeyClass)}</li>
      <li>Route: ${String(row.fromStation)} to ${String(row.toStation)}</li>
    </ul>

    <p>This is a matter of urgent importance and I would greatly appreciate your assistance in accommodating this request under the Emergency Quota (EQ) facility.</p>

    <p>Kindly extend your cooperation in this regard.</p>
  </div>

  <div class="signature">
    <p>With regards,</p>
    <p><strong>Shri Pralhad Joshi</strong><br>
    Hon'ble Union Minister<br>
    Office of Hon'ble Union Minister</p>
  </div>

  <div class="footer">
    Office of Hon'ble Minister | Krishi Bhawan, New Delhi - 110001 | Tel: 011-23383615
  </div>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    sendServerError(res, 'Failed to preview letter', error);
  }
}

// ── Grievance ──────────────────────────────────────────────────────────────

/** GET /api/pdf/grievance/:id */
export async function generateGrievancePDF(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    const row = await getRow(GRIEVANCE_TABLE, id);
    if (!row) {
      sendNotFound(res, 'Grievance not found');
      return;
    }

    if (
      req.user?.role === 'STAFF' &&
      String(row.createdById) !== req.user.id
    ) {
      sendForbidden(res, 'You can only download your own grievance letters');
      return;
    }

    const grievanceType = String(row.grievanceType);
    const dept = DEPARTMENT_MAP[grievanceType] || DEPARTMENT_MAP.OTHER;
    const refNumber = `GRV/${new Date().getFullYear()}/${refSuffix(id)}`;
    const actionRequired = String(row.actionRequired || 'NO_ACTION');

    generateGrievanceLetter(
      {
        refNumber,
        date: new Date().toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }),
        petitionerName: String(row.petitionerName),
        mobileNumber: String(row.mobileNumber),
        constituency: String(row.constituency),
        grievanceType: grievanceType.replace(/_/g, ' '),
        description: String(row.description),
        actionRequired: ACTION_MAP[actionRequired] || actionRequired,
        toOfficial: dept.official,
        toDesignation: dept.designation,
        toDepartment: dept.department,
        senderName: 'Shri Pralhad Joshi',
        senderDesignation: "Hon'ble Union Minister",
      },
      res
    );
  } catch (error) {
    sendServerError(res, 'Failed to generate Grievance PDF', error);
  }
}

/** GET /api/pdf/grievance/:id/preview */
export async function previewGrievance(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    const row = await getRow(GRIEVANCE_TABLE, id);
    if (!row) {
      sendNotFound(res, 'Grievance not found');
      return;
    }

    if (
      req.user?.role === 'STAFF' &&
      String(row.createdById) !== req.user.id
    ) {
      sendForbidden(res, 'You can only preview your own grievance letters');
      return;
    }

    const grievanceType = String(row.grievanceType);
    const dept = DEPARTMENT_MAP[grievanceType] || DEPARTMENT_MAP.OTHER;
    const refNumber = `GRV/${new Date().getFullYear()}/${refSuffix(id)}`;
    const date = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const actionRequired = String(row.actionRequired || 'NO_ACTION');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 20px; }
    .letterhead { text-align: center; border-bottom: 3px solid; border-image: linear-gradient(to right, #FF9933, white, #138808) 1; padding-bottom: 20px; margin-bottom: 30px; }
    .letterhead h1 { color: #000080; margin: 5px 0; font-size: 16px; }
    .letterhead h2 { color: #000; margin: 10px 0; font-size: 20px; }
    .letterhead p { color: #666; margin: 5px 0; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .to { margin-bottom: 20px; }
    .subject { font-weight: bold; margin-bottom: 20px; }
    .body { line-height: 1.8; text-align: justify; }
    .signature { margin-top: 50px; }
    .footer { margin-top: 50px; text-align: center; border-top: 3px solid; border-image: linear-gradient(to right, #FF9933, white, #138808) 1; padding-top: 10px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="letterhead">
    <p style="font-size: 20px;">॥ सत्यमेव जयते ॥</p>
    <h1>GOVERNMENT OF INDIA</h1>
    <h1>MINISTRY OF CONSUMER AFFAIRS, FOOD AND PUBLIC DISTRIBUTION</h1>
    <h2>SHRI PRAHLAD JOSHI</h2>
    <p>Hon'ble Union Minister</p>
  </div>

  <div class="meta">
    <span>Ref No: ${refNumber}</span>
    <span>Date: ${date}</span>
  </div>

  <div class="to">
    <strong>To,</strong><br>
    ${dept.official}<br>
    ${dept.designation}<br>
    ${dept.department}
  </div>

  <div class="subject">
    Subject: ${grievanceType.replace(/_/g, ' ')} - Request for Action
  </div>

  <div class="body">
    <p>Sir/Madam,</p>
    <p>I am writing to bring to your attention a grievance received at our office that requires your immediate attention and action.</p>

    <p><strong>Petitioner Details:</strong></p>
    <ul>
      <li>Name: ${String(row.petitionerName)}</li>
      <li>Mobile: ${String(row.mobileNumber)}</li>
      <li>Constituency: ${String(row.constituency)}</li>
    </ul>

    <p><strong>Grievance Details:</strong></p>
    <ul>
      <li>Type: ${grievanceType.replace(/_/g, ' ')}</li>
      <li>Description: ${String(row.description)}</li>
    </ul>

    <p><strong>Action Required:</strong> ${ACTION_MAP[actionRequired] || actionRequired}</p>

    <p>I request you to look into this matter personally and take necessary action at the earliest. Kindly update this office on the progress of the same.</p>
  </div>

  <div class="signature">
    <p>With regards,</p>
    <p><strong>Shri Pralhad Joshi</strong><br>
    Hon'ble Union Minister<br>
    Office of Hon'ble Union Minister</p>
  </div>

  <div class="footer">
    Office of Hon'ble Minister | Krishi Bhawan, New Delhi - 110001 | Tel: 011-23383615
  </div>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    sendServerError(res, 'Failed to preview letter', error);
  }
}

// ── Tour Program ───────────────────────────────────────────────────────────

/** GET /api/pdf/tour-program */
export async function generateTourProgramPDFController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };

    // Default window: today → 7 days from now (matches Prisma version).
    const startMs = startDate
      ? new Date(startDate).getTime()
      : new Date().setHours(0, 0, 0, 0);
    const endMs = endDate
      ? new Date(endDate).getTime()
      : Date.now() + 7 * 24 * 60 * 60 * 1000;

    const rows = await listAllRows(TOUR_TABLE);
    const events = rows
      .filter((r: CatalystRow) => {
        if (String(r.decision) !== 'ACCEPTED') return false;
        if (!r.dateTime) return false;
        const t = new Date(r.dateTime).getTime();
        if (isNaN(t)) return false;
        return t >= startMs && t <= endMs;
      })
      .sort(
        (a, b) =>
          new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
      );

    if (events.length === 0) {
      sendError(res, 'No accepted events found for the specified period', 404);
      return;
    }

    const startLabel = new Date(startMs).toLocaleDateString('en-IN');
    const endLabel = new Date(endMs).toLocaleDateString('en-IN');

    generateTourProgramPDF(
      events.map((e: CatalystRow) => ({
        eventName: String(e.eventName),
        organizer: String(e.organizer),
        eventDate: new Date(e.dateTime).toISOString(),
        venue: String(e.venue),
        decision: String(e.decision),
      })),
      `${startLabel} - ${endLabel}`,
      res
    );
  } catch (error) {
    sendServerError(res, 'Failed to generate Tour Program PDF', error);
  }
}
