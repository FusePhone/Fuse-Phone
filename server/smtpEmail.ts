import nodemailer from 'nodemailer';
import { db } from './db';
import { companySettings } from '@shared/schema';
import { eq } from 'drizzle-orm';

export async function getSmtpSettings(userId: string) {
  const [settings] = await db.select()
    .from(companySettings)
    .where(eq(companySettings.userId, userId));
  
  if (!settings?.smtpHost || !settings?.smtpUser || !settings?.smtpPass) {
    return null;
  }

  return {
    host: settings.smtpHost,
    port: settings.smtpPort || 587,
    secure: settings.smtpSecure ?? true,
    user: settings.smtpUser,
    pass: settings.smtpPass,
    fromEmail: settings.smtpFromEmail || settings.smtpUser,
    fromName: settings.smtpFromName || settings.companyName || '',
  };
}

export async function getImapSettings(userId: string) {
  const [settings] = await db.select()
    .from(companySettings)
    .where(eq(companySettings.userId, userId));
  
  if (!settings?.imapHost || !settings?.imapUser || !settings?.imapPass) {
    return null;
  }

  return {
    host: settings.imapHost,
    port: settings.imapPort || 993,
    secure: settings.imapSecure ?? true,
    user: settings.imapUser,
    pass: settings.imapPass,
  };
}

function createTransporter(config: { host: string; port: number; secure: boolean; user: string; pass: string }) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

export async function testSmtpConnection(config: { host: string; port: number; secure: boolean; user: string; pass: string }): Promise<{ success: boolean; message: string }> {
  try {
    const transporter = createTransporter(config);
    await transporter.verify();
    transporter.close();
    return { success: true, message: 'SMTP connection successful' };
  } catch (err: any) {
    console.error('[SMTP] Connection test failed:', err.message);
    return { success: false, message: err.message || 'SMTP connection failed' };
  }
}

export async function sendSmtpEmail(
  userId: string,
  to: string,
  subject: string,
  body: string,
  fromName?: string
): Promise<{ success: boolean; messageId?: string }> {
  const smtp = await getSmtpSettings(userId);
  if (!smtp) {
    throw new Error('SMTP is not configured. Please set up SMTP in Integrations.');
  }

  const transporter = createTransporter({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    user: smtp.user,
    pass: smtp.pass,
  });

  const from = fromName
    ? `"${fromName}" <${smtp.fromEmail}>`
    : smtp.fromName
      ? `"${smtp.fromName}" <${smtp.fromEmail}>`
      : smtp.fromEmail;

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    html: body,
  });

  transporter.close();

  return { success: true, messageId: info.messageId };
}

export async function sendEmailWithFallback(
  userId: string,
  to: string,
  subject: string,
  body: string,
  fromName?: string,
  googleSendEmail?: (userId: string, to: string, subject: string, body: string, fromName?: string) => Promise<{ success: boolean; messageId?: string }>
): Promise<{ success: boolean; messageId?: string; provider: 'gmail' | 'smtp' | 'sendgrid' }> {
  const [settings] = await db.select()
    .from(companySettings)
    .where(eq(companySettings.userId, userId));

  if (settings?.googleConnectedAt && googleSendEmail) {
    try {
      const result = await googleSendEmail(userId, to, subject, body, fromName);
      return { ...result, provider: 'gmail' };
    } catch (err: any) {
      console.warn('[Email] Gmail send failed, trying fallback:', err.message);
    }
  }

  if (settings?.smtpHost && settings?.smtpUser && settings?.smtpPass) {
    try {
      const result = await sendSmtpEmail(userId, to, subject, body, fromName);
      return { ...result, provider: 'smtp' };
    } catch (err: any) {
      console.warn('[Email] SMTP send failed, trying SendGrid fallback:', err.message);
    }
  }

  if (settings?.sendgridDomainVerified && settings?.sendgridFromEmail) {
    const { sendSendGridEmail } = await import('./sendgridEmail.js');
    const result = await sendSendGridEmail(to, subject, body, settings.sendgridFromEmail, fromName || settings.companyName || undefined);
    if (result.success) {
      return { ...result, provider: 'sendgrid' };
    }
    console.warn('[Email] SendGrid send failed:', result.error);
  }

  throw new Error('No email provider configured. Please connect Gmail or set up your custom domain in Integrations.');
}

export function isSmtpConfigured(settings: any): boolean {
  return !!(settings?.smtpHost && settings?.smtpUser && settings?.smtpPass && settings?.smtpConnectedAt);
}
