import PDFDocument from 'pdfkit';
import { Response } from 'express';
import fs from 'fs';
import path from 'path';

// Government letterhead colors
const COLORS = {
  saffron: '#FF9933',
  navy: '#000080',
  green: '#138808',
  black: '#000000',
  gray: '#666666',
};

// Resolve and cache the national emblem PNG once. Source lives in src/assets;
// when running from compiled/ we fall back to ../../src/assets so the same
// binary works in both `ts-node-dev` (src/) and `node compiled/app.js` setups.
let cachedEmblem: Buffer | null | undefined;
function getEmblemBuffer(): Buffer | null {
  if (cachedEmblem !== undefined) return cachedEmblem;
  const candidates = [
    path.resolve(__dirname, '../assets/Embelem.png'),
    path.resolve(__dirname, '../../src/assets/Embelem.png'),
    path.resolve(process.cwd(), 'src/assets/Embelem.png'),
    path.resolve(process.cwd(), 'backend/src/assets/Embelem.png'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        cachedEmblem = fs.readFileSync(p);
        return cachedEmblem;
      }
    } catch {
      /* try next */
    }
  }
  cachedEmblem = null;
  return null;
}

interface LetterConfig {
  refNumber: string;
  date: string;
  to: string;
  toDesignation?: string;
  toAddress?: string;
  subject: string;
  body: string[];
  senderName: string;
  senderDesignation: string;
  senderOffice: string;
}

// Per-passenger row used in the railway EQ letter. Sex/Age and W/L columns
// pull from this when present; missing fields render as blanks.
export interface TrainEQPassenger {
  name: string;
  gender?: string;
  age?: number | string;
  waitlist?: string;
}

interface TrainEQLetter {
  refNumber: string;
  date: string;
  passengerName: string;
  pnrNumber: string;
  trainNumber: string;
  trainName: string;
  journeyDate: string;
  journeyClass: string;
  fromStation: string;
  toStation: string;
  senderName: string;
  senderDesignation: string;
  // Primary passenger's contact number — printed just under his name in the
  // passenger table.
  contactNumber?: string;
  // Additional passenger names for multiple passengers
  additionalPassengers?: string[];
  // Structured passenger rows (preferred over name strings when supplied —
  // populates Sex/Age and W/L columns).
  passengerDetails?: TrainEQPassenger[];
  // Number of berths requested. Falls back to passenger count if absent.
  numberOfPassengers?: number;
  // Unique document ID for watermark
  documentId?: string;
}

interface GrievanceLetter {
  refNumber: string;
  date: string;
  petitionerName: string;
  mobileNumber: string;
  constituency: string;
  wardVillage?: string;
  grievanceType: string;
  description: string;
  actionRequired: string;
  toOfficial: string;
  toDesignation: string;
  toDepartment: string;
  senderName: string;
  senderDesignation: string;
}

// Data shape for the MGP darshan/accommodation letter. Renders to the same
// letterhead as the Train EQ letter (Mallikarjungouda Patil → Additional PS to
// Minister of CAF&PD and MNRE). The recipient block is per-temple.
//
// `petitionerName` is the full name including any honorific the staff wants
// to print (e.g. "Sri. Amit Solanki", "Smt. Reshma K. Goni") — we render it
// verbatim into the body, no salutation field of our own.
export interface TempleVisitLetterData {
  refNumber: string;    // e.g. "No.M(CA,F&D and MNRE)/Addl.PS/4815"
  date: string;         // e.g. "09-05-2026"
  subject: string;      // e.g. "Request for Special Darshan & Accommodation."
  petitionerName: string;
  memberCount: number;
  originLine: string;   // e.g. "Hubli, Dist: Dharwad, State: Karnataka"
  deityLine: string;    // e.g. "Lord Shri Venkateshwar"
  visitDateLine: string; // e.g. "from 10-05-2026 to 13-05-2026" or "on 10-05-2026"
  mobileLine?: string;  // optional "Mob No:-9900430015"
  servicesRequestedText: string; // e.g. "Special Darshan & Accommodation"
  closing: string;      // "Thanking you," | "With regards,"
  signerName: string;   // "(Mallikarjunagouda Patil)"
  recipientLines: string[]; // ["The Joint Executive Officer", "Shri Tirumala Tirupati Devastanam Trust,", ...]
  documentId?: string;
  /**
   * When true, the PDF is rendered for printing onto physical letterhead
   * stationery: the digital letterhead, footer line, verification notice
   * and watermark are all suppressed, and the body is shifted down so the
   * pre-printed letterhead zone (top ~170pt) and footer zone (bottom ~90pt)
   * remain blank. The downloadable copy from the temple-visit endpoint
   * defaults to this mode.
   */
  letterheadMode?: boolean;
}

// Build the PDF entirely in memory, then send. The previous implementation
// piped doc directly to res, which sent `Content-Type: application/pdf`
// headers immediately. If a downstream `doc.text(...)` call threw partway
// through (e.g., PDFKit's default Helvetica throws WinAnsi-encoding errors
// on Devanagari / smart-quote / em-dash chars), the client received a
// truncated stream that no PDF reader could open.
//
// Buffering first lets us either send a complete PDF or a real 500 JSON
// error -- never a corrupt file.
export type PdfPageSize = 'A4' | 'A5';

function streamPdfToResponse(
  res: Response,
  filename: string,
  label: string,
  build: (doc: PDFKit.PDFDocument) => void,
  size: PdfPageSize = 'A4'
): void {
  const doc = new PDFDocument({ margin: 50, size });
  const chunks: Buffer[] = [];
  let failed = false;

  const fail = (error: unknown): void => {
    if (failed) return;
    failed = true;
    console.error(`PDF generation error (${label}):`, error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to generate PDF',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  doc.on('data', (c: Buffer) => chunks.push(c));
  doc.on('error', fail);
  doc.on('end', () => {
    if (failed) return;
    const buf = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-Length', String(buf.length));
    res.send(buf);
  });

  try {
    build(doc);
    doc.end();
  } catch (error) {
    fail(error);
  }
}

// Helper to create letterhead. Used by grievance and tour-program PDFs. Sized
// to fit on A5 (320pt usable width) without text wrapping — fontSize 11 keeps
// the long ministry line on a single line at both A5 and A4.
function createLetterhead(doc: PDFKit.PDFDocument): void {
  const pageWidth = doc.page.width;
  const margin = 50;
  const innerWidth = pageWidth - margin * 2;

  // Office of the Minister — top-of-letterhead heading. Replaces the
  // previous generic "GOVERNMENT OF INDIA" line per office convention.
  doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.navy)
     .text('OFFICE OF SHRI PRALHAD JOSHI', margin, 50, {
       align: 'center', width: innerWidth, lineBreak: false,
     });

  doc.font('Helvetica').fontSize(10).fillColor(COLORS.gray)
     .text("Hon'ble Union Minister", margin, 70, {
       align: 'center', width: innerWidth, lineBreak: false,
     });

  // Minister Pralhad Joshi holds both portfolios — list them on consecutive
  // lines. fontSize 11 keeps the long Consumer-Affairs line single-line on A5.
  doc.font('Helvetica').fontSize(11).fillColor(COLORS.black)
     .text('Ministry of Consumer Affairs, Food and Public Distribution', margin, 92, {
       align: 'center', width: innerWidth, lineBreak: false,
     });
  doc.text('Ministry of New and Renewable Energy', margin, 108, {
       align: 'center', width: innerWidth, lineBreak: false,
     });

  // Member of Parliament line — Pralhad Joshi represents Dharwad constituency.
  doc.font('Helvetica-Oblique').fontSize(10).fillColor(COLORS.gray)
     .text('MP, Dharwad Constituency', margin, 126, {
       align: 'center', width: innerWidth, lineBreak: false,
     });

  // Tricolor line
  const lineY = 146;
  const segmentWidth = innerWidth / 3;
  doc.rect(margin, lineY, segmentWidth, 3).fill(COLORS.saffron);
  doc.rect(margin + segmentWidth, lineY, segmentWidth, 3).fill('#FFFFFF');
  doc.rect(margin + segmentWidth, lineY, segmentWidth, 1).stroke(COLORS.gray);
  doc.rect(margin + segmentWidth * 2, lineY, segmentWidth, 3).fill(COLORS.green);

  doc.moveDown(2);
}

// Flag to prevent recursive watermark calls
let isCreatingWatermark = false;

// Helper to create unique watermark - SAFE version that won't cause infinite recursion
// `overrideWidth` / `overrideHeight` let callers in a scaled coordinate system
// (train EQ on A5 — see generateTrainEQLetter) pass the virtual page dimensions
// so the watermark and corner labels sit at the right virtual coordinates.
function createWatermark(
  doc: PDFKit.PDFDocument,
  documentId: string,
  refNumber: string,
  overrideWidth?: number,
  overrideHeight?: number
): void {
  // Prevent re-entry which causes infinite recursion
  if (isCreatingWatermark) {
    return;
  }

  isCreatingWatermark = true;

  try {
    const pageWidth = overrideWidth ?? doc.page.width;
    const pageHeight = overrideHeight ?? doc.page.height;
    
    // Save current state including position
    const savedY = doc.y;
    const savedX = doc.x;
    
    // Create diagonal watermark text
    const watermarkText = `OMS-${documentId.slice(0, 12).toUpperCase()}`;
    
    // Save graphics state
    doc.save();
    
    // Set watermark properties
    doc.opacity(0.08)
       .fontSize(60)
       .font('Helvetica-Bold')
       .fillColor('#000080');
    
    // Calculate center point
    const centerX = pageWidth / 2;
    const centerY = pageHeight / 2;
    
    // Apply transformations for rotation
    doc.translate(centerX, centerY)
       .rotate(-45)
       .translate(-centerX, -centerY);
    
    // Draw watermark using lineBreak: false to prevent page overflow
    doc.text(watermarkText, centerX - 150, centerY - 30, {
      lineBreak: false,
    });
    
    // Restore graphics state
    doc.restore();
    
    // Add small document ID in corner (visible)
    doc.save();
    doc.opacity(0.5)
       .fontSize(7)
       .font('Helvetica')
       .fillColor('#666666')
       .text(`Doc ID: ${documentId.slice(0, 12).toUpperCase()}`, pageWidth - 130, pageHeight - 25, {
         lineBreak: false,
       });
    doc.restore();
    
    // Add reference at bottom left
    doc.save();
    doc.opacity(0.3)
       .fontSize(6)
       .font('Helvetica')
       .fillColor('#333333')
       .text(`Ref: ${refNumber} | ID: ${documentId.slice(0, 8)}`, 50, pageHeight - 25, {
         lineBreak: false,
       });
    doc.restore();
    
    // Restore original position
    doc.x = savedX;
    doc.y = savedY;
  } finally {
    isCreatingWatermark = false;
  }
}

// Helper to create footer. Matches the Train EQ / Temple Visit footer style:
// a single black line with the Delhi residence address below it. Used by
// grievance and tour-program PDFs so all letters share one footer identity.
function createFooter(doc: PDFKit.PDFDocument): void {
  const pageWidth = doc.page.width;
  const margin = 50;
  const innerWidth = pageWidth - margin * 2;
  const footerLineY = doc.page.height - 55;

  doc.moveTo(margin, footerLineY)
     .lineTo(pageWidth - margin, footerLineY)
     .strokeColor(COLORS.black)
     .stroke();

  doc.font('Helvetica').fontSize(9).fillColor(COLORS.black)
     .text(
       'DELHI RESIDENCE : #11, AKBAR ROAD, NEW DELHI - 110001, TEL : 011 23014097, 23094098',
       margin,
       footerLineY + 6,
       { align: 'center', width: innerWidth, lineBreak: false }
     );
}

// Generate Train EQ Letter using the Addl. PS / Chief Commercial Manager
// pre-printed form layout. Staff-entered fields populate the blanks; Sex/Age
// and W/L columns are filled from passengerDetails when present.
export function generateTrainEQLetter(data: TrainEQLetter, res: Response): void {
  const documentId = data.documentId || `EQ${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const filename = `TrainEQ_${data.pnrNumber}_${documentId.slice(0, 8)}.pdf`;

  // Resolve the full passenger list. Prefer passengerDetails (full rows) when
  // supplied; otherwise fall back to comma-split names + additionalPassengers
  // for backward compat.
  let rows: TrainEQPassenger[];
  if (data.passengerDetails && data.passengerDetails.length > 0) {
    rows = data.passengerDetails.filter((p) => p.name && p.name.trim());
  } else {
    const splitNames = data.passengerName
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    const names =
      splitNames.length > 1 ? splitNames : data.passengerName.trim() ? [data.passengerName.trim()] : [];
    if (data.additionalPassengers && data.additionalPassengers.length > 0) {
      data.additionalPassengers.forEach((p) => {
        const t = p.trim();
        if (t) names.push(t);
      });
    }
    rows = names.map((name) => ({ name }));
  }

  const berthCount = data.numberOfPassengers && data.numberOfPassengers > 0
    ? data.numberOfPassengers
    : rows.length || 1;

  // Collapse to "<primary> + N others" when there's a single primary row but
  // the PNR has additional travellers (numberOfPassengers > 1). Sex/Age and
  // W/L for the primary stay populated; only the name is suffixed.
  if (
    rows.length === 1 &&
    data.numberOfPassengers &&
    data.numberOfPassengers > 1
  ) {
    const others = data.numberOfPassengers - 1;
    rows = [{
      ...rows[0],
      name: `${rows[0].name} + ${others} ${others === 1 ? 'other' : 'others'}`,
    }];
  }

  // Format Sex/Age cell as "M/34", "F/27", "OTHER/—". Returns empty string
  // when neither field is present so the cell looks blank rather than "—/—".
  const sexAgeCell = (p: TrainEQPassenger): string => {
    const g = (p.gender || '').toString().trim().toUpperCase();
    const sexLetter = g === 'MALE' ? 'M' : g === 'FEMALE' ? 'F' : g === 'OTHER' ? 'O' : '';
    const ageStr = p.age !== undefined && p.age !== null && String(p.age).trim() && Number(p.age) > 0
      ? String(p.age).trim()
      : '';
    if (!sexLetter && !ageStr) return '';
    return `${sexLetter || '-'}/${ageStr || '-'}`;
  };

  streamPdfToResponse(res, filename, 'TrainEQ', (doc) => {
    // Train EQ letters always render on A5. The layout below was tuned for
    // A4 (595×842pt) — we keep it pixel-identical and uniformly scale the
    // canvas down so the same content fits on A5 (420×595pt) without any
    // content modification. All draw calls use the virtual A4 dimensions.
    const VIRTUAL_W = 595;
    const VIRTUAL_H = 842;
    const scaleFactor = Math.min(
      doc.page.width / VIRTUAL_W,
      doc.page.height / VIRTUAL_H
    );

    // PDFKit's auto-pagination compares `doc.y` against
    // (page.height - margins.bottom) in user-space units. The signature,
    // footer line, and verification notice sit at virtual y ≈ 692..810,
    // which is well past the A5 page height (595) — each call would
    // otherwise trigger a fresh blank page just to draw that one line.
    // Push the bottom margin below the actual page edge so the virtual
    // layout never trips overflow. Same trick for the top margin so the
    // first writes at virtual y=50 (above actual y=50) don't get clipped.
    doc.page.margins.top = 0;
    doc.page.margins.bottom = doc.page.height - VIRTUAL_H - 20;

    doc.scale(scaleFactor);

    doc.on('pageAdded', () =>
      createWatermark(doc, documentId, data.refNumber, VIRTUAL_W, VIRTUAL_H)
    );
    createWatermark(doc, documentId, data.refNumber, VIRTUAL_W, VIRTUAL_H);

    const pageWidth = VIRTUAL_W;
    const margin = 50;
    const innerWidth = pageWidth - margin * 2;
    const headerTop = 50;

    // ── Three-column letterhead ───────────────────────────────────────────
    // Width budget across the 495pt content row:
    //   Left officer block : 220pt   (50  → 270)
    //   Emblem column      :  65pt   (275 → 340)
    //   Right contact block: 200pt   (345 → 545)
    // The right block needs ~140pt of value width so "CHITAGUPPI HOSPITAL
    // COMPOUND," fits on one line — keeping it wider than that prevents
    // PDFKit from line-wrapping which previously caused the rows to overlap.
    const officerW = 220;

    // Left: officer name + designation block.
    // Description uses fontSize 7.5 so the longest designation line
    // ("FOOD & PUBLIC DISTRIBUTION AND CONSUMER AFFAIRS", ~230pt at fontSize
    // 8) fits inside the 220pt officer column without wrapping into the
    // next row. lineBreak:false alone isn't reliable with `&`-containing
    // strings in older PDFKit versions.
    doc.font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(COLORS.navy)
      .text('MALLIKARJUNGOUDA PATIL', margin, headerTop, { width: officerW, lineBreak: false });
    const descLines = [
      'ADDITIONAL PRIVATE SECRETARY TO MINISTER OF',
      'FOOD & PUBLIC DISTRIBUTION AND CONSUMER AFFAIRS',
      'NEW & RENEWABLE ENERGY',
      'GOVERNMENT OF INDIA, NEW DELHI',
    ];
    const descLineGap = 11;
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.black);
    descLines.forEach((line, i) => {
      doc.text(line, margin, headerTop + 22 + i * descLineGap, {
        width: officerW,
        lineBreak: false,
      });
    });

    // Center: national emblem (Ashoka pillar). Falls back to text label if
    // the asset can't be located on disk for any reason.
    const centerX = margin + officerW + 5;     // 275
    const centerW = 65;
    const emblem = getEmblemBuffer();
    if (emblem) {
      try {
        doc.image(emblem, centerX, headerTop, { fit: [centerW, 75], align: 'center' });
      } catch {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.gray)
          .text('GOVT. OF INDIA', centerX, headerTop + 30, { width: centerW, align: 'center', lineBreak: false });
      }
    } else {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.gray)
        .text('GOVT. OF INDIA', centerX, headerTop + 30, { width: centerW, align: 'center', lineBreak: false });
    }

    // Right: contact info block. rightValueW = 545 - 405 = 140pt at A4.
    const rightX = margin + officerW + 5 + centerW + 5;   // 345
    const rightLabelW = 55;
    const rightValueX = rightX + rightLabelW;             // 400
    const rightValueW = pageWidth - margin - rightValueX; // 145
    let rightY = headerTop;
    const rowGap = 12; // a touch over fontSize 8's natural line height

    const writeRow = (label: string, value: string) => {
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.black)
        .text(label, rightX, rightY, { width: rightLabelW, lineBreak: false });
      doc.text(': ' + value, rightValueX, rightY, { width: rightValueW, lineBreak: false });
      rightY += rowGap;
    };
    const writeContinuation = (value: string) => {
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.black)
        .text('  ' + value, rightValueX, rightY, { width: rightValueW, lineBreak: false });
      rightY += rowGap;
    };

    writeRow('OFF', 'CHITAGUPPI HOSPITAL COMPOUND,');
    writeContinuation('LAMINGTON ROAD, HUBLI- 580 020.');
    writeRow('TEL', '(0) 2251055   FAX : 2258955');
    writeRow('E-MAIL', 'patil.nimmav@gmail.com');
    writeRow('DELHI OFF', 'Room No. 179 "G" Wing, 1st Floor');
    writeContinuation('Krishi Bhawan, New Delhi - 110 001');
    writeRow('TEL', '23070637, 23070642');

    // Last description line ends at headerTop + 22 + 3*11 = headerTop + 55.
    // Add ~30pt of breathing room before the body.
    let y = Math.max(headerTop + 85, rightY + 10);

    // ── Reference number + Date row ───────────────────────────────────────
    // Print the last 4 digits of this EQ's document id right after "PS/".
    const eqShort = (documentId || '').slice(-4).toUpperCase();
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.black)
      .text(`No. M(CA, F & PD And MNRE) Addl. PS/${eqShort}`, margin, y, { lineBreak: false });
    doc.text(`Date : ${data.date}`, pageWidth - margin - 180, y, { width: 180, align: 'left', lineBreak: false });
    y += 24;

    // ── Addressee ─────────────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(11).text('To,', margin, y, { lineBreak: false });
    y += 14;
    doc.text('Chief Commercial Manager,', margin, y, { lineBreak: false });
    y += 14;
    doc.text('South Western Railway, Hubli.', margin, y, { lineBreak: false });

    y += 22;
    doc.text('Sir,', margin, y, { lineBreak: false });
    y += 16;

    // ── Body with fill-ins ────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(11);

    // "Please arrange to release <berths> Berths from Emergency Quota"
    // ("Emergency Quota" kept together on this line — Quota no longer wraps.)
    doc.text('Please arrange to release ', margin, y, { continued: true })
      .font('Helvetica-Bold').text(String(berthCount), { continued: true })
      .font('Helvetica').text(' Berths from Emergency Quota');
    y = doc.y + 2;

    // "for the following persons who are Travelling by Train No. <num>"
    // (Train number stays on this line with its label.)
    doc.text('for the following persons who are Travelling by Train No. ', margin, y, { continued: true })
      .font('Helvetica-Bold').text(data.trainNumber || '_____');
    y = doc.y + 4;

    // "Train Name <name>"
    doc.font('Helvetica').text('Train Name ', margin, y, { continued: true })
      .font('Helvetica-Bold').text(data.trainName || '_____');
    y = doc.y + 4;

    // "From <from> To <to> in <class> on <date>"
    doc.font('Helvetica').text('From ', margin, y, { continued: true })
      .font('Helvetica-Bold').text(data.fromStation || '_____', { continued: true })
      .font('Helvetica').text(' To ', { continued: true })
      .font('Helvetica-Bold').text(data.toStation || '_____', { continued: true })
      .font('Helvetica').text(' in ', { continued: true })
      .font('Helvetica-Bold').text(data.journeyClass || '_____', { continued: true })
      .font('Helvetica').text(' class on ', { continued: true })
      .font('Helvetica-Bold').text(data.journeyDate || '_____');
    y = doc.y + 14;

    // ── Passenger Table ───────────────────────────────────────────────────
    const colW = [40, 200, 70, 130, 50];
    const colX = [margin];
    for (let i = 1; i < colW.length; i++) colX[i] = colX[i - 1] + colW[i - 1];
    const tableEndX = colX[colW.length - 1] + colW[colW.length - 1];

    const headers = ['Sl No.', 'Name', 'Sex/Age', 'PNR No.', 'W/L'];
    doc.font('Helvetica-Bold').fontSize(10);
    headers.forEach((h, i) => doc.text(h, colX[i] + 4, y, { width: colW[i] - 8, lineBreak: false }));
    y += 14;
    doc.moveTo(margin, y).lineTo(tableEndX, y).strokeColor(COLORS.gray).stroke();
    y += 5;

    doc.font('Helvetica').fontSize(10).fillColor(COLORS.black);
    if (rows.length === 0) {
      // No names at all — render at least one blank row so the grid isn't empty.
      doc.font('Helvetica').text('1', colX[0] + 4, y, { width: colW[0] - 8, lineBreak: false });
      // PNR in bold (per the EQ letter format).
      doc.font('Helvetica-Bold').text(data.pnrNumber, colX[3] + 4, y, { width: colW[3] - 8, lineBreak: false });
      y += 16;
    } else {
      rows.forEach((p, i) => {
        doc.font('Helvetica').fontSize(10).fillColor(COLORS.black)
          .text(String(i + 1), colX[0] + 4, y, { width: colW[0] - 8, lineBreak: false });
        // Passenger name in bold.
        doc.font('Helvetica-Bold').text(p.name, colX[1] + 4, y, { width: colW[1] - 8, lineBreak: false });
        const sa = sexAgeCell(p);
        if (sa) {
          doc.font('Helvetica').text(sa, colX[2] + 4, y, { width: colW[2] - 8, lineBreak: false });
        }
        // PNR (and the primary's mobile) show only on the first row — one PNR
        // covers all passengers. PNR is printed in bold.
        if (i === 0) {
          doc.font('Helvetica-Bold').text(data.pnrNumber, colX[3] + 4, y, { width: colW[3] - 8, lineBreak: false });
        }
        if (p.waitlist && String(p.waitlist).trim()) {
          doc.font('Helvetica').text(String(p.waitlist).trim(), colX[4] + 4, y, { width: colW[4] - 8, lineBreak: false });
        }
        // Primary passenger's mobile number, printed just under his name.
        if (i === 0 && data.contactNumber && data.contactNumber.trim()) {
          doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.gray)
            .text(`Mob: ${data.contactNumber.trim()}`, colX[1] + 4, y + 12, {
              width: colW[1] - 8,
              lineBreak: false,
            });
          doc.fontSize(10).fillColor(COLORS.black);
          y += 12; // extra room so the mobile line doesn't collide with the next row
        }
        y += 16;
      });
    }

    // Bottom border under table
    doc.moveTo(margin, y).lineTo(tableEndX, y).strokeColor(COLORS.gray).stroke();

    // ── Signature block (anchored above the bottom footer) ────────────────
    const signatureY = VIRTUAL_H - 150;
    doc.font('Helvetica').fontSize(11).fillColor(COLORS.black)
      .text("Your's Faithfully,", pageWidth - margin - 220, signatureY, { width: 220, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(13)
      .text('MALLIKARJUNGOUDA PATIL', pageWidth - margin - 260, signatureY + 45, { width: 260, lineBreak: false });

    // ── Bottom footer ─────────────────────────────────────────────────────
    const footerLineY = VIRTUAL_H - 55;
    doc.moveTo(margin, footerLineY).lineTo(pageWidth - margin, footerLineY).strokeColor(COLORS.black).stroke();
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.black)
      .text(
        'DELHI RESIDENCE : #11, AKBAR ROAD, NEW DELHI - 110001, TEL : 011 23014097, 23094098',
        margin,
        footerLineY + 6,
        { align: 'center', width: innerWidth, lineBreak: false }
      );

    // Verification notice (small) — kept inline with footer to stay on-page.
    doc.fontSize(7).fillColor('#888888')
      .text(
        `This document is electronically generated. Verify at: verify.oms.gov.in/${documentId}`,
        margin,
        footerLineY + 22,
        { width: innerWidth, align: 'center', lineBreak: false }
      );
  }, 'A5');
}

// Generate Grievance Letter
export function generateGrievanceLetter(data: GrievanceLetter, res: Response, size: PdfPageSize = 'A4'): void {
  const documentId = `GRV${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const filename = `Grievance_${data.refNumber}.pdf`;

  streamPdfToResponse(res, filename, 'Grievance', (doc) => {
    // Verification notice is drawn at (page.height - 40). PDFKit's default
    // margins.bottom=50 would treat that as overflow and add a blank trailing
    // page just to hold that single line — tighten the bottom margin so the
    // notice stays on the same page as the letter body.
    doc.page.margins.bottom = 15;

    // Add watermark to every page using page event
    doc.on('pageAdded', () => {
      createWatermark(doc, documentId, data.refNumber);
    });

    // Add watermark to first page
    createWatermark(doc, documentId, data.refNumber);

    // Create letterhead
    createLetterhead(doc);

  const margin = 50;
  let y = 170;

  // Reference and Date
  doc.fontSize(10)
     .font('Helvetica')
     .fillColor(COLORS.black)
     .text(`Ref No: ${data.refNumber}`, margin, y)
     .text(`Date: ${data.date}`, doc.page.width - 150, y);

  y += 30;

  // To Address
  doc.fontSize(11)
     .font('Helvetica-Bold')
     .text('To,', margin, y);
  
  y += 15;
  doc.font('Helvetica')
     .text(data.toOfficial, margin, y);
  y += 15;
  doc.text(data.toDesignation, margin, y);
  y += 15;
  doc.text(data.toDepartment, margin, y);

  y += 30;

  // Subject
  doc.font('Helvetica-Bold')
     .text(`Subject: ${data.grievanceType} - Request for Action`, margin, y);

  y += 25;

  // Body
  doc.font('Helvetica')
     .fontSize(11)
     .text('Sir/Madam,', margin, y);

  y += 20;

  const wardVillageLine = data.wardVillage ? `\n• Ward/Village: ${data.wardVillage}` : '';
  const bodyText = `I am writing to bring to your attention a grievance received at our office that requires your immediate attention and action.

Petitioner Details:
• Name: ${data.petitionerName}
• Mobile: ${data.mobileNumber}
• Constituency: ${data.constituency}${wardVillageLine}

Grievance Details:
• Type: ${data.grievanceType}
• Description: ${data.description}

Action Required: ${data.actionRequired}

I request you to look into this matter personally and take necessary action at the earliest. Kindly update this office on the progress of the same.`;

  doc.text(bodyText, margin, y, {
    width: doc.page.width - margin * 2,
    align: 'justify',
    lineGap: 5,
  });

  y = doc.y + 40;

  // Signature — matches the Train EQ / Temple Visit letters: a single
  // "Yours sincerely" line with the issuing officer's name below it.
  // (Shri Pralhad Joshi is the Hon'ble Minister; letters from this office
  // are issued under his Additional Private Secretary's signature.)
  doc.text('Yours sincerely,', margin, y);
  y += 45;
  doc.font('Helvetica-Bold')
     .text('MALLIKARJUNGOUDA PATIL', margin, y);

  // Footer
  createFooter(doc);

    // Verification notice — sits just below the createFooter line, matching
    // the Train EQ footer/notice stack so all letters look identical at the
    // bottom edge.
    doc.fontSize(7)
       .font('Helvetica')
       .fillColor('#888888')
       .text(
         `This document is electronically generated. Verify at: verify.oms.gov.in/${documentId}`,
         margin,
         doc.page.height - 33,
         { width: doc.page.width - margin * 2, align: 'center', lineBreak: false }
       );
  }, size);
}

// Generate Tour Program PDF
export function generateTourProgramPDF(
  events: Array<{
    eventName: string;
    organizer: string;
    organizerPhone?: string | null;
    eventDate: string;
    venue: string;
    decision: string;
  }>,
  dateRange: string,
  res: Response,
  size: PdfPageSize = 'A5'
): void {
  const documentId = `TOUR${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const refNumber = `TOUR-${Date.now().toString(36).toUpperCase()}`;
  const filename = `TourProgram_${Date.now()}.pdf`;

  streamPdfToResponse(res, filename, 'TourProgram', (doc) => {
    // Verification notice sits at (page.height - 40); default margins.bottom=50
    // would treat that as overflow and append a blank page. Tighten it so the
    // notice stays on the last content page.
    doc.page.margins.bottom = 15;

    // Add watermark to every page using page event
    doc.on('pageAdded', () => {
      createWatermark(doc, documentId, refNumber);
    });

    // Add watermark to first page
    createWatermark(doc, documentId, refNumber);

    // Create letterhead
    createLetterhead(doc);

  const margin = 50;
  let y = 170;

  // Title
  doc.fontSize(16)
     .font('Helvetica-Bold')
     .fillColor(COLORS.navy)
     .text('TOUR PROGRAM', margin, y, { align: 'center', width: doc.page.width - margin * 2 });

  y += 25;

  doc.fontSize(12)
     .font('Helvetica')
     .fillColor(COLORS.black)
     .text(dateRange, margin, y, { align: 'center', width: doc.page.width - margin * 2 });

  y += 40;

  // Table header. Column widths sized so the total (320pt) fits within A5's
  // usable area (420 page - 100 margins = 320pt). Organizer cell shows name +
  // phone on two lines, so rowHeight is bumped accordingly.
  const colWidths = [25, 70, 90, 55, 35, 45];
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const startX = (doc.page.width - tableWidth) / 2;

  // Header row
  doc.rect(startX, y, tableWidth, 22).fill(COLORS.navy);

  doc.fillColor('#FFFFFF')
     .fontSize(9)
     .font('Helvetica-Bold');

  let x = startX + 4;
  const headers = ['S.No', 'Event', 'Organizer / Phone', 'Venue', 'Time', 'Status'];
  headers.forEach((header, i) => {
    doc.text(header, x, y + 7, { width: colWidths[i] - 8, lineBreak: false });
    x += colWidths[i];
  });

  y += 22;

  // Data rows
  doc.font('Helvetica')
     .fontSize(8)
     .fillColor(COLORS.black);

  events.forEach((event, index) => {
    const rowHeight = 38;

    // Alternate row colors
    if (index % 2 === 0) {
      doc.rect(startX, y, tableWidth, rowHeight).fill('#f8f9fa');
    }

    doc.fillColor(COLORS.black);
    x = startX + 4;

    const eventTime = new Date(event.eventDate).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const organizerCell = event.organizerPhone
      ? `${event.organizer}\n${event.organizerPhone}`
      : event.organizer;

    const rowData = [
      String(index + 1),
      event.eventName,
      organizerCell,
      event.venue,
      eventTime,
      event.decision,
    ];

    rowData.forEach((data, i) => {
      doc.text(data, x, y + 4, { width: colWidths[i] - 8 });
      x += colWidths[i];
    });

    y += rowHeight;

    // Add new page if needed
    if (y > doc.page.height - 150) {
      doc.addPage();
      y = 50;
    }
  });

  // Border around table
  doc.rect(startX, 235, tableWidth, y - 235).stroke(COLORS.gray);

  // Footer
  createFooter(doc);

    // Verification notice — sits just below the createFooter line, matching
    // the Train EQ footer/notice stack so all letters look identical at the
    // bottom edge.
    doc.fontSize(7)
       .font('Helvetica')
       .fillColor('#888888')
       .text(
         `This document is electronically generated. Verify at: verify.oms.gov.in/${documentId}`,
         margin,
         doc.page.height - 33,
         { width: doc.page.width - margin * 2, align: 'center', lineBreak: false }
       );
  }, size);
}

// Generate Temple Visit (darshan / accommodation) letter. Uses the
// Addl. PS letterhead — three-column header identical to the Train EQ form
// (officer details + emblem + contact block), then a narrative body and a
// per-temple recipient block at the bottom.
export function generateTempleVisitLetter(
  data: TempleVisitLetterData,
  res: Response,
  size: PdfPageSize = 'A5'
): void {
  const documentId =
    data.documentId ||
    `TPL${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const filename = `TempleVisit_${data.refNumber.replace(/[^A-Za-z0-9]/g, '_')}_${documentId.slice(0, 6)}.pdf`;

  streamPdfToResponse(res, filename, 'TempleVisit', (doc) => {
    doc.page.margins.bottom = 15;
    const letterheadMode = !!data.letterheadMode;

    // Watermark is for digital-only copies. On letterhead stationery the
    // physical paper itself is the source of truth; a diagonal watermark
    // would just clash with the pre-printed letterhead visually.
    if (!letterheadMode) {
      doc.on('pageAdded', () => createWatermark(doc, documentId, data.refNumber));
      createWatermark(doc, documentId, data.refNumber);
    }

    const pageWidth = doc.page.width;
    const margin = 50;
    const innerWidth = pageWidth - margin * 2;
    const headerTop = 50;
    const officerW = 220;

    // Body start Y. In letterhead mode we shift down to ~145pt so the
    // pre-printed letterhead occupies the blank zone above. In normal mode
    // we draw the digital letterhead in that zone and start the body right
    // below it.
    let y: number;

    if (letterheadMode) {
      // Start the body below the pre-printed letterhead zone. Expressed as a
      // fraction of page height (not a fixed 145pt that was tuned for A5) so
      // it lands correctly on the A4 letterhead the office actually prints on.
      y = Math.round(doc.page.height * 0.23);
    } else {
      // ── Letterhead — left officer block ────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.navy)
        .text('MALLIKARJUNGOUDA PATIL', margin, headerTop, { width: officerW, lineBreak: false });
      const descLines = [
        'ADDITIONAL PRIVATE SECRETARY TO MINISTER OF',
        'FOOD & PUBLIC DISTRIBUTION AND CONSUMER AFFAIRS',
        'NEW & RENEWABLE ENERGY',
        'GOVERNMENT OF INDIA, NEW DELHI',
      ];
      const descLineGap = 11;
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.black);
      descLines.forEach((line, i) => {
        doc.text(line, margin, headerTop + 22 + i * descLineGap, { width: officerW, lineBreak: false });
      });

      // Center emblem
      const centerX = margin + officerW + 5;
      const centerW = 65;
      const emblem = getEmblemBuffer();
      if (emblem) {
        try {
          doc.image(emblem, centerX, headerTop, { fit: [centerW, 75], align: 'center' });
        } catch {
          doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.gray)
            .text('GOVT. OF INDIA', centerX, headerTop + 30, { width: centerW, align: 'center', lineBreak: false });
        }
      } else {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.gray)
          .text('GOVT. OF INDIA', centerX, headerTop + 30, { width: centerW, align: 'center', lineBreak: false });
      }

      // Right contact block
      const rightX = margin + officerW + 5 + centerW + 5;
      const rightLabelW = 55;
      const rightValueX = rightX + rightLabelW;
      const rightValueW = pageWidth - margin - rightValueX;
      let rightY = headerTop;
      const rowGap = 12;
      const writeRow = (label: string, value: string) => {
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.black)
          .text(label, rightX, rightY, { width: rightLabelW, lineBreak: false });
        doc.text(': ' + value, rightValueX, rightY, { width: rightValueW, lineBreak: false });
        rightY += rowGap;
      };
      const writeContinuation = (value: string) => {
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.black)
          .text('  ' + value, rightValueX, rightY, { width: rightValueW, lineBreak: false });
        rightY += rowGap;
      };
      writeRow('OFF', 'CHITAGUPPI HOSPITAL COMPOUND,');
      writeContinuation('LAMINGTON ROAD, HUBLI- 580 020.');
      writeRow('TEL', '(0) 2251055   FAX : 2258955');
      writeRow('E-MAIL', 'patil.nimmav@gmail.com');
      writeRow('DELHI OFF', 'Room No. 179 "G" Wing, 1st Floor');
      writeContinuation('Krishi Bhawan, New Delhi - 110 001');
      writeRow('TEL', '23070637, 23070642');

      y = Math.max(headerTop + 85, rightY + 10);
    }

    // ── Reference number + Date row ───────────────────────────────────────
    // Date is hard-right-aligned to the page margin — the text's right edge
    // sits at (pageWidth - margin) regardless of how short the date string is.
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.black)
      .text(data.refNumber, margin, y, { lineBreak: false });
    doc.text(`Date: ${data.date}`, margin, y, { width: innerWidth, align: 'right', lineBreak: false });
    y += 28;

    // ── Salutation + Subject ──────────────────────────────────────────────
    // "Dear Sir," is bold and at the left margin; the subject is bold and
    // first-line-indented, matching the office's standard letter format.
    const bodyIndent = 36;
    doc.font('Helvetica-Bold').fontSize(11).text('Dear Sir,', margin, y, { lineBreak: false });
    y += 24;
    doc.font('Helvetica-Bold').text(`Sub: ${data.subject}`, margin, y, {
      width: innerWidth,
      indent: bodyIndent,
    });
    y = doc.y + 16;

    // ── Body ──────────────────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(11).fillColor(COLORS.black);

    // "The Bearer of this letter <Name> and <N> members from <originLine> are
    //  on pilgrimage to the Holy Shrine of <Deity> <visitDateLine>."
    const bodyParas: string[] = [];
    const memberWord = data.memberCount === 1 ? 'member' : 'members';
    bodyParas.push(
      `The Bearer of this letter ${data.petitionerName} and ${data.memberCount} ${memberWord} ` +
        `from ${data.originLine} are on pilgrimage to the Holy Shrine of ${data.deityLine} ` +
        `${data.visitDateLine}.` +
        (data.mobileLine ? ` ${data.mobileLine}` : '')
    );
    bodyParas.push(
      `I am directed by Hon'ble Union Minister to request you to kindly arrange ${data.servicesRequestedText} ` +
        `on above said ${data.visitDateLine.startsWith('from') ? 'dates' : 'date'} for them and oblige.`
    );

    bodyParas.forEach((p) => {
      doc.text(p, margin, y, {
        width: innerWidth,
        align: 'justify',
        indent: bodyIndent,
        lineGap: 6,
      });
      y = doc.y + 14;
    });

    // ── Closing + signature + recipient ───────────────────────────────────
    // The recipient address block is anchored near the page bottom so the
    // pre-printed footer zone (letterhead mode) or rendered footer line
    // (digital mode) has the breathing room the office expects. The
    // signature block is then vertically centred in the gap between the
    // body and the recipient block, instead of being bunched up directly
    // under the body with a sea of whitespace below.
    y += 6;
    const bodyEndY = y;
    const recipientLineHeight = 14;
    const recipientLineCount = Math.max(1, data.recipientLines.length);
    // Anchor the recipient block roughly two-thirds down the page — high
    // enough to leave a comfortable margin above the (pre-printed or
    // rendered) footer, but not so low that there's a sea of whitespace
    // between the signature and the address. Tuned by eye against the
    // sample letter; bump the reserve to push the block higher.
    // Anchor the recipient block near the page bottom but with guaranteed
    // clearance above the pre-printed physical footer. The footer zone on the
    // office's A4 letterhead (Delhi/Hubballi office addresses + tel/fax) runs
    // about the bottom ~90pt, so the reserve must exceed that or the recipient
    // address overprints the footer. Expressed as a fraction of page height
    // (≈0.22 → 185pt on A4) so the block ends at ~78% — sitting well clear of
    // the footer, matching the office's sample letter.
    const bottomReserve = letterheadMode
      ? Math.round(doc.page.height * 0.22)
      : 250;
    const recipientStartY = Math.max(
      bodyEndY + 90,
      doc.page.height - bottomReserve - recipientLineCount * recipientLineHeight
    );

    // Signature block layout (relative to its top):
    //   0   : closing (left)
    //   +20 : "Yours sincerely" (right-aligned)
    //   +70 : signer name (right-aligned, bold)
    // The wider gap between "Yours sincerely" and the printed signer name
    // gives space for a hand-written signature on the printed letter.
    //
    // Anchor the closing just under the body (not floated to the middle of the
    // gap) so "With regards," / "Thanking you," reads as a natural continuation
    // of the letter instead of drifting halfway down toward the footer. Capped
    // so an unusually long body can't push the signature into the recipient
    // block.
    const sigBlockHeight = 70;
    const closingY = Math.min(
      bodyEndY + 30,
      recipientStartY - sigBlockHeight - 24
    );

    doc.font('Helvetica').fontSize(11).fillColor(COLORS.black);
    doc.text(data.closing, margin, closingY, { lineBreak: false });
    doc.text('Yours sincerely,', margin, closingY + 20, {
      width: innerWidth,
      align: 'right',
      lineBreak: false,
    });
    doc.font('Helvetica-Bold').fontSize(11).text(data.signerName, margin, closingY + 70, {
      width: innerWidth,
      align: 'right',
      lineBreak: false,
    });

    // Recipient block (bottom-left, like a footer address). Anchored to the
    // page bottom so it visually balances the header zone above the body. The
    // first line (the office/designation) is bold, like the sample letter.
    let recipY = recipientStartY;
    data.recipientLines.forEach((line, i) => {
      doc.font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(11).fillColor(COLORS.black);
      doc.text(line, margin, recipY, { width: innerWidth, lineBreak: false });
      recipY += recipientLineHeight;
    });
    y = recipY;

    // ── Bottom footer line ─ skipped in letterhead mode so the pre-printed
    // physical footer (Delhi residence + tel) stays clean.
    if (!letterheadMode) {
      const footerLineY = doc.page.height - 55;
      doc.moveTo(margin, footerLineY).lineTo(pageWidth - margin, footerLineY).strokeColor(COLORS.black).stroke();
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.black)
        .text(
          'DELHI RESIDENCE : #11, AKBAR ROAD, NEW DELHI - 110001, TEL : 011 23014097, 23094098',
          margin,
          footerLineY + 6,
          { align: 'center', width: innerWidth, lineBreak: false }
        );
      doc.fontSize(7).fillColor('#888888')
        .text(
          `This document is electronically generated. Verify at: verify.oms.gov.in/${documentId}`,
          margin,
          footerLineY + 22,
          { width: innerWidth, align: 'center', lineBreak: false }
        );
    }
  }, size);
}

// Generate generic letter
export function generateGenericLetter(config: LetterConfig, res: Response): void {
  const documentId = `LTR${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const filename = `Letter_${config.refNumber}.pdf`;

  streamPdfToResponse(res, filename, 'GenericLetter', (doc) => {
    // Add watermark to every page using page event
    doc.on('pageAdded', () => {
      createWatermark(doc, documentId, config.refNumber);
    });

    // Add watermark to first page
    createWatermark(doc, documentId, config.refNumber);

    // Create letterhead
    createLetterhead(doc);

  const margin = 50;
  let y = 170;

  // Reference and Date
  doc.fontSize(10)
     .font('Helvetica')
     .fillColor(COLORS.black)
     .text(`Ref No: ${config.refNumber}`, margin, y)
     .text(`Date: ${config.date}`, doc.page.width - 150, y);

  y += 30;

  // To Address
  doc.fontSize(11)
     .font('Helvetica-Bold')
     .text('To,', margin, y);
  
  y += 15;
  doc.font('Helvetica')
     .text(config.to, margin, y);
  
  if (config.toDesignation) {
    y += 15;
    doc.text(config.toDesignation, margin, y);
  }
  
  if (config.toAddress) {
    y += 15;
    doc.text(config.toAddress, margin, y);
  }

  y += 30;

  // Subject
  doc.font('Helvetica-Bold')
     .text(`Subject: ${config.subject}`, margin, y);

  y += 25;

  // Body
  doc.font('Helvetica')
     .fontSize(11)
     .text('Sir/Madam,', margin, y);

  y += 20;

  config.body.forEach((paragraph) => {
    doc.text(paragraph, margin, y, {
      width: doc.page.width - margin * 2,
      align: 'justify',
      lineGap: 5,
    });
    y = doc.y + 15;
  });

  y += 25;

  // Signature
  doc.text('With regards,', margin, y);
  y += 30;
  doc.font('Helvetica-Bold')
     .text(config.senderName, margin, y);
  y += 15;
  doc.font('Helvetica')
     .text(config.senderDesignation, margin, y);
  y += 15;
  doc.text(config.senderOffice, margin, y);

  // Footer
  createFooter(doc);

    // Verification notice — sits just below the createFooter line, matching
    // the Train EQ footer/notice stack so all letters look identical at the
    // bottom edge.
    doc.fontSize(7)
       .font('Helvetica')
       .fillColor('#888888')
       .text(
         `This document is electronically generated. Verify at: verify.oms.gov.in/${documentId}`,
         margin,
         doc.page.height - 33,
         { width: doc.page.width - margin * 2, align: 'center', lineBreak: false }
       );
  });
}
