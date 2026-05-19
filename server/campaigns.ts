import { db } from "./db";
import { campaigns, campaignMessages, contacts, documents, projects, companySettings } from "@shared/schema";
import { eq, and, inArray, sql, ne, isNull } from "drizzle-orm";
import { wrapEmailInTemplate } from "./emailTemplate";
import * as smtpEmail from "./smtpEmail";
import * as googleIntegration from "./google";
import * as systemEmail from "./systemEmail";
import { storage } from "./storage";
import crypto from "crypto";

function getUnsubSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is required for unsubscribe tokens');
  return secret;
}

export function generateUnsubscribeToken(contactId: number, userId: string): string {
  const payload = `${contactId}:${userId}`;
  const hmac = crypto.createHmac('sha256', getUnsubSecret()).update(payload).digest('hex').slice(0, 16);
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

export function verifyUnsubscribeToken(token: string): { contactId: number; userId: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split(':');
    if (parts.length < 3) return null;
    const contactIdStr = parts[0];
    const hmac = parts[parts.length - 1];
    const userId = parts.slice(1, -1).join(':');
    const contactId = parseInt(contactIdStr, 10);
    if (!contactId || !userId || !hmac) return null;
    const expected = crypto.createHmac('sha256', getUnsubSecret()).update(`${contactId}:${userId}`).digest('hex').slice(0, 16);
    if (hmac !== expected) return null;
    return { contactId, userId };
  } catch {
    return null;
  }
}

export type CampaignSegment =
  | 'all_contacts'
  | 'active_leads'
  | 'sent_estimates'
  | 'active_projects'
  | 'completed_jobs'
  | 'specific_contacts';

export const AVAILABLE_TAGS = [
  { tag: '{{contact_name}}', description: 'Full name of the contact', example: 'John Smith' },
  { tag: '{{first_name}}', description: 'First name only', example: 'John' },
  { tag: '{{last_name}}', description: 'Last name only', example: 'Smith' },
  { tag: '{{company_name}}', description: 'Your company name', example: 'Fuse Painting' },
  { tag: '{{salesperson}}', description: 'Your name (business owner)', example: 'Maria Garcia' },
  { tag: '{{phone}}', description: 'Your business phone', example: '(555) 123-4567' },
  { tag: '{{email}}', description: 'Your business email', example: 'office@example.com' },
  { tag: '{{website}}', description: 'Your website', example: 'www.example.com' },
  { tag: '{{booking_link}}', description: 'Your booking/scheduling link', example: 'https://example.com/book' },
];

export function replaceTags(
  text: string,
  contact: { name: string; email?: string | null; phone?: string | null },
  settings: { companyName?: string; phone?: string | null; email?: string | null; website?: string | null; bookingUrl?: string | null; bookingSlug?: string | null; ownerName?: string; customDomain?: string | null; customDomainVerified?: boolean | null; whiteLabelEnabled?: boolean | null },
): string {
  const nameParts = (contact.name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

  let bookingLink = settings.bookingUrl || '';
  if (!bookingLink && settings.customDomain && settings.customDomainVerified && settings.whiteLabelEnabled) {
    bookingLink = `https://${settings.customDomain}/booking`;
  }
  if (!bookingLink && settings.bookingSlug) {
    bookingLink = `https://app.fusephone.com/${settings.bookingSlug}/booking`;
  }
  if (!bookingLink) {
    bookingLink = settings.website || '';
  }

  return text
    .replace(/\{\{contact_name\}\}/gi, contact.name || 'there')
    .replace(/\{\{first_name\}\}/gi, firstName || 'there')
    .replace(/\{\{last_name\}\}/gi, lastName)
    .replace(/\{\{company_name\}\}/gi, settings.companyName || '')
    .replace(/\{\{salesperson\}\}/gi, settings.ownerName || settings.companyName || '')
    .replace(/\{\{phone\}\}/gi, settings.phone || '')
    .replace(/\{\{email\}\}/gi, settings.email || '')
    .replace(/\{\{website\}\}/gi, settings.website || '')
    .replace(/\{\{booking_link\}\}/gi, bookingLink);
}

export function getBookingLink(settings: { bookingUrl?: string | null; bookingSlug?: string | null; website?: string | null; customDomain?: string | null; customDomainVerified?: boolean | null; whiteLabelEnabled?: boolean | null }): string {
  if (settings.bookingUrl) return settings.bookingUrl;
  if (settings.customDomain && settings.customDomainVerified && settings.whiteLabelEnabled) {
    return `https://${settings.customDomain}/booking`;
  }
  if (settings.bookingSlug) {
    return `https://app.fusephone.com/${settings.bookingSlug}/booking`;
  }
  return '';
}

export function previewTagsWithSample(text: string): string {
  return text
    .replace(/\{\{contact_name\}\}/gi, 'John Smith')
    .replace(/\{\{first_name\}\}/gi, 'John')
    .replace(/\{\{last_name\}\}/gi, 'Smith')
    .replace(/\{\{company_name\}\}/gi, 'Your Company')
    .replace(/\{\{salesperson\}\}/gi, 'You')
    .replace(/\{\{phone\}\}/gi, '(555) 123-4567')
    .replace(/\{\{email\}\}/gi, 'office@example.com')
    .replace(/\{\{website\}\}/gi, 'www.example.com')
    .replace(/\{\{booking_link\}\}/gi, 'https://example.com/book');
}

export async function getSegmentContacts(userId: string, segment: CampaignSegment, specificContactIds?: number[] | null) {
  if (segment === 'specific_contacts' && specificContactIds && specificContactIds.length > 0) {
    return db.select()
      .from(contacts)
      .where(and(
        eq(contacts.userId, userId),
        inArray(contacts.id, specificContactIds),
        isNull(contacts.unsubscribedAt)
      ));
  }

  switch (segment) {
    case 'active_leads': {
      return db.select()
        .from(contacts)
        .where(and(
          eq(contacts.userId, userId),
          eq(contacts.type, 'lead'),
          isNull(contacts.unsubscribedAt)
        ));
    }
    case 'sent_estimates': {
      const docs = await db.select({ contactId: documents.contactId })
        .from(documents)
        .where(and(
          eq(documents.userId, userId),
          eq(documents.type, 'estimate'),
          eq(documents.status, 'sent')
        ));
      const contactIds = [...new Set(docs.map(d => d.contactId).filter(Boolean))] as number[];
      if (contactIds.length === 0) return [];
      return db.select()
        .from(contacts)
        .where(and(
          eq(contacts.userId, userId),
          inArray(contacts.id, contactIds),
          isNull(contacts.unsubscribedAt)
        ));
    }
    case 'active_projects': {
      const projs = await db.select({ contactId: projects.contactId })
        .from(projects)
        .where(and(
          eq(projects.userId, userId),
          ne(projects.stage, 'completed'),
          ne(projects.stage, 'lost')
        ));
      const contactIds = [...new Set(projs.map(p => p.contactId).filter(Boolean))] as number[];
      if (contactIds.length === 0) return [];
      return db.select()
        .from(contacts)
        .where(and(
          eq(contacts.userId, userId),
          inArray(contacts.id, contactIds),
          isNull(contacts.unsubscribedAt)
        ));
    }
    case 'completed_jobs': {
      const projs = await db.select({ contactId: projects.contactId })
        .from(projects)
        .where(and(
          eq(projects.userId, userId),
          eq(projects.stage, 'completed')
        ));
      const contactIds = [...new Set(projs.map(p => p.contactId).filter(Boolean))] as number[];
      if (contactIds.length === 0) return [];
      return db.select()
        .from(contacts)
        .where(and(
          eq(contacts.userId, userId),
          inArray(contacts.id, contactIds),
          isNull(contacts.unsubscribedAt)
        ));
    }
    case 'all_contacts':
    default: {
      return db.select()
        .from(contacts)
        .where(and(
          eq(contacts.userId, userId),
          isNull(contacts.unsubscribedAt)
        ));
    }
  }
}

export async function getSegmentCount(userId: string, segment: CampaignSegment): Promise<number> {
  const contactsList = await getSegmentContacts(userId, segment);
  return contactsList.length;
}

export async function startCampaign(campaignId: number, userId: string): Promise<{ success: boolean; message: string }> {
  const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)));
  if (!campaign) return { success: false, message: 'Campaign not found' };
  if (campaign.status !== 'draft' && campaign.status !== 'paused') {
    return { success: false, message: 'Campaign can only be started from draft or paused status' };
  }

  const segmentContacts = await getSegmentContacts(userId, campaign.segment as CampaignSegment, campaign.specificContactIds);

  const eligibleContacts = segmentContacts.filter(c => {
    if (campaign.channel === 'email') return !!c.email;
    if (campaign.channel === 'sms') return !!c.phone;
    return !!c.email || !!c.phone;
  });

  if (eligibleContacts.length === 0) {
    return { success: false, message: 'No eligible contacts found in this segment' };
  }

  if (campaign.status === 'draft') {
    const messagesToInsert = eligibleContacts.map(contact => ({
      campaignId: campaign.id,
      contactId: contact.id,
      channel: campaign.channel === 'both'
        ? (contact.email ? 'email' : 'sms')
        : campaign.channel,
      to: campaign.channel === 'sms'
        ? contact.phone
        : (contact.email || contact.phone),
      status: 'pending' as const,
    })).filter(m => m.to);

    if (messagesToInsert.length > 0) {
      await db.insert(campaignMessages).values(messagesToInsert);
    }

    await db.update(campaigns)
      .set({
        status: 'active',
        totalRecipients: messagesToInsert.length,
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));
  } else {
    await db.update(campaigns)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));
  }

  processCampaignBatch(campaignId, userId).catch(err => {
    console.error(`[Campaigns] Background processing error for campaign ${campaignId}:`, err);
  });

  return { success: true, message: `Campaign started with ${eligibleContacts.length} recipients` };
}

export async function pauseCampaign(campaignId: number, userId: string): Promise<{ success: boolean; message: string }> {
  const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)));
  if (!campaign) return { success: false, message: 'Campaign not found' };
  if (campaign.status !== 'active') return { success: false, message: 'Campaign is not active' };

  await db.update(campaigns)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));

  return { success: true, message: 'Campaign paused' };
}

async function getOwnerName(userId: string): Promise<string> {
  try {
    const result = await db.execute(sql`SELECT "firstName", "lastName", "profileImageUrl" FROM sessions WHERE "userId" = ${userId} ORDER BY "expiresAt" DESC LIMIT 1`);
    const row = (result as any)?.rows?.[0];
    if (row?.firstName) {
      return `${row.firstName}${row.lastName ? ' ' + row.lastName : ''}`;
    }
  } catch {}
  return '';
}

async function processCampaignBatch(campaignId: number, userId: string) {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!campaign || campaign.status !== 'active') return;

  const [settings] = await db.select().from(companySettings).where(eq(companySettings.userId, userId));
  if (!settings) {
    console.error(`[Campaigns] No company settings for user ${userId}`);
    return;
  }

  const ownerName = await getOwnerName(userId);

  const dailyLimit = campaign.channel === 'sms'
    ? (campaign.dailySmsLimit || 20)
    : (campaign.dailyEmailLimit || 50);

  const pendingMessages = await db.select()
    .from(campaignMessages)
    .where(and(
      eq(campaignMessages.campaignId, campaignId),
      eq(campaignMessages.status, 'pending')
    ))
    .limit(dailyLimit);

  if (pendingMessages.length === 0) {
    await db.update(campaigns)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));
    return;
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const msg of pendingMessages) {
    const [freshCampaign] = await db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, campaignId));
    if (freshCampaign?.status !== 'active') break;

    const [contact] = await db.select().from(contacts).where(eq(contacts.id, msg.contactId));

    try {
      if (msg.channel === 'email') {
        await sendCampaignEmail(userId, settings, msg, campaign, contact, ownerName);
        sentCount++;
      } else if (msg.channel === 'sms') {
        await sendCampaignSms(userId, settings, msg, campaign, contact, ownerName);
        sentCount++;
      }

      await db.update(campaignMessages)
        .set({ status: 'sent', sentAt: new Date() })
        .where(eq(campaignMessages.id, msg.id));
    } catch (err: any) {
      failedCount++;
      await db.update(campaignMessages)
        .set({ status: 'failed', error: err.message?.substring(0, 500) })
        .where(eq(campaignMessages.id, msg.id));
    }

    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  await db.update(campaigns)
    .set({
      sentCount: sql`${campaigns.sentCount} + ${sentCount}`,
      failedCount: sql`${campaigns.failedCount} + ${failedCount}`,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaignId));

  const [updated] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (updated?.status === 'active') {
    const remainingCount = await db.select({ count: sql<number>`count(*)` })
      .from(campaignMessages)
      .where(and(
        eq(campaignMessages.campaignId, campaignId),
        eq(campaignMessages.status, 'pending')
      ));

    const remaining = Number(remainingCount[0]?.count || 0);
    if (remaining === 0) {
      await db.update(campaigns)
        .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
        .where(eq(campaigns.id, campaignId));
    } else {
      console.log(`[Campaigns] Daily limit reached for campaign ${campaignId}. ${remaining} messages remaining. Will continue tomorrow.`);
      setTimeout(() => {
        processCampaignBatch(campaignId, userId).catch(err => {
          console.error(`[Campaigns] Scheduled batch error for campaign ${campaignId}:`, err);
        });
      }, 24 * 60 * 60 * 1000);
    }
  }
}

async function sendCampaignEmail(
  userId: string,
  settings: any,
  msg: any,
  campaign: any,
  contact: any,
  ownerName: string
) {
  const fromName = (settings.companyName && settings.companyName.trim().toLowerCase() !== 'my company') ? settings.companyName : 'Fuse Phone';

  const personalizedBody = contact
    ? replaceTags(campaign.body, contact, { ...settings, ownerName })
    : campaign.body;

  const personalizedSubject = contact && campaign.subject
    ? replaceTags(campaign.subject, contact, { ...settings, ownerName })
    : (campaign.subject || campaign.name);

  const unsubToken = msg.contactId ? generateUnsubscribeToken(msg.contactId, userId) : null;
  const baseUrl = process.env.NODE_ENV === 'production'
    ? 'https://app.fusephone.com'
    : (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'https://app.fusephone.com');
  const unsubscribeUrl = unsubToken ? `${baseUrl}/unsubscribe/${unsubToken}` : undefined;

  const htmlBody = wrapEmailInTemplate(personalizedBody, {
    companyName: fromName,
    companyLicense: settings.companyLicense || undefined,
    companyLogo: settings.logo,
    companyPhone: settings.phone || undefined,
    companyEmail: settings.email || undefined,
    companyWebsite: settings.website || undefined,
    ctaText: campaign.ctaText || undefined,
    ctaUrl: campaign.ctaUrl || undefined,
    accentColor: settings.brandColor || undefined,
    unsubscribeUrl,
  });

  const hasUserEmail = settings.googleConnectedAt || settings.smtpConnectedAt;
  if (hasUserEmail) {
    try {
      await smtpEmail.sendEmailWithFallback(
        userId, msg.to, personalizedSubject, htmlBody, fromName,
        googleIntegration.sendEmail
      );
      return;
    } catch (err: any) {
      console.warn(`[Campaigns] User email failed, trying system email:`, err.message);
    }
  }

  const result = await systemEmail.sendSystemEmail(
    msg.to, personalizedSubject, htmlBody, fromName
  );
  if (!result.success) throw new Error(result.error || 'System email failed');
}

async function sendCampaignSms(
  userId: string,
  settings: any,
  msg: any,
  campaign: any,
  contact: any,
  ownerName: string
) {
  const { sendSms, canSendSms } = await import("./sms-provider.js");
  if (!canSendSms(settings)) {
    throw new Error('SMS not configured');
  }

  const personalizedBody = contact
    ? replaceTags(campaign.body, contact, { ...settings, ownerName })
    : campaign.body;

  const result = await sendSms(settings, { to: msg.to, body: personalizedBody });
  if (!result.success) throw new Error(result.error || 'SMS send failed');

  await storage.createCommunication(userId, {
    contactId: msg.contactId,
    phoneNumber: msg.to,
    type: "sms",
    direction: "outbound",
    content: personalizedBody,
    messageSid: result.sid || null,
  });
}

export async function sendTestCampaign(userId: string, campaignId: number): Promise<{ success: boolean; message: string }> {
  const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)));
  if (!campaign) return { success: false, message: 'Campaign not found' };

  const [settings] = await db.select().from(companySettings).where(eq(companySettings.userId, userId));
  if (!settings) return { success: false, message: 'Company settings not found' };

  const ownerName = await getOwnerName(userId);

  const sampleContact = {
    name: ownerName || settings.companyName || 'Test Contact',
    email: settings.email,
    phone: settings.phone,
  };

  if (campaign.channel === 'email') {
    const toEmail = settings.email;
    if (!toEmail) return { success: false, message: 'No email configured in company settings to send test to' };

    const personalizedBody = replaceTags(campaign.body, sampleContact, { ...settings, ownerName });
    const personalizedSubject = campaign.subject
      ? `[TEST] ${replaceTags(campaign.subject, sampleContact, { ...settings, ownerName })}`
      : `[TEST] ${campaign.name}`;

    const htmlBody = wrapEmailInTemplate(personalizedBody, {
      companyName: settings.companyName || 'Fuse Phone',
      companyLicense: settings.companyLicense || undefined,
      companyLogo: settings.logo,
      companyPhone: settings.phone || undefined,
      companyEmail: settings.email || undefined,
      companyWebsite: settings.website || undefined,
      ctaText: campaign.ctaText || undefined,
      ctaUrl: campaign.ctaUrl || undefined,
      accentColor: settings.brandColor || undefined,
    });

    try {
      const hasUserEmail = settings.googleConnectedAt || (settings as any).smtpConnectedAt;
      if (hasUserEmail) {
        await smtpEmail.sendEmailWithFallback(
          userId, toEmail, personalizedSubject, htmlBody, settings.companyName || 'Fuse Phone',
          googleIntegration.sendEmail
        );
      } else {
        const result = await systemEmail.sendSystemEmail(toEmail, personalizedSubject, htmlBody, settings.companyName || 'Fuse Phone');
        if (!result.success) throw new Error(result.error || 'System email failed');
      }
      return { success: true, message: `Test email sent to ${toEmail}` };
    } catch (err: any) {
      return { success: false, message: `Failed to send test: ${err.message}` };
    }
  } else {
    const toPhone = settings.phone || settings.twilioPhoneNumber;
    if (!toPhone) return { success: false, message: 'No phone configured to send test SMS to' };

    try {
      const { sendSms, canSendSms } = await import("./sms-provider.js");
      if (!canSendSms(settings)) return { success: false, message: 'SMS not configured' };
      const personalizedBody = `[TEST] ${replaceTags(campaign.body, sampleContact, { ...settings, ownerName })}`;
      const result = await sendSms(settings, { to: toPhone, body: personalizedBody });
      if (!result.success) throw new Error(result.error || 'SMS send failed');
      return { success: true, message: `Test SMS sent to ${toPhone}` };
    } catch (err: any) {
      return { success: false, message: `Failed to send test: ${err.message}` };
    }
  }
}
