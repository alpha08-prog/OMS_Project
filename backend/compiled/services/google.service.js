"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuthUrl = getAuthUrl;
exports.exchangeCodeForTokens = exchangeCodeForTokens;
exports.getValidAccessToken = getValidAccessToken;
exports.createTourCalendarEvent = createTourCalendarEvent;
exports.disconnectCalendar = disconnectCalendar;
const googleapis_1 = require("googleapis");
const prisma_1 = __importDefault(require("../lib/prisma"));
const config_1 = __importDefault(require("../config"));
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI || `${config_1.default.backendUrl}/api/google/callback`;
const oauth2Client = new googleapis_1.google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, googleRedirectUri);
const SCOPES = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
];
function getAuthUrl(userId) {
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        state: userId,
        prompt: 'consent', // always get refresh_token
    });
}
async function exchangeCodeForTokens(code, userId) {
    const { tokens } = await oauth2Client.getToken(code);
    await prisma_1.default.user.update({
        where: { id: userId },
        data: {
            googleAccessToken: tokens.access_token ?? null,
            googleRefreshToken: tokens.refresh_token ?? null,
            googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            calendarConnected: true,
        },
    });
}
async function getValidAccessToken(userId) {
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
        select: {
            googleAccessToken: true,
            googleRefreshToken: true,
            googleTokenExpiry: true,
            calendarConnected: true,
        },
    });
    if (!user || !user.calendarConnected || !user.googleAccessToken)
        return null;
    // Refresh if token expires within 5 minutes
    const now = Date.now();
    const expiresAt = user.googleTokenExpiry?.getTime() ?? 0;
    const needsRefresh = expiresAt < now + 5 * 60 * 1000;
    if (needsRefresh && user.googleRefreshToken) {
        oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
        const { credentials } = await oauth2Client.refreshAccessToken();
        await prisma_1.default.user.update({
            where: { id: userId },
            data: {
                googleAccessToken: credentials.access_token ?? null,
                googleTokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
            },
        });
        return credentials.access_token ?? null;
    }
    return user.googleAccessToken;
}
async function createTourCalendarEvent(userId, tour) {
    const accessToken = await getValidAccessToken(userId);
    if (!accessToken)
        return null;
    const auth = new googleapis_1.google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, googleRedirectUri);
    auth.setCredentials({ access_token: accessToken });
    const calendar = googleapis_1.google.calendar({ version: 'v3', auth });
    const startTime = new Date(tour.dateTime);
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // 2-hour block
    const descriptionLines = [
        `Organizer: ${tour.organizer}`,
        `Venue: ${tour.venue}`,
        tour.description ? `Details: ${tour.description}` : '',
        `OMS Tour ID: ${tour.id}`,
    ].filter(Boolean);
    const event = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
            summary: `[OMS] ${tour.eventName}`,
            location: tour.venueLink || tour.venue,
            description: descriptionLines.join('\n'),
            start: { dateTime: startTime.toISOString() },
            end: { dateTime: endTime.toISOString() },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 24 * 60 },
                    { method: 'popup', minutes: 60 },
                ],
            },
        },
    });
    return event.data.id ?? null;
}
async function disconnectCalendar(userId) {
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
        select: { googleAccessToken: true },
    });
    if (user?.googleAccessToken) {
        try {
            await oauth2Client.revokeToken(user.googleAccessToken);
        }
        catch {
            // ignore — token may already be expired
        }
    }
    await prisma_1.default.user.update({
        where: { id: userId },
        data: {
            googleAccessToken: null,
            googleRefreshToken: null,
            googleTokenExpiry: null,
            calendarConnected: false,
        },
    });
}
//# sourceMappingURL=google.service.js.map