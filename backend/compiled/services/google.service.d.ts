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
/**
 * Push a CustomCalendarEvent to the user's primary Google Calendar.
 * Returns the new Google event id, or null if the user isn't connected.
 */
export declare function createCustomGoogleEvent(userId: string, event: {
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
    description?: string | null;
}): Promise<string | null>;
export declare function disconnectCalendar(userId: string): Promise<void>;
/** Returns true when the user has an active Google Calendar connection. */
export declare function isCalendarConnected(userId: string): Promise<boolean>;
//# sourceMappingURL=google.service.d.ts.map