export declare function getAuthUrl(userId: string): string;
export declare function exchangeCodeForTokens(code: string, userId: string): Promise<void>;
export declare function getValidAccessToken(userId: string): Promise<string | null>;
export declare function createTourCalendarEvent(userId: string, tour: {
    id: string;
    eventName: string;
    organizer: string;
    venue: string;
    dateTime: Date;
    description?: string | null;
    venueLink?: string | null;
}): Promise<string | null>;
export declare function disconnectCalendar(userId: string): Promise<void>;
//# sourceMappingURL=google.service.d.ts.map