import { google } from 'googleapis';

const SYSTEM_EMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getSystemRedirectUri() {
  let redirectUri: string;
  
  if (process.env.REPLIT_DEPLOYMENT === '1' && process.env.REPLIT_DOMAINS) {
    const domains = process.env.REPLIT_DOMAINS.split(',');
    const domain = domains.find(d => !d.includes('.replit.')) || domains[0];
    redirectUri = `https://${domain}/api/admin/system-email/callback`;
  } else if (process.env.REPLIT_DEV_DOMAIN) {
    redirectUri = `https://${process.env.REPLIT_DEV_DOMAIN}/api/admin/system-email/callback`;
  } else {
    redirectUri = 'http://localhost:5000/api/admin/system-email/callback';
  }
  
  console.log('[System Email] Redirect URI:', redirectUri);
  console.log('[System Email] REPLIT_DEPLOYMENT:', process.env.REPLIT_DEPLOYMENT);
  console.log('[System Email] REPLIT_DOMAINS:', process.env.REPLIT_DOMAINS);
  
  return redirectUri;
}

function getSystemOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getSystemRedirectUri();

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getSystemEmailAuthUrl(): string {
  console.log('[System Email] Generating auth URL...');
  const oauth2Client = getSystemOAuth2Client();
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SYSTEM_EMAIL_SCOPES,
    prompt: 'consent',
    state: 'system-email-setup',
  });

  console.log('[System Email] Auth URL generated:', authUrl.substring(0, 100) + '...');
  return authUrl;
}

export async function handleSystemEmailCallback(code: string): Promise<{ 
  email: string; 
  accessToken: string; 
  refreshToken: string;
  expiryDate: number | null;
}> {
  const oauth2Client = getSystemOAuth2Client();
  
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const email = userInfo.data.email || '';

  if (!tokens.refresh_token) {
    throw new Error('No refresh token received. Please try again.');
  }

  return {
    email,
    accessToken: tokens.access_token || '',
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date || null,
  };
}

export function isSystemEmailConfigured(): boolean {
  return !!(
    process.env.SYSTEM_GMAIL_REFRESH_TOKEN &&
    process.env.SYSTEM_GMAIL_EMAIL
  );
}

export async function sendSystemEmail(
  to: string,
  subject: string,
  htmlBody: string,
  fromName: string = 'Fuse Phone'
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const refreshToken = process.env.SYSTEM_GMAIL_REFRESH_TOKEN;
    const systemEmail = process.env.SYSTEM_GMAIL_EMAIL;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    console.log('[System Email] Attempting to send email to:', to);
    console.log('[System Email] From:', systemEmail);
    console.log('[System Email] Has refresh token:', !!refreshToken);
    console.log('[System Email] Refresh token length:', refreshToken?.length || 0);

    if (!refreshToken || !systemEmail) {
      console.log('[System Email] Not configured - SYSTEM_GMAIL_REFRESH_TOKEN or SYSTEM_GMAIL_EMAIL missing');
      return { success: false, error: 'System email not configured' };
    }

    if (!clientId || !clientSecret) {
      return { success: false, error: 'Google OAuth credentials not configured' };
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });
    
    // Try to get access token to verify credentials work
    console.log('[System Email] Getting access token...');

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const sanitizeHeader = (v: string) => String(v).replace(/[\r\n]+/g, ' ').trim();
    const safeFromName = sanitizeHeader(fromName);
    const safeSystemEmail = sanitizeHeader(systemEmail);
    const safeTo = sanitizeHeader(to);
    const safeSubject = sanitizeHeader(subject);
    // RFC 2047 MIME-encode any header value containing non-ASCII characters
    // so smart quotes, em dashes, and emoji render correctly across all clients.
    const encodeHeader = (v: string) => {
      if (/^[\x00-\x7F]*$/.test(v)) return v;
      return `=?UTF-8?B?${Buffer.from(v, 'utf-8').toString('base64')}?=`;
    };
    const encodedSubject = encodeHeader(safeSubject);
    const encodedFromName = encodeHeader(safeFromName);
    const from = `${encodedFromName} <${safeSystemEmail}>`;

    const messageParts = [
      `From: ${from}`,
      `To: ${safeTo}`,
      `Subject: ${encodedSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      htmlBody,
    ];
    const message = messageParts.join('\n');

    const encodedMessage = Buffer.from(message, 'utf-8')
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

    console.log(`[System Email] Sent email to ${to}, messageId: ${result.data.id}`);
    return { success: true, messageId: result.data.id || undefined };
  } catch (error: any) {
    console.error('[System Email] Failed to send:', error.message);
    if (error.response?.data) {
      console.error('[System Email] Error details:', JSON.stringify(error.response.data));
    }
    if (error.code) {
      console.error('[System Email] Error code:', error.code);
    }
    return { success: false, error: error.message };
  }
}
