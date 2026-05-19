import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  passwordHash: varchar("password_hash"),
  authProvider: varchar("auth_provider").default('replit'),
  emailVerified: timestamp("email_verified"),
  verificationToken: varchar("verification_token"),
  verificationTokenExpiry: timestamp("verification_token_expiry"),
  passwordResetToken: varchar("password_reset_token"),
  passwordResetTokenExpiry: timestamp("password_reset_token_expiry"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  isAdmin: boolean("is_admin").default(false),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  subscriptionTier: varchar("subscription_tier").default('core'),
  subscriptionStatus: varchar("subscription_status").default('trialing'),
  trialEndsAt: timestamp("trial_ends_at"),
  eliteBonusEndsAt: timestamp("elite_bonus_ends_at"),
  subscriptionEndsAt: timestamp("subscription_ends_at"),
  // Apple-only: when the user queues a downgrade in iOS, Apple keeps the
  // higher tier active until the current paid period ends, then switches.
  // We record the queued lower tier here (`pendingTier`) and the date it
  // will activate (`pendingTierEffectiveAt` = current subscriptionEndsAt
  // at time of queue) so the UI can surface "Downgrading to Core on
  // May 28" banners and warn the user that Elite-only add-ons will stop
  // working then. Cleared when (a) the user re-upgrades to a tier >=
  // current OR (b) the webhook writes the actual tier change.
  pendingTier: varchar("pending_tier"),
  pendingTierEffectiveAt: timestamp("pending_tier_effective_at"),
  promoCodeId: integer("promo_code_id"),
  fuseAiSubscriptionId: varchar("fuse_ai_subscription_id"),
  fuseAiStatus: varchar("fuse_ai_status").default('inactive'),
  fuseAiTrialEndsAt: timestamp("fuse_ai_trial_ends_at"),
  aiAssistantSubscriptionId: varchar("ai_assistant_subscription_id"),
  aiAssistantStatus: varchar("ai_assistant_status").default('inactive'),
  whiteLabelSubscriptionId: varchar("white_label_subscription_id"),
  whiteLabelStatus: varchar("white_label_status").default('inactive'),
  // Paid extra-seat counts, kept in sync with Stripe subscription items via
  // the seats/purchase + seats/release endpoints AND by the
  // customer.subscription.updated webhook. These EXCLUDE the free allowance
  // (3 field worker, 0 office). Used by the invite endpoint to compute total
  // allowance = free + paid.
  paidFieldWorkerSeats: integer("paid_field_worker_seats").default(0),
  paidOfficeSeats: integer("paid_office_seats").default(0),
  aiEstimatesUsedThisMonth: integer("ai_estimates_used_this_month").default(0),
  aiEstimatesPeriodStart: timestamp("ai_estimates_period_start"),
  appleUserId: varchar("apple_user_id"),
  appleOriginalTransactionId: varchar("apple_original_transaction_id"),
  appleWhiteLabelOriginalTxnId: varchar("apple_white_label_original_txn_id"),
  appleFuseAiOriginalTxnId: varchar("apple_fuse_ai_original_txn_id"),
  appleAiAssistantOriginalTxnId: varchar("apple_ai_assistant_original_txn_id"),
  // Auto-renewal cancellation tracking (set by App Store Server Notification
  // V2 DID_CHANGE_RENEWAL_STATUS with autoRenewStatus=0). Apple keeps the
  // user on their current paid period and stops billing afterward, so the
  // status column stays 'active' and these timestamps mark when access
  // actually ends. Cleared on successful renewal or when the user re-enables
  // auto-renew. The boolean covers the base tier (we already track the
  // end-of-period in subscriptionEndsAt). The per-add-on timestamps cover
  // each independently-renewable add-on. UI uses these to show
  // "Cancelling on May 28" badges and to skip the downgrade hard-block
  // (a cancelling add-on no longer needs to be cancelled by the user).
  appleAutoRenewOff: boolean("apple_auto_renew_off").default(false),
  // Per-add-on period end date — populated on EVERY webhook (SUBSCRIBED,
  // DID_RENEW, DID_CHANGE_RENEWAL_STATUS, etc.). When auto-renew is on,
  // this is the next charge date; when off, it's the final access date.
  // The label ("renews on" vs "ends on") is decided by the autoRenewOff
  // boolean below, NOT by the presence of this date.
  appleWhiteLabelExpiresAt: timestamp("apple_white_label_expires_at"),
  appleFuseAiExpiresAt: timestamp("apple_fuse_ai_expires_at"),
  appleAiAssistantExpiresAt: timestamp("apple_ai_assistant_expires_at"),
  // Per-add-on auto-renew off flag. True ⇔ user disabled auto-renew for
  // this add-on in iOS Settings (DID_CHANGE_RENEWAL_STATUS w/
  // autoRenewStatus=0). The downgrade hard-block uses this — NOT the
  // expiresAt date — to decide whether to nag the user to cancel.
  appleWhiteLabelAutoRenewOff: boolean("apple_white_label_auto_renew_off").default(false),
  appleFuseAiAutoRenewOff: boolean("apple_fuse_ai_auto_renew_off").default(false),
  appleAiAssistantAutoRenewOff: boolean("apple_ai_assistant_auto_renew_off").default(false),
  referralCode: varchar("referral_code").unique(),
  referredByUserId: varchar("referred_by_user_id"),
  referralCreditCents: integer("referral_credit_cents").default(0),
  referralRole: varchar("referral_role").default('user'),
  lastActiveAt: timestamp("last_active_at"),
  // Account-deletion lifecycle (Apple Guideline 5.1.1(v) compliant).
  // accountStatus: 'active' | 'deleted' | 'purged'.
  // When user requests deletion: status='deleted', deletedAt=now,
  // scheduledPurgeAt=now+60d. Background job hard-deletes after that window
  // and sets purgedAt. Login during the window routes to /restore-account.
  accountStatus: varchar("account_status").default('active'),
  deletedAt: timestamp("deleted_at"),
  scheduledPurgeAt: timestamp("scheduled_purge_at"),
  purgedAt: timestamp("purged_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
