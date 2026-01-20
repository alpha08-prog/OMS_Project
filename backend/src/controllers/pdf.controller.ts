import { Response } from 'express';
import prisma from '../lib/prisma';
import { sendError, sendNotFound, sendServerError } from '../utils/response';
import {
  generateTrainEQLetter,
  generateGrievanceLetter,
  generateTourProgramPDF,
} from '../utils/pdfGenerator';
import type { AuthenticatedRequest } from '../types';

/**
 * Generate Train EQ Letter PDF
 * GET /api/pdf/train-eq/:id
 */
export async function generateTrainEQPDF(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    const trainRequest = await prisma.trainRequest.findUnique({
      where: { id },
      include: {
        createdBy: true,
      },
    });

    if (!trainRequest) {
      sendNotFound(res, 'Train request not found');
      return;
    }

    // Generate reference number
    const refNumber = `EQ/${new Date().getFullYear()}/${trainRequest.id.slice(0, 8).toUpperCase()}`;

    generateTrainEQLetter(
      {
        refNumber,
        date: new Date().toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }),
        passengerName: trainRequest.passengerName,
        pnrNumber: trainRequest.pnrNumber,
        trainNumber: trainRequest.trainNumber || 'N/A',
        trainName: trainRequest.trainName || 'N/A',
        journeyDate: trainRequest.dateOfJourney.toLocaleDateString('en-IN'),
        journeyClass: trainRequest.journeyClass,
        fromStation: trainRequest.fromStation,
        toStation: trainRequest.toStation,
        senderName: 'Shri Prahlad Joshi',
        senderDesignation: 'Hon\'ble Union Minister',
      },
      res
    );
  } catch (error) {
    sendServerError(res, 'Failed to generate Train EQ PDF', error);
  }
}

/**
 * Generate Grievance Letter PDF
 * GET /api/pdf/grievance/:id
 */
export async function generateGrievancePDF(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    const grievance = await prisma.grievance.findUnique({
      where: { id },
      include: {
        createdBy: true,
      },
    });

    if (!grievance) {
      sendNotFound(res, 'Grievance not found');
      return;
    }

    // Determine department based on grievance type
    const departmentMap: Record<string, { official: string; designation: string; department: string }> = {
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

    const dept = departmentMap[grievance.grievanceType] || departmentMap.OTHER;

    // Generate reference number
    const refNumber = `GRV/${new Date().getFullYear()}/${grievance.id.slice(0, 8).toUpperCase()}`;

    // Map action required to readable text
    const actionMap: Record<string, string> = {
      GENERATE_LETTER: 'Please generate official letter and forward to concerned department',
      CALL_OFFICIAL: 'Please call the concerned official and follow up',
      FORWARD_TO_DEPT: 'Forward this grievance to the relevant department for action',
      SCHEDULE_MEETING: 'Schedule a meeting with the petitioner',
      NO_ACTION: 'For information only, no immediate action required',
    };

    generateGrievanceLetter(
      {
        refNumber,
        date: new Date().toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }),
        petitionerName: grievance.petitionerName,
        mobileNumber: grievance.mobileNumber,
        constituency: grievance.constituency,
        grievanceType: grievance.grievanceType.replace(/_/g, ' '),
        description: grievance.description,
        actionRequired: actionMap[grievance.actionRequired] || grievance.actionRequired,
        toOfficial: dept.official,
        toDesignation: dept.designation,
        toDepartment: dept.department,
        senderName: 'Shri Prahlad Joshi',
        senderDesignation: 'Hon\'ble Union Minister',
      },
      res
    );
  } catch (error) {
    sendServerError(res, 'Failed to generate Grievance PDF', error);
  }
}

/**
 * Generate Tour Program PDF
 * GET /api/pdf/tour-program
 */
export async function generateTourProgramPDFController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { startDate, endDate } = req.query;

    // Build date filter
    const where: any = {
      decision: 'ACCEPTED', // Only accepted events
    };

    if (startDate || endDate) {
      where.dateTime = {};
      if (startDate) where.dateTime.gte = new Date(startDate as string);
      if (endDate) where.dateTime.lte = new Date(endDate as string);
    } else {
      // Default to next 7 days
      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      where.dateTime = {
        gte: today,
        lte: nextWeek,
      };
    }

    const events = await prisma.tourProgram.findMany({
      where,
      orderBy: { dateTime: 'asc' },
    });

    if (events.length === 0) {
      sendError(res, 'No accepted events found for the specified period', 404);
      return;
    }

    // Format date range for title
    const start = startDate
      ? new Date(startDate as string).toLocaleDateString('en-IN')
      : new Date().toLocaleDateString('en-IN');
    const end = endDate
      ? new Date(endDate as string).toLocaleDateString('en-IN')
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN');

    generateTourProgramPDF(
      events.map((e) => ({
        eventName: e.eventName,
        organizer: e.organizer,
        eventDate: e.dateTime.toISOString(),
        venue: e.venue,
        decision: e.decision,
      })),
      `${start} - ${end}`,
      res
    );
  } catch (error) {
    sendServerError(res, 'Failed to generate Tour Program PDF', error);
  }
}

/**
 * Preview Train EQ Letter (returns HTML instead of PDF for quick preview)
 * GET /api/pdf/train-eq/:id/preview
 */
export async function previewTrainEQ(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    const trainRequest = await prisma.trainRequest.findUnique({
      where: { id },
      include: {
        createdBy: true,
      },
    });

    if (!trainRequest) {
      sendNotFound(res, 'Train request not found');
      return;
    }

    const refNumber = `EQ/${new Date().getFullYear()}/${trainRequest.id.slice(0, 8).toUpperCase()}`;
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
    ${trainRequest.fromStation} Railway Station<br>
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
      <li>Name: ${trainRequest.passengerName}</li>
      <li>PNR Number: ${trainRequest.pnrNumber}</li>
      <li>Train: ${trainRequest.trainNumber || 'N/A'} - ${trainRequest.trainName || 'N/A'}</li>
      <li>Date of Journey: ${trainRequest.dateOfJourney.toLocaleDateString('en-IN')}</li>
      <li>Class: ${trainRequest.journeyClass}</li>
      <li>Route: ${trainRequest.fromStation} to ${trainRequest.toStation}</li>
    </ul>
    
    <p>This is a matter of urgent importance and I would greatly appreciate your assistance in accommodating this request under the Emergency Quota (EQ) facility.</p>
    
    <p>Kindly extend your cooperation in this regard.</p>
  </div>
  
  <div class="signature">
    <p>With regards,</p>
    <p><strong>Shri Prahlad Joshi</strong><br>
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

/**
 * Preview Grievance Letter (returns HTML)
 * GET /api/pdf/grievance/:id/preview
 */
export async function previewGrievance(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    const grievance = await prisma.grievance.findUnique({
      where: { id },
      include: {
        createdBy: true,
      },
    });

    if (!grievance) {
      sendNotFound(res, 'Grievance not found');
      return;
    }

    // Determine department based on grievance type
    const departmentMap: Record<string, { official: string; designation: string; department: string }> = {
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

    const dept = departmentMap[grievance.grievanceType] || departmentMap.OTHER;
    const refNumber = `GRV/${new Date().getFullYear()}/${grievance.id.slice(0, 8).toUpperCase()}`;
    const date = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    // Map action required to readable text
    const actionMap: Record<string, string> = {
      GENERATE_LETTER: 'Please generate official letter and forward to concerned department',
      CALL_OFFICIAL: 'Please call the concerned official and follow up',
      FORWARD_TO_DEPT: 'Forward this grievance to the relevant department for action',
      SCHEDULE_MEETING: 'Schedule a meeting with the petitioner',
      NO_ACTION: 'For information only, no immediate action required',
    };

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
    Subject: ${grievance.grievanceType.replace(/_/g, ' ')} - Request for Action
  </div>
  
  <div class="body">
    <p>Sir/Madam,</p>
    <p>I am writing to bring to your attention a grievance received at our office that requires your immediate attention and action.</p>
    
    <p><strong>Petitioner Details:</strong></p>
    <ul>
      <li>Name: ${grievance.petitionerName}</li>
      <li>Mobile: ${grievance.mobileNumber}</li>
      <li>Constituency: ${grievance.constituency}</li>
    </ul>
    
    <p><strong>Grievance Details:</strong></p>
    <ul>
      <li>Type: ${grievance.grievanceType.replace(/_/g, ' ')}</li>
      <li>Description: ${grievance.description}</li>
    </ul>
    
    <p><strong>Action Required:</strong> ${actionMap[grievance.actionRequired] || grievance.actionRequired}</p>
    
    <p>I request you to look into this matter personally and take necessary action at the earliest. Kindly update this office on the progress of the same.</p>
  </div>
  
  <div class="signature">
    <p>With regards,</p>
    <p><strong>Shri Prahlad Joshi</strong><br>
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
