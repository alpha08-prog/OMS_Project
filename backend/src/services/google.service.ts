import { google } from 'googleapis';
import prisma from '../lib/prisma';
import config from '../config';

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

  await prisma.user.update({
    where: { id: userId },
    data: {
      googleAccessToken: tokens.access_token ?? null,
      googleRefreshToken: tokens.refresh_token ?? null,
      googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      calendarConnected: true,
    },
  });
}

export async function getValidAccessToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      googleAccessToken: true,
      googleRefreshToken: true,
      googleTokenExpiry: true,
      calendarConnected: true,
    },
  });

  if (!user || !user.calendarConnected || !user.googleAccessToken) return null;

  // Refresh if token expires within 5 minutes
  const now = Date.now();
  const expiresAt = user.googleTokenExpiry?.getTime() ?? 0;
  const needsRefresh = expiresAt < now + 5 * 60 * 1000;

  if (needsRefresh && user.googleRefreshToken) {
    oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();

    await prisma.user.update({
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

export async function disconnectCalendar(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleAccessToken: true },
  });

  if (user?.googleAccessToken) {
    try {
      await oauth2Client.revokeToken(user.googleAccessToken);
    } catch {
      // ignore — token may already be expired
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiry: null,
      calendarConnected: false,
    },
  });
}
