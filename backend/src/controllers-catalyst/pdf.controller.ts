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
  type TrainEQPassenger,
} from '../utils/pdfGenerator';
import type { AuthenticatedRequest } from '../types';

const TRAIN_TABLE = 'TrainRequest';
const PASSENGER_TABLE = 'TrainPassenger';
const GRIEVANCE_TABLE = 'Grievance';
const TOUR_TABLE = 'TourProgram';

/**
 * Load passenger rows for a train request, ordered by Catalyst CREATEDTIME so
 * the letter shows them in entry order. Returns an empty array if the table
 * doesn't exist or the call fails — the PDF then falls back to splitting
 * passengerName by comma (legacy behaviour).
 */
async function loadTrainPassengers(trainRequestId: string): Promise<TrainEQPassenger[]> {
  let allRows: CatalystRow[] = [];
  try {
    allRows = await listAllRows(PASSENGER_TABLE);
  } catch {
    return [];
  }
  return allRows
    .filter((p) => String(p.trainRequestId) === String(trainRequestId))
    .sort((a, b) => String(a.CREATEDTIME).localeCompare(String(b.CREATEDTIME)))
    .map((p) => ({
      name: String(p.passengerName || '').trim(),
      gender: p.gender ? String(p.gender) : undefined,
      age: p.age !== null && p.age !== undefined ? Number(p.age) : undefined,
      // We store the W/L value in `currentStatus` since the schema has no
      // dedicated waitlist column — see TrainPassenger writes in the
      // train-request controller.
      waitlist: p.currentStatus ? String(p.currentStatus) : undefined,
    }))
    .filter((p) => p.name);
}

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

    const rawCount = Number(row.numberOfPassengers);
    const numberOfPassengers = Number.isFinite(rawCount) && rawCount > 0 ? rawCount : undefined;

    // Pull structured passenger rows so the letter can fill Sex/Age + W/L
    // columns. Falls through to the comma-split passengerName when none exist.
    const passengerDetails = await loadTrainPassengers(id);

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
        passengerDetails: passengerDetails.length > 0 ? passengerDetails : undefined,
        numberOfPassengers,
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

    const date = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    const passengerName = String(row.passengerName || '');
    const splitNames = passengerName
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    const allNames = splitNames.length > 1 ? splitNames : passengerName ? [passengerName] : [];

    // Prefer structured passenger rows when present so the preview matches
    // the PDF (Sex/Age and W/L populated).
    const passengers = await loadTrainPassengers(id);
    const previewRows: TrainEQPassenger[] =
      passengers.length > 0 ? passengers : allNames.map((n) => ({ name: n }));

    const rawCount = Number(row.numberOfPassengers);
    const berthCount =
      Number.isFinite(rawCount) && rawCount > 0 ? rawCount : previewRows.length || 1;

    const trainNumber = row.trainNumber ? String(row.trainNumber) : '';
    const trainName = row.trainName ? String(row.trainName) : '';
    const journeyClass = String(row.journeyClass || '');
    const journeyDate = formatDateIN(row.dateOfJourney);
    const fromStation = String(row.fromStation || '');
    const toStation = String(row.toStation || '');
    const pnrNumber = String(row.pnrNumber || '');

    const sexAgeOf = (p: TrainEQPassenger): string => {
      const g = (p.gender || '').toString().trim().toUpperCase();
      const sex = g === 'MALE' ? 'M' : g === 'FEMALE' ? 'F' : g === 'OTHER' ? 'O' : '';
      const age = p.age !== undefined && p.age !== null && Number(p.age) > 0 ? String(p.age) : '';
      if (!sex && !age) return '';
      return `${sex || '-'}/${age || '-'}`;
    };

    const tableRows =
      previewRows.length === 0
        ? `<tr><td>1</td><td></td><td></td><td>${pnrNumber}</td><td></td></tr>`
        : previewRows
            .map(
              (p, i) => `<tr>
                <td>${i + 1}</td>
                <td>${p.name}</td>
                <td>${sexAgeOf(p)}</td>
                <td>${i === 0 ? pnrNumber : ''}</td>
                <td>${p.waitlist ? String(p.waitlist) : ''}</td>
              </tr>`
            )
            .join('');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Georgia, serif; max-width: 820px; margin: 30px auto; padding: 20px; color: #000; }
    .letterhead { display: grid; grid-template-columns: 1fr 90px 1fr; gap: 12px; align-items: flex-start; margin-bottom: 18px; }
    .lh-left h1 { color: #000080; margin: 0 0 4px 0; font-size: 15px; letter-spacing: 0.5px; }
    .lh-left p { margin: 1px 0; font-size: 9px; line-height: 1.3; }
    .lh-center { text-align: center; color: #555; font-size: 9px; padding-top: 12px; }
    .lh-center .label { font-weight: bold; font-size: 10px; color: #000; }
    .lh-right { font-size: 9px; line-height: 1.45; }
    .lh-right .row { display: grid; grid-template-columns: 75px 1fr; }
    .lh-right .row .l { font-weight: normal; }
    .lh-right .row .v { white-space: pre-line; }
    .meta { display: flex; justify-content: space-between; margin: 16px 0 18px 0; font-size: 11px; }
    .to { margin: 8px 0 16px 0; font-size: 12px; line-height: 1.6; }
    .body { font-size: 12px; line-height: 1.9; }
    .body .blank { font-weight: bold; border-bottom: 1px solid #000; padding: 0 6px; }
    table.passengers { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
    table.passengers th, table.passengers td { border: 1px solid #888; padding: 6px 8px; text-align: left; }
    table.passengers th { background: #f1f1f1; }
    .signature { margin-top: 60px; text-align: right; }
    .signature .line1 { font-size: 12px; margin-bottom: 36px; }
    .signature .line2 { font-weight: bold; color: #000080; font-size: 13px; letter-spacing: 0.5px; }
    .footer { margin-top: 30px; padding-top: 8px; border-top: 1px solid #000; text-align: center; font-size: 10px; }
  </style>
</head>
<body>
  <div class="letterhead">
    <div class="lh-left">
      <h1>MALLIKARJUNGOUDA PATIL</h1>
      <p>ADDITIONAL PRIVATE SECRETARY TO MINISTER OF</p>
      <p>FOOD &amp; PUBLIC DISTRIBUTION AND CONSUMER AFFAIRS</p>
      <p>NEW &amp; RENEWABLE ENERGY</p>
      <p>GOVERNMENT OF INDIA, NEW DELHI</p>
    </div>
    <div class="lh-center">
      <div class="label">GOVT.<br>OF INDIA</div>
      <div style="margin-top:6px;">सत्यमेव जयते</div>
    </div>
    <div class="lh-right">
      <div class="row"><span class="l">OFF</span><span class="v">: CHITAGUPPI HOSPITAL COMPOUND,
  LAMINGTON ROAD, HUBLI- 580 020.</span></div>
      <div class="row"><span class="l">TEL</span><span class="v">: (0) 2251055   FAX : 2258955</span></div>
      <div class="row"><span class="l">E-MAIL</span><span class="v">: patil.nimmav@gmail.com</span></div>
      <div class="row"><span class="l">DELHI OFF</span><span class="v">: Room No. 179 "G" Wing, 1st Floor
  Krishi Bhawan, New Delhi - 110 001</span></div>
      <div class="row"><span class="l">TEL</span><span class="v">: 23070637, 23070642</span></div>
    </div>
  </div>

  <div class="meta">
    <span>No. M(CA, F &amp; PD And MNRE) Addl. PS/</span>
    <span>Date : ${date}</span>
  </div>

  <div class="to">
    To,<br>
    Chief Commercial Manager,<br>
    South Western Railway, Hubli.
  </div>

  <p style="font-size:12px;">Sir,</p>

  <div class="body">
    <p>Please arrange to release <span class="blank">${berthCount}</span> Berths from Emergency
    Quota for the following persons who are Travelling by Train No. <span class="blank">${trainNumber || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</span></p>

    <p>Train Name <span class="blank">${trainName || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</span></p>

    <p>From <span class="blank">${fromStation || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</span>
    To <span class="blank">${toStation || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</span>
    in <span class="blank">${journeyClass || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</span>
    on <span class="blank">${journeyDate}</span></p>
  </div>

  <table class="passengers">
    <thead>
      <tr>
        <th style="width:50px;">Sl No.</th>
        <th>Name</th>
        <th style="width:80px;">Sex/Age</th>
        <th style="width:140px;">PNR No.</th>
        <th style="width:60px;">W/L</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <div class="signature">
    <div class="line1">Your's Faithfully,</div>
    <div class="line2">MALLIKARJUNGOUDA PATIL</div>
  </div>

  <div class="footer">
    DELHI RESIDENCE : #11, AKBAR ROAD, NEW DELHI - 110001, TEL : 011 23014097, 23094098
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
        wardVillage: row.wardVillage ? String(row.wardVillage) : undefined,
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
      ${row.wardVillage ? `<li>Ward/Village: ${String(row.wardVillage)}</li>` : ''}
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

/** GET /api/pdf/tour-program/:id */
export async function generateTourProgramSinglePDF(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    const row = await getRow(TOUR_TABLE, id);
    if (!row) {
      sendNotFound(res, 'Tour program not found');
      return;
    }

    if (String(row.decision) !== 'ACCEPTED') {
      sendError(res, 'Only accepted tour programs can be printed', 400);
      return;
    }

    const eventDate = row.dateTime
      ? new Date(String(row.dateTime)).toLocaleDateString('en-IN')
      : 'N/A';

    generateTourProgramPDF(
      [
        {
          eventName: String(row.eventName),
          organizer: String(row.organizer),
          eventDate: row.dateTime
            ? new Date(String(row.dateTime)).toISOString()
            : new Date().toISOString(),
          venue: String(row.venue),
          decision: String(row.decision),
        },
      ],
      eventDate,
      res
    );
  } catch (error) {
    sendServerError(res, 'Failed to generate Tour Program PDF', error);
  }
}

/** GET /api/pdf/tour-program/:id/preview */
export async function previewTourProgram(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    const row = await getRow(TOUR_TABLE, id);
    if (!row) {
      sendNotFound(res, 'Tour program not found');
      return;
    }

    const eventDateObj = row.dateTime ? new Date(String(row.dateTime)) : null;
    const eventDate =
      eventDateObj && !isNaN(eventDateObj.getTime())
        ? eventDateObj.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })
        : 'N/A';
    const eventTime =
      eventDateObj && !isNaN(eventDateObj.getTime())
        ? eventDateObj.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'N/A';

    const refNumber = `TOUR/${new Date().getFullYear()}/${refSuffix(id)}`;
    const generatedDate = new Date().toLocaleDateString('en-IN', {
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
    .title { text-align: center; color: #000080; font-size: 18px; font-weight: bold; margin-bottom: 8px; letter-spacing: 1px; }
    .subtitle { text-align: center; color: #333; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #000080; color: white; padding: 10px; text-align: left; font-size: 12px; }
    td { padding: 10px; border: 1px solid #ccc; font-size: 12px; vertical-align: top; }
    tr:nth-child(even) td { background: #f8f9fa; }
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
    <span>Generated: ${generatedDate}</span>
  </div>

  <div class="title">TOUR PROGRAM</div>
  <div class="subtitle">${eventDate}</div>

  <table>
    <thead>
      <tr>
        <th style="width:40px;">S.No</th>
        <th>Event</th>
        <th>Venue</th>
        <th style="width:80px;">Time</th>
        <th style="width:90px;">Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td><strong>${String(row.eventName)}</strong><br><span style="color:#555;">(${String(row.organizer)})</span></td>
        <td>${String(row.venue)}</td>
        <td>${eventTime}</td>
        <td>${String(row.decision)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    Office of Hon'ble Minister | Krishi Bhawan, New Delhi - 110001 | Tel: 011-23383615
  </div>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    sendServerError(res, 'Failed to preview tour program', error);
  }
}
