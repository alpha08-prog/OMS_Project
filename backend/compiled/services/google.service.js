"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuthUrl = getAuthUrl;
exports.exchangeCodeForTokens = exchangeCodeForTokens;
exports.getValidAccessToken = getValidAccessToken;
exports.createTourCalendarEvent = createTourCalendarEvent;
exports.createCustomGoogleEvent = createCustomGoogleEvent;
exports.disconnectCalendar = disconnectCalendar;
exports.isCalendarConnected = isCalendarConnected;
const googleapis_1 = require("googleapis");
const catalyst_client_1 = require("../lib/catalyst-client");
const catalyst_user_lookup_1 = require("../lib/catalyst-user-lookup");
const config_1 = __importDefault(require("../config"));
const APPUSER_TABLE = 'AppUser';
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI || `${config_1.default.backendUrl}/api/google/callback`;
const oauth2Client = new googleapis_1.google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, googleRedirectUri);
const SCOPES = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
];
/**
 * Resolve a user id (numeric ROWID or legacy UUID) to the underlying Catalyst
 * AppUser ROWID. All Google-token reads/writes need the actual ROWID since
 * Catalyst's row update endpoint only takes ROWID.
 */
async function resolveAppUserRowId(userId) {
    if (/^\d+$/.test(userId)) {
        const row = await (0, catalyst_client_1.getRow)(APPUSER_TABLE, userId);
        return row ? String(row.ROWID) : null;
    }
    // UUID — look up by legacyId in cached AppUser
    try {
        const all = await (0, catalyst_user_lookup_1.getCachedTableList)(APPUSER_TABLE);
        const row = all.find((u) => u.legacyId && String(u.legacyId) === userId);
        return row ? String(row.ROWID) : null;
    }
    catch {
        return null;
    }
}
async function readAppUser(userId) {
    const rowId = await resolveAppUserRowId(userId);
    if (!rowId)
        return null;
    const row = await (0, catalyst_client_1.getRow)(APPUSER_TABLE, rowId);
    return row ?? null;
}
function parseBool(v) {
    if (typeof v === 'boolean')
        return v;
    if (typeof v === 'string')
        return v.toLowerCase() === 'true';
    return Boolean(v);
}
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
    const rowId = await resolveAppUserRowId(userId);
    if (!rowId)
        throw new Error(`User not found in AppUser: ${userId}`);
    await (0, catalyst_client_1.updateRow)(APPUSER_TABLE, {
        ROWID: rowId,
        googleAccessToken: tokens.access_token ?? null,
        googleRefreshToken: tokens.refresh_token ?? null,
        googleTokenExpiry: tokens.expiry_date ? (0, catalyst_client_1.toCatalystDate)(new Date(tokens.expiry_date)) : null,
        calendarConnected: true,
    });
    (0, catalyst_user_lookup_1.invalidateTableList)(APPUSER_TABLE);
}
async function getValidAccessToken(userId) {
    const user = await readAppUser(userId);
    if (!user || !parseBool(user.calendarConnected) || !user.googleAccessToken)
        return null;
    // Refresh if token expires within 5 minutes
    const now = Date.now();
    const expiresAt = user.googleTokenExpiry ? new Date(user.googleTokenExpiry).getTime() : 0;
    const needsRefresh = expiresAt < now + 5 * 60 * 1000;
    if (needsRefresh && user.googleRefreshToken) {
        oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
        const { credentials } = await oauth2Client.refreshAccessToken();
        await (0, catalyst_client_1.updateRow)(APPUSER_TABLE, {
            ROWID: user.ROWID,
            googleAccessToken: credentials.access_token ?? null,
            googleTokenExpiry: credentials.expiry_date ? (0, catalyst_client_1.toCatalystDate)(new Date(credentials.expiry_date)) : null,
        });
        (0, catalyst_user_lookup_1.invalidateTableList)(APPUSER_TABLE);
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
/**
 * Push a CustomCalendarEvent to the user's primary Google Calendar.
 * Returns the new Google event id, or null if the user isn't connected.
 */
async function createCustomGoogleEvent(userId, event) {
    const accessToken = await getValidAccessToken(userId);
    if (!accessToken)
        return null;
    const auth = new googleapis_1.google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, googleRedirectUri);
    auth.setCredentials({ access_token: accessToken });
    const calendar = googleapis_1.google.calendar({ version: 'v3', auth });
    const description = [
        event.description || '',
        `OMS Custom Event ID: ${event.id}`,
    ]
        .filter(Boolean)
        .join('\n');
    const result = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
            summary: `[OMS] ${event.title}`,
            description,
            start: { dateTime: event.startTime.toISOString() },
            end: { dateTime: event.endTime.toISOString() },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 24 * 60 },
                    { method: 'popup', minutes: 60 },
                ],
            },
        },
    });
    return result.data.id ?? null;
}
async function disconnectCalendar(userId) {
    const user = await readAppUser(userId);
    if (!user)
        return;
    if (user.googleAccessToken) {
        try {
            await oauth2Client.revokeToken(user.googleAccessToken);
        }
        catch {
            // ignore — token may already be expired
        }
    }
    await (0, catalyst_client_1.updateRow)(APPUSER_TABLE, {
        ROWID: user.ROWID,
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiry: null,
        calendarConnected: false,
    });
    (0, catalyst_user_lookup_1.invalidateTableList)(APPUSER_TABLE);
}
/** Returns true when the user has an active Google Calendar connection. */
async function isCalendarConnected(userId) {
    const user = await readAppUser(userId);
    return Boolean(user && parseBool(user.calendarConnected) && user.googleAccessToken);
}
//# sourceMappingURL=google.service.js.map