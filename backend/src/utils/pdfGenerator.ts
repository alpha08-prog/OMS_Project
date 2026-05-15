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
function streamPdfToResponse(
  res: Response,
  filename: string,
  label: string,
  build: (doc: PDFKit.PDFDocument) => void
): void {
  const doc = new PDFDocument({ margin: 50 });
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

// Helper to create letterhead
function createLetterhead(doc: PDFKit.PDFDocument): void {
  const pageWidth = doc.page.width;
  const margin = 50;

  // Government header
  doc.fontSize(14)
     .fillColor(COLORS.navy)
     .text('GOVERNMENT OF INDIA', margin, 50, { align: 'center', width: pageWidth - margin * 2 });

  doc.fontSize(12)
     .text('MINISTRY OF CONSUMER AFFAIRS, FOOD AND PUBLIC DISTRIBUTION', margin, 68, { align: 'center', width: pageWidth - margin * 2 });

  // Minister's name
  doc.fontSize(16)
     .font('Helvetica-Bold')
     .fillColor(COLORS.black)
     .text('SHRI PRAHLAD JOSHI', margin, 90, { align: 'center', width: pageWidth - margin * 2 });

  doc.fontSize(11)
     .font('Helvetica')
     .fillColor(COLORS.gray)
     .text('Hon\'ble Union Minister', margin, 110, { align: 'center', width: pageWidth - margin * 2 });

  // Tricolor line
  const lineY = 135;
  const lineWidth = pageWidth - margin * 2;
  const segmentWidth = lineWidth / 3;

  doc.rect(margin, lineY, segmentWidth, 3).fill(COLORS.saffron);
  doc.rect(margin + segmentWidth, lineY, segmentWidth, 3).fill('#FFFFFF');
  doc.rect(margin + segmentWidth, lineY, segmentWidth, 1).stroke(COLORS.gray);
  doc.rect(margin + segmentWidth * 2, lineY, segmentWidth, 3).fill(COLORS.green);

  doc.moveDown(2);
}

// Flag to prevent recursive watermark calls
let isCreatingWatermark = false;

// Helper to create unique watermark - SAFE version that won't cause infinite recursion
function createWatermark(doc: PDFKit.PDFDocument, documentId: string, refNumber: string): void {
  // Prevent re-entry which causes infinite recursion
  if (isCreatingWatermark) {
    return;
  }
  
  isCreatingWatermark = true;
  
  try {
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    
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

// Helper to create footer
function createFooter(doc: PDFKit.PDFDocument): void {
  const pageWidth = doc.page.width;
  const margin = 50;
  const footerY = doc.page.height - 80;

  // Tricolor line
  const lineWidth = pageWidth - margin * 2;
  const segmentWidth = lineWidth / 3;

  doc.rect(margin, footerY, segmentWidth, 2).fill(COLORS.saffron);
  doc.rect(margin + segmentWidth, footerY, segmentWidth, 2).fill('#FFFFFF');
  doc.rect(margin + segmentWidth, footerY, segmentWidth, 0.5).stroke(COLORS.gray);
  doc.rect(margin + segmentWidth * 2, footerY, segmentWidth, 2).fill(COLORS.green);

  // Contact info
  doc.fontSize(8)
     .fillColor(COLORS.gray)
     .text(
       'Office of Hon\'ble Minister | Krishi Bhawan, New Delhi - 110001 | Tel: 011-23383615',
       margin,
       footerY + 10,
       { align: 'center', width: pageWidth - margin * 2 }
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
    // Tighten the bottom margin so the contact-line footer + verification
    // notice (which sit close to the page edge) don't trip PDFKit's auto
    // pagination and produce extra blank pages.
    doc.page.margins.bottom = 15;

    doc.on('pageAdded', () => createWatermark(doc, documentId, data.refNumber));
    createWatermark(doc, documentId, data.refNumber);

    const pageWidth = doc.page.width;
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
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.black)
      .text('No. M(CA, F & PD And MNRE) Addl. PS/', margin, y, { lineBreak: false });
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

    // "Please arrange to release <berths> Berths from Emergency"
    doc.text('Please arrange to release ', margin, y, { continued: true })
      .font('Helvetica-Bold').text(String(berthCount), { continued: true })
      .font('Helvetica').text(' Berths from Emergency');
    y = doc.y + 2;

    // "Quota for the following persons who are Travelling by Train No. <num>"
    doc.text('Quota for the following persons who are Travelling by Train No. ', margin, y, { continued: true })
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
      .font('Helvetica').text(' on ', { continued: true })
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
      doc.text('1', colX[0] + 4, y, { width: colW[0] - 8, lineBreak: false });
      doc.text(data.pnrNumber, colX[3] + 4, y, { width: colW[3] - 8, lineBreak: false });
      y += 16;
    } else {
      rows.forEach((p, i) => {
        doc.text(String(i + 1), colX[0] + 4, y, { width: colW[0] - 8, lineBreak: false });
        doc.text(p.name, colX[1] + 4, y, { width: colW[1] - 8, lineBreak: false });
        const sa = sexAgeCell(p);
        if (sa) doc.text(sa, colX[2] + 4, y, { width: colW[2] - 8, lineBreak: false });
        // PNR shows only on the first row (one PNR covers all passengers).
        if (i === 0) {
          doc.text(data.pnrNumber, colX[3] + 4, y, { width: colW[3] - 8, lineBreak: false });
        }
        if (p.waitlist && String(p.waitlist).trim()) {
          doc.text(String(p.waitlist).trim(), colX[4] + 4, y, { width: colW[4] - 8, lineBreak: false });
        }
        y += 16;
      });
    }

    // Bottom border under table
    doc.moveTo(margin, y).lineTo(tableEndX, y).strokeColor(COLORS.gray).stroke();

    // ── Signature block (anchored above the bottom footer) ────────────────
    const signatureY = doc.page.height - 150;
    doc.font('Helvetica').fontSize(11).fillColor(COLORS.black)
      .text("Your's Faithfully,", pageWidth - margin - 220, signatureY, { width: 220, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(13)
      .text('MALLIKARJUNGOUDA PATIL', pageWidth - margin - 260, signatureY + 45, { width: 260, lineBreak: false });

    // ── Bottom footer ─────────────────────────────────────────────────────
    const footerLineY = doc.page.height - 55;
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
  });
}

// Generate Grievance Letter
export function generateGrievanceLetter(data: GrievanceLetter, res: Response): void {
  const documentId = `GRV${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const filename = `Grievance_${data.refNumber}.pdf`;

  streamPdfToResponse(res, filename, 'Grievance', (doc) => {
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

  // Signature
  doc.text('With regards,', margin, y);
  y += 30;
  doc.font('Helvetica-Bold')
     .text(data.senderName, margin, y);
  y += 15;
  doc.font('Helvetica')
     .text(data.senderDesignation, margin, y);
  y += 15;
  doc.text('Office of Hon\'ble Union Minister', margin, y);

  // Footer
  createFooter(doc);

    // Add verification notice at bottom
    doc.fontSize(7)
       .font('Helvetica')
       .fillColor('#888888')
       .text(
         `This document is electronically generated. Verify at: verify.oms.gov.in/${documentId}`,
         margin,
         doc.page.height - 40,
         { width: doc.page.width - margin * 2, align: 'center' }
       );
  });
}

// Generate Tour Program PDF
export function generateTourProgramPDF(
  events: Array<{
    eventName: string;
    organizer: string;
    eventDate: string;
    venue: string;
    decision: string;
  }>,
  dateRange: string,
  res: Response
): void {
  const documentId = `TOUR${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const refNumber = `TOUR-${Date.now().toString(36).toUpperCase()}`;
  const filename = `TourProgram_${Date.now()}.pdf`;

  streamPdfToResponse(res, filename, 'TourProgram', (doc) => {
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

  // Table header
  const colWidths = [40, 150, 120, 80, 100];
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const startX = (doc.page.width - tableWidth) / 2;

  // Header row
  doc.rect(startX, y, tableWidth, 25).fill(COLORS.navy);
  
  doc.fillColor('#FFFFFF')
     .fontSize(10)
     .font('Helvetica-Bold');

  let x = startX + 5;
  const headers = ['S.No', 'Event', 'Venue', 'Time', 'Status'];
  headers.forEach((header, i) => {
    doc.text(header, x, y + 7, { width: colWidths[i] - 10 });
    x += colWidths[i];
  });

  y += 25;

  // Data rows
  doc.font('Helvetica')
     .fontSize(9)
     .fillColor(COLORS.black);

  events.forEach((event, index) => {
    const rowHeight = 35;
    
    // Alternate row colors
    if (index % 2 === 0) {
      doc.rect(startX, y, tableWidth, rowHeight).fill('#f8f9fa');
    }

    doc.fillColor(COLORS.black);
    x = startX + 5;

    const eventTime = new Date(event.eventDate).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const rowData = [
      String(index + 1),
      `${event.eventName}\n(${event.organizer})`,
      event.venue,
      eventTime,
      event.decision,
    ];

    rowData.forEach((data, i) => {
      doc.text(data, x, y + 5, { width: colWidths[i] - 10 });
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

    // Add verification notice at bottom
    doc.fontSize(7)
       .font('Helvetica')
       .fillColor('#888888')
       .text(
         `This document is electronically generated. Verify at: verify.oms.gov.in/${documentId}`,
         margin,
         doc.page.height - 40,
         { width: doc.page.width - margin * 2, align: 'center' }
       );
  });
}

// Generate Temple Visit (darshan / accommodation) letter. Uses the
// Addl. PS letterhead — three-column header identical to the Train EQ form
// (officer details + emblem + contact block), then a narrative body and a
// per-temple recipient block at the bottom.
export function generateTempleVisitLetter(data: TempleVisitLetterData, res: Response): void {
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

    // Body start Y. In letterhead mode we shift down to ~180pt (≈ 2.5") so
    // the pre-printed letterhead occupies the blank zone above. In normal
    // mode we draw the digital letterhead in that zone and start the body
    // right below it.
    let y: number;

    if (letterheadMode) {
      y = 180;
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
    doc.font('Helvetica').fontSize(11).text('Dear Sir,', margin, y, { lineBreak: false });
    y += 22;
    doc.font('Helvetica-Bold').text(`Sub: ${data.subject}`, margin, y, { width: innerWidth, lineBreak: false });
    y += 24;

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
      `I am directed by Hon'ble Minister to request you to kindly arrange ${data.servicesRequestedText} ` +
        `on above said ${data.visitDateLine.startsWith('from') ? 'dates' : 'date'} for them and oblige.`
    );

    bodyParas.forEach((p) => {
      doc.text(p, margin, y, {
        width: innerWidth,
        align: 'justify',
        lineGap: 4,
      });
      y = doc.y + 12;
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
    const bottomReserve = letterheadMode ? 230 : 250;
    const recipientStartY = Math.max(
      bodyEndY + 90,
      doc.page.height - bottomReserve - recipientLineCount * recipientLineHeight
    );

    // Signature block layout (relative to its top):
    //   0   : closing (left)
    //   +20 : "Yours sincerely" (centred)
    //   +50 : signer name (centred, bold)
    // Total block height ≈ 50pt; centre it in the available gap.
    const sigBlockHeight = 50;
    const gapMid = (bodyEndY + recipientStartY) / 2;
    const closingY = Math.max(bodyEndY + 18, gapMid - sigBlockHeight / 2);

    doc.font('Helvetica').fontSize(11).fillColor(COLORS.black);
    doc.text(data.closing, margin, closingY, { lineBreak: false });
    doc.text('Yours sincerely', margin, closingY + 20, {
      width: innerWidth,
      align: 'center',
      lineBreak: false,
    });
    doc.font('Helvetica-Bold').fontSize(11).text(data.signerName, margin, closingY + 50, {
      width: innerWidth,
      align: 'center',
      lineBreak: false,
    });

    // Recipient block (bottom-left, like a footer address). Anchored to the
    // page bottom so it visually balances the header zone above the body.
    doc.font('Helvetica').fontSize(11).fillColor(COLORS.black);
    let recipY = recipientStartY;
    data.recipientLines.forEach((line) => {
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
  });
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

    // Add verification notice at bottom
    doc.fontSize(7)
       .font('Helvetica')
       .fillColor('#888888')
       .text(
         `This document is electronically generated. Verify at: verify.oms.gov.in/${documentId}`,
         margin,
         doc.page.height - 40,
         { width: doc.page.width - margin * 2, align: 'center' }
       );
  });
}
