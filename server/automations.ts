import { storage } from "./storage";
import * as systemEmail from "./systemEmail";
import * as smtpEmail from "./smtpEmail";
import * as googleIntegration from "./google";
import { wrapEmailInTemplate } from "./emailTemplate";
import type { CompanySettings, Contact, ScheduledAutomation } from "@shared/schema";
import { appointmentReminders, notifications, appointments, projects, documents, scheduledAutomations, jobScheduleDates, projectCrewAssignments, teamMembers, timeEntries } from "@shared/schema";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq, and, lte, lt, gt, gte, inArray, ne } from "drizzle-orm";
import { emitToUser } from "./realtime";
import { sendPushToUser } from "./pushNotifications";

interface WorkingHoursDay {
  enabled: boolean;
  start: string;
  end: string;
}

interface WorkingHoursData {
  [key: string]: WorkingHoursDay;
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function getTzParts(date: Date, tz: string): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '0';
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const rawHour = parseInt(get('hour'));
  return {
    year: parseInt(get('year')),
    month: parseInt(get('month')),
    day: parseInt(get('day')),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: parseInt(get('minute')),
    weekday: wdMap[get('weekday')] ?? 0,
  };
}

function utcDateForTzTime(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const isoGuess = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  const guessUtc = new Date(isoGuess + 'Z');
  for (let pass = 0; pass < 2; pass++) {
    const probe = new Date(guessUtc.getTime() + (pass === 0 ? 0 : 3600000));
    const p = getTzParts(probe, tz);
    const diff = (p.hour * 60 + p.minute) - (hour * 60 + minute);
    const adjusted = new Date(probe.getTime() - diff * 60000);
    const check = getTzParts(adjusted, tz);
    if (check.hour === hour && check.minute === minute && check.day === day) {
      return adjusted;
    }
  }
  return guessUtc;
}

export function getNextBusinessWindow(settings: CompanySettings): Date | null {
  const tz = settings.timezone || 'America/New_York';
  let workingHours: WorkingHoursData;
  try {
    workingHours = settings.workingHours ? JSON.parse(settings.workingHours as string) : null;
  } catch {
    return null;
  }
  if (!workingHours) return null;

  const now = new Date();
  const nowParts = getTzParts(now, tz);
  const nowMinutes = nowParts.hour * 60 + nowParts.minute;
  const currentDayIdx = nowParts.weekday;
  const currentDayKey = DAY_KEYS[currentDayIdx];

  const todayHours = workingHours[currentDayKey];
  if (todayHours?.enabled) {
    const [startH, startM] = todayHours.start.split(':').map(Number);
    const [endH, endM] = todayHours.end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (nowMinutes >= startMinutes && nowMinutes < endMinutes) {
      return null;
    }

    if (nowMinutes < startMinutes) {
      return utcDateForTzTime(nowParts.year, nowParts.month, nowParts.day, startH, startM, tz);
    }
  }

  for (let offset = 1; offset <= 7; offset++) {
    const checkDayIdx = (currentDayIdx + offset) % 7;
    const checkDayKey = DAY_KEYS[checkDayIdx];
    const dayHours = workingHours[checkDayKey];
    if (dayHours?.enabled) {
      const [startH, startM] = dayHours.start.split(':').map(Number);
      const futureDate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
      const futureParts = getTzParts(futureDate, tz);
      return utcDateForTzTime(futureParts.year, futureParts.month, futureParts.day, startH, startM, tz);
    }
  }

  return null;
}

async function getUserTier(userId: string): Promise<string> {
  try {
    const [user] = await db.select({ subscriptionTier: users.subscriptionTier }).from(users).where(eq(users.id, userId)).limit(1);
    return user?.subscriptionTier || 'core';
  } catch {
    return 'core';
  }
}

const STARTER_NOT_VIEWED_LIMIT = 3;
const STARTER_VIEWED_LIMIT = 3;

const LEAD_FOLLOWUP_SCHEDULE: Array<{ slug: string; delayMs: number }> = [
  { slug: "lead_welcome", delayMs: 0 },
  { slug: "lead_followup_2_hours", delayMs: 2 * 60 * 60 * 1000 },
  { slug: "lead_followup_1_day", delayMs: 24 * 60 * 60 * 1000 },
  { slug: "lead_followup_2_days", delayMs: 2 * 24 * 60 * 60 * 1000 },
  { slug: "lead_followup_5_days", delayMs: 5 * 24 * 60 * 60 * 1000 },
  { slug: "lead_followup_9_days", delayMs: 9 * 24 * 60 * 60 * 1000 },
  { slug: "lead_followup_15_days", delayMs: 15 * 24 * 60 * 60 * 1000 },
  { slug: "lead_followup_30_days", delayMs: 30 * 24 * 60 * 60 * 1000 },
];

const DOC_NOT_VIEWED_SCHEDULE: Array<{ slug: string; delayMs: number }> = [
  { slug: "followup_not_viewed_1_day", delayMs: 24 * 60 * 60 * 1000 },
  { slug: "followup_not_viewed_2_days", delayMs: 2 * 24 * 60 * 60 * 1000 },
  { slug: "followup_not_viewed_5_days", delayMs: 5 * 24 * 60 * 60 * 1000 },
  { slug: "followup_not_viewed_9_days", delayMs: 9 * 24 * 60 * 60 * 1000 },
  { slug: "followup_not_viewed_15_days", delayMs: 15 * 24 * 60 * 60 * 1000 },
  { slug: "followup_not_viewed_21_days", delayMs: 21 * 24 * 60 * 60 * 1000 },
  { slug: "followup_not_viewed_30_days", delayMs: 30 * 24 * 60 * 60 * 1000 },
];

const DOC_VIEWED_SCHEDULE: Array<{ slug: string; delayMs: number }> = [
  { slug: "followup_viewed_1_day", delayMs: 24 * 60 * 60 * 1000 },
  { slug: "followup_viewed_2_days", delayMs: 2 * 24 * 60 * 60 * 1000 },
  { slug: "followup_viewed_5_days", delayMs: 5 * 24 * 60 * 60 * 1000 },
  { slug: "followup_viewed_9_days", delayMs: 9 * 24 * 60 * 60 * 1000 },
  { slug: "followup_viewed_15_days", delayMs: 15 * 24 * 60 * 60 * 1000 },
  { slug: "followup_viewed_21_days", delayMs: 21 * 24 * 60 * 60 * 1000 },
  { slug: "followup_viewed_30_days", delayMs: 30 * 24 * 60 * 60 * 1000 },
];

function replaceTemplateVars(
  text: string,
  vars: Record<string, string>
): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
  }
  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}

function buildTemplateVars(
  contact: Contact,
  settings: CompanySettings,
  extras: Record<string, string> = {}
): Record<string, string> {
  const clientName =
    (contact as any).name ||
    [(contact as any).firstName, (contact as any).lastName].filter(Boolean).join(" ") ||
    "Valued Customer";
  const nameParts = clientName.split(" ");
  const clientFirstName = nameParts[0] || clientName;
  return {
    client_name: clientName,
    client_first_name: clientFirstName,
    client_phone: (contact as any).phone || "",
    client_email: (contact as any).email || "",
    company_name: settings.companyName || "",
    company_phone: settings.phone || "",
    company_email: settings.email || "",
    review_link: settings.reviewLink || "",
    ...extras,
  };
}

function getDocumentPortalUrl(
  settings: CompanySettings,
  doc: { id: number; type: string; publicToken: string | null }
): string {
  const baseUrl =
    process.env.REPLIT_DEPLOYMENT === "1" && process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "http://localhost:5000";

  const typeMap: Record<string, string> = {
    proposal: "proposal",
    estimate: "estimate",
    invoice: "invoice",
    change_order: "change-order",
  };
  const typePath = typeMap[doc.type] || doc.type;

  if (settings.customDomain && settings.customDomainVerified && settings.whiteLabelEnabled) {
    return `https://${settings.customDomain}/${typePath}/${doc.id}`;
  }

  if (settings.bookingSlug) {
    return `${baseUrl}/${settings.bookingSlug}/${typePath}/${doc.id}`;
  }

  if (doc.publicToken) {
    return `${baseUrl}/portal/document/${doc.publicToken}`;
  }

  return baseUrl;
}

export async function scheduleLeadFollowups(
  userId: string,
  contactId: number,
  projectId?: number
): Promise<void> {
  const existing = await storage.getAutomationsForContact(userId, contactId);
  const hasPendingLeadFollowups = existing.some(
    a => a.category === 'lead_followup' && (a.status === 'pending' || a.status === 'sent')
  );
  if (hasPendingLeadFollowups) {
    console.log(`[Automations] Skipping lead follow-ups for contact ${contactId} — already has existing lead_followup automations`);
    return;
  }

  const contact = await storage.getContact(userId, contactId);
  if (contact?.phone) {
    const allContacts = await storage.getContacts(userId);
    const samePhoneIds = allContacts
      .filter((c: any) => c.phone === contact.phone && c.id !== contactId)
      .map((c: any) => c.id);
    if (samePhoneIds.length > 0) {
      for (const otherId of samePhoneIds) {
        const otherAutos = await storage.getAutomationsForContact(userId, otherId);
        const otherHas = otherAutos.some(
          a => a.category === 'lead_followup' && (a.status === 'pending' || a.status === 'sent')
        );
        if (otherHas) {
          console.log(`[Automations] Skipping lead follow-ups for contact ${contactId} — another contact (${otherId}) with same phone already has lead_followup automations`);
          return;
        }
      }
    }
  }

  const tier = await getUserTier(userId);
  const channel = tier === 'elite' ? 'both' : 'email';
  // User overrides per-template delays + can disable individual messages.
  const userTemplates = await storage.getMessageTemplates(userId);
  const overrides = new Map(
    userTemplates.map(t => [t.slug, { delayMinutes: t.delayMinutes, isEnabled: t.isEnabled !== false }])
  );
  const fullSchedule = LEAD_FOLLOWUP_SCHEDULE
    .map(s => {
      const o = overrides.get(s.slug);
      const isEnabled = o ? o.isEnabled : true;
      const delayMs = o && o.delayMinutes != null ? o.delayMinutes * 60_000 : s.delayMs;
      return { slug: s.slug, delayMs, isEnabled };
    })
    .filter(s => s.isEnabled)
    .sort((a, b) => a.delayMs - b.delayMs);
  const schedule = tier === 'starter' ? fullSchedule.slice(0, 5) : fullSchedule;

  const now = Date.now();
  for (const item of schedule) {
    await storage.createScheduledAutomation({
      userId,
      contactId,
      projectId: projectId || null,
      documentId: null,
      templateSlug: item.slug,
      category: "lead_followup",
      channel,
      status: "pending",
      scheduledFor: new Date(now + item.delayMs),
    });
  }
  console.log(
    `[Automations] Scheduled ${schedule.length} lead follow-ups for contact ${contactId} (tier: ${tier}, channel: ${channel})`
  );
}

export async function scheduleDocumentFollowups(
  userId: string,
  contactId: number,
  documentId: number,
  projectId?: number | null
): Promise<void> {
  const tier = await getUserTier(userId);
  const channel = tier === 'elite' ? 'both' : 'email';
  const userTemplates = await storage.getMessageTemplates(userId);
  const overrides = new Map(
    userTemplates.map(t => [t.slug, { delayMinutes: t.delayMinutes, isEnabled: t.isEnabled !== false }])
  );
  const fullSchedule = DOC_NOT_VIEWED_SCHEDULE
    .map(s => {
      const o = overrides.get(s.slug);
      const isEnabled = o ? o.isEnabled : true;
      const delayMs = o && o.delayMinutes != null ? o.delayMinutes * 60_000 : s.delayMs;
      return { slug: s.slug, delayMs, isEnabled };
    })
    .filter(s => s.isEnabled)
    .sort((a, b) => a.delayMs - b.delayMs);
  const schedule = tier === 'starter' ? fullSchedule.slice(0, STARTER_NOT_VIEWED_LIMIT) : fullSchedule;

  const now = Date.now();
  for (const item of schedule) {
    await storage.createScheduledAutomation({
      userId,
      contactId,
      projectId: projectId || null,
      documentId,
      templateSlug: item.slug,
      category: "followup_not_viewed",
      channel,
      status: "pending",
      scheduledFor: new Date(now + item.delayMs),
    });
  }
  console.log(
    `[Automations] Scheduled ${schedule.length} not-viewed follow-ups for document ${documentId}${projectId ? ` (project ${projectId})` : ''} (tier: ${tier})`
  );
}

export async function scheduleDocumentViewedFollowups(
  userId: string,
  contactId: number,
  documentId: number,
  projectId?: number | null
): Promise<void> {
  await storage.cancelAutomations(userId, {
    documentId,
    category: "followup_not_viewed",
  });

  const tier = await getUserTier(userId);
  const channel = tier === 'elite' ? 'both' : 'email';
  const userTemplates = await storage.getMessageTemplates(userId);
  const overrides = new Map(
    userTemplates.map(t => [t.slug, { delayMinutes: t.delayMinutes, isEnabled: t.isEnabled !== false }])
  );
  const fullSchedule = DOC_VIEWED_SCHEDULE
    .map(s => {
      const o = overrides.get(s.slug);
      const isEnabled = o ? o.isEnabled : true;
      const delayMs = o && o.delayMinutes != null ? o.delayMinutes * 60_000 : s.delayMs;
      return { slug: s.slug, delayMs, isEnabled };
    })
    .filter(s => s.isEnabled)
    .sort((a, b) => a.delayMs - b.delayMs);
  const schedule = tier === 'starter' ? fullSchedule.slice(0, STARTER_VIEWED_LIMIT) : fullSchedule;

  const now = Date.now();
  for (const item of schedule) {
    await storage.createScheduledAutomation({
      userId,
      contactId,
      projectId: projectId || null,
      documentId,
      templateSlug: item.slug,
      category: "followup_viewed",
      channel,
      status: "pending",
      scheduledFor: new Date(now + item.delayMs),
    });
  }

  if (projectId) {
    try {
      await storage.updateProject(userId, projectId, {
        automationPausedReason: null,
        automationPausedAt: null,
        automationPausedCategory: null,
        automationPausedStep: null,
        automationPausedDocumentId: null,
      } as any);
      console.log(`[Automations] Cleared paused state for project ${projectId} (document viewed, new follow-ups scheduled)`);
    } catch (e) {
      console.error(`[Automations] Failed to clear paused state for project ${projectId}:`, e);
    }
  }

  console.log(
    `[Automations] Scheduled ${DOC_VIEWED_SCHEDULE.length} viewed follow-ups for document ${documentId}${projectId ? ` (project ${projectId})` : ''}`
  );
}

export async function scheduleJobNotification(
  userId: string,
  contactId: number,
  projectId: number,
  slug: string,
  delayMs?: number
): Promise<number> {
  const scheduledFor = delayMs ? new Date(Date.now() + delayMs) : new Date();
  const automation = await storage.createScheduledAutomation({
    userId,
    contactId,
    projectId,
    documentId: null,
    templateSlug: slug,
    category: "jobs",
    channel: "both",
    status: "pending",
    scheduledFor,
  });
  console.log(
    `[Automations] Scheduled job notification "${slug}" for project ${projectId}${delayMs ? ` (delayed ${Math.round(delayMs / 60000)} min)` : ''}`
  );
  return automation.id;
}

export async function scheduleJobReminder(
  userId: string,
  contactId: number,
  projectId: number,
  scheduledDate: Date
): Promise<void> {
  const dateStr = scheduledDate.toISOString().slice(0, 10);
  const [year, month, day] = dateStr.split('-').map(Number);
  const dayBeforeDate = new Date(Date.UTC(year, month - 1, day - 1, 13, 0, 0));

  console.log(`[Automations] Day-before reminder calc: jobDate=${dateStr} → reminderAt=${dayBeforeDate.toISOString()} (9AM ET)`);

  if (dayBeforeDate.getTime() > Date.now()) {
    await storage.createScheduledAutomation({
      userId,
      contactId,
      projectId,
      documentId: null,
      templateSlug: "job_reminder_day_before",
      category: "jobs",
      channel: "both",
      status: "pending",
      scheduledFor: dayBeforeDate,
    });
    console.log(
      `[Automations] Scheduled day-before reminder for project ${projectId} at ${dayBeforeDate.toISOString()}`
    );
  } else {
    console.log(`[Automations] Skipped day-before reminder for project ${projectId} (${dayBeforeDate.toISOString()} is in the past)`);
  }
}

export async function cancelLeadFollowups(
  userId: string,
  contactId: number,
  reason?: 'customer_replied' | 'user_messaged'
): Promise<void> {
  const cancelled = await storage.cancelAutomations(userId, {
    contactId,
    category: "lead_followup",
  });
  if (cancelled.length > 0 && reason) {
    const earliest = cancelled.reduce((a, b) =>
      new Date(a.scheduledFor) < new Date(b.scheduledFor) ? a : b
    );
    const project = await storage.getProjectByContact(userId, contactId);
    if (project) {
      await storage.updateProject(userId, project.id, {
        automationPausedReason: reason,
        automationPausedAt: new Date(),
        automationPausedCategory: 'lead_followup',
        automationPausedStep: earliest.templateSlug,
        automationPausedDocumentId: null,
      } as any);
      console.log(`[Automations] Paused lead follow-ups for project ${project.id} (${reason}), next step was: ${earliest.templateSlug}`);
    }
  }
  if (cancelled.length > 0) {
    console.log(
      `[Automations] Cancelled ${cancelled.length} lead follow-ups for contact ${contactId}`
    );
  }
}

export async function cancelDocumentFollowups(
  userId: string,
  documentId: number,
  reason?: 'customer_replied' | 'user_messaged' | 'document_signed' | 'document_status_changed'
): Promise<void> {
  const cancelledNV = await storage.cancelAutomations(userId, {
    documentId,
    category: "followup_not_viewed",
  });
  const cancelledV = await storage.cancelAutomations(userId, {
    documentId,
    category: "followup_viewed",
  });
  const allCancelled = [...cancelledNV, ...cancelledV];
  if (allCancelled.length > 0 && reason && (reason === 'customer_replied' || reason === 'user_messaged')) {
    const earliest = allCancelled.reduce((a, b) =>
      new Date(a.scheduledFor) < new Date(b.scheduledFor) ? a : b
    );
    const project = earliest.contactId
      ? await storage.getProjectByContact(userId, earliest.contactId)
      : undefined;
    if (project) {
      const category = cancelledV.length > 0 ? 'followup_viewed' : 'followup_not_viewed';
      await storage.updateProject(userId, project.id, {
        automationPausedReason: reason,
        automationPausedAt: new Date(),
        automationPausedCategory: category,
        automationPausedStep: earliest.templateSlug,
        automationPausedDocumentId: documentId,
      } as any);
      console.log(`[Automations] Paused doc follow-ups for project ${project.id} (${reason}), next step was: ${earliest.templateSlug}, doc: ${documentId}`);
    }
  }
  if (allCancelled.length > 0) {
    console.log(
      `[Automations] Cancelled ${allCancelled.length} document follow-ups for document ${documentId}`
    );
  }
}

export async function cancelAllContactFollowups(
  userId: string,
  contactId: number,
  reason: 'customer_replied' | 'user_messaged'
): Promise<void> {
  await cancelLeadFollowups(userId, contactId, reason);

  const cancelledNV = await storage.cancelAutomations(userId, {
    contactId,
    category: "followup_not_viewed",
  });
  const cancelledV = await storage.cancelAutomations(userId, {
    contactId,
    category: "followup_viewed",
  });
  const allDocCancelled = [...cancelledNV, ...cancelledV];
  if (allDocCancelled.length > 0) {
    const earliest = allDocCancelled.reduce((a, b) =>
      new Date(a.scheduledFor) < new Date(b.scheduledFor) ? a : b
    );
    const project = await storage.getProjectByContact(userId, contactId);
    if (project && !project.automationPausedReason) {
      const category = cancelledV.length > 0 ? 'followup_viewed' : 'followup_not_viewed';
      await storage.updateProject(userId, project.id, {
        automationPausedReason: reason,
        automationPausedAt: new Date(),
        automationPausedCategory: category,
        automationPausedStep: earliest.templateSlug,
        automationPausedDocumentId: earliest.documentId || null,
      } as any);
      console.log(`[Automations] Paused doc follow-ups for project ${project.id} (${reason}), contact ${contactId}`);
    }
    console.log(`[Automations] Cancelled ${allDocCancelled.length} document follow-ups for contact ${contactId}`);
  }
}

export function getScheduleForCategory(category: string): Array<{ slug: string; delayMs: number }> {
  switch (category) {
    case 'lead_followup': return LEAD_FOLLOWUP_SCHEDULE;
    case 'followup_not_viewed': return DOC_NOT_VIEWED_SCHEDULE;
    case 'followup_viewed': return DOC_VIEWED_SCHEDULE;
    default: return [];
  }
}

export function getStepLabel(slug: string): string {
  const map: Record<string, string> = {
    lead_welcome: "Welcome message",
    lead_followup_2_hours: "Follow-up (2 hours)",
    lead_followup_1_day: "Follow-up (1 day)",
    lead_followup_2_days: "Follow-up (2 days)",
    lead_followup_5_days: "Follow-up (5 days)",
    lead_followup_9_days: "Follow-up (9 days)",
    lead_followup_15_days: "Follow-up (15 days)",
    lead_followup_30_days: "Follow-up (30 days)",
    followup_not_viewed_1_day: "Not viewed - 1 day",
    followup_not_viewed_2_days: "Not viewed - 2 days",
    followup_not_viewed_5_days: "Not viewed - 5 days",
    followup_not_viewed_9_days: "Not viewed - 9 days",
    followup_not_viewed_15_days: "Not viewed - 15 days",
    followup_not_viewed_21_days: "Not viewed - 21 days",
    followup_not_viewed_30_days: "Not viewed - 30 days",
    followup_viewed_1_day: "Viewed - 1 day",
    followup_viewed_2_days: "Viewed - 2 days",
    followup_viewed_5_days: "Viewed - 5 days",
    followup_viewed_9_days: "Viewed - 9 days",
    followup_viewed_15_days: "Viewed - 15 days",
    followup_viewed_21_days: "Viewed - 21 days",
    followup_viewed_30_days: "Viewed - 30 days",
  };
  return map[slug] || slug.replace(/_/g, " ");
}

export function getRemainingSteps(category: string, pausedStep: string): Array<{ slug: string; label: string; delayLabel: string }> {
  const schedule = getScheduleForCategory(category);
  if (schedule.length === 0) return [];
  const pausedIdx = schedule.findIndex(s => s.slug === pausedStep);
  if (pausedIdx === -1) return [];
  const remaining = schedule.slice(pausedIdx);

  let cumulativeDelay = 0;
  return remaining.map((item, idx) => {
    if (idx === 0) {
      const gap = pausedIdx > 0
        ? remaining[0].delayMs - schedule[pausedIdx - 1].delayMs
        : remaining[0].delayMs;
      cumulativeDelay = Math.max(gap, 24 * 60 * 60 * 1000);
    } else {
      const gap = remaining[idx].delayMs - remaining[idx - 1].delayMs;
      cumulativeDelay += gap;
    }
    const delDays = Math.round(cumulativeDelay / (24 * 60 * 60 * 1000));
    const delHours = Math.round(cumulativeDelay / (60 * 60 * 1000));
    let delayLabel: string;
    if (delDays >= 1) delayLabel = `+${delDays} day${delDays > 1 ? 's' : ''} after resume`;
    else if (delHours >= 1) delayLabel = `+${delHours} hour${delHours > 1 ? 's' : ''} after resume`;
    else delayLabel = "Sends shortly after resume";

    return {
      slug: item.slug,
      label: getStepLabel(item.slug),
      delayLabel,
    };
  });
}

export async function resumeAutomations(
  userId: string,
  projectId: number,
  pausedCategory: string,
  pausedStep: string,
  contactId: number,
  documentId?: number | null,
  firstStepScheduledFor?: Date | null
): Promise<{ scheduled: number; nextSlug: string | null }> {
  const schedule = getScheduleForCategory(pausedCategory);
  if (schedule.length === 0) return { scheduled: 0, nextSlug: null };

  const pausedIdx = schedule.findIndex(s => s.slug === pausedStep);
  if (pausedIdx === -1) return { scheduled: 0, nextSlug: null };

  const remaining = schedule.slice(pausedIdx);
  if (remaining.length === 0) return { scheduled: 0, nextSlug: null };

  const now = Date.now();
  const firstTime = firstStepScheduledFor ? firstStepScheduledFor.getTime() : null;

  let cumulativeDelay = 0;
  for (let i = 0; i < remaining.length; i++) {
    let scheduledTime: number;
    if (i === 0 && firstTime) {
      scheduledTime = firstTime;
    } else if (i === 0) {
      const gap = pausedIdx > 0
        ? remaining[0].delayMs - schedule[pausedIdx - 1].delayMs
        : remaining[0].delayMs;
      cumulativeDelay = Math.max(gap, 24 * 60 * 60 * 1000);
      scheduledTime = now + cumulativeDelay;
    } else {
      const gap = remaining[i].delayMs - remaining[i - 1].delayMs;
      if (i === 1 && firstTime) {
        scheduledTime = firstTime + gap;
      } else {
        cumulativeDelay += gap;
        scheduledTime = firstTime ? firstTime + (remaining[i].delayMs - remaining[0].delayMs) : now + cumulativeDelay;
      }
    }
    await storage.createScheduledAutomation({
      userId,
      contactId,
      projectId,
      documentId: documentId || null,
      templateSlug: remaining[i].slug,
      category: pausedCategory,
      channel: "both",
      status: "pending",
      scheduledFor: new Date(scheduledTime),
    });
  }

  await storage.updateProject(userId, projectId, {
    automationPausedReason: null,
    automationPausedAt: null,
    automationPausedCategory: null,
    automationPausedStep: null,
    automationPausedDocumentId: null,
  } as any);

  console.log(`[Automations] Resumed ${remaining.length} automations for project ${projectId} starting at ${pausedStep}${firstStepScheduledFor ? ` (first at ${firstStepScheduledFor.toISOString()})` : ''}`);
  return { scheduled: remaining.length, nextSlug: remaining[0].slug };
}

async function sendAutomationSms(
  settings: CompanySettings,
  to: string,
  body: string,
  contactId: number,
  userId: string
): Promise<boolean> {
  try {
    const { sendSms, canSendSms } = await import("./sms-provider.js");
    if (!canSendSms(settings)) {
      console.warn(`[Automations] SMS not configured for provider ${settings.phoneProvider || 'twilio'}`);
      return false;
    }
    const result = await sendSms(settings, { to, body });
    if (!result.success) {
      console.error(`[Automations] SMS send failed via ${result.provider}:`, result.error);
      return false;
    }
    await storage.createCommunication(userId, {
      contactId,
      phoneNumber: to,
      type: "sms",
      direction: "outbound",
      content: body,
      messageSid: result.sid || null,
    });
    return true;
  } catch (err: any) {
    console.error(`[Automations] SMS send failed:`, err.message);
    return false;
  }
}

async function sendAutomationEmail(
  settings: CompanySettings,
  to: string,
  subject: string,
  body: string,
  contactId: number,
  userId: string
): Promise<boolean> {
  try {
    const fromName = (settings.companyName && settings.companyName !== 'My Company') ? settings.companyName : "Fuse Phone";
    const htmlBody = wrapEmailInTemplate(body, {
      companyName: fromName,
      companyLicense: settings.companyLicense || undefined,
      companyLogo: settings.logo,
      companyPhone: settings.phone || undefined,
      companyEmail: settings.email || undefined,
      companyWebsite: settings.website || undefined,
      accentColor: settings.brandColor || undefined,
    });
    let result: { success: boolean; messageId?: string; error?: string };

    const hasUserEmail = settings.googleConnectedAt || settings.smtpConnectedAt;

    if (hasUserEmail) {
      try {
        const fallbackResult = await smtpEmail.sendEmailWithFallback(
          userId, to, subject, htmlBody, fromName,
          googleIntegration.sendEmail
        );
        result = fallbackResult;
        console.log(`[Automations] Email sent via user's ${fallbackResult.provider} for ${userId}`);
      } catch (userEmailErr: any) {
        console.warn(`[Automations] User email failed for ${userId}, falling back to system email:`, userEmailErr.message);
        result = await systemEmail.sendSystemEmail(to, subject, htmlBody, fromName);
      }
    } else {
      result = await systemEmail.sendSystemEmail(to, subject, htmlBody, fromName);
    }

    if (result.success) {
      await storage.createCommunication(userId, {
        contactId,
        phoneNumber: to,
        type: "email",
        direction: "outbound",
        content: body,
      });
    }
    return result.success;
  } catch (err: any) {
    console.error(`[Automations] Email send failed:`, err.message);
    return false;
  }
}

export async function forceProcessAutomation(userId: string, automationId: number): Promise<boolean> {
  const allPending = await db.select().from(scheduledAutomations)
    .where(and(
      eq(scheduledAutomations.id, automationId),
      eq(scheduledAutomations.userId, userId),
      eq(scheduledAutomations.status, 'pending')
    )).limit(1);
  
  if (allPending.length === 0) {
    console.log(`[Automations] Force-send: automation ${automationId} not found, not owned by user, or not pending`);
    return false;
  }
  
  const automation = allPending[0];
  await processOneAutomation(automation, true);
  return true;
}

export async function cancelAutomationById(userId: string, automationId: number): Promise<boolean> {
  const [existing] = await db.select().from(scheduledAutomations)
    .where(and(
      eq(scheduledAutomations.id, automationId),
      eq(scheduledAutomations.userId, userId),
      eq(scheduledAutomations.status, 'pending')
    )).limit(1);
  
  if (!existing) return false;
  await storage.markAutomationFailed(automationId, 'Cancelled by user');
  return true;
}

async function processOneAutomation(
  automation: ScheduledAutomation,
  skipBusinessHours: boolean = false
): Promise<void> {
  const { userId, contactId, documentId, templateSlug, channel } = automation;

  try {
    const contact = await storage.getContact(userId, contactId);
    if (!contact) {
      await storage.markAutomationFailed(automation.id, "Contact not found");
      return;
    }

    if (contact.pauseAutomations || contact.archived) {
      await storage.markAutomationFailed(
        automation.id,
        contact.archived ? "Contact is archived" : "Automations paused for contact"
      );
      return;
    }

    const template = await storage.getMessageTemplate(userId, templateSlug);
    if (!template || !template.isEnabled) {
      await storage.markAutomationFailed(
        automation.id,
        template ? "Template disabled" : "Template not found"
      );
      return;
    }

    const settings = await storage.getCompanySettings(userId);
    if (!settings) {
      await storage.markAutomationFailed(
        automation.id,
        "Company settings not found"
      );
      return;
    }

    if (!settings.companyName || settings.companyName === 'My Company') {
      await storage.markAutomationFailed(
        automation.id,
        "Company profile not configured - company name is still default. Please update your Company Profile in Settings."
      );
      console.warn(`[Automations] Skipping automation ${automation.id} for user ${userId}: company name is still default "My Company". User needs to update their Company Profile.`);
      return;
    }

    const isWelcomeMessage = templateSlug === 'lead_welcome';
    if (!skipBusinessHours && !isWelcomeMessage) {
      const nextWindow = getNextBusinessWindow(settings);
      if (nextWindow) {
        await storage.rescheduleAutomation(automation.id, nextWindow);
        console.log(`[Automations] Rescheduled automation ${automation.id} ("${templateSlug}") to business hours: ${nextWindow.toISOString()}`);
        return;
      }
    }

    const extras: Record<string, string> = {
      scheduled_date: "",
      scheduled_time: "",
      job_address: "",
    };

    if (automation.projectId) {
      try {
        const project = await storage.getProject(userId, automation.projectId);
        if (project) {
          if (project.scheduledDate) {
            try {
              const { format: fmtDate, parseISO: pISO } = await import('date-fns');
              extras.scheduled_date = fmtDate(pISO(project.scheduledDate), "EEEE, MMMM d, yyyy");
            } catch {
              extras.scheduled_date = project.scheduledDate;
            }
          }
          if (project.scheduledTime) {
            const timeOpts = project.scheduledTime.split(":");
            if (timeOpts.length >= 2) {
              const h = parseInt(timeOpts[0], 10);
              const m = parseInt(timeOpts[1], 10);
              if (!isNaN(h) && !isNaN(m)) {
                const ampm = h >= 12 ? "PM" : "AM";
                const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                extras.scheduled_time = `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
              } else {
                extras.scheduled_time = project.scheduledTime;
              }
            } else {
              extras.scheduled_time = project.scheduledTime;
            }
          }
          let addrParts = [project.jobAddress, project.jobCity, project.jobState].filter(Boolean);
          if (addrParts.length === 0 && project.contactId) {
            try {
              const contact = await storage.getContact(userId, project.contactId);
              if (contact) {
                addrParts = [contact.address, contact.city, contact.state].filter(Boolean);
              }
            } catch (e) {
              console.error(`[Automations] Failed to fetch contact address for project ${automation.projectId}:`, e);
            }
          }
          if (addrParts.length > 0) {
            extras.job_address = `Address: ${addrParts.join(', ')}`;
          } else {
            extras.job_address = '';
          }
        }
      } catch (e) {
        console.error(`[Automations] Failed to fetch project ${automation.projectId} for template vars:`, e);
      }
    }

    if (documentId) {
      const doc = await storage.getDocument(userId, documentId);
      if (doc) {
        const completedStatuses = ['accepted', 'paid', 'rejected'];
        if (completedStatuses.includes(doc.status) || doc.signedAt) {
          await storage.markAutomationFailed(
            automation.id,
            `Document already ${doc.status}${doc.signedAt ? ' (signed)' : ''} — skipping follow-up`
          );
          await storage.cancelAutomations(userId, { documentId });
          console.log(
            `[Automations] Skipped and cancelled follow-ups for document ${documentId} — status: ${doc.status}, signed: ${!!doc.signedAt}`
          );
          return;
        }

        const portalUrl = getDocumentPortalUrl(settings, doc);
        const typeMap: Record<string, string> = {
          proposal: "proposal",
          estimate: "estimate",
          invoice: "invoice",
          change_order: "change order",
        };
        extras.document_type = typeMap[doc.type] || doc.type;
        extras.proposal_link = portalUrl;
        extras.estimate_link = portalUrl;
        extras.invoice_link = portalUrl;
        extras.change_order_link = portalUrl;
        extras.document_link = portalUrl;
        if (doc.totalAmount) {
          extras.amount = (doc.totalAmount / 100).toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
          });
        }
      }
    }

    const vars = buildTemplateVars(contact, settings, extras);
    let smsSent = false;
    let emailSent = false;

    const tier = await getUserTier(userId);
    const effectiveChannel = tier === 'elite' ? channel : 'email';

    if ((effectiveChannel === "sms" || effectiveChannel === "both") && contact.phone) {
      const smsBody = replaceTemplateVars(template.content, vars);
      if (smsBody.trim()) {
        smsSent = await sendAutomationSms(
          settings,
          contact.phone,
          smsBody,
          contactId,
          userId
        );
      }
    }

    if ((channel === "email" || channel === "both") && contact.email) {
      const emailSubject = replaceTemplateVars(
        template.emailSubject || "",
        vars
      );
      const emailBody = replaceTemplateVars(template.emailContent || "", vars);
      if (emailSubject.trim() && emailBody.trim()) {
        emailSent = await sendAutomationEmail(
          settings,
          contact.email,
          emailSubject,
          emailBody,
          contactId,
          userId
        );
      }
    }

    if (smsSent || emailSent) {
      await storage.markAutomationSent(automation.id);
      console.log(
        `[Automations] Sent "${templateSlug}" to contact ${contactId} (sms:${smsSent}, email:${emailSent})`
      );
    } else if (!contact.phone && !contact.email) {
      await storage.markAutomationFailed(
        automation.id,
        "Contact has no phone or email"
      );
    } else {
      await storage.markAutomationFailed(
        automation.id,
        "All send channels failed"
      );
    }
  } catch (err: any) {
    console.error(
      `[Automations] Error processing automation ${automation.id}:`,
      err.message
    );
    await storage.markAutomationFailed(automation.id, err.message);
  }
}

let automationInterval: ReturnType<typeof setInterval> | null = null;

async function processScheduledMessages(): Promise<void> {
  try {
    const due = await storage.getDueScheduledMessages();
    if (due.length === 0) return;
    console.log(`[ScheduledMessages] Processing ${due.length} due messages`);
    for (const msg of due) {
      try {
        const settings = await storage.getCompanySettings(msg.userId);
        if (!settings) {
          await storage.markScheduledMessageFailed(msg.id, 'Settings not found');
          continue;
        }

        let smsSent = false;
        let emailSent = false;

        if (msg.phoneNumber && msg.body) {
          const { sendSms, canSendSms } = await import("./sms-provider.js");
          if (!canSendSms(settings)) {
            console.log(`[ScheduledMessages] SMS provider not configured for message ${msg.id}`);
          } else {
            const result = await sendSms(settings, {
              to: msg.phoneNumber,
              body: msg.body,
              mediaUrl: msg.mediaUrl ? [msg.mediaUrl] : undefined,
            });
            if (result.success) {
              smsSent = true;
              if (msg.contactId) {
                await storage.createCommunication(msg.userId, {
                  contactId: msg.contactId,
                  type: 'sms',
                  direction: 'outbound',
                  content: msg.body,
                });
              }
              console.log(`[ScheduledMessages] Sent SMS ${msg.id} to ${msg.phoneNumber}`);
            } else {
              console.error(`[ScheduledMessages] SMS failed for ${msg.id}: ${result.error}`);
            }
          }
        }

        if (msg.emailTo && msg.emailSubject && msg.emailBody) {
          try {
            let htmlBody = msg.emailBody;
            htmlBody = wrapEmailInTemplate(htmlBody, {
              companyName: settings?.companyName || msg.emailFromName || '',
              companyLicense: settings?.companyLicense || undefined,
              companyLogo: settings?.logo,
              companyPhone: settings?.phone || undefined,
              companyEmail: settings?.email || undefined,
              companyWebsite: settings?.website || undefined,
              ctaText: msg.emailCtaText || undefined,
              ctaUrl: msg.emailCtaUrl || undefined,
              accentColor: settings?.brandColor || undefined,
            });
            await smtpEmail.sendEmailWithFallback(
              msg.userId, msg.emailTo, msg.emailSubject, htmlBody, msg.emailFromName || undefined,
              googleIntegration.sendEmail
            );
            emailSent = true;
            if (msg.contactId) {
              await storage.createCommunication(msg.userId, {
                contactId: msg.contactId,
                type: 'email',
                direction: 'outbound',
                content: msg.emailBody,
              });
            }
            console.log(`[ScheduledMessages] Sent email ${msg.id} to ${msg.emailTo}`);
          } catch (emailErr: any) {
            console.error(`[ScheduledMessages] Email failed for ${msg.id}: ${emailErr.message}`);
          }
        }

        if (smsSent || emailSent) {
          await storage.markScheduledMessageSent(msg.id);
        } else if (!msg.phoneNumber && !msg.emailTo) {
          await storage.markScheduledMessageFailed(msg.id, 'No phone number or email configured');
        } else {
          await storage.markScheduledMessageFailed(msg.id, 'All delivery methods failed');
        }
      } catch (err: any) {
        console.error(`[ScheduledMessages] Failed to send message ${msg.id}:`, err.message);
        await storage.markScheduledMessageFailed(msg.id, err.message);
      }
    }
  } catch (err: any) {
    console.error("[ScheduledMessages] Runner error:", err.message);
  }
}

async function processAppointmentReminders(): Promise<void> {
  try {
    const now = new Date();
    const dueReminders = await db.select().from(appointmentReminders)
      .where(and(
        eq(appointmentReminders.fired, false),
        lte(appointmentReminders.fireAt, now)
      ));

    if (dueReminders.length === 0) return;

    console.log(`[AppointmentReminders] Processing ${dueReminders.length} due reminders`);

    const apptIds = [...new Set(dueReminders.map(r => r.appointmentId))];
    const apptRows = await db.select().from(appointments).where(inArray(appointments.id, apptIds));
    const apptMap = new Map(apptRows.map(a => [a.id, a]));

    for (const reminder of dueReminders) {
      try {
        const appt = apptMap.get(reminder.appointmentId);
        if (!appt || appt.status === 'cancelled') {
          await db.update(appointmentReminders).set({ fired: true }).where(eq(appointmentReminders.id, reminder.id));
          continue;
        }

        let contact: Contact | undefined;
        try {
          contact = await storage.getContact(reminder.userId, appt.contactId);
        } catch {}

        const contactName = contact?.name || contact?.firstName || 'Customer';
        const mins = reminder.minutesBefore;
        let timeLabel: string;
        if (mins < 60) timeLabel = `${mins} minute${mins > 1 ? 's' : ''}`;
        else if (mins < 1440) {
          const hrs = Math.round(mins / 60);
          timeLabel = `${hrs} hour${hrs > 1 ? 's' : ''}`;
        } else {
          const days = Math.round(mins / 1440);
          timeLabel = `${days} day${days > 1 ? 's' : ''}`;
        }

        let formattedDate = appt.date;
        try {
          const { format: fmtDate, parseISO } = await import('date-fns');
          formattedDate = fmtDate(parseISO(appt.date), 'EEEE, MMM d');
        } catch {}

        let formattedTime = '';
        if (appt.time) {
          try {
            const [h, m] = appt.time.split(':').map(Number);
            const period = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            formattedTime = `${h12}:${String(m).padStart(2, '0')} ${period}`;
          } catch {}
        }

        const typeLabels: Record<string, string> = {
          estimate: 'Estimate',
          payment: 'Payment Pickup',
          walkthrough: 'Walkthrough',
          site_visit: 'Site Visit',
          consultation: 'Consultation',
          follow_up: 'Follow-Up',
          other: 'Appointment',
        };
        const typeLabel = typeLabels[appt.type] || appt.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        const title = `📅 ${typeLabel} in ${timeLabel}`;
        const message = `${contactName} — ${formattedDate}${formattedTime ? ` at ${formattedTime}` : ''}`;

        let settings: any = null;
        try { settings = await storage.getCompanySettings(reminder.userId); } catch {}
        const companyName = settings?.companyName || '';

        await db.insert(notifications).values({
          userId: reminder.userId,
          type: 'appointment_reminder',
          title,
          message,
          link: `/calendar`,
          metadata: { appointmentId: appt.id, contactId: appt.contactId, minutesBefore: mins },
        });

        const pushBody = appt.notes
          ? `${message}\n${appt.notes.substring(0, 80)}`
          : message;
        try {
          await sendPushToUser(reminder.userId, {
            title,
            body: pushBody,
            url: '/calendar',
            tag: `appt-reminder-${appt.id}-${mins}`,
          });
        } catch {}

        await db.update(appointmentReminders).set({ fired: true }).where(eq(appointmentReminders.id, reminder.id));
        console.log(`[AppointmentReminders] Fired reminder ${reminder.id} for appointment ${appt.id}`);
      } catch (err: any) {
        console.error(`[AppointmentReminders] Failed to process reminder ${reminder.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error("[AppointmentReminders] Runner error:", err.message);
  }
}

function parseScheduledTimeToHoursMinutes(timeStr: string): { hours: number; minutes: number } {
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!match) return { hours: 0, minutes: 0 };
  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const ampm = match[3];
  if (ampm) {
    if (ampm.toUpperCase() === 'PM' && hours !== 12) hours += 12;
    if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
  }
  return { hours, minutes };
}

async function autoAdvanceScheduledToInProgress(): Promise<void> {
  try {
    const now = new Date();
    const allScheduled = await db
      .select()
      .from(projects)
      .where(eq(projects.stage, 'scheduled'));

    for (const project of allScheduled) {
      if (!project.scheduledDate) continue;

      const settings = await storage.getCompanySettings(project.userId);
      const tz = settings?.timezone || 'America/New_York';

      const nowInTz = now.toLocaleString('en-CA', { timeZone: tz, hour12: false });
      const [nowDateStr, nowTimeStr] = nowInTz.split(', ');
      const nowDate = nowDateStr.trim();
      const nowTimeParts = (nowTimeStr || '00:00:00').trim().split(':');
      const nowMinutes = parseInt(nowTimeParts[0]) * 60 + parseInt(nowTimeParts[1]);

      const schedDate = project.scheduledDate;
      let schedMinutes = 0;
      if (project.scheduledTime) {
        const parsed = parseScheduledTimeToHoursMinutes(project.scheduledTime);
        schedMinutes = parsed.hours * 60 + parsed.minutes;
      }

      const shouldAdvance = nowDate > schedDate || (nowDate === schedDate && nowMinutes >= schedMinutes);

      if (shouldAdvance) {
        await storage.updateProject(project.userId, project.id, {
          stage: 'in_progress',
          automationPausedReason: null,
          automationPausedAt: null,
          automationPausedCategory: null,
          automationPausedStep: null,
          automationPausedDocumentId: null,
        } as any);

        await storage.createProjectActivity(project.userId, {
          projectId: project.id,
          type: 'stage_change',
          content: 'Stage automatically changed to In Progress (scheduled start date reached)',
        });

        const cancelledReminders = await storage.cancelAutomations(project.userId, {
          projectId: project.id,
          category: 'jobs',
        });
        if (cancelledReminders.length > 0) {
          console.log(`[Automations] Cancelled ${cancelledReminders.length} pending day-before reminder(s) for project ${project.id} (job now in progress)`);
        }

        console.log(`[Automations] Auto-advanced project ${project.id} from scheduled to in_progress`);
      }
    }
  } catch (err: any) {
    console.error("[Automations] Auto-advance scheduled projects error:", err.message);
  }
}

async function autoCompletePastAppointments(): Promise<void> {
  try {
    const { format: fmtDate } = await import('date-fns');
    const today = fmtDate(new Date(), 'yyyy-MM-dd');
    const pastScheduled = await db
      .update(appointments)
      .set({ status: 'completed' })
      .where(and(eq(appointments.status, 'scheduled'), lt(appointments.date, today)))
      .returning({ id: appointments.id });
    if (pastScheduled.length > 0) {
      console.log(`[Automations] Auto-completed ${pastScheduled.length} past appointments`);
    }
  } catch (err: any) {
    console.error("[Automations] Auto-complete appointments error:", err.message);
  }
}

const STAGE_ORDER = ['new_lead', 'appointment_requested', 'draft', 'proposal_sent', 'accepted', 'scheduled', 'in_progress', 'invoiced', 'paid', 'completed', 'lost'];

async function autoFixProjectStages(): Promise<void> {
  try {
    const stuckProjects = await db
      .select({
        id: projects.id,
        userId: projects.userId,
        stage: projects.stage,
        title: projects.title,
      })
      .from(projects)
      .where(and(
        ne(projects.stage, 'completed'),
        ne(projects.stage, 'lost'),
        eq(projects.archived, false),
      ));

    for (const project of stuckProjects) {
      const projectDocs = await db
        .select({
          id: documents.id,
          type: documents.type,
          status: documents.status,
          signature: documents.signature,
          firstViewedAt: documents.firstViewedAt,
        })
        .from(documents)
        .where(eq(documents.projectId, project.id));

      if (projectDocs.length === 0) continue;

      let correctStage = project.stage;
      const currentIdx = STAGE_ORDER.indexOf(project.stage);

      const hasAcceptedProposal = projectDocs.some(
        d => ['proposal', 'estimate'].includes(d.type) && d.status === 'accepted' && d.signature
      );
      const hasPaidInvoice = projectDocs.some(
        d => d.type === 'invoice' && d.status === 'paid'
      );
      const hasSentInvoice = projectDocs.some(
        d => d.type === 'invoice' && d.status === 'sent'
      );
      const hasSentProposal = projectDocs.some(
        d => ['proposal', 'estimate'].includes(d.type) && (d.status === 'sent' || d.status === 'viewed' || d.firstViewedAt)
      );

      if (hasPaidInvoice) {
        const paidIdx = STAGE_ORDER.indexOf('paid');
        if (currentIdx < paidIdx) correctStage = 'paid';
      } else if (hasSentInvoice) {
        const invoicedIdx = STAGE_ORDER.indexOf('invoiced');
        if (currentIdx < invoicedIdx) correctStage = 'invoiced';
      } else if (hasAcceptedProposal) {
        const acceptedIdx = STAGE_ORDER.indexOf('accepted');
        if (currentIdx < acceptedIdx) correctStage = 'accepted';
      } else if (hasSentProposal) {
        const sentIdx = STAGE_ORDER.indexOf('proposal_sent');
        if (currentIdx < sentIdx) correctStage = 'proposal_sent';
      }

      if (correctStage !== project.stage) {
        await storage.updateProject(project.userId, project.id, {
          stage: correctStage,
          automationPausedReason: null,
          automationPausedAt: null,
          automationPausedCategory: null,
          automationPausedStep: null,
          automationPausedDocumentId: null,
        } as any);

        await storage.createProjectActivity(project.userId, {
          projectId: project.id,
          type: 'stage_change',
          content: `Stage auto-corrected from ${project.stage} to ${correctStage} (based on document status)`,
        });

        emitToUser(project.userId, project.userId, { type: "project.updated", tenantId: project.userId, projectId: project.id });
        emitToUser(project.userId, project.userId, { type: "dashboard.refresh", tenantId: project.userId });

        console.log(`[Automations] Auto-fixed project ${project.id} "${project.title}" from ${project.stage} → ${correctStage}`);
      }
    }
  } catch (err: any) {
    console.error("[Automations] Auto-fix project stages error:", err.message);
  }
}

const crewRemindersSentToday = new Set<string>();

function parseCurrentTimeMins(now: Date, tz: string): number {
  const nowInTz = now.toLocaleString('en-US', { timeZone: tz, hour12: false });
  const timePart = nowInTz.includes(', ') ? nowInTz.split(', ')[1] : nowInTz;
  const nowTimeParts = (timePart || '00:00:00').trim().split(':');
  return (parseInt(nowTimeParts[0] || '0') || 0) * 60 + (parseInt(nowTimeParts[1] || '0') || 0);
}

function parseStartTimeMins(startTime: string | null): number {
  if (!startTime || typeof startTime !== 'string' || !startTime.includes(':')) return 7 * 60;
  const parts = startTime.split(':').map(Number);
  const h = parts[0];
  const m = parts[1];
  if (!Number.isFinite(h) || h < 0 || h > 23) return 7 * 60;
  const validM = Number.isFinite(m) && m >= 0 && m < 60 ? m : 0;
  return h * 60 + validM;
}

function getDateInTimezone(now: Date, tz: string): string {
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: tz });
  return dateStr;
}

function getTomorrowInTimezone(now: Date, tz: string): string {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return tomorrow.toLocaleDateString('en-CA', { timeZone: tz });
}

function isInWindow(nowMins: number, windowStart: number, windowEnd: number): boolean {
  return nowMins >= windowStart && nowMins < windowEnd;
}

async function processCrewEveningReminders(): Promise<void> {
  try {
    const now = new Date();
    const todayStr = getDateInTimezone(now, 'America/New_York');
    const tomorrowStr = getTomorrowInTimezone(now, 'America/New_York');

    const tomorrowSchedules = await db.select({
      projectId: jobScheduleDates.projectId,
      userId: jobScheduleDates.userId,
      startTime: jobScheduleDates.startTime,
      date: jobScheduleDates.date,
    }).from(jobScheduleDates).where(eq(jobScheduleDates.date, tomorrowStr));

    const tomorrowProjects = await db.select({
      id: projects.id,
      title: projects.title,
      userId: projects.userId,
      scheduledDate: projects.scheduledDate,
      scheduledTime: projects.scheduledTime,
      address: projects.jobAddress,
    }).from(projects).where(and(
      eq(projects.scheduledDate, tomorrowStr),
      inArray(projects.stage, ['scheduled', 'in_progress'])
    ));

    const scheduleIds = tomorrowSchedules ? tomorrowSchedules.map(s => s.projectId).filter(Boolean) : [];
    const projectIds = tomorrowProjects ? tomorrowProjects.map(p => p.id).filter(Boolean) : [];
    const allProjectIds = [...new Set([...scheduleIds, ...projectIds])];

    if (allProjectIds.length === 0) return;

    for (const projectId of allProjectIds) {
      try {
        const project = tomorrowProjects?.find(p => p.id === projectId);
        const scheduleEntry = tomorrowSchedules?.find(s => s.projectId === projectId);
        const ownerId = project?.userId || scheduleEntry?.userId;
        if (!ownerId) continue;

        let tz = 'America/New_York';
        try {
          const settings = await storage.getCompanySettings(ownerId);
          if (settings?.timezone) tz = settings.timezone;
        } catch {}

        let nowTotalMins = 0;
        try {
          nowTotalMins = parseCurrentTimeMins(now, tz);
        } catch {
          continue;
        }

        const eveningStart = 20 * 60;
        const eveningEnd = 20 * 60 + 5;
        if (!isInWindow(nowTotalMins, eveningStart, eveningEnd)) continue;

        const assignments = await db.select({
          linkedUserId: teamMembers.linkedUserId,
          teamMemberId: teamMembers.id,
        }).from(projectCrewAssignments)
          .innerJoin(teamMembers, eq(projectCrewAssignments.teamMemberId, teamMembers.id))
          .where(eq(projectCrewAssignments.projectId, projectId));

        if (!assignments || assignments.length === 0) continue;

        const projectTitle = project?.title || `Project #${projectId}`;
        const startTime = scheduleEntry?.startTime || project?.scheduledTime || null;
        const timeLabel = startTime ? ` at ${startTime.replace(/^0/, '')}` : '';
        const address = project?.address ? `\n📍 ${project.address}` : '';

        for (const assignment of assignments) {
          try {
            const crewUserId = assignment.linkedUserId;
            if (!crewUserId) continue;

            const reminderKey = `${todayStr}:${projectId}:${crewUserId}:evening`;
            if (crewRemindersSentToday.has(reminderKey)) continue;

            await sendPushToUser(crewUserId, {
              title: `🗓️ Tomorrow: ${projectTitle}`,
              body: `You're working tomorrow${timeLabel}${address}\nMake sure to plan your parking and route!`,
              url: `/field-worker/jobs/${projectId}`,
              tag: `crew-evening-${projectId}`,
              isTimeSensitive: false,
            });
            crewRemindersSentToday.add(reminderKey);
            console.log(`[Automations] Crew evening reminder sent to user ${crewUserId} for project ${projectId} (tomorrow)`);
          } catch (assignErr: any) {
            console.error(`[Automations] Crew evening reminder failed for project ${projectId}:`, assignErr?.message);
          }
        }
      } catch (projErr: any) {
        console.error(`[Automations] Crew evening reminder error for project ${projectId}:`, projErr?.message, projErr?.stack);
      }
    }
  } catch (err: any) {
    console.error("[Automations] Crew evening reminders error:", err?.message, err?.stack);
  }
}

async function processCrewDayOfReminders(): Promise<void> {
  try {
    const now = new Date();
    const todayStr = getDateInTimezone(now, 'America/New_York');

    const todaySchedules = await db.select({
      projectId: jobScheduleDates.projectId,
      userId: jobScheduleDates.userId,
      startTime: jobScheduleDates.startTime,
      endTime: jobScheduleDates.endTime,
      date: jobScheduleDates.date,
    }).from(jobScheduleDates).where(eq(jobScheduleDates.date, todayStr));

    const scheduledProjects = await db.select({
      id: projects.id,
      title: projects.title,
      userId: projects.userId,
      scheduledDate: projects.scheduledDate,
      scheduledTime: projects.scheduledTime,
      scheduledEndTime: projects.scheduledEndTime,
      address: projects.jobAddress,
    }).from(projects).where(and(
      eq(projects.scheduledDate, todayStr),
      inArray(projects.stage, ['scheduled', 'in_progress'])
    ));

    const scheduleIds = todaySchedules ? todaySchedules.map(s => s.projectId).filter(Boolean) : [];
    const projectIds = scheduledProjects ? scheduledProjects.map(p => p.id).filter(Boolean) : [];
    const allProjectIds = [...new Set([...scheduleIds, ...projectIds])];

    if (allProjectIds.length === 0) return;

    for (const projectId of allProjectIds) {
      try {
        const assignments = await db.select({
          linkedUserId: teamMembers.linkedUserId,
          teamMemberId: teamMembers.id,
          memberName: teamMembers.name,
        }).from(projectCrewAssignments)
          .innerJoin(teamMembers, eq(projectCrewAssignments.teamMemberId, teamMembers.id))
          .where(eq(projectCrewAssignments.projectId, projectId));

        if (!assignments || assignments.length === 0) continue;

        const project = scheduledProjects?.find(p => p.id === projectId);
        const scheduleEntry = todaySchedules?.find(s => s.projectId === projectId);
        const projectTitle = project?.title || `Project #${projectId}`;
        const startTime = scheduleEntry?.startTime || project?.scheduledTime || null;
        const ownerId = project?.userId || scheduleEntry?.userId;
        if (!ownerId) continue;

        let tz = 'America/New_York';
        try {
          const settings = await storage.getCompanySettings(ownerId);
          if (settings?.timezone) tz = settings.timezone;
        } catch (settingsErr: any) {
          console.error(`[Automations] Failed to get settings for owner ${ownerId}:`, settingsErr?.message);
        }

        let nowTotalMins = 0;
        try {
          nowTotalMins = parseCurrentTimeMins(now, tz);
        } catch (tzErr: any) {
          console.error(`[Automations] Timezone parse error for tz=${tz}:`, tzErr?.message);
          continue;
        }

        const startTotalMins = parseStartTimeMins(startTime);
        const endTime = scheduleEntry?.endTime || project?.scheduledEndTime || null;
        const endTotalMins = endTime ? parseStartTimeMins(endTime) : 0;

        const morningStart = 7 * 60;
        const morningEnd = 7 * 60 + 5;
        const headingOutStart = startTotalMins - 15;
        const headingOutEnd = headingOutStart + 5;

        const clockInReminders: { type: string; start: number; end: number; title: string; bodyFn: (label: string, addr: string) => string; notifyOwner?: boolean; ownerMsg?: (memberName: string, mins: number) => string; }[] = [
          { type: 'clock_in', start: startTotalMins, end: startTotalMins + 2,
            title: '⏰ Time to clock in!',
            bodyFn: (label, addr) => `${projectTitle} starts now${addr}. Open the app and clock in!`,
            notifyOwner: true,
            ownerMsg: (name, _) => `${name} hasn't clocked in yet for ${projectTitle}. Start time was just now.` },
          { type: 'clock_in_late1', start: startTotalMins + 3, end: startTotalMins + 4,
            title: '🚨 You haven\'t clocked in yet!',
            bodyFn: (label, addr) => `${projectTitle} started 3 minutes ago${addr}. Please clock in now!`,
            notifyOwner: true,
            ownerMsg: (name, _) => `${name} still hasn't clocked in — 3 minutes late for ${projectTitle}.` },
          { type: 'clock_in_late2', start: startTotalMins + 7, end: startTotalMins + 8,
            title: '🚨 Clock in now — you\'re late!',
            bodyFn: (label, addr) => `${projectTitle} started 7 minutes ago${addr}. Clock in immediately or contact the office.`,
            notifyOwner: true,
            ownerMsg: (name, _) => `${name} is 7 minutes late for ${projectTitle} and hasn't clocked in.` },
          { type: 'clock_in_late3', start: startTotalMins + 10, end: startTotalMins + 11,
            title: '❗ Still not clocked in!',
            bodyFn: (label, addr) => `You're 10 minutes late for ${projectTitle}${addr}. Please clock in or call the office right away.`,
            notifyOwner: true,
            ownerMsg: (name, _) => `⚠️ ${name} is 10 minutes late and still not clocked in for ${projectTitle}. Please follow up.` },
        ];

        const effectiveEndMins = endTotalMins > 0 ? endTotalMins : (startTotalMins > 0 ? startTotalMins + 540 : 0);
        const clockOutReminders: { type: string; start: number; end: number; title: string; bodyFn: (title: string) => string; notifyOwner?: boolean; ownerMsg?: (memberName: string) => string; }[] = effectiveEndMins > 0 ? [
          { type: 'clock_out_1', start: effectiveEndMins, end: effectiveEndMins + 2,
            title: '🕐 Time to clock out!',
            bodyFn: (t) => `Your shift for ${t} is over. Don't forget to clock out!`,
            notifyOwner: true,
            ownerMsg: (name) => `${name}'s shift for ${projectTitle} just ended. They haven't clocked out yet.` },
          { type: 'clock_out_2', start: effectiveEndMins + 3, end: effectiveEndMins + 4,
            title: '🕐 Don\'t forget to clock out!',
            bodyFn: (t) => `Your shift for ${t} ended 3 minutes ago. Please clock out now.`,
            notifyOwner: true,
            ownerMsg: (name) => `${name} still hasn't clocked out — shift for ${projectTitle} ended 3 minutes ago.` },
          { type: 'clock_out_3', start: effectiveEndMins + 7, end: effectiveEndMins + 8,
            title: '🕐 Clock out reminder!',
            bodyFn: (t) => `Your shift for ${t} ended 7 minutes ago. Please clock out.`,
            notifyOwner: true,
            ownerMsg: (name) => `${name} hasn't clocked out for ${projectTitle} — 7 minutes past end of shift.` },
          { type: 'clock_out_4', start: effectiveEndMins + 10, end: effectiveEndMins + 11,
            title: '❗ Clock out now!',
            bodyFn: (t) => `You're still clocked in to ${t} — shift ended 10 minutes ago. Clock out immediately.`,
            notifyOwner: true,
            ownerMsg: (name) => `⚠️ ${name} is still clocked in 10 minutes after shift ended for ${projectTitle}.` },
        ] : [];

        const activeReminders: { type: string; title: string; body: string; sensitive: boolean; isClockOut: boolean; notifyOwner?: boolean; ownerMsg?: string; }[] = [];

        if (isInWindow(nowTotalMins, morningStart, morningEnd)) {
          const timeLabel = startTime ? ` at ${startTime.replace(/^0/, '')}` : '';
          const address = project?.address ? ` - ${project.address}` : '';
          activeReminders.push({ type: 'morning', title: `📋 Today's Job: ${projectTitle}`, body: `You're scheduled today${timeLabel}${address}`, sensitive: false, isClockOut: false });
        }
        if (startTotalMins > morningEnd && isInWindow(nowTotalMins, headingOutStart, headingOutEnd)) {
          const timeLabel = startTime ? ` at ${startTime.replace(/^0/, '')}` : '';
          const address = project?.address ? ` - ${project.address}` : '';
          activeReminders.push({ type: 'heading_out', title: `🚗 Head out! ${projectTitle}`, body: `Your clock-in time${timeLabel} is getting closer${address}`, sensitive: true, isClockOut: false });
        }

        const timeLabel = startTime ? ` at ${startTime.replace(/^0/, '')}` : '';
        const address = project?.address ? ` - ${project.address}` : '';
        for (const r of clockInReminders) {
          if (isInWindow(nowTotalMins, r.start, r.end)) {
            activeReminders.push({ type: r.type, title: r.title, body: r.bodyFn(timeLabel, address), sensitive: true, isClockOut: false, notifyOwner: r.notifyOwner, ownerMsg: '__CLOCK_IN__' });
          }
        }
        for (const r of clockOutReminders) {
          if (isInWindow(nowTotalMins, r.start, r.end)) {
            activeReminders.push({ type: r.type, title: r.title, body: r.bodyFn(projectTitle), sensitive: true, isClockOut: true, notifyOwner: r.notifyOwner, ownerMsg: '__CLOCK_OUT__' });
          }
        }

        if (activeReminders.length === 0) continue;

        const clockInReminderMap = new Map(clockInReminders.map(r => [r.type, r]));
        const clockOutReminderMap = new Map(clockOutReminders.map(r => [r.type, r]));

        for (const reminder of activeReminders) {
          for (const assignment of assignments) {
            try {
              const crewUserId = assignment.linkedUserId;
              if (!crewUserId) continue;

              const reminderKey = `${todayStr}:${projectId}:${crewUserId}:${reminder.type}`;
              if (crewRemindersSentToday.has(reminderKey)) continue;

              if (reminder.isClockOut) {
                const activeClockIn = await storage.getActiveTimeEntry(ownerId, assignment.teamMemberId);
                if (!activeClockIn || activeClockIn.projectId !== projectId) {
                  crewRemindersSentToday.add(reminderKey);
                  continue;
                }
              } else if (reminder.type !== 'morning' && reminder.type !== 'heading_out') {
                const todayStart = new Date(todayStr + 'T00:00:00');
                const todayEnd = new Date(todayStr + 'T23:59:59');
                const clockedIn = await db.select({ id: timeEntries.id }).from(timeEntries)
                  .where(and(
                    eq(timeEntries.teamMemberId, assignment.teamMemberId),
                    eq(timeEntries.projectId, projectId),
                    gte(timeEntries.clockIn, todayStart),
                    lte(timeEntries.clockIn, todayEnd),
                  )).limit(1);
                if (clockedIn && clockedIn.length > 0) {
                  crewRemindersSentToday.add(reminderKey);
                  continue;
                }
              }

              await sendPushToUser(crewUserId, {
                title: reminder.title,
                body: reminder.body,
                url: `/field-worker/jobs/${projectId}`,
                tag: `crew-reminder-${reminder.type}-${projectId}`,
                isTimeSensitive: reminder.sensitive,
              });
              crewRemindersSentToday.add(reminderKey);
              console.log(`[Automations] Crew ${reminder.type} reminder sent to user ${crewUserId} for project ${projectId}`);

              if (reminder.notifyOwner && ownerId) {
                const ownerKey = `${todayStr}:${projectId}:owner:${reminder.type}:${assignment.teamMemberId}`;
                if (!crewRemindersSentToday.has(ownerKey)) {
                  const memberName = assignment.memberName || 'A crew member';
                  let ownerBody = '';
                  if (reminder.ownerMsg === '__CLOCK_IN__') {
                    const ciReminder = clockInReminderMap.get(reminder.type);
                    ownerBody = ciReminder?.ownerMsg ? ciReminder.ownerMsg(memberName, 0) : `${memberName} hasn't clocked in for ${projectTitle}.`;
                  } else if (reminder.ownerMsg === '__CLOCK_OUT__') {
                    const coReminder = clockOutReminderMap.get(reminder.type);
                    ownerBody = coReminder?.ownerMsg ? coReminder.ownerMsg(memberName) : `${memberName} hasn't clocked out for ${projectTitle}.`;
                  }

                  setTimeout(async () => {
                    try {
                      await sendPushToUser(ownerId, {
                        title: reminder.isClockOut ? `🕐 ${memberName} — Clock Out` : `🚨 ${memberName} — Not Clocked In`,
                        body: ownerBody,
                        url: `/projects/${projectId}`,
                        tag: `owner-crew-${reminder.type}-${projectId}-${assignment.teamMemberId}`,
                        isTimeSensitive: true,
                      });
                      console.log(`[Automations] Owner notified about ${memberName} ${reminder.type} for project ${projectId}`);
                    } catch (ownerErr: any) {
                      console.error(`[Automations] Owner notification failed:`, ownerErr?.message);
                    }
                  }, 60000);
                  crewRemindersSentToday.add(ownerKey);
                }
              }
            } catch (assignErr: any) {
              console.error(`[Automations] Crew reminder failed for assignment in project ${projectId}:`, assignErr?.message);
            }
          }
        }
      } catch (projErr: any) {
        console.error(`[Automations] Crew reminder error for project ${projectId}:`, projErr?.message, projErr?.stack);
      }
    }
  } catch (err: any) {
    console.error("[Automations] Crew day-of reminders error:", err?.message, err?.stack);
  }
}

async function processTrialEndingReminders(): Promise<void> {
  try {
    const { sendSystemEmail } = await import('./systemEmail.js');
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const oneDayFromNow = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);

    const trialingUsers = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      trialEndsAt: users.trialEndsAt,
      subscriptionTier: users.subscriptionTier,
    }).from(users)
      .where(and(
        eq(users.subscriptionStatus, 'trialing'),
        gt(users.trialEndsAt, oneDayFromNow),
        lte(users.trialEndsAt, twoDaysFromNow),
      ));

    for (const u of trialingUsers) {
      if (!u.email || !u.trialEndsAt) continue;

      if (u.id.startsWith('test-') || u.email.endsWith('@test.com')) continue;

      const existing = await db.select({ id: notifications.id })
        .from(notifications)
        .where(and(
          eq(notifications.userId, u.id),
          eq(notifications.type, 'trial_ending_reminder'),
        ))
        .limit(1);
      if (existing.length > 0) continue;

      const tierLabel = u.subscriptionTier === 'early_access' ? 'Early Access' :
        u.subscriptionTier === 'elite' ? 'Elite' :
        u.subscriptionTier === 'starter' ? 'Starter' : 'Core';
      const endDate = new Date(u.trialEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const name = u.firstName || 'there';

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="font-size: 24px; color: #1a1a1a; margin: 0;">Fuse Phone</h1>
          </div>
          <h2 style="font-size: 20px; color: #1a1a1a;">Hey ${name},</h2>
          <p style="font-size: 15px; color: #444; line-height: 1.6;">
            Your <strong>FusePhone ${tierLabel}</strong> trial ends on <strong>${endDate}</strong>.
          </p>
          <p style="font-size: 15px; color: #444; line-height: 1.6;">
            To keep using all your features — proposals, scheduling, crew management, and more — subscribe before your trial expires.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="https://app.fusephone.com/billing" style="background-color: #2563eb; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
              Subscribe Now
            </a>
          </div>
          <p style="font-size: 13px; color: #888; line-height: 1.5;">
            If you don't want to continue, no action is needed — your trial will simply end and no charges will be made. You can cancel anytime from the Billing page.
          </p>
        </div>
      `;

      const result = await sendSystemEmail(u.email, `Your FusePhone trial ends in 2 days`, html);
      if (result.success) {
        await db.insert(notifications).values({
          userId: u.id,
          type: 'trial_ending_reminder',
          title: 'Trial ending reminder sent',
          message: `Trial ending reminder email sent to ${u.email}`,
          link: '/billing',
        });
        console.log(`[TrialReminder] Sent trial ending reminder to ${u.email}`);
      }
    }
  } catch (err: any) {
    console.error("[TrialReminder] Error:", err.message);
  }
}

async function processTrialEndingRemindersOneDay(): Promise<void> {
  try {
    const { sendSystemEmail } = await import('./systemEmail.js');
    const oneDayFromNow = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
    const now = new Date();

    const trialingUsers = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      trialEndsAt: users.trialEndsAt,
      subscriptionTier: users.subscriptionTier,
    }).from(users)
      .where(and(
        eq(users.subscriptionStatus, 'trialing'),
        gt(users.trialEndsAt, now),
        lte(users.trialEndsAt, oneDayFromNow),
      ));

    for (const u of trialingUsers) {
      if (!u.email || !u.trialEndsAt) continue;
      if (u.id.startsWith('test-') || u.email.endsWith('@test.com')) continue;

      const existing = await db.select({ id: notifications.id })
        .from(notifications)
        .where(and(
          eq(notifications.userId, u.id),
          eq(notifications.type, 'trial_ending_reminder_1day'),
        ))
        .limit(1);
      if (existing.length > 0) continue;

      const tierLabel = u.subscriptionTier === 'early_access' ? 'Early Access' :
        u.subscriptionTier === 'elite' ? 'Elite' :
        u.subscriptionTier === 'starter' ? 'Starter' : 'Core';
      const endDate = new Date(u.trialEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const name = u.firstName || 'there';

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="font-size: 24px; color: #1a1a1a; margin: 0;">Fuse Phone</h1>
          </div>
          <h2 style="font-size: 20px; color: #1a1a1a;">Hey ${name},</h2>
          <p style="font-size: 15px; color: #444; line-height: 1.6;">
            Quick heads up — your <strong>FusePhone ${tierLabel}</strong> trial ends <strong>tomorrow (${endDate})</strong>.
          </p>
          <p style="font-size: 15px; color: #444; line-height: 1.6;">
            If you don't cancel, the card on file will be charged tomorrow and your subscription will continue with no interruption. We'll email you the receipt the moment that happens.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="https://app.fusephone.com/billing" style="background-color: #2563eb; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
              Manage Subscription
            </a>
          </div>
          <p style="font-size: 13px; color: #888; line-height: 1.5;">
            Want to cancel? Tap the button above and you can do it in two clicks — no charge will be made.
          </p>
        </div>
      `;

      const result = await sendSystemEmail(u.email, `Your FusePhone trial ends tomorrow`, html);
      if (result.success) {
        await db.insert(notifications).values({
          userId: u.id,
          type: 'trial_ending_reminder_1day',
          title: 'Trial ending tomorrow reminder sent',
          message: `1-day trial ending reminder sent to ${u.email}`,
          link: '/billing',
        });
        console.log(`[TrialReminder1Day] Sent 1-day trial ending reminder to ${u.email}`);
      }
    }
  } catch (err: any) {
    console.error("[TrialReminder1Day] Error:", err.message);
  }
}

export async function processAutomations(): Promise<void> {
  try {
    const due = await storage.getDueAutomations();
    if (due.length > 0) {
      console.log(`[Automations] Processing ${due.length} due automations`);
      for (const automation of due) {
        await processOneAutomation(automation);
      }
    }
  } catch (err: any) {
    console.error("[Automations] Runner error:", err.message);
  }
  await processScheduledMessages();
  await processAppointmentReminders();
  await autoCompletePastAppointments();
  await autoAdvanceScheduledToInProgress();
  await processCrewDayOfReminders();
  await processCrewEveningReminders();
  await processTrialEndingReminders();
  await processTrialEndingRemindersOneDay();
}

export function startAutomationRunner(intervalMs: number = 60000): void {
  if (automationInterval) {
    clearInterval(automationInterval);
  }
  automationInterval = setInterval(processAutomations, intervalMs);
  console.log(
    `[Automations] Runner started (checking every ${intervalMs / 1000}s)`
  );
}

export function stopAutomationRunner(): void {
  if (automationInterval) {
    clearInterval(automationInterval);
    automationInterval = null;
    console.log("[Automations] Runner stopped");
  }
}
