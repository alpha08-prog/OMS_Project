import PDFDocument from 'pdfkit';
import { Response } from 'express';

// Government letterhead colors
const COLORS = {
  saffron: '#FF9933',
  navy: '#000080',
  green: '#138808',
  black: '#000000',
  gray: '#666666',
};

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
  // Unique document ID for watermark
  documentId?: string;
}

interface GrievanceLetter {
  refNumber: string;
  date: string;
  petitionerName: string;
  mobileNumber: string;
  constituency: string;
  grievanceType: string;
  description: string;
  actionRequired: string;
  toOfficial: string;
  toDesignation: string;
  toDepartment: string;
  senderName: string;
  senderDesignation: string;
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

// Generate Train EQ Letter with watermark and multiple passengers support
export function generateTrainEQLetter(data: TrainEQLetter, res: Response): void {
  try {
    const doc = new PDFDocument({ margin: 50 });
    
    // Generate unique document ID if not provided
    const documentId = data.documentId || `EQ${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=TrainEQ_${data.pnrNumber}_${documentId.slice(0, 8)}.pdf`);

    // Handle errors - must be set BEFORE piping
    doc.on('error', (error) => {
      console.error('PDF generation error (TrainEQ):', error);
      // Once piped, we can't send JSON, so just log the error
      // The response will be incomplete/corrupted, which the client will detect
    });

    // Pipe to response - this starts the stream and sends headers
    doc.pipe(res);

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
     .text('The Station Master / TTI', margin, y);
  y += 15;
  doc.text(`${data.fromStation} Railway Station`, margin, y);
  y += 15;
  doc.text('Indian Railways', margin, y);

  y += 30;

  // Subject
  doc.font('Helvetica-Bold')
     .text('Subject: Request for Emergency Quota Accommodation', margin, y);

  y += 25;

  // Body
  doc.font('Helvetica')
     .fontSize(11)
     .text('Sir/Madam,', margin, y);

  y += 20;

  // Build passenger list
  let passengerList = `• Name: ${data.passengerName}`;
  
  // Add additional passengers if provided
  if (data.additionalPassengers && data.additionalPassengers.length > 0) {
    data.additionalPassengers.forEach((passenger, index) => {
      passengerList += `\n• Passenger ${index + 2}: ${passenger}`;
    });
  }
  
  // Parse comma-separated names as well
  const passengerNames = data.passengerName.split(',').map(n => n.trim()).filter(n => n);
  if (passengerNames.length > 1) {
    passengerList = passengerNames.map((name, index) => 
      `• Passenger ${index + 1}: ${name}`
    ).join('\n');
  }

  const bodyText = `I am writing to request your kind consideration for emergency quota accommodation for the following passenger(s) traveling under my recommendation.

Passenger Details:
${passengerList}

Booking Information:
• PNR Number: ${data.pnrNumber}
• Train: ${data.trainNumber} - ${data.trainName}
• Date of Journey: ${data.journeyDate}
• Class: ${data.journeyClass}
• Route: ${data.fromStation} to ${data.toStation}

This is a matter of urgent importance and I would greatly appreciate your assistance in accommodating this request under the Emergency Quota (EQ) facility.

Kindly extend your cooperation in this regard.`;

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

    // Finalize
    doc.end();
  } catch (error) {
    console.error('Error generating TrainEQ PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate PDF', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
}

// Generate Grievance Letter
export function generateGrievanceLetter(data: GrievanceLetter, res: Response): void {
  try {
    const doc = new PDFDocument({ margin: 50 });

    // Generate unique document ID for watermark
    const documentId = `GRV${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Grievance_${data.refNumber}.pdf`);

    // Handle errors - must be set BEFORE piping
    doc.on('error', (error) => {
      console.error('PDF generation error (Grievance):', error);
      // Once piped, we can't send JSON, so just log the error
      // The response will be incomplete/corrupted, which the client will detect
    });

    // Pipe to response - this starts the stream and sends headers
    doc.pipe(res);

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

  const bodyText = `I am writing to bring to your attention a grievance received at our office that requires your immediate attention and action.

Petitioner Details:
• Name: ${data.petitionerName}
• Mobile: ${data.mobileNumber}
• Constituency: ${data.constituency}

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

    // Finalize
    doc.end();
  } catch (error) {
    console.error('Error generating Grievance PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate PDF', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
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
  try {
    const doc = new PDFDocument({ margin: 50 });

    // Generate unique document ID for watermark
    const documentId = `TOUR${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const refNumber = `TOUR-${Date.now().toString(36).toUpperCase()}`;

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=TourProgram_${Date.now()}.pdf`);

    // Handle errors - must be set BEFORE piping
    doc.on('error', (error) => {
      console.error('PDF generation error (TourProgram):', error);
      // Once piped, we can't send JSON, so just log the error
      // The response will be incomplete/corrupted, which the client will detect
    });

    // Pipe to response
    doc.pipe(res);

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

    // Finalize
    doc.end();
  } catch (error) {
    console.error('Error generating TourProgram PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate PDF', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
}

// Generate generic letter
export function generateGenericLetter(config: LetterConfig, res: Response): void {
  try {
    const doc = new PDFDocument({ margin: 50 });

    // Generate unique document ID for watermark
    const documentId = `LTR${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Letter_${config.refNumber}.pdf`);

    // Handle errors - must be set BEFORE piping
    doc.on('error', (error) => {
      console.error('PDF generation error (GenericLetter):', error);
      // Once piped, we can't send JSON, so just log the error
      // The response will be incomplete/corrupted, which the client will detect
    });

    // Pipe to response
    doc.pipe(res);

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

    // Finalize
    doc.end();
  } catch (error) {
    console.error('Error generating GenericLetter PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate PDF', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
}
