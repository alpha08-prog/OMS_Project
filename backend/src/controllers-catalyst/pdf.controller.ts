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
import { getRow, listAllRows, updateRow, toCatalystDate, CatalystRow } from '../lib/catalyst-client';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendServerError,
  sendForbidden,
} from '../utils/response';
import {
  generateTrainEQLetter,
  generateGrievanceLetter,
  generateTempleVisitLetter,
  generateTourProgramPDF,
  type TrainEQPassenger,
} from '../utils/pdfGenerator';
import { cacheClear } from '../lib/cache';
import { getCachedTableList } from '../lib/catalyst-user-lookup';
import { emitNotifications } from './notification.controller';
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

// ── Temple Visit ───────────────────────────────────────────────────────────

/**
 * Static registry of temples / accommodation offices the MGP minister's office
 * regularly issues darshan letters to. Keyed by the templeKey value stored on
 * the Grievance row.
 *
 * `defaultServices` lets the staff submit a minimal create form (no services
 * picked → we fall back to the temple's typical service set).
 */
type TempleEntry = {
  deity: string;
  recipient: string[]; // multi-line address — rendered as the bottom address block
  defaultServices: TempleServiceCode[];
};
type TempleServiceCode =
  | 'SPECIAL_DARSHAN'
  | 'DARSHAN'
  | 'SPARSH_DARSHAN'
  | 'MANGALARATI'
  | 'BHASMARATI'
  | 'POOJA'
  | 'ACCOMMODATION';

export const TEMPLE_REGISTRY: Record<string, TempleEntry> = {
  TIRUMALA_TTD: {
    deity: 'Lord Shri Venkateshwar',
    recipient: [
      'The Joint Executive Officer',
      'Shri Tirumala Tirupati Devastanam Trust,',
      'Tirumala, Andhra Pradesh.',
    ],
    defaultServices: ['SPECIAL_DARSHAN', 'ACCOMMODATION'],
  },
  KASHI_VISHWANATH: {
    deity: 'Lord Shri Kashi Vishwanatheswara',
    recipient: ['A.D.M. Protocol', 'Varanasi.', 'Uttar Pradesh.'],
    defaultServices: ['SPARSH_DARSHAN', 'MANGALARATI'],
  },
  YALLAMMA_SAVADATTI: {
    deity: 'Renuka Yallamma Devi temple, Shreekshetra Savadatti',
    recipient: [
      'The Executive Officer',
      'Renuka Yallamma Devastan Trust,',
      'Savadatti, Dist: Belagavi.',
    ],
    defaultServices: ['SPECIAL_DARSHAN', 'ACCOMMODATION'],
  },
  KUKKE_SUBRAMANYA: {
    deity: 'Lord Shri. Kukke Subramanyam Swamy',
    recipient: [
      'Executive Officer',
      'Kukke Shree Subrahamanya Temple,',
      'Subrahamanya Post, Sullia Taluk,',
      'Dakshina Kannada District, Karnataka - 574238.',
    ],
    defaultServices: ['SPECIAL_DARSHAN', 'POOJA', 'ACCOMMODATION'],
  },
  DHARMASTHALA: {
    deity: 'Lord Shri. Dharmasthala Manjunath Swamy',
    recipient: [
      'The Public Relation Office,',
      'Shri. Dharmasthal Devastan Trust,',
      'Dharmasthala.',
    ],
    defaultServices: ['DARSHAN', 'ACCOMMODATION'],
  },
  MANTRALAYAM: {
    deity: 'Lord Shri Raghavendra Swami',
    recipient: [
      'The Public Relation Office,',
      'Mantralayam Temple Trust,',
      'Mantralayam.',
    ],
    defaultServices: ['SPECIAL_DARSHAN', 'ACCOMMODATION'],
  },
  KARNATAKA_BHAVAN_TIRUMALA: {
    deity: 'Lord Shri Venkateshwar',
    recipient: [
      'The Resident Commissioner',
      'Karnataka Bhavan,',
      'Tirumala, Tirupati,',
      'Andhra Pradesh.',
    ],
    defaultServices: ['ACCOMMODATION'],
  },
  SRISAILAM_MALLIKARJUNA: {
    deity: 'Lord Shri Mallikarjuna',
    recipient: ['The Executive Officer', 'SBMS Temple,', 'Shrishailam (A.P)'],
    defaultServices: ['SPECIAL_DARSHAN', 'ACCOMMODATION'],
  },
  BADRINATH: {
    deity: 'Lord Shri Badrinath',
    recipient: [
      'The Chief Executive Officer',
      'Shri Badrinath Kedarnath Temple Committee,',
      'Saket, Lane Number 07, Canal Road Dehradun',
      'Uttarakhand-248001',
    ],
    defaultServices: ['SPECIAL_DARSHAN'],
  },
  KEDARNATH: {
    deity: 'Lord Shri Kedarnath',
    recipient: [
      'The Chief Executive Officer',
      'Shri Kedarnath Temple Trust,',
      'Kedarnath, Uttarakhand -246445',
    ],
    defaultServices: ['SPECIAL_DARSHAN'],
  },
  MAHAKALESHWAR: {
    deity: 'Lord Shri Mahakaleshwar',
    recipient: [
      'Dist. Protocol Officer',
      'Shri. Mahakaleshwar Temple,',
      'Jaisinghpura, Ujjain,',
      'Madhya Pradesh.',
    ],
    defaultServices: ['SPECIAL_DARSHAN', 'BHASMARATI'],
  },
  OMKARESHWAR: {
    deity: 'Lord Shri Omkareshwar',
    recipient: [
      'The Administrative Officer',
      'Shri. Omkareshwar Temple,',
      'Ujjain,',
      'Madhya Pradesh - 456006',
    ],
    defaultServices: ['SPECIAL_DARSHAN', 'ACCOMMODATION'],
  },
  JAGANNATH_PURI: {
    deity: 'Shri Jagannath',
    recipient: [
      'The Chief Administrator',
      'Shri Jagannath Temple,',
      'Puri, Odisha.',
    ],
    defaultServices: ['SPECIAL_DARSHAN', 'ACCOMMODATION'],
  },
  SHIRDI_SAI: {
    deity: 'Lord Shri Shiradi Sai Baba',
    recipient: [
      'Chief Executive Officer',
      'Shri Saibaba Sansthan Trust,',
      'Po. Shiradi, Tq: Rahata, Dist: Ahmednagar,',
      'Maharashtra.',
    ],
    defaultServices: ['SPECIAL_DARSHAN', 'ACCOMMODATION'],
  },
};

const SERVICE_LABEL: Record<TempleServiceCode, string> = {
  SPECIAL_DARSHAN: 'Special Darshan',
  DARSHAN: 'Darshan',
  SPARSH_DARSHAN: 'Sparsh Darshan',
  MANGALARATI: 'Mangalarati',
  BHASMARATI: 'Bhasmarati',
  POOJA: 'Pooja',
  ACCOMMODATION: 'Accommodation',
};

/** Render an ordered service list into the natural-English form used in the
 *  template: "Special Darshan & Accommodation" or "Darshan, Pooja & Accommodation". */
function formatServiceList(codes: TempleServiceCode[]): string {
  const labels = codes.map((c) => SERVICE_LABEL[c]).filter(Boolean);
  if (labels.length === 0) return 'Special Darshan';
  if (labels.length === 1) return labels[0];
  return labels.slice(0, -1).join(', ') + ' & ' + labels[labels.length - 1];
}

/** Build the origin line. Falls back gracefully if some pieces are missing. */
function formatOriginLine(district?: string, state?: string): string {
  const parts: string[] = [];
  if (district) parts.push(`Dist: ${district}`);
  if (state) parts.push(`State: ${state}`);
  return parts.length > 0 ? parts.join(', ') : 'India';
}

/** Format YYYY-MM-DD (or ISO) → "DD-MM-YYYY" matching the docx layout. */
function formatDDMMYYYY(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

/** Closing line — Kashi/Yallamma/Kukke historically use "With regards,", the
 *  rest use "Thanking you,". Matches the docx exactly. */
function closingFor(templeKey: string): string {
  return new Set(['KASHI_VISHWANATH', 'YALLAMMA_SAVADATTI', 'KUKKE_SUBRAMANYA']).has(templeKey)
    ? 'With regards,'
    : 'Thanking you,';
}

/** Stable 4-digit-ish sequence derived from the row id — keeps the ref number
 *  consistent across reprints. Catalyst ROWIDs are long numerics; UUIDs hash
 *  through Number(). */
function refSeqForId(id: string): string {
  const last = id.replace(/[^0-9]/g, '').slice(-4);
  return last.padStart(4, '0') || '0001';
}

/** Discover all admin/super-admin recipient IDs from the cached AppUser
 *  table. Best-effort: returns [] on lookup failure so the parent operation
 *  (letter generation) never blocks on a missing notification. */
async function listAdminRecipientIds(): Promise<string[]> {
  try {
    const users = await getCachedTableList('AppUser');
    return users
      .filter((u) => {
        const role = String(u.role || '').toUpperCase();
        return role === 'ADMIN' || role === 'SUPER_ADMIN';
      })
      .map((u) => String(u.ROWID))
      .filter(Boolean);
  } catch (err) {
    console.error('[temple-visit] admin lookup failed:', err);
    return [];
  }
}

/** Fan-out the "letter generated + grievance resolved" notification to every
 *  admin. The notification doubles as a persistent action-history entry — its
 *  type, referenceId, body, and createdAt give admins a scrollable trail. */
async function notifyAdminsTempleVisitIssued(
  grievanceId: string,
  row: CatalystRow,
  letter: Parameters<typeof generateTempleVisitLetter>[0]
): Promise<void> {
  const adminIds = await listAdminRecipientIds();
  if (adminIds.length === 0) return;

  const petitionerName = String(row.petitionerName || 'a petitioner');
  const title = `Temple-visit letter issued — ${petitionerName}`;
  const body =
    `${petitionerName} and ${letter.memberCount} members on pilgrimage to ` +
    `${letter.deityLine}. Letter generated by staff, grievance auto-resolved.`;

  await emitNotifications(adminIds, {
    type: 'TEMPLE_VISIT_LETTER_GENERATED',
    title,
    body,
    // Deep-link search uses petitionerName, mirroring the GRIEVANCE_REJECTED
    // notification's link pattern — opens the grievance list filtered to this
    // entry.
    link: `/grievances/view?search=${encodeURIComponent(petitionerName)}`,
    referenceId: String(grievanceId),
    referenceType: 'GRIEVANCE',
  });
}

/** Map status + currentStage to {status:'RESOLVED', currentStage:'LETTER_GENERATED'}
 *  only for grievances that are still open. Returns null if the row is already
 *  resolved (so reprints don't re-stamp resolvedAt). */
function statusUpdateForLetterIssue(row: CatalystRow): Record<string, unknown> | null {
  if (String(row.status) === 'RESOLVED') return null;
  return {
    currentStage: 'LETTER_GENERATED',
    status: 'RESOLVED',
    resolvedAt: toCatalystDate(new Date()),
    isVerified: true,
    verifiedAt: row.verifiedAt ?? toCatalystDate(new Date()),
  };
}

/** Build the {data} object handed to generateTempleVisitLetter, given a row
 *  from Catalyst. Throws Error if templeKey is missing/unknown. */
function buildTempleLetterData(row: CatalystRow, id: string): {
  data: Parameters<typeof generateTempleVisitLetter>[0];
} {
  const templeKey = String(row.templeKey || '').trim();
  const temple = TEMPLE_REGISTRY[templeKey];
  if (!temple) {
    throw new Error(
      `Unknown or missing templeKey on grievance ${id}: "${templeKey}". ` +
        `Allowed keys: ${Object.keys(TEMPLE_REGISTRY).join(', ')}`
    );
  }

  // services: prefer what the staff stored on the row, else temple defaults.
  const storedServices =
    typeof row.servicesRequested === 'string' && row.servicesRequested.trim()
      ? row.servicesRequested
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      : [];
  const services = (storedServices.length > 0 ? storedServices : temple.defaultServices) as TempleServiceCode[];
  const servicesRequestedText = formatServiceList(services);

  const visitFrom = formatDDMMYYYY(row.visitDateFrom);
  const visitTo = formatDDMMYYYY(row.visitDateTo);
  const visitDateLine =
    visitFrom && visitTo && visitTo !== visitFrom
      ? `from ${visitFrom} to ${visitTo}`
      : visitFrom
      ? `on ${visitFrom}`
      : 'on the above said date';

  const memberCount =
    row.memberCount !== null && row.memberCount !== undefined && row.memberCount !== ''
      ? Math.max(1, Number(row.memberCount))
      : 1;

  const showMobile = (() => {
    const v = row.showMobileOnLetter;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.toLowerCase() === 'true';
    return false;
  })();
  const mobileLine = showMobile && row.mobileNumber ? `Mob No:-${String(row.mobileNumber)}` : undefined;

  const refSeq = refSeqForId(id);
  const refNumber = `No.M(CA,F&D and MNRE)/Addl.PS/${refSeq}`;
  const date = formatDDMMYYYY(new Date()) || new Date().toLocaleDateString('en-IN');

  return {
    data: {
      refNumber,
      date,
      subject: `Request for ${servicesRequestedText}.`,
      petitionerName: String(row.petitionerName || ''),
      memberCount,
      originLine: formatOriginLine(
        row.originDistrict ? String(row.originDistrict) : undefined,
        row.originState ? String(row.originState) : undefined
      ),
      deityLine: temple.deity,
      visitDateLine,
      mobileLine,
      servicesRequestedText,
      closing: closingFor(templeKey),
      signerName: '(Mallikarjunagouda Patil)',
      recipientLines: temple.recipient,
      documentId: `TPL${id.replace(/-/g, '').slice(-12).toUpperCase()}`,
      // Downloadable PDF is meant to be printed onto pre-printed letterhead
      // stationery — suppress the digital letterhead/footer/watermark and
      // leave the corresponding zones blank. The HTML preview still shows
      // the full digital rendering for sanity-checking.
      letterheadMode: true,
    },
  };
}

/** GET /api/pdf/temple-registry — frontend uses this to populate the temple
 *  dropdown and pre-fill default services. */
export async function getTempleRegistry(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const list = Object.entries(TEMPLE_REGISTRY).map(([key, t]) => ({
    key,
    deity: t.deity,
    recipient: t.recipient,
    defaultServices: t.defaultServices,
  }));
  sendSuccess(
    res,
    { temples: list, services: SERVICE_LABEL },
    'Temple registry retrieved'
  );
}

/**
 * GET /api/pdf/grievance/:id/temple-visit
 *
 * Streams the temple-visit letter as a PDF, then atomically marks the
 * underlying grievance RESOLVED + LETTER_GENERATED (unless it was already
 * RESOLVED — reprints don't re-stamp the resolvedAt timestamp).
 *
 * The auto-close happens AFTER the PDF bytes are sent so a failure during
 * rendering doesn't accidentally close the ticket.
 */
export async function generateTempleVisitPDF(
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

    if (req.user?.role === 'STAFF' && String(row.createdById) !== req.user.id) {
      sendForbidden(res, 'You can only download your own grievance letters');
      return;
    }

    if (String(row.grievanceType) !== 'TEMPLE_VISIT') {
      sendError(res, 'This grievance is not a temple visit', 400);
      return;
    }

    let built;
    try {
      built = buildTempleLetterData(row, id);
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Failed to build letter data', 400);
      return;
    }

    // Capture the close-out work BEFORE streaming so we can run it once the
    // response finishes. res.on('finish', ...) fires after the last byte goes
    // out — that's our signal the PDF was actually delivered.
    const closeOut = statusUpdateForLetterIssue(row);
    const wasFirstIssue = closeOut !== null; // false on a reprint of an already-resolved grievance
    res.once('finish', () => {
      // Fire-and-forget; the PDF is already on its way to the client. Each
      // step is wrapped so one failure doesn't block the others (e.g. cache
      // clear shouldn't depend on Catalyst, notifications shouldn't depend
      // on the cache).
      void (async () => {
        if (closeOut) {
          try {
            await updateRow(GRIEVANCE_TABLE, { ROWID: id, ...closeOut });
            cacheClear('dashboard_stats');
            cacheClear('stats_by_type');
            cacheClear('stats_by_status');
            cacheClear('stats_by_constituency');
          } catch (err) {
            console.error('[temple-visit] failed to auto-close grievance', id, err);
          }
        }
        // Notify admins on the first issue only — reprints are routine and
        // would otherwise spam the bell. The notification doubles as the
        // action-history record (recipientId + referenceId + createdAt).
        if (wasFirstIssue) {
          try {
            await notifyAdminsTempleVisitIssued(id, row, built.data);
          } catch (err) {
            console.error('[temple-visit] failed to notify admins', id, err);
          }
        }
      })();
    });

    generateTempleVisitLetter(built.data, res);
  } catch (error) {
    sendServerError(res, 'Failed to generate temple-visit PDF', error);
  }
}

/** GET /api/pdf/grievance/:id/temple-visit/preview — HTML preview that mirrors
 *  the PDF layout. Does NOT close the grievance. */
export async function previewTempleVisit(
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
    if (req.user?.role === 'STAFF' && String(row.createdById) !== req.user.id) {
      sendForbidden(res, 'You can only preview your own grievance letters');
      return;
    }
    if (String(row.grievanceType) !== 'TEMPLE_VISIT') {
      sendError(res, 'This grievance is not a temple visit', 400);
      return;
    }

    let built;
    try {
      built = buildTempleLetterData(row, id);
    } catch (e) {
      sendError(res, e instanceof Error ? e.message : 'Failed to build letter data', 400);
      return;
    }
    const d = built.data;
    const memberWord = d.memberCount === 1 ? 'member' : 'members';
    const dateWord = d.visitDateLine.startsWith('from') ? 'dates' : 'date';

    // Preview matches the PDF: letterhead-mode rendering. The pre-printed
    // physical letterhead/footer zones are shown as dashed placeholders so
    // the staff understands what will actually get printed onto the
    // letterhead stationery vs. what is provided by the paper itself.
    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Georgia, serif; max-width: 820px; margin: 30px auto; padding: 20px; color: #000; }
    .notice { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; padding: 8px 12px; border-radius: 6px; font-size: 11px; margin-bottom: 14px; }
    .letterhead-zone {
      border: 1px dashed #cbd5e1;
      height: 140px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #94a3b8;
      font-size: 11px;
      font-style: italic;
      letter-spacing: 0.05em;
      margin-bottom: 30px;
      background:
        repeating-linear-gradient(
          45deg,
          transparent 0 8px,
          rgba(148, 163, 184, 0.05) 8px 16px
        );
    }
    .footer-zone {
      border: 1px dashed #cbd5e1;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #94a3b8;
      font-size: 11px;
      font-style: italic;
      letter-spacing: 0.05em;
      margin-top: 36px;
      background:
        repeating-linear-gradient(
          45deg,
          transparent 0 8px,
          rgba(148, 163, 184, 0.05) 8px 16px
        );
    }
    .meta { display: flex; margin: 0 0 18px 0; font-size: 11px; }
    .meta .ref { flex: 1; text-align: left; }
    .meta .date { flex: 1; text-align: right; }
    .subject { font-weight: bold; margin: 12px 0 18px 0; font-size: 12px; }
    .body { font-size: 12px; line-height: 1.9; text-align: justify; }
    /* Closing row uses a 3-column grid so the centre column stays centred on
       the page regardless of the closing text's length. */
    .closing { margin-top: 24px; display: grid; grid-template-columns: 1fr 1fr 1fr; font-size: 12px; }
    .closing .left { text-align: left; }
    .closing .center { text-align: center; }
    .signer { margin-top: 40px; text-align: center; font-weight: bold; color: #000080; font-size: 13px; }
    .recipient { margin-top: 28px; font-size: 12px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="notice">
    <strong>Preview:</strong> This is what the downloaded PDF will contain.
    The dashed zones are intentionally blank — your printer should be loaded
    with the office's pre-printed letterhead, which fills those zones on paper.
  </div>

  <div class="letterhead-zone">Reserved for pre-printed letterhead</div>

  <div class="meta">
    <span class="ref">${escapeHtml(d.refNumber)}</span>
    <span class="date">Date: ${escapeHtml(d.date)}</span>
  </div>

  <p style="font-size:12px;">Dear Sir,</p>
  <div class="subject">Sub: ${escapeHtml(d.subject)}</div>

  <div class="body">
    <p>The Bearer of this letter ${escapeHtml(d.petitionerName)} and ${d.memberCount} ${memberWord}
       from ${escapeHtml(d.originLine)} are on pilgrimage to the Holy Shrine of ${escapeHtml(d.deityLine)}
       ${escapeHtml(d.visitDateLine)}.${d.mobileLine ? ' ' + escapeHtml(d.mobileLine) : ''}</p>
    <p>I am directed by Hon'ble Minister to request you to kindly arrange ${escapeHtml(d.servicesRequestedText)} on above said ${dateWord} for them and oblige.</p>
  </div>

  <div class="closing">
    <span class="left">${escapeHtml(d.closing)}</span>
    <span class="center">Yours sincerely</span>
    <span></span>
  </div>
  <div class="signer">${escapeHtml(d.signerName)}</div>

  <div class="recipient">
    ${d.recipientLines.map((l) => escapeHtml(l)).join('<br>')}
  </div>

  <div class="footer-zone">Reserved for pre-printed footer</div>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    sendServerError(res, 'Failed to preview temple-visit letter', error);
  }
}

/** Minimal HTML escape — sufficient because letter data has already been
 *  validated at write time and we never inline scripts/styles from user input. */
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
