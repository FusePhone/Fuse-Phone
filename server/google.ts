import { google } from 'googleapis';
import { db } from './db';
import { companySettings } from '@shared/schema';
import { eq } from 'drizzle-orm';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getRedirectUri() {
  // In production, use the deployment URL
  if (process.env.REPLIT_DEPLOYMENT === '1' && process.env.REPLIT_DOMAINS) {
    // REPLIT_DOMAINS contains comma-separated list of domains
    const domains = process.env.REPLIT_DOMAINS.split(',');
    // Prefer custom domain if available, otherwise use first domain
    const domain = domains.find(d => !d.includes('.replit.')) || domains[0];
    console.log('[Google OAuth] Production mode, using domain:', domain);
    return `https://${domain}/api/google/oauth/callback`;
  }
  
  // In development, use dev domain
  if (process.env.REPLIT_DEV_DOMAIN) {
    console.log('[Google OAuth] Dev mode, using domain:', process.env.REPLIT_DEV_DOMAIN);
    return `https://${process.env.REPLIT_DEV_DOMAIN}/api/google/oauth/callback`;
  }
  
  // Fallback for local development
  console.log('[Google OAuth] Local mode, using localhost');
  return 'http://localhost:5000/api/google/oauth/callback';
}

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getRedirectUri();

  console.log('[Google OAuth] Redirect URI:', redirectUri);

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getGoogleAuthUrl(userId: string, mobile?: boolean): string {
  const oauth2Client = getOAuth2Client();
  
  const statePayload = mobile ? `${userId}|mobile` : userId;
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: statePayload,
  });

  return authUrl;
}

export async function handleGoogleCallback(code: string, userId: string): Promise<{ email: string }> {
  const oauth2Client = getOAuth2Client();
  
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const email = userInfo.data.email || '';

  await db.update(companySettings)
    .set({
      googleAccessToken: tokens.access_token,
      googleRefreshToken: tokens.refresh_token,
      googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      googleEmail: email,
      googleCalendarId: 'primary',
      googleConnectedAt: new Date(),
    })
    .where(eq(companySettings.userId, userId));

  return { email };
}

export async function disconnectGoogle(userId: string): Promise<void> {
  await db.update(companySettings)
    .set({
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiry: null,
      googleEmail: null,
      googleCalendarId: null,
      googleConnectedAt: null,
    })
    .where(eq(companySettings.userId, userId));
}

async function getAuthenticatedClient(userId: string) {
  const [settings] = await db.select()
    .from(companySettings)
    .where(eq(companySettings.userId, userId));

  if (!settings?.googleAccessToken || !settings?.googleRefreshToken) {
    throw new Error('Google account not connected');
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: settings.googleAccessToken,
    refresh_token: settings.googleRefreshToken,
    expiry_date: settings.googleTokenExpiry?.getTime(),
  });

  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await db.update(companySettings)
        .set({
          googleAccessToken: tokens.access_token,
          googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        })
        .where(eq(companySettings.userId, userId));
    }
  });

  return oauth2Client;
}

export async function sendEmail(
  userId: string,
  to: string,
  subject: string,
  body: string,
  fromName?: string
): Promise<{ success: boolean; messageId?: string }> {
  const oauth2Client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const [settings] = await db.select()
    .from(companySettings)
    .where(eq(companySettings.userId, userId));

  const from = fromName 
    ? `${fromName} <${settings?.googleEmail}>` 
    : settings?.googleEmail || '';

  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    body,
  ];
  const message = messageParts.join('\n');

  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
    },
  });

  return { success: true, messageId: result.data.id || undefined };
}

export async function createCalendarEvent(
  userId: string,
  summary: string,
  description: string,
  startDateTime: string,
  endDateTime: string,
  location?: string,
  timezone?: string
): Promise<{ eventId: string; htmlLink: string }> {
  const oauth2Client = await getAuthenticatedClient(userId);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const [settings] = await db.select()
    .from(companySettings)
    .where(eq(companySettings.userId, userId));

  const calendarId = settings?.googleCalendarId || 'primary';
  const tz = timezone || settings?.timezone || 'America/New_York';

  const event = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary,
      description,
      location,
      start: {
        dateTime: startDateTime,
        timeZone: tz,
      },
      end: {
        dateTime: endDateTime,
        timeZone: tz,
      },
    },
  });

  return {
    eventId: event.data.id || '',
    htmlLink: event.data.htmlLink || '',
  };
}

export async function updateCalendarEvent(
  userId: string,
  eventId: string,
  summary: string,
  description: string,
  startDateTime: string,
  endDateTime: string,
  location?: string,
  timezone?: string
): Promise<void> {
  const oauth2Client = await getAuthenticatedClient(userId);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const [settings] = await db.select()
    .from(companySettings)
    .where(eq(companySettings.userId, userId));

  const calendarId = settings?.googleCalendarId || 'primary';
  const tz = timezone || settings?.timezone || 'America/New_York';

  await calendar.events.update({
    calendarId,
    eventId,
    requestBody: {
      summary,
      description,
      location,
      start: {
        dateTime: startDateTime,
        timeZone: tz,
      },
      end: {
        dateTime: endDateTime,
        timeZone: tz,
      },
    },
  });
}

export async function deleteCalendarEvent(userId: string, eventId: string): Promise<void> {
  const oauth2Client = await getAuthenticatedClient(userId);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const [settings] = await db.select()
    .from(companySettings)
    .where(eq(companySettings.userId, userId));

  const calendarId = settings?.googleCalendarId || 'primary';

  await calendar.events.delete({
    calendarId,
    eventId,
  });
}
