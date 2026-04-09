import { Response } from 'express';
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
    additionalPassengers?: string[];
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
export declare function generateTrainEQLetter(data: TrainEQLetter, res: Response): void;
export declare function generateGrievanceLetter(data: GrievanceLetter, res: Response): void;
export declare function generateTourProgramPDF(events: Array<{
    eventName: string;
    organizer: string;
    eventDate: string;
    venue: string;
    decision: string;
}>, dateRange: string, res: Response): void;
export declare function generateGenericLetter(config: LetterConfig, res: Response): void;
export {};
//# sourceMappingURL=pdfGenerator.d.ts.map