import { google } from 'googleapis';
import { getRow, updateRow, toCatalystDate } from '../lib/catalyst-client';
import { getCachedTableList, invalidateTableList } from '../lib/catalyst-user-lookup';
import config from '../config';

const APPUSER_TABLE = 'AppUser';

const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI || `${config.backendUrl}/api/google/callback`;

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  googleRedirectUri
);

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

/**
 * Resolve a user id (numeric ROWID or legacy UUID) to the underlying Catalyst
 * AppUser ROWID. All Google-token reads/writes need the actual ROWID since
 * Catalyst's row update endpoint only takes ROWID.
 */
async function resolveAppUserRowId(userId: string): Promise<string | null> {
  if (/^\d+$/.test(userId)) {
    const row = await getRow(APPUSER_TABLE, userId);
    return row ? String(row.ROWID) : null;
  }
  // UUID — look up by legacyId in cached AppUser
  try {
    const all = await getCachedTableList(APPUSER_TABLE);
    const row = all.find((u) => u.legacyId && String(u.legacyId) === userId);
    return row ? String(row.ROWID) : null;
  } catch {
    return null;
  }
}

interface AppUserRow {
  ROWID: string;
  googleAccessToken?: string | null;
  googleRefreshToken?: string | null;
  googleTokenExpiry?: string | null;
  calendarConnected?: boolean | string | null;
}

async function readAppUser(userId: string): Promise<AppUserRow | null> {
  const rowId = await resolveAppUserRowId(userId);
  if (!rowId) return null;
  const row = await getRow(APPUSER_TABLE, rowId);
  return (row as AppUserRow | null) ?? null;
}

function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return Boolean(v);
}

export function getAuthUrl(userId: string): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: userId,
    prompt: 'consent', // always get refresh_token
  });
}

export async function exchangeCodeForTokens(code: string, userId: string): Promise<void> {
  const { tokens } = await oauth2Client.getToken(code);
  const rowId = await resolveAppUserRowId(userId);
  if (!rowId) throw new Error(`User not found in AppUser: ${userId}`);

  await updateRow(APPUSER_TABLE, {
    ROWID: rowId,
    googleAccessToken: tokens.access_token ?? null,
    googleRefreshToken: tokens.refresh_token ?? null,
    googleTokenExpiry: tokens.expiry_date ? toCatalystDate(new Date(tokens.expiry_date)) : null,
    calendarConnected: true,
  });
  invalidateTableList(APPUSER_TABLE);
}

export async function getValidAccessToken(userId: string): Promise<string | null> {
  const user = await readAppUser(userId);
  if (!user || !parseBool(user.calendarConnected) || !user.googleAccessToken) return null;

  // Refresh if token expires within 5 minutes
  const now = Date.now();
  const expiresAt = user.googleTokenExpiry ? new Date(user.googleTokenExpiry).getTime() : 0;
  const needsRefresh = expiresAt < now + 5 * 60 * 1000;

  if (needsRefresh && user.googleRefreshToken) {
    oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();

    await updateRow(APPUSER_TABLE, {
      ROWID: user.ROWID,
      googleAccessToken: credentials.access_token ?? null,
      googleTokenExpiry: credentials.expiry_date ? toCatalystDate(new Date(credentials.expiry_date)) : null,
    });
    invalidateTableList(APPUSER_TABLE);

    return credentials.access_token ?? null;
  }

  return user.googleAccessToken;
}

export async function createTourCalendarEvent(
  userId: string,
  tour: {
    id: string;
    eventName: string;
    organizer: string;
    venue: string;
    dateTime: Date;
    description?: string | null;
    venueLink?: string | null;
  }
): Promise<string | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri
  );
  auth.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: 'v3', auth });

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
export async function createCustomGoogleEvent(
  userId: string,
  event: {
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
    description?: string | null;
  }
): Promise<string | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri
  );
  auth.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: 'v3', auth });

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

/**
 * Push a Meeting to the user's primary Google Calendar.
 *
 * `dateTime` is the IST wall-clock string ("YYYY-MM-DD HH:mm:ss") as stored in
 * Catalyst. We attach an explicit Asia/Kolkata timeZone so Google places the
 * event at the correct hour instead of misreading the wall-clock as UTC
 * (which would drift it +5.5h). Returns the new Google event id, or null if
 * the user isn't connected.
 */
export async function createMeetingGoogleEvent(
  userId: string,
  meeting: {
    id: string;
    title: string;
    dateTime: string;
    location?: string | null;
    attendees?: string | null;
    agenda?: string | null;
  }
): Promise<string | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri
  );
  auth.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: 'v3', auth });

  // Parse the IST wall-clock as a UTC instant purely so we can add the 1-hour
  // block and reformat. The timeZone field below tells Google these strings are
  // Asia/Kolkata wall-times, so there's no ±5.5h drift.
  const base = new Date(`${meeting.dateTime.replace(' ', 'T')}Z`);
  const endBase = new Date(base.getTime() + 60 * 60 * 1000);
  const wall = (d: Date) => d.toISOString().slice(0, 19); // YYYY-MM-DDTHH:mm:ss

  const description = [
    meeting.agenda ? `Agenda: ${meeting.agenda}` : '',
    meeting.attendees ? `Attendees: ${meeting.attendees}` : '',
    `OMS Meeting ID: ${meeting.id}`,
  ]
    .filter(Boolean)
    .join('\n');

  const result = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: `[OMS] ${meeting.title}`,
      location: meeting.location || undefined,
      description,
      start: { dateTime: wall(base), timeZone: 'Asia/Kolkata' },
      end: { dateTime: wall(endBase), timeZone: 'Asia/Kolkata' },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    },
  });

  return result.data.id ?? null;
}

export async function disconnectCalendar(userId: string): Promise<void> {
  const user = await readAppUser(userId);
  if (!user) return;

  if (user.googleAccessToken) {
    try {
      await oauth2Client.revokeToken(user.googleAccessToken);
    } catch {
      // ignore — token may already be expired
    }
  }

  await updateRow(APPUSER_TABLE, {
    ROWID: user.ROWID,
    googleAccessToken: null,
    googleRefreshToken: null,
    googleTokenExpiry: null,
    calendarConnected: false,
  });
  invalidateTableList(APPUSER_TABLE);
}

/** Returns true when the user has an active Google Calendar connection. */
export async function isCalendarConnected(userId: string): Promise<boolean> {
  const user = await readAppUser(userId);
  return Boolean(user && parseBool(user.calendarConnected) && user.googleAccessToken);
}
