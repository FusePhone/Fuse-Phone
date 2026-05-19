// Apple-compliant account deletion + restore + hard-purge module.
// Implements Apple Guideline 5.1.1(v) self-service account deletion with a
// 60-day grace window. During the window the user can restore. After the
// window the background job hard-deletes their workspace data and only
// retains minimal billing/accounting records (legal/tax retention).

import jwt from "jsonwebtoken";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq, sql } from "drizzle-orm";
import Stripe from "stripe";

const JWT_SECRET = process.env.SESSION_SECRET!;
const RESTORE_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
const PURGE_GRACE_DAYS = 60;

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-08-27.basil" as any })
  : null;

export interface DeletionStatus {
  accountStatus: "active" | "deleted" | "purged";
  deletedAt: Date | null;
  scheduledPurgeAt: Date | null;
  purgedAt: Date | null;
}

export function mintRestoreToken(userId: string): string {
  return jwt.sign({ userId, purpose: "restore" }, JWT_SECRET, {
    expiresIn: RESTORE_TOKEN_TTL_SECONDS,
  });
}

export function verifyRestoreToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded?.purpose !== "restore" || !decoded?.userId) return null;
    return String(decoded.userId);
  } catch {
    return null;
  }
}

// Cancel any active Stripe subscription on this user. Does NOT touch Apple
// IAP — Apple subs cannot be cancelled by us; user is warned in the UI.
async function cancelStripeSubscriptions(userId: string): Promise<void> {
  if (!stripe) return;
  try {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    if (!u) return;
    const subIds = [
      u.stripeSubscriptionId,
      u.fuseAiSubscriptionId,
      u.aiAssistantSubscriptionId,
      u.whiteLabelSubscriptionId,
    ].filter((id): id is string => !!id);
    for (const id of subIds) {
      try {
        // Schedule cancel at period end so user keeps paid features through
        // the period they already paid for. If they restore inside the
        // 60-day window we flip cancel_at_period_end back to false.
        await stripe.subscriptions.update(id, { cancel_at_period_end: true });
        console.log(`[AccountDelete] Scheduled Stripe sub ${id} cancel_at_period_end (userId=${userId})`);
      } catch (err: any) {
        console.warn(`[AccountDelete] Failed to schedule cancel for Stripe sub ${id}:`, err?.message || err);
      }
    }
  } catch (err) {
    console.error(`[AccountDelete] cancelStripeSubscriptions failed for ${userId}:`, err);
  }
}

// Clear OAuth tokens / API keys / webhook secrets from company_settings.
// We don't proactively call providers' revoke endpoints here (best-effort
// only); clearing the tokens prevents the app from making any further calls
// on the user's behalf.
async function clearThirdPartyTokens(userId: string): Promise<void> {
  try {
    await db.execute(sql`UPDATE company_settings SET
      twilio_account_sid = NULL,
      twilio_auth_token = NULL,
      twilio_phone_number = NULL,
      twilio_messaging_service_sid = NULL,
      google_access_token = NULL,
      google_refresh_token = NULL,
      google_email = NULL,
      google_calendar_id = NULL,
      facebook_page_access_token = NULL,
      facebook_user_token = NULL,
      facebook_pixel_id = NULL,
      facebook_capi_token = NULL,
      company_cam_api_token = NULL,
      openphone_api_key = NULL,
      thumbtack_business_id = NULL,
      thumbtack_webhook_secret = NULL,
      zapier_webhook_secret = NULL,
      square_merchant_id = NULL,
      square_access_token = NULL,
      square_refresh_token = NULL
      WHERE user_id = ${userId}`);
  } catch (err) {
    // Some columns may not exist in older schemas — that's fine, ignore.
    console.warn(`[AccountDelete] clearThirdPartyTokens warn for ${userId}:`, (err as any)?.message);
  }
}

// Wipe all auth tokens / sessions for this user so login access is revoked
// the instant the user confirms deletion.
async function revokeLoginAccess(userId: string): Promise<void> {
  try {
    // Refresh tokens for native auth.
    await db.execute(sql`DELETE FROM refresh_tokens WHERE user_id = ${userId}`);
  } catch { /* table may not exist */ }
  try {
    // Express sessions table (connect-pg-simple). Note the table is named
    // `sessions` (plural) in this app, not the default `session`.
    await db.execute(sql`DELETE FROM sessions WHERE sess::text LIKE ${'%' + userId + '%'}`);
  } catch { /* ignore */ }
  try {
    await db.execute(sql`DELETE FROM device_tokens WHERE user_id = ${userId}`);
  } catch { /* ignore */ }
  try {
    await db.execute(sql`DELETE FROM push_subscriptions WHERE user_id = ${userId}`);
  } catch { /* ignore */ }
}

export async function softDeleteAccount(userId: string): Promise<{
  scheduledPurgeAt: Date;
}> {
  const now = new Date();
  const scheduledPurgeAt = new Date(now.getTime() + PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000);

  // 1. Cancel Stripe subscriptions FIRST so renewals stop immediately.
  await cancelStripeSubscriptions(userId);

  // 2. Mark the user row as deleted. This is the source of truth for the
  // auth gate and the purge worker.
  await db
    .update(users)
    .set({
      accountStatus: "deleted",
      deletedAt: now,
      scheduledPurgeAt,
      // NOTE: We intentionally do NOT overwrite subscriptionStatus here.
      // Stripe webhooks update it naturally; preserving it means a restore
      // inside the period reactivates seamlessly without forcing re-purchase.
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  // 3. Clear third-party tokens so background webhooks/cron jobs can't
  // talk to the user's Twilio/Google/etc. on their behalf.
  await clearThirdPartyTokens(userId);

  // 4. Revoke login access (refresh tokens, sessions, push tokens).
  await revokeLoginAccess(userId);

  console.log(
    `[AccountDelete] Soft-deleted user ${userId} — scheduled hard purge at ${scheduledPurgeAt.toISOString()}`,
  );
  return { scheduledPurgeAt };
}

export async function restoreAccount(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      accountStatus: "active",
      deletedAt: null,
      scheduledPurgeAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  // Best-effort: undo the cancel_at_period_end on any still-live Stripe
  // subscription so the user comes back to a fully working paid account.
  if (stripe) {
    try {
      const [u] = await db.select().from(users).where(eq(users.id, userId));
      if (u) {
        const subIds = [
          u.stripeSubscriptionId,
          u.fuseAiSubscriptionId,
          u.aiAssistantSubscriptionId,
          u.whiteLabelSubscriptionId,
        ].filter((id): id is string => !!id);
        for (const id of subIds) {
          try {
            const sub = await stripe.subscriptions.retrieve(id);
            if (sub.status !== "canceled" && (sub as any).cancel_at_period_end) {
              await stripe.subscriptions.update(id, { cancel_at_period_end: false });
              console.log(`[AccountDelete] Reactivated Stripe sub ${id} on restore (userId=${userId})`);
            }
          } catch (err: any) {
            console.warn(`[AccountDelete] Could not reactivate Stripe sub ${id}:`, err?.message);
          }
        }
      }
    } catch (err: any) {
      console.warn(`[AccountDelete] restore: stripe reactivation skipped:`, err?.message);
    }
  }

  console.log(`[AccountDelete] Restored user ${userId}`);
}

// Hard-delete every workspace/CRM artifact owned by this user. Keeps a
// minimal billing breadcrumb on the users row (id, email, stripeCustomerId,
// appleOriginalTransactionId) so accountants/refunds can still reconcile
// for up to 7 years.
export async function hardPurgeAccount(userId: string): Promise<void> {
  console.log(`[AccountPurge] Starting hard purge for user ${userId}`);

  // Try to delete object storage assets BEFORE we wipe DB rows that
  // reference them. Best-effort: any failure is logged and we continue.
  await purgeObjectStorageAssets(userId);

  // Workspace / CRM tables. Order matters where there are FKs — generally
  // children before parents. Each delete is wrapped so a failure on one
  // table doesn't stop the others.
  const childTables = [
    // Activity/event-style children
    "ai_assistant_calls",
    "ai_assistant_usage",
    "campaign_messages",
    "campaigns",
    "client_error_logs",
    "communications",
    "crew_receipt_submissions",
    "device_tokens",
    "document_photos",
    "document_recipients",
    "document_views",
    "appointment_sessions",
    "project_activities",
    "project_color_groups",
    "project_color_selections",
    "project_crew_notes",
    "project_recipients",
    "project_expenses",
    "team_message_reads",
    "time_entries",
    "scheduled_messages",
    "scheduled_automations",
    "color_submissions",
    "paint_orders",
    "push_subscriptions",
    "refresh_tokens",
    "blocked_numbers",
    "notifications",
    "work_orders",
    "work_order_settings",
    "booking_requests",
    "appointments",
    "jobs",
    "documents",
    "payments",
    "templates",
    "proposal_templates",
    "service_templates",
    "message_templates",
    "booking_forms",
    "tax_profiles",
    "team_members",
    "materials",
    "surfaces",
    "paint_colors",
    "suppliers",
    "contacts",
    "projects",
    "company_settings",
    "game_plan_pages",
    "game_plan_city_projects",
  ];

  for (const t of childTables) {
    try {
      await db.execute(sql`DELETE FROM ${sql.identifier(t)} WHERE user_id = ${userId}`);
    } catch (err: any) {
      // Table may not exist in this deploy — that's fine.
      const msg = err?.message || String(err);
      if (!/does not exist/i.test(msg)) {
        console.warn(`[AccountPurge] Delete from ${t} for ${userId} warn: ${msg}`);
      }
    }
  }

  // Mark the user row as purged but DON'T delete it. Keeping the row (with
  // PII stripped) preserves billing references for accounting/legal up to
  // 7 years. Status='purged' guarantees no login/restore is ever possible.
  await db
    .update(users)
    .set({
      accountStatus: "purged",
      purgedAt: new Date(),
      // Strip PII; keep only billing handles and original-txn IDs.
      email: sql`'purged_' || id || '@deleted.local'`,
      passwordHash: null,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
      verificationToken: null,
      verificationTokenExpiry: null,
      passwordResetToken: null,
      passwordResetTokenExpiry: null,
      referralCode: null,
      // Keep: stripeCustomerId, stripeSubscriptionId, appleOriginalTransactionId,
      // promoCodeId, subscriptionTier (for accounting).
      updatedAt: new Date(),
    } as any)
    .where(eq(users.id, userId));

  console.log(`[AccountPurge] Hard purge complete for user ${userId} (PII stripped, billing handles retained)`);
}

// Best-effort delete of every object-storage prefix that belongs to this
// user. Uses the existing GCS-backed objectStorageClient.
async function purgeObjectStorageAssets(userId: string): Promise<void> {
  try {
    const { objectStorageClient } = await import(
      "./replit_integrations/object_storage/objectStorage"
    );
    // The bucket name lives at the head of PRIVATE_OBJECT_DIR, e.g.
    // "/replit-objstore-<id>/.private". The PUBLIC_OBJECT_SEARCH_PATHS
    // env var lists comma-separated public prefixes.
    const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
    const publicSearchPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "")
      .split(",").map((s) => s.trim()).filter(Boolean);

    // Each path is "/<bucket>/<prefix...>". Group prefixes by bucket so we
    // can list once per bucket then filter to the user.
    const byBucket = new Map<string, string[]>();
    const addPath = (full: string) => {
      const m = full.match(/^\/?([^/]+)\/?(.*)$/);
      if (!m) return;
      const bucket = m[1];
      const base = m[2] ? (m[2].endsWith("/") ? m[2] : m[2] + "/") : "";
      const arr = byBucket.get(bucket) || [];
      // Add user-scoped prefixes.
      arr.push(`${base}users/${userId}/`);
      arr.push(`${base}user/${userId}/`);
      arr.push(`${base}${userId}/`);
      byBucket.set(bucket, arr);
    };
    if (privateDir) addPath(privateDir);
    for (const p of publicSearchPaths) addPath(p);

    for (const [bucketName, prefixes] of Array.from(byBucket.entries())) {
      try {
        const bucket = (objectStorageClient as any).bucket(bucketName);
        for (const prefix of prefixes) {
          try {
            const [files] = await bucket.getFiles({ prefix });
            if (!files || files.length === 0) continue;
            for (const file of files) {
              try {
                await file.delete({ ignoreNotFound: true });
              } catch (err: any) {
                console.warn(`[AccountPurge] Delete failed for ${file.name}:`, err?.message);
              }
            }
            console.log(`[AccountPurge] Deleted ${files.length} object(s) under ${bucketName}/${prefix} for user ${userId}`);
          } catch (err: any) {
            // Listing may fail on missing prefix — fine.
          }
        }
      } catch (err: any) {
        console.warn(`[AccountPurge] Bucket ${bucketName} cleanup error:`, err?.message);
      }
    }
  } catch (err: any) {
    console.warn(`[AccountPurge] Object storage cleanup skipped for ${userId}:`, err?.message || err);
  }
}

export async function getDeletionStatus(userId: string): Promise<DeletionStatus | null> {
  const [u] = await db
    .select({
      accountStatus: users.accountStatus,
      deletedAt: users.deletedAt,
      scheduledPurgeAt: users.scheduledPurgeAt,
      purgedAt: users.purgedAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!u) return null;
  return {
    accountStatus: (u.accountStatus as any) || "active",
    deletedAt: u.deletedAt,
    scheduledPurgeAt: u.scheduledPurgeAt,
    purgedAt: u.purgedAt,
  };
}

export const ACCOUNT_PURGE_GRACE_DAYS = PURGE_GRACE_DAYS;
