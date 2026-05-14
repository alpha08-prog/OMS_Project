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
    additionalPassengers?: string[];
    passengerDetails?: TrainEQPassenger[];
    numberOfPassengers?: number;
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
export interface TempleVisitLetterData {
    refNumber: string;
    date: string;
    subject: string;
    petitionerName: string;
    memberCount: number;
    originLine: string;
    deityLine: string;
    visitDateLine: string;
    mobileLine?: string;
    servicesRequestedText: string;
    closing: string;
    signerName: string;
    recipientLines: string[];
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
export declare function generateTrainEQLetter(data: TrainEQLetter, res: Response): void;
export declare function generateGrievanceLetter(data: GrievanceLetter, res: Response): void;
export declare function generateTourProgramPDF(events: Array<{
    eventName: string;
    organizer: string;
    eventDate: string;
    venue: string;
    decision: string;
}>, dateRange: string, res: Response): void;
export declare function generateTempleVisitLetter(data: TempleVisitLetterData, res: Response): void;
export declare function generateGenericLetter(config: LetterConfig, res: Response): void;
export {};
//# sourceMappingURL=pdfGenerator.d.ts.map