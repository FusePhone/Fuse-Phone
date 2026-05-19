import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDefaultTemplatesForAllExistingUsers } from "./defaultTemplates";
import { seedDefaultPackagesForAllUsers } from "./defaultPackages";
import { startAutomationRunner } from "./automations";
import { startAffiliatePayoutScheduler } from "./jobs/affiliatePayouts";
import { startAccountPurgeScheduler } from "./jobs/accountPurge";
import { startAttentionDigestScheduler } from "./jobs/attentionDigest";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { WebhookHandlers } from "./webhookHandlers";
import { runProductionDataMigration } from "./productionDataMigration";
import { runAreaPhotosToPoolMigration } from "./areaPhotosToPoolMigration";
import { seedKasajProposal } from "./kasajProposalSeed";
import { runProductionRatesExpansionSeed, runKitchenCabinetsSeed, runAdditionalPrimersAndPaintsSeed, runEcoSpecPaintsSeed } from "./productionRatesExpansionSeed";
import { seedGamaPages } from "./seedGamaPages";
import { WebSocketServer } from "ws";
import { handleTwilioMediaStream } from "./aiAssistantCall";

const app = express();
const httpServer = createServer(app);

const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (request, socket, head) => {
  const url = request.url || '';
  const aiStreamMatch = url.match(/^\/api\/twilio\/ai-stream\/(.+)$/);

  if (aiStreamMatch) {
    const callSid = aiStreamMatch[1];
    wss.handleUpgrade(request, socket, head, (ws) => {
      console.log(`[AI Stream] WebSocket upgrade accepted for callSid=${callSid}`);
      handleTwilioMediaStream(ws, callSid);
    });
    return;
  }
});

import { setupTeamCallingWebSocket } from "./teamCalling";
setupTeamCallingWebSocket(httpServer);

import { setupRealtimeWebSocket } from "./realtime";
setupRealtimeWebSocket(httpServer);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(
  express.json({
    limit: "20mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "20mb" }));

app.use("/__mockup", async (req, res) => {
  try {
    const targetUrl = `http://localhost:23636/__mockup${req.url}`;
    const headers: Record<string, string> = {};
    if (req.headers.accept) headers.accept = req.headers.accept as string;
    if (req.headers["accept-encoding"]) headers["accept-encoding"] = req.headers["accept-encoding"] as string;
    const resp = await fetch(targetUrl, { headers });
    const ct = resp.headers.get("content-type");
    if (ct) res.setHeader("content-type", ct);
    const body = Buffer.from(await resp.arrayBuffer());
    res.status(resp.status).send(body);
  } catch {
    res.status(502).send("Mockup sandbox not running");
  }
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  try {
    const { storage } = await import("./storage");
    const TARGET_TOTAL_CENTS = 75174;
    const fixDoc = async (docId: number, expectedType: string) => {
      const doc: any = await storage.getDocument(docId);
      if (!doc || doc.type !== expectedType) return;
      if (doc.totalAmount === TARGET_TOTAL_CENTS) {
        console.log(`[startup-fix] ${expectedType} ${docId} already correct — skipping`);
        return;
      }
      const content: any = JSON.parse(JSON.stringify(doc.content || {}));
      const block = content.productionRateBlocks?.[0];
      if (!block) return;
      block.roomBuilderData.rooms = (block.roomBuilderData.rooms || []).filter((r: any) => !r.isOptional);
      block.roomBuilderData.areaResults = (block.roomBuilderData.areaResults || []).filter((a: any) => !a.isOptional);
      block.lineItems = (block.lineItems || []).filter((li: any) => li.name !== 'Skimcoat and Prime');
      block.roomBuilderData.sellRate = 80;
      const newPreTax = (block.lineItems as any[]).reduce((s, li) => s + (li.total || 0) / 100, 0);
      block.roomBuilderData.grandTotal = newPreTax;
      const newLaborHours = (block.roomBuilderData.areaResults || []).reduce(
        (s: number, a: any) => s + (a.totalLaborHours || 0), 0
      );
      block.roomBuilderData.totalLaborHours = newLaborHours;
      block.roomBuilderData.totalLaborCost = newLaborHours * 80;
      content.sellRateSnapshot = 80;
      const taxRate = Number(block.taxProfileRate || 0);
      const newTotal = Math.round(newPreTax * (1 + taxRate / 100) * 100);
      await storage.updateDocument(docId, { content, totalAmount: newTotal } as any);
      console.log(`[startup-fix] ${expectedType} ${docId} corrected: $${(newTotal / 100).toFixed(2)} (was $${(doc.totalAmount / 100).toFixed(2)})`);
    };
    await fixDoc(341, 'invoice');
    await fixDoc(337, 'proposal');
  } catch (e: any) {
    console.error('[startup-fix] Document fix failed:', e?.message || e);
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);

      (async () => {
        try {
          await db.execute(sql`ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_slug_unique`);
          await db.execute(sql`ALTER TABLE templates ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT false`);
          await db.execute(sql`ALTER TABLE templates ALTER COLUMN enabled SET DEFAULT false`);
          console.log("[Migration] Dropped templates_slug_unique constraint (if existed)");
        } catch (err) {
          console.error("[Migration] Error fixing templates constraint:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false`);
          await db.execute(sql`UPDATE users SET is_admin = true WHERE LOWER(email) IN ('gama@gamainteriorpainting.com', 'gabriel@fusephonepainting.com', 'gamalielrevolorio@gmail.com', 'ghimprovement20@gmail.com')`);
          await db.execute(sql`UPDATE users SET fuse_ai_status = 'active' WHERE is_admin = true AND (fuse_ai_status IS NULL OR fuse_ai_status = 'inactive')`);
          await db.execute(sql`INSERT INTO company_settings (user_id, ai_assistant_enabled) SELECT id, true FROM users WHERE email IN ('gama@gamainteriorpainting.com', 'ghimprovement20@gmail.com', 'gamalielrevolorio@gmail.com') ON CONFLICT (user_id) DO UPDATE SET ai_assistant_enabled = true`);
          await db.execute(sql`UPDATE users SET ai_assistant_status = 'active' WHERE email IN ('gama@gamainteriorpainting.com', 'ghimprovement20@gmail.com', 'gamalielrevolorio@gmail.com')`);
          await db.execute(sql`UPDATE users SET subscription_tier = 'elite', subscription_status = 'active', trial_ends_at = NULL WHERE LOWER(email) IN ('gama@gamainteriorpainting.com', 'gabriel@fusephonepainting.com', 'gamalielrevolorio@gmail.com', 'gamaliel_revolorio@icloud.com', 'ghimprovement20@gmail.com')`);

          // FULL WIPE for iOS IAP test accounts on every boot. The user
          // (developer) is testing the buy flow against Apple sandbox and
          // needs a guaranteed clean slate every time. Wipes ALL Apple/IAP
          // traces — original txn ids for tier and every add-on, every
          // status, every Stripe handle. Idempotent; safe to re-run.
          // IMPORTANT: only test emails. Never includes the real prod
          // accounts (gama@gamainteriorpainting.com, gamalielrevolorio@gmail.com).
          // Match ALL gama@gamagt*.com variants — present and future.
          // Real prod accounts (gama@gamainteriorpainting.com,
          // gamalielrevolorio@gmail.com, gabriel@fusephonepainting.com) do
          // NOT match this pattern, so they are safe.
          // Also clear apple_user_id so a new SK2 sign-in is treated as fresh.
          // Also wipe server-side sessions so the test user is forced to log
          // back in (no stale cookie carrying old subscription state).
          const wipeRes = await db.execute(sql`UPDATE users SET
            subscription_tier = 'starter',
            subscription_status = 'inactive',
            subscription_ends_at = NULL,
            trial_ends_at = NULL,
            elite_bonus_ends_at = NULL,
            stripe_customer_id = NULL,
            stripe_subscription_id = NULL,
            apple_user_id = NULL,
            apple_original_transaction_id = NULL,
            apple_white_label_original_txn_id = NULL,
            apple_fuse_ai_original_txn_id = NULL,
            apple_ai_assistant_original_txn_id = NULL,
            white_label_status = 'inactive',
            white_label_subscription_id = NULL,
            ai_assistant_status = 'inactive',
            ai_assistant_subscription_id = NULL,
            fuse_ai_status = 'inactive',
            fuse_ai_subscription_id = NULL,
            fuse_ai_trial_ends_at = NULL
            WHERE LOWER(email) ~ '^gama@gamagt+\.com$'`);
          console.log(`[Migration] Wiped IAP state for ALL gama@gamagt*.com test accounts (rows=${(wipeRes as any).rowCount ?? '?'})`);
          // Drop any active session rows referencing those wiped users.
          // Sessions table is the connect-pg-simple default; payload is JSON
          // with the user id embedded under passport.user. Match by string
          // search on the JSON payload — broad but harmless: at most a few
          // test sessions exist on any given boot.
          try {
            const sessRes = await db.execute(sql`DELETE FROM session
              WHERE sess::text ~ 'gama@gamagt+'`);
            console.log(`[Migration] Dropped sessions for gama@gamagt*.com test accounts (rows=${(sessRes as any).rowCount ?? '?'})`);
          } catch (sessErr) {
            console.warn("[Migration] Session wipe skipped (table may not exist):", (sessErr as any)?.message);
          }
          // Apple App Review reviewer account MUST always boot as starter/inactive
          // so the reviewer sees the IAP paywall on iOS (App Store guideline 2.1).
          // This runs on every server boot and undoes any accidental promotion.
          await db.execute(sql`UPDATE users SET
            subscription_tier = 'starter',
            subscription_status = 'inactive',
            trial_ends_at = NULL,
            subscription_ends_at = NULL,
            elite_bonus_ends_at = NULL,
            stripe_customer_id = NULL,
            stripe_subscription_id = NULL,
            apple_original_transaction_id = NULL,
            apple_white_label_original_txn_id = NULL,
            apple_fuse_ai_original_txn_id = NULL,
            apple_ai_assistant_original_txn_id = NULL,
            fuse_ai_status = 'inactive',
            fuse_ai_subscription_id = NULL,
            ai_assistant_status = 'inactive',
            ai_assistant_subscription_id = NULL,
            white_label_status = 'inactive',
            white_label_subscription_id = NULL,
            is_admin = false
            WHERE LOWER(email) = 'applereviewfusephone@gmail.com'`);
          console.log("[Migration] Ensured admin column, admin user, admin FuseAI access, AI Assistant activation, Elite tier, and reset Apple reviewer account");

          // Google Play reviewer account. Mirrors the Apple reviewer pattern:
          // create the account on first boot if missing, then on every boot
          // reset it to starter/inactive so Google's reviewer always sees the
          // in-app subscription paywall (Play policy: reviewer must be able
          // to reach the IAP flow). Reviewer logs in with normal email +
          // password — no OTP, no bypass code.
          const googleReviewerEmail = 'googlereviewfusephone@gmail.com';
          const googleReviewerPassword = 'GoogleReview2026!Fuse';
          const googleReviewerExisting = await db.execute(
            sql`SELECT id FROM users WHERE LOWER(email) = ${googleReviewerEmail} LIMIT 1`
          );
          if (googleReviewerExisting.rows.length === 0) {
            const bcrypt = await import('bcrypt');
            const hash = await bcrypt.hash(googleReviewerPassword, 10);
            await db.execute(sql`
              INSERT INTO users (
                email, password_hash, first_name, last_name,
                auth_provider, email_verified,
                subscription_tier, subscription_status
              ) VALUES (
                ${googleReviewerEmail}, ${hash}, 'Google', 'Reviewer',
                'email', NOW(),
                'starter', 'inactive'
              )
            `);
            console.log("[Migration] Created Google Play reviewer account");
          }
          await db.execute(sql`UPDATE users SET
            subscription_tier = 'starter',
            subscription_status = 'inactive',
            trial_ends_at = NULL,
            subscription_ends_at = NULL,
            elite_bonus_ends_at = NULL,
            stripe_customer_id = NULL,
            stripe_subscription_id = NULL,
            apple_original_transaction_id = NULL,
            apple_white_label_original_txn_id = NULL,
            apple_fuse_ai_original_txn_id = NULL,
            apple_ai_assistant_original_txn_id = NULL,
            fuse_ai_status = 'inactive',
            fuse_ai_subscription_id = NULL,
            ai_assistant_status = 'inactive',
            ai_assistant_subscription_id = NULL,
            white_label_status = 'inactive',
            white_label_subscription_id = NULL,
            is_admin = false
            WHERE LOWER(email) = ${googleReviewerEmail}`);
          console.log("[Migration] Reset Google Play reviewer account to starter/inactive");
        } catch (err) {
          console.error("[Migration] Error setting admin:", err);
        }

        try {
          const zapierTestEmail = 'integration-testing@zapier.com';
          const existing = await db.execute(sql`SELECT id FROM users WHERE email = ${zapierTestEmail} LIMIT 1`);
          if (existing.rows.length === 0) {
            const bcrypt = await import('bcrypt');
            const hash = await bcrypt.hash('ZapierFuse2026!Secure', 10);
            await db.execute(sql`INSERT INTO users (email, password_hash, first_name, last_name, auth_provider, email_verified, subscription_tier, subscription_status, trial_ends_at) VALUES (${zapierTestEmail}, ${hash}, 'Zapier', 'Testing', 'email', NOW(), 'core', 'active', NOW() + INTERVAL '365 days')`);
            console.log("[Migration] Created Zapier test account");
          }
        } catch (err) {
          console.error("[Migration] Error creating Zapier test account:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id varchar`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id varchar`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier varchar DEFAULT 'core'`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status varchar DEFAULT 'trialing'`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at timestamp`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_ends_at timestamp`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS promo_code_id integer`);
          await db.execute(sql`UPDATE users SET trial_ends_at = NOW() + INTERVAL '30 days', subscription_tier = 'elite' WHERE trial_ends_at IS NULL AND subscription_status = 'trialing'`);
          console.log("[Migration] Ensured subscription columns on users");
        } catch (err) {
          console.error("[Migration] Error adding subscription columns:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_user_id varchar`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_original_transaction_id varchar`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_apple_original_txn ON users(apple_original_transaction_id) WHERE apple_original_transaction_id IS NOT NULL`);
          // Per-add-on Apple original transaction IDs so the webhook can map
          // back to a user when appAccountToken is missing. Each Apple
          // subscription (tier + each add-on) has its own originalTransactionId.
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_white_label_original_txn_id varchar`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_fuse_ai_original_txn_id varchar`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_ai_assistant_original_txn_id varchar`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_apple_wl_txn ON users(apple_white_label_original_txn_id) WHERE apple_white_label_original_txn_id IS NOT NULL`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_apple_fuseai_txn ON users(apple_fuse_ai_original_txn_id) WHERE apple_fuse_ai_original_txn_id IS NOT NULL`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_apple_aia_txn ON users(apple_ai_assistant_original_txn_id) WHERE apple_ai_assistant_original_txn_id IS NOT NULL`);
          // Queued-downgrade tracking (Apple iOS only). When the user picks a
          // lower tier in the StoreKit sheet, Apple keeps the higher tier
          // entitled until the current period ends. The /api/iap/sync
          // queued-downgrade guard records the queued tier + effective date
          // here so the UI can show "Downgrading to X on Y" banners.
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_tier varchar`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_tier_effective_at timestamp`);
          console.log("[Migration] Ensured apple_user_id + add-on transaction columns on users");
        } catch (err) {
          console.error("[Migration] Error adding apple_user_id column:", err);
        }

        try {
          // Google Play Billing per-user state. Mirrors the apple_* columns
          // exactly so the gating + reconcile logic stays uniform across
          // stores. The "purchase token" is Google's equivalent of Apple's
          // originalTransactionId — STAYS the same across renewals.
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_field_worker_seats integer DEFAULT 0`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_office_seats integer DEFAULT 0`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_play_user_id varchar`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_original_purchase_token varchar`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_google_orig_token ON users(google_original_purchase_token) WHERE google_original_purchase_token IS NOT NULL`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_white_label_purchase_token varchar`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_fuse_ai_purchase_token varchar`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_ai_assistant_purchase_token varchar`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_google_wl_token ON users(google_white_label_purchase_token) WHERE google_white_label_purchase_token IS NOT NULL`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_google_fuseai_token ON users(google_fuse_ai_purchase_token) WHERE google_fuse_ai_purchase_token IS NOT NULL`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_google_aia_token ON users(google_ai_assistant_purchase_token) WHERE google_ai_assistant_purchase_token IS NOT NULL`);
          // Per-add-on expiry + auto-renew-off (mirrors apple_*_expires_at).
          // expires_at marks when access actually ends after the user kills
          // auto-renew in the Play Store; status STAYS active until the
          // EXPIRED RTDN arrives because the user already paid for the period.
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_white_label_expires_at timestamp`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_fuse_ai_expires_at timestamp`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_ai_assistant_expires_at timestamp`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_white_label_auto_renew_off boolean DEFAULT false`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_fuse_ai_auto_renew_off boolean DEFAULT false`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_ai_assistant_auto_renew_off boolean DEFAULT false`);
          console.log("[Migration] Ensured google_play_* columns on users");
        } catch (err) {
          console.error("[Migration] Error adding google_play_* columns:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code varchar`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_user_id varchar`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_credit_cents integer DEFAULT 0`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_role varchar DEFAULT 'user'`);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_unique ON users (referral_code) WHERE referral_code IS NOT NULL`);

          await db.execute(sql`CREATE TABLE IF NOT EXISTS referrals (
            id serial PRIMARY KEY,
            referrer_user_id varchar NOT NULL,
            referred_user_id varchar NOT NULL UNIQUE,
            status varchar(20) NOT NULL DEFAULT 'pending',
            credited_at timestamp,
            created_at timestamp DEFAULT NOW()
          )`);

          await db.execute(sql`CREATE TABLE IF NOT EXISTS gift_card_requests (
            id serial PRIMARY KEY,
            user_id varchar NOT NULL,
            amount_cents integer NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'requested',
            notes text,
            created_at timestamp DEFAULT NOW(),
            fulfilled_at timestamp
          )`);

          await db.execute(sql`CREATE TABLE IF NOT EXISTS affiliates (
            id serial PRIMARY KEY,
            user_id varchar NOT NULL UNIQUE,
            status varchar(20) NOT NULL DEFAULT 'applied',
            full_name varchar,
            social_handle varchar,
            social_platform varchar(30),
            follower_count integer,
            website_url varchar,
            application_notes text,
            rejection_reason text,
            approved_at timestamp,
            stripe_connect_account_id varchar,
            stripe_onboarding_complete boolean DEFAULT false,
            created_at timestamp DEFAULT NOW()
          )`);

          await db.execute(sql`CREATE TABLE IF NOT EXISTS affiliate_referrals (
            id serial PRIMARY KEY,
            affiliate_id integer NOT NULL,
            referred_user_id varchar NOT NULL UNIQUE,
            status varchar(20) NOT NULL DEFAULT 'pending',
            first_paid_at timestamp,
            commission_ends_at timestamp,
            created_at timestamp DEFAULT NOW()
          )`);

          await db.execute(sql`CREATE TABLE IF NOT EXISTS affiliate_commissions (
            id serial PRIMARY KEY,
            affiliate_id integer NOT NULL,
            affiliate_referral_id integer NOT NULL,
            stripe_invoice_id varchar,
            customer_payment_cents integer NOT NULL,
            amount_cents integer NOT NULL,
            earned_at timestamp DEFAULT NOW(),
            payout_id integer
          )`);

          await db.execute(sql`CREATE TABLE IF NOT EXISTS affiliate_payouts (
            id serial PRIMARY KEY,
            affiliate_id integer NOT NULL,
            amount_cents integer NOT NULL,
            period_start timestamp NOT NULL,
            period_end timestamp NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'pending',
            stripe_transfer_id varchar,
            failure_reason text,
            created_at timestamp DEFAULT NOW(),
            paid_at timestamp
          )`);

          // Per-affiliate custom commission rate + admin notes (added later)
          await db.execute(sql`ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS commission_bps integer NOT NULL DEFAULT 1000`);
          await db.execute(sql`ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS admin_notes text`);

          // Backfill: any approved affiliate with no linked Fuse Phone user
          // gets an affiliate-only user row created so they can OTP-login on
          // the affiliate portal.
          try {
            const orphanRows = (await db.execute(sql`
              SELECT a.id, a.email, a.full_name
              FROM affiliates a
              WHERE a.status = 'approved'
                AND a.user_id IS NULL
                AND a.email IS NOT NULL
                AND a.email <> ''
            `)) as any;
            const orphans = (orphanRows?.rows || orphanRows) as Array<{ id: number; email: string; full_name: string | null }>;
            for (const orphan of orphans) {
              const lowered = String(orphan.email).toLowerCase().trim();
              const existingRows = (await db.execute(sql`SELECT id FROM users WHERE LOWER(email) = ${lowered} LIMIT 1`)) as any;
              const existing = (existingRows?.rows || existingRows) as Array<{ id: string }>;
              if (existing.length > 0) {
                await db.execute(sql`UPDATE affiliates SET user_id = ${existing[0].id} WHERE id = ${orphan.id}`);
                await db.execute(sql`UPDATE users SET referral_role = 'affiliate' WHERE id = ${existing[0].id} AND (referral_role IS NULL OR referral_role <> 'affiliate')`);
              } else {
                const nameParts = String(orphan.full_name || '').trim().split(/\s+/);
                const firstName = nameParts[0] || null;
                const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;
                const insertedRows = (await db.execute(sql`
                  INSERT INTO users (email, first_name, last_name, auth_provider, referral_role, subscription_tier, subscription_status, trial_ends_at)
                  VALUES (${lowered}, ${firstName}, ${lastName}, 'affiliate', 'affiliate', 'starter', 'inactive', NULL)
                  RETURNING id
                `)) as any;
                const inserted = (insertedRows?.rows || insertedRows) as Array<{ id: string }>;
                if (inserted[0]?.id) {
                  await db.execute(sql`UPDATE affiliates SET user_id = ${inserted[0].id} WHERE id = ${orphan.id}`);
                  console.log(`[Migration] Created affiliate-only user for ${lowered}`);
                }
              }
            }
          } catch (backfillErr) {
            console.error("[Migration] Affiliate user backfill failed:", backfillErr);
          }

          console.log("[Migration] Ensured referral & affiliate tables");
        } catch (err) {
          console.error("[Migration] Error adding referral/affiliate tables:", err);
        }

        // Backfill referral codes for existing users that don't have one
        try {
          const { generateUniqueReferralCode } = await import("./referrals");
          const rows = (await db.execute(sql`
            SELECT id, first_name, last_name, email FROM users WHERE referral_code IS NULL LIMIT 1000
          `)) as any;
          const list = (rows?.rows || rows) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>;
          if (Array.isArray(list) && list.length > 0) {
            console.log(`[Migration] Backfilling referral codes for ${list.length} users`);
            for (const u of list) {
              try {
                const code = await generateUniqueReferralCode(u.first_name, u.last_name, u.email);
                await db.execute(sql`UPDATE users SET referral_code = ${code} WHERE id = ${u.id} AND referral_code IS NULL`);
              } catch (e) {
                console.error(`[Migration] Backfill referral code failed for ${u.id}:`, e);
              }
            }
            console.log("[Migration] Referral code backfill complete");
          }
        } catch (err) {
          console.error("[Migration] Error backfilling referral codes:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS environment varchar DEFAULT 'production'`);
          console.log("[Migration] Ensured environment column on device_tokens");
        } catch (err) {
          console.error("[Migration] Error adding environment column to device_tokens:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS allow_client_color_submission boolean DEFAULT true`);
          await db.execute(sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS color_submission_status text DEFAULT 'not_requested'`);
          console.log("[Migration] Ensured color submission columns on documents");
        } catch (err) {
          console.error("[Migration] Error adding color submission columns:", err);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS color_submissions (
              id serial PRIMARY KEY,
              document_id integer NOT NULL,
              project_id integer,
              user_id varchar NOT NULL,
              entries jsonb NOT NULL DEFAULT '[]',
              status text NOT NULL DEFAULT 'pending',
              review_note text,
              reviewed_at timestamp,
              submitted_at timestamp DEFAULT now(),
              created_at timestamp DEFAULT now()
            )
          `);
          console.log("[Migration] Ensured color_submissions table");

          const newCols = [
            { name: 'contractor_approved', def: 'boolean DEFAULT false' },
            { name: 'contractor_approved_at', def: 'timestamp' },
            { name: 'customer_approved', def: 'boolean DEFAULT false' },
            { name: 'customer_approved_at', def: 'timestamp' },
            { name: 'customer_note', def: 'text' },
            { name: 'deadline', def: 'timestamp' },
            { name: 'customer_token', def: 'varchar' },
            { name: 'customer_signature', def: 'text' },
            { name: 'customer_signed_at', def: 'timestamp' },
            { name: 'selected_areas', def: 'jsonb' },
            { name: 'manual_rooms', def: 'jsonb' },
            { name: 'hidden_prod_surfaces', def: 'jsonb' },
            { name: 'activity_log', def: 'jsonb' },
            { name: 'section_notes', def: 'jsonb' },
          ];
          for (const col of newCols) {
            await db.execute(sql.raw(`ALTER TABLE color_submissions ADD COLUMN IF NOT EXISTS ${col.name} ${col.def}`));
          }
          console.log("[Migration] Ensured color_submissions approval columns");
        } catch (err) {
          console.error("[Migration] Error creating color_submissions table:", err);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS notifications (
              id serial PRIMARY KEY,
              user_id varchar NOT NULL,
              document_id integer,
              project_id integer,
              type text NOT NULL,
              title text NOT NULL,
              message text NOT NULL,
              link text,
              metadata jsonb,
              read_at timestamp,
              created_at timestamp DEFAULT now()
            )
          `);
          console.log("[Migration] Ensured notifications table");
        } catch (err) {
          console.error("[Migration] Error creating notifications table:", err);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS help_tutorials (
              id serial PRIMARY KEY,
              title text NOT NULL,
              description text,
              category text NOT NULL DEFAULT 'overview',
              video_url text,
              thumbnail_url text,
              recording_notes text,
              sort_order integer NOT NULL DEFAULT 0,
              published boolean NOT NULL DEFAULT false,
              created_at timestamp DEFAULT now(),
              updated_at timestamp DEFAULT now()
            )
          `);
          await db.execute(sql`
            ALTER TABLE help_tutorials ADD COLUMN IF NOT EXISTS recording_notes text
          `);
          console.log("[Migration] Ensured help_tutorials table");

          const existing = await db.execute(sql`SELECT COUNT(*) as cnt FROM help_tutorials`);
          const count = parseInt((existing as any).rows?.[0]?.cnt || '0', 10);
          if (count === 0) {
            console.log("[Migration] Seeding default help tutorials...");
            await db.execute(sql`
              INSERT INTO help_tutorials (title, description, category, recording_notes, sort_order, published) VALUES
              ('Welcome to Fuse Phone', 'Get a complete overview of your CRM dashboard, sidebar navigation, and key features to help you hit the ground running.', 'overview', 'Walk through the main dashboard: show metric cards, project pipeline chart, recent activity feed, and quick-action buttons. Then demonstrate sidebar navigation — click each section briefly. End by showing the mobile bottom nav and PWA install prompt.', 0, false),
              ('Getting Started Checklist', 'Follow this step-by-step guide to set up your company profile, add your first contact, and create your first document.', 'overview', 'Start from a fresh account perspective. Show: 1) Go to Company Profile and fill in company name, logo, address, phone. 2) Add a new contact with name, email, phone. 3) Create a simple estimate for that contact with a couple of line items. Emphasize how quick the setup is.', 1, false),
              ('Setting Up Company Profile', 'Configure your company logo, business information, booking page link, review link, and brand color to personalize your Fuse Phone experience.', 'settings', 'Navigate to Settings > Company Profile. Show: uploading a logo (and how brand color auto-extracts), editing company name/address/phone, setting up booking page URL, adding Google review link, manually changing brand color with the color picker. Mention that brand color affects email templates and document styling.', 0, false),
              ('Managing Your Team', 'Learn how to add team members, organize crews, and use time tracking to manage your workforce efficiently.', 'settings', 'Go to Settings > Team. Show: adding a new team member (name, role, hourly rate), creating a crew, assigning members to a crew. Then show the Time Tracking tab — how to clock in/out for a project and view time entries. Mention crew assignments appear on project details.', 1, false),
              ('Connecting Twilio (Calls & Texts)', 'Set up your business phone number with Twilio to send and receive SMS messages and make calls directly from Fuse Phone.', 'integrations', 'Go to Settings > Integrations > Twilio. Show: entering Twilio Account SID, Auth Token, and phone number. Send a test SMS to a contact. Then show the Phone tab — make an outbound call and demonstrate the in-browser dialer. Show how incoming texts appear in real-time on the Messages page.', 0, false),
              ('Google Integration', 'Connect Gmail for professional email sending, sync your Google Calendar, and enable Google Maps for address autocomplete.', 'integrations', 'Go to Settings > Integrations > Google. Show: connecting Google account, authorizing Gmail access (mention this sends emails from their Gmail). Show Calendar sync toggle. Demonstrate Maps autocomplete when adding a contact address. Note: mention that Calendar sync requires Elite plan.', 1, false),
              ('Connecting Stripe for Payments', 'Set up Stripe to collect payments from customers through invoices, proposals, and payment links.', 'integrations', 'Go to Settings > Integrations > Stripe. Show the Connect with Stripe flow. Once connected, show: creating an invoice with a payment link, how the customer sees the payment page, and where paid invoices show up in your revenue tracking. Mention deposit collection on proposals.', 2, false),
              ('Thumbtack & Facebook Lead Ads', 'Automatically import leads from Thumbtack and Facebook Lead Ads to never miss a potential customer.', 'integrations', 'Go to Settings > Integrations. Show Thumbtack webhook URL setup — explain where to paste it in Thumbtack settings. Then show Facebook Lead Ads: click Connect with Facebook, select a page, and explain that new leads from Facebook/Instagram ad forms will automatically appear as contacts. Show a sample imported lead.', 3, false),
              ('Creating Estimates & Proposals', 'Master the document editor: add line items, use templates, leverage FuseAI to generate content, and customize pricing for your clients.', 'documents', 'Create a new proposal. Show: adding line items manually (name, description, quantity, price), using a template to auto-fill content, opening FuseAI chat to ask "generate line items for an interior painting job" and inserting the result. Show how to adjust visibility settings (hide labor/materials from customer). Save and preview the document.', 0, false),
              ('Sending Documents to Clients', 'Learn how to send estimates and proposals to clients via email, share through the customer portal, and collect digital signatures.', 'documents', 'From a completed proposal, click Send. Show: the email preview with professional template, adding recipients, and sending. Then show the public customer portal link — open it to demonstrate what the customer sees. Show the digital signature flow: customer signs, you see the signed status. Mention document locking after signing.', 1, false),
              ('Invoicing & Payments', 'Create professional invoices, send payment requests, and track your revenue from estimate to final payment.', 'documents', 'Create an invoice from a completed project (show "Convert to Invoice" if available). Add line items, set payment terms, and send to customer. Show the payment flow: customer clicks Pay, enters card info via Stripe. Back in the app, show the payment recorded, revenue dashboard updated. Mention partial payments and deposit tracking.', 2, false),
              ('Understanding the Project Pipeline', 'Explore the 8-stage project pipeline to track every job from initial lead to project completion.', 'projects', 'Navigate to Projects. Show the pipeline view with all 8 stages: Lead In, Estimate Sent, Follow Up, Proposal Sent, Negotiation, Contract Signed, In Progress, Completed. Create or move a project through stages — demonstrate drag or click to advance. Show the "Next Steps" suggestions at each stage. Explain the Lost status and reactivation.', 0, false),
              ('Managing Active Projects', 'Track project activities, log expenses, record time entries, and use Next Steps to keep every project moving forward.', 'projects', 'Open an active project. Show: the activity timeline (calls, messages, documents auto-logged), adding a manual activity note, logging an expense with receipt photo, adding a time entry. Show Next Steps actions and how they auto-advance the project stage. Demonstrate adding project photos and viewing them in the gallery.', 1, false),
              ('Adding & Managing Contacts', 'Add contacts manually, track lead sources, manage contact statuses, and convert leads into clients as they move through your pipeline.', 'contacts', 'Go to Contacts. Show: adding a new contact (fill all fields including address with Maps autocomplete), setting lead source (Referral, Website, etc.), viewing the contact list with filters. Open a contact detail page — show how their status changes from Lead to Client automatically when a project advances. Show editing and the communication history tab.', 0, false),
              ('Contact Communication History', 'View the complete history of messages, calls, emails, and documents for any contact in one unified timeline.', 'contacts', 'Open a contact with some activity history. Show the unified timeline: SMS messages, call logs with recordings, sent documents, and notes all in one view. Demonstrate sending a quick text from the contact page. Show how clicking a document in the timeline opens it. Emphasize that everything about a customer is in one place.', 1, false),
              ('Sending Messages & Campaigns', 'Send individual SMS messages, create bulk campaigns with contact segmentation, and use templates for efficient communication.', 'communication', 'Go to Messages — send a quick text to a contact. Then go to Campaigns. Create a new campaign: choose a segment (e.g., Active Leads), write the message content, and start the campaign. Show the progress tracker and delivery stats. Mention throttling (20 SMS/day, 50 emails/day) and pause/resume controls. Show email campaigns using the professional template.', 0, false),
              ('Making & Receiving Calls', 'Use the built-in VoIP dialer to make and receive business calls, with automatic call logging and recording.', 'communication', 'Open the Phone/Dialer. Make an outbound call — show the in-browser calling experience. Show how the call is automatically logged in the contact timeline. Demonstrate call recording playback. Show the call history list. If applicable, show receiving an incoming call notification. Mention conference call capabilities.', 1, false),
              ('AI Virtual Assistant Setup', 'Configure your AI receptionist to handle incoming calls, capture new leads automatically, and route important calls to your team.', 'communication', 'Go to Settings > AI Virtual Assistant (Elite plan). Show: enabling the assistant, choosing call handling mode (answer all, after-hours only, overflow), customizing the greeting message, and setting up call routing rules. Demonstrate a test call showing the AI answering. Show how captured leads appear as new contacts with call transcription. Mention push notifications for new leads.', 2, false),
              ('Subscription Plans & Billing', 'Compare Starter, Core, and Elite plans, manage your subscription, and understand what features are included at each tier.', 'billing', 'Go to Billing page. Show the three plan tiers side by side: Starter (contacts, basic docs, SMS), Core (projects pipeline, campaigns, team), Elite (AI assistant, calendar sync, advanced features). Demonstrate upgrading a plan. Show payment method management. Mention the FuseAI add-on and promo codes. Show where to find invoices and billing history.', 0, false)
            `);
            console.log("[Migration] Seeded 19 default help tutorials");
          }
        } catch (err) {
          console.error("[Migration] Error creating help_tutorials table:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS image_url text`);
          console.log("[Migration] Ensured image_url column on team_messages");
        } catch (err) {
          console.error("[Migration] Error adding image_url to team_messages:", err);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS team_channels (
              id SERIAL PRIMARY KEY,
              company_owner_id VARCHAR NOT NULL,
              name TEXT,
              type TEXT NOT NULL DEFAULT 'general',
              created_by_id VARCHAR NOT NULL,
              member_ids TEXT[] NOT NULL,
              created_at TIMESTAMP DEFAULT NOW(),
              updated_at TIMESTAMP DEFAULT NOW()
            )
          `);
          await db.execute(sql`ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS channel_id INTEGER`);
          console.log("[Migration] Ensured team_channels table and channel_id column");
        } catch (err) {
          console.error("[Migration] Error creating team_channels:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS trial_days INTEGER`);
          console.log("[Migration] Ensured trial_days column on promo_codes");
        } catch (err) {
          console.error("[Migration] Error adding trial_days to promo_codes:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS sendgrid_domain TEXT`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS sendgrid_domain_id INTEGER`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS sendgrid_domain_verified BOOLEAN DEFAULT FALSE`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS sendgrid_from_email TEXT`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS sendgrid_connected_at TIMESTAMP`);
          console.log("[Migration] Ensured SendGrid domain columns on company_settings");
        } catch (err) {
          console.error("[Migration] Error adding SendGrid columns:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS financing_enabled BOOLEAN DEFAULT FALSE`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS financing_provider TEXT`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS financing_link TEXT`);
          console.log("[Migration] Ensured financing columns on company_settings");
        } catch (err) {
          console.error("[Migration] Error adding financing columns:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS attention_digest_enabled BOOLEAN DEFAULT TRUE`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS attention_digest_hour INTEGER DEFAULT 6`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS attention_immediate_enabled BOOLEAN DEFAULT TRUE`);
          // attention_last_notified_ids is NULL until the scheduler observes
          // the user for the first time. NULL means "never seen this user,
          // seed the snapshot without firing pushes." Empty array means
          // "seen, currently has zero attention items." This distinction
          // prevents a burst of pushes on first deploy.
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS attention_last_notified_ids JSONB`);
          // ONE-TIME reset for dev environments where an earlier draft of this
          // migration set DEFAULT '[]'::jsonb. Guarded by a marker column so
          // it never runs again — otherwise it would clobber legitimate
          // steady-state '[]' snapshots from users who genuinely have zero
          // attention items.
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS attention_bootstrap_reset_done BOOLEAN DEFAULT FALSE`);
          await db.execute(sql`UPDATE company_settings SET attention_last_notified_ids = NULL, attention_bootstrap_reset_done = TRUE WHERE attention_bootstrap_reset_done = FALSE AND attention_last_notified_ids = '[]'::jsonb`);
          await db.execute(sql`UPDATE company_settings SET attention_bootstrap_reset_done = TRUE WHERE attention_bootstrap_reset_done = FALSE`);
          console.log("[Migration] Ensured attention notification preference columns on company_settings");
        } catch (err) {
          console.error("[Migration] Error adding attention notification columns:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS secondary_color TEXT`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tagline TEXT`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS document_trust_badges JSONB`);
          console.log("[Migration] Ensured document branding columns on company_settings");
        } catch (err) {
          console.error("[Migration] Error adding document branding columns:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS contractor_signature TEXT`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS use_contractor_signature BOOLEAN DEFAULT FALSE`);
        } catch (err) {
          console.error("[Migration] Error adding contractor signature columns:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS packages_enabled BOOLEAN DEFAULT FALSE`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS package_material_adjustments BOOLEAN DEFAULT FALSE`);
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS proposal_packages (
              id SERIAL PRIMARY KEY,
              user_id VARCHAR NOT NULL,
              name TEXT NOT NULL,
              description TEXT,
              recommended BOOLEAN DEFAULT FALSE,
              price_adjustment_type TEXT NOT NULL DEFAULT 'percent',
              adjustment_value DOUBLE PRECISION NOT NULL DEFAULT 0,
              material_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1.0,
              features JSONB DEFAULT '[]',
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMP DEFAULT NOW()
            )
          `);
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS proposal_upsells (
              id SERIAL PRIMARY KEY,
              user_id VARCHAR NOT NULL,
              name TEXT NOT NULL,
              description TEXT,
              price_type TEXT NOT NULL DEFAULT 'flat',
              price_value DOUBLE PRECISION NOT NULL DEFAULT 0,
              category TEXT,
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMP DEFAULT NOW()
            )
          `);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS upsells_enabled BOOLEAN DEFAULT TRUE`);
          await db.execute(sql`ALTER TABLE proposal_upsells ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`);
          console.log("[Migration] Ensured packages/upsells tables and company_settings columns");
        } catch (err) {
          console.error("[Migration] Error creating packages/upsells:", err);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS package_features_library (
              id SERIAL PRIMARY KEY,
              user_id VARCHAR NOT NULL,
              title TEXT NOT NULL,
              description TEXT,
              created_at TIMESTAMP DEFAULT NOW()
            )
          `);
          await db.execute(sql`ALTER TABLE package_features_library ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`);
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS package_feature_assignments (
              id SERIAL PRIMARY KEY,
              package_id INTEGER NOT NULL,
              feature_id INTEGER NOT NULL,
              included BOOLEAN NOT NULL DEFAULT TRUE,
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMP DEFAULT NOW(),
              UNIQUE(package_id, feature_id)
            )
          `);
          console.log("[Migration] Ensured feature library tables");
        } catch (err) {
          console.error("[Migration] Error creating feature library tables:", err);
        }

        try {
          const pkgUsers = await db.execute(sql`SELECT DISTINCT user_id FROM proposal_packages`);
          for (const row of pkgUsers.rows) {
            const uid = row.user_id as string;
            const pkgsResult = await db.execute(sql`SELECT id, features FROM proposal_packages WHERE user_id = ${uid}`);
            const featsResult = await db.execute(sql`SELECT id, title, description FROM package_features_library WHERE user_id = ${uid}`);
            const assignsResult = await db.execute(sql`SELECT package_id, feature_id, included FROM package_feature_assignments WHERE package_id IN (SELECT id FROM proposal_packages WHERE user_id = ${uid})`);
            const featMap = new Map((featsResult.rows as any[]).map(f => [f.id, f]));
            const assigns = assignsResult.rows as any[];
            for (const pkg of pkgsResult.rows as any[]) {
              const pkgAssigns = assigns.filter((a: any) => a.package_id === pkg.id);
              const assignMap = new Map(pkgAssigns.map((a: any) => [a.feature_id, a.included]));
              const allFeatIds = Array.from(featMap.keys());
              const features = allFeatIds
                .filter(id => featMap.has(id))
                .map(id => ({
                  name: featMap.get(id)!.title,
                  included: assignMap.get(id) ?? false,
                  ...(featMap.get(id)!.description ? { description: featMap.get(id)!.description } : {}),
                }));
              await db.execute(sql`UPDATE proposal_packages SET features = ${JSON.stringify(features)}::jsonb WHERE id = ${pkg.id} AND user_id = ${uid}`);
            }
          }
          console.log("[Migration] Resynced package features with descriptions");
        } catch (err) {
          console.error("[Migration] Error resyncing package features:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS compliance_data JSONB`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS coi_file_path TEXT`);
          await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS coi_file_path TEXT`);
          console.log("[Migration] Ensured compliance and COI columns");
        } catch (err) {
          console.error("[Migration] Error adding compliance columns:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS ai_lead_suggestions_enabled BOOLEAN DEFAULT true`);
          console.log("[Migration] Ensured ai_lead_suggestions_enabled column");
        } catch (err) {
          console.error("[Migration] Error adding ai_lead_suggestions column:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS stripe_account_id TEXT`);
          console.log("[Migration] Ensured stripe_account_id column");
        } catch (err) {
          console.error("[Migration] Error adding stripe_account_id column:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS square_merchant_id TEXT`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS square_access_token TEXT`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS square_refresh_token TEXT`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS square_location_id TEXT`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS active_payment_processor TEXT`);
          console.log("[Migration] Ensured Square and payment processor columns");
        } catch (err) {
          console.error("[Migration] Error adding Square columns:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS cloudflare_hostname_id TEXT`);
          console.log("[Migration] Ensured cloudflare_hostname_id column");
        } catch (err) {
          console.error("[Migration] Error adding cloudflare_hostname_id:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS custom_roles JSONB`);
          console.log("[Migration] Ensured custom_roles column");
        } catch (err) {
          console.error("[Migration] Error adding custom_roles:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS monthly_sales_goal INTEGER`);
          console.log("[Migration] Ensured monthly_sales_goal column");
        } catch (err) {
          console.error("[Migration] Error adding monthly_sales_goal:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS archive_freelancer_email TEXT`);
          console.log("[Migration] Ensured archive_freelancer_email column");
        } catch (err) {
          console.error("[Migration] Error adding archive_freelancer_email:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE company_invitations ADD COLUMN IF NOT EXISTS phone TEXT`);
          await db.execute(sql`ALTER TABLE company_invitations ALTER COLUMN email DROP NOT NULL`);
          console.log("[Migration] Ensured phone column on company_invitations");
        } catch (err) {
          console.error("[Migration] Error adding phone to company_invitations:", err);
        }

        try {
          await db.execute(sql`CREATE TABLE IF NOT EXISTS job_schedule_dates (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL,
            user_id VARCHAR NOT NULL,
            date TEXT NOT NULL,
            start_time TEXT,
            end_time TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT NOW()
          )`);
          console.log("[Migration] Ensured job_schedule_dates table");
        } catch (err) {
          console.error("[Migration] Error creating job_schedule_dates:", err);
        }

        try {
          await db.execute(sql`CREATE TABLE IF NOT EXISTS production_calculators (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR NOT NULL,
            name TEXT NOT NULL,
            surface_id INTEGER,
            material_id INTEGER,
            painters JSONB NOT NULL DEFAULT '[]',
            average_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
            use_as_production_rate BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW()
          )`);
          console.log("[Migration] Ensured production_calculators table");
          await db.execute(sql`ALTER TABLE production_calculators ADD COLUMN IF NOT EXISTS team_member_id INTEGER`);
        } catch (err) {
          console.error("[Migration] Error creating production_calculators:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP`);
          await db.execute(sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS edited_by VARCHAR`);
          await db.execute(sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS edit_reason TEXT`);
          console.log("[Migration] Ensured time_entries edit tracking columns");
        } catch (err) {
          console.error("[Migration] Error adding time_entries edit columns:", err);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS crew_receipt_submissions (
              id SERIAL PRIMARY KEY,
              project_id INTEGER NOT NULL,
              user_id VARCHAR NOT NULL,
              owner_id VARCHAR NOT NULL,
              file_name TEXT NOT NULL,
              storage_key TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',
              title TEXT,
              amount INTEGER,
              vendor TEXT,
              category TEXT,
              receipt_date TIMESTAMP,
              expense_id INTEGER,
              created_at TIMESTAMP DEFAULT NOW()
            )
          `);
          console.log("[Migration] Ensured crew_receipt_submissions table");
          await db.execute(sql`ALTER TABLE crew_receipt_submissions ADD COLUMN IF NOT EXISTS paid_by_worker BOOLEAN DEFAULT false`);
          await db.execute(sql`ALTER TABLE crew_receipt_submissions ADD COLUMN IF NOT EXISTS worker_reimbursement_amount INTEGER`);
        } catch (err) {
          console.error("[Migration] Error creating crew_receipt_submissions:", err);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS project_crew_notes (
              id SERIAL PRIMARY KEY,
              company_owner_id VARCHAR NOT NULL,
              project_id INTEGER,
              created_by_id VARCHAR NOT NULL,
              title TEXT NOT NULL,
              message TEXT,
              priority TEXT NOT NULL DEFAULT 'normal',
              tasks JSONB,
              created_at TIMESTAMP DEFAULT NOW()
            )
          `);
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS project_crew_note_reads (
              id SERIAL PRIMARY KEY,
              note_id INTEGER NOT NULL,
              user_id VARCHAR NOT NULL,
              read_at TIMESTAMP DEFAULT NOW()
            )
          `);
          console.log("[Migration] Ensured project_crew_notes tables");
        } catch (err) {
          console.error("[Migration] Error creating project_crew_notes:", err);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS team_message_reads (
              id SERIAL PRIMARY KEY,
              message_id INTEGER NOT NULL,
              user_id VARCHAR NOT NULL,
              read_at TIMESTAMP DEFAULT NOW()
            )
          `);
          await db.execute(sql`DROP INDEX IF EXISTS idx_tmr_user_msg`);
          await db.execute(sql`
            DELETE FROM team_message_reads a USING team_message_reads b
            WHERE a.id > b.id AND a.user_id = b.user_id AND a.message_id = b.message_id
          `);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_tmr_user_msg ON team_message_reads(user_id, message_id)`);

          const backfillResult = await db.execute(sql`SELECT count(*) as cnt FROM team_message_reads LIMIT 1`);
          const backfillCount = Number((backfillResult as any)?.[0]?.cnt ?? (backfillResult as any)?.rows?.[0]?.cnt ?? 0);
          if (backfillCount === 0) {
            await db.execute(sql`
              INSERT INTO team_message_reads (message_id, user_id)
              SELECT tm.id, member_ids.uid
              FROM team_messages tm
              CROSS JOIN LATERAL (
                SELECT tm.company_owner_id AS uid
                UNION
                SELECT cu.user_id AS uid FROM company_users cu WHERE cu.owner_id = tm.company_owner_id
              ) member_ids
              WHERE tm.is_read = true
                AND tm.sender_id != member_ids.uid
              ON CONFLICT DO NOTHING
            `);
          }

          console.log("[Migration] Ensured team_message_reads table");
        } catch (err) {
          console.error("[Migration] Error creating team_message_reads:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE scheduled_messages ALTER COLUMN phone_number DROP NOT NULL`);
          await db.execute(sql`ALTER TABLE scheduled_messages ALTER COLUMN body DROP NOT NULL`);
          await db.execute(sql`ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS email_to VARCHAR`);
          await db.execute(sql`ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS email_subject VARCHAR`);
          await db.execute(sql`ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS email_body TEXT`);
          await db.execute(sql`ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS email_from_name VARCHAR`);
          await db.execute(sql`ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS email_cta_text VARCHAR`);
          await db.execute(sql`ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS email_cta_url VARCHAR`);
          console.log("[Migration] Ensured scheduled_messages email columns");
        } catch (err) {
          console.error("[Migration] Error adding scheduled_messages email columns:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS costing_snapshot JSONB`);
          await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS locked_overhead_per_hour INTEGER`);
          await db.execute(sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS locked_hourly_rate INTEGER`);
          await db.execute(sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS locked_payroll_burden TEXT`);
          await db.execute(sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS locked_workers_comp TEXT`);
          await db.execute(sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS locked_benefits_per_hour TEXT`);
          console.log("[Migration] Ensured costing snapshot and rate lock columns");
        } catch (err) {
          console.error("[Migration] Error adding costing/rate lock columns:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE booking_forms ADD COLUMN IF NOT EXISTS thank_you_url TEXT`);
          console.log("[Migration] Ensured thank_you_url column on booking_forms");
        } catch (err) {
          console.error("[Migration] Error adding thank_you_url column:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE game_plan_queue ADD COLUMN IF NOT EXISTS page_type TEXT`);
          await db.execute(sql`ALTER TABLE game_plan_target_cities ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE`);
          await db.execute(sql`ALTER TABLE game_plan_settings ADD COLUMN IF NOT EXISTS reviews_widget_code TEXT`);
          console.log("[Migration] Ensured page_type, is_premium, and reviews_widget_code columns");
        } catch (err) {
          console.error("[Migration] Error adding website builder columns:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE game_plan_target_cities ADD COLUMN IF NOT EXISTS city_profile TEXT`);
          await db.execute(sql`ALTER TABLE game_plan_target_cities ADD COLUMN IF NOT EXISTS tone_type TEXT`);
          await db.execute(sql`ALTER TABLE game_plan_target_cities ADD COLUMN IF NOT EXISTS local_housing_notes TEXT`);
          await db.execute(sql`ALTER TABLE game_plan_target_cities ADD COLUMN IF NOT EXISTS common_problems TEXT[]`);
          await db.execute(sql`ALTER TABLE game_plan_target_cities ADD COLUMN IF NOT EXISTS priority_services TEXT[]`);
          await db.execute(sql`ALTER TABLE game_plan_queue ADD COLUMN IF NOT EXISTS seo_details JSONB`);
          await db.execute(sql`ALTER TABLE game_plan_queue ADD COLUMN IF NOT EXISTS tone_type TEXT`);
          await db.execute(sql`ALTER TABLE game_plan_queue ADD COLUMN IF NOT EXISTS intro_style TEXT`);
          await db.execute(sql`ALTER TABLE game_plan_queue ADD COLUMN IF NOT EXISTS cta_style TEXT`);
          await db.execute(sql`ALTER TABLE game_plan_queue ADD COLUMN IF NOT EXISTS publish_blocked BOOLEAN`);
          await db.execute(sql`ALTER TABLE game_plan_queue ADD COLUMN IF NOT EXISTS publish_block_reasons TEXT[]`);
          console.log("[Migration] Ensured SEO scoring and variation columns on game_plan tables");
        } catch (err) {
          console.error("[Migration] Error adding SEO/variation columns:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS linked_user_id VARCHAR`);
          console.log("[Migration] Ensured linked_user_id column on team_members");
        } catch (err) {
          console.error("[Migration] Error adding linked_user_id column:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS booking_request_id INTEGER`);
          console.log("[Migration] Ensured booking_request_id column on appointments");
        } catch (err) {
          console.error("[Migration] Error adding booking_request_id column:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS landing_page TEXT`);
          await db.execute(sql`ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS form_page TEXT`);
          await db.execute(sql`ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS referrer TEXT`);
          await db.execute(sql`ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS utm_source TEXT`);
          await db.execute(sql`ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS utm_medium TEXT`);
          await db.execute(sql`ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS utm_campaign TEXT`);
          await db.execute(sql`ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS source_channel TEXT`);
          console.log("[Migration] Ensured lead tracking columns on booking_requests");
        } catch (err) {
          console.error("[Migration] Error adding lead tracking columns:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE document_photos ADD COLUMN IF NOT EXISTS source TEXT`);
          await db.execute(sql`ALTER TABLE document_photos ADD COLUMN IF NOT EXISTS project_id INTEGER`);
          await db.execute(sql`ALTER TABLE document_photos ALTER COLUMN document_id DROP NOT NULL`);
          console.log("[Migration] Ensured source/project_id columns on document_photos");
        } catch (err) {
          console.error("[Migration] Error adding source column to document_photos:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE proposal_templates ADD COLUMN IF NOT EXISTS entry_order JSONB`);
        } catch (err) {
          console.error("[Migration] entry_order column pre-seed error:", err);
        }
        await seedDefaultTemplatesForAllExistingUsers();

        try {
          const apptConfirmFix = await db.execute(sql`
            UPDATE message_templates
            SET content = 'Hi {{client_name}}, this is {{company_name}}. Your appointment has been confirmed for {{appointment_date}} at {{appointment_time}}.

{{appointment_address}}

We look forward to seeing you! If you need to reschedule, please let us know. {{company_phone}}',
                email_content = 'Hi {{client_name}},

Your appointment with {{company_name}} has been confirmed!

Date: {{appointment_date}}
Time: {{appointment_time}}
{{appointment_address}}

If you need to reschedule or have any questions, please reach out to us at {{company_phone}} or reply to this email.

We look forward to seeing you!

Best regards,
{{company_name}}
{{company_phone}}
{{company_email}}'
            WHERE slug = 'appointment_confirmation'
            AND content NOT LIKE '%appointment_address%'
          `);
          if (apptConfirmFix.rowCount && apptConfirmFix.rowCount > 0) {
            console.log(`[Migration] Updated ${apptConfirmFix.rowCount} appointment_confirmation templates with address placeholder`);
          }

          const apptReminderFix = await db.execute(sql`
            UPDATE message_templates
            SET content = 'Hi {{client_name}}, this is {{company_name}}. Just a reminder about your upcoming appointment on {{appointment_date}} at {{appointment_time}}.

{{appointment_address}}

Please let us know if you need to reschedule. {{company_phone}}',
                email_content = 'Hi {{client_name}},

This is a friendly reminder about your upcoming appointment with {{company_name}}.

Date: {{appointment_date}}
Time: {{appointment_time}}
{{appointment_address}}

If you need to reschedule or have any questions, please contact us at {{company_phone}} or reply to this email.

We look forward to seeing you!

Best regards,
{{company_name}}
{{company_phone}}
{{company_email}}'
            WHERE slug = 'appointment_reminder'
            AND content NOT LIKE '%appointment_address%'
          `);
          if (apptReminderFix.rowCount && apptReminderFix.rowCount > 0) {
            console.log(`[Migration] Updated ${apptReminderFix.rowCount} appointment_reminder templates with address placeholder`);
          }
        } catch (err) {
          console.error("[Migration] Error updating appointment templates:", err);
        }

        try {
          const fixResult = await db.execute(sql`
            UPDATE message_templates
            SET content = 'Hi {{client_name}}, this is {{company_name}}. We''ve received your {{payment_label}} of {{amount}}. Thank you!

Remaining balance: {{remaining_balance}}

View your invoice: {{document_link}}

We appreciate your business.',
                email_subject = '{{payment_label}} Received - Thank You! | {{company_name}}',
                email_content = 'Hi {{client_name}},

We''ve received your {{payment_label}} of {{amount}}. Thank you for your prompt payment!

Remaining balance: {{remaining_balance}}

View your invoice and payment details here:
{{document_link}}

We truly appreciate your business and look forward to working with you.

Best regards,
{{company_name}}
{{company_phone}}
{{company_email}}'
            WHERE slug = 'payment_received'
            AND content NOT LIKE '%document_link%'
          `);
          const fixCount = (fixResult as any).rowCount || 0;
          if (fixCount > 0) {
            console.log(`[Migration] Updated ${fixCount} payment_received templates with invoice link, remaining balance, and payment label tags`);
          }
        } catch (err) {
          console.error("[Migration] Error updating payment_received templates:", err);
        }

        try {
          const stageFixResult = await db.execute(sql`
            UPDATE projects SET stage = 'accepted', stage_changed_at = NOW(), updated_at = NOW()
            WHERE id IN (47, 273)
            AND user_id = 'd919045f-db56-4f2b-abfc-6bdfe83e27b5'
            AND stage = 'invoiced'
          `);
          const stageFixCount = (stageFixResult as any).rowCount || 0;
          if (stageFixCount > 0) {
            console.log(`[Migration] Fixed ${stageFixCount} projects incorrectly moved to invoiced stage`);
          }
        } catch (err) {
          console.error("[Migration] Error fixing project stages:", err);
        }

        try {
          const renameResult = await db.execute(sql`
            UPDATE proposal_packages SET name = CASE
              WHEN name = 'Standard' THEN 'Essential'
              WHEN name = 'Premium' THEN 'Professional'
              WHEN name = 'Luxury' THEN 'Signature'
              ELSE name
            END
            WHERE name IN ('Standard', 'Premium', 'Luxury')
          `);
          const renameCount = (renameResult as any).rowCount || 0;
          if (renameCount > 0) {
            console.log(`[Migration] Renamed ${renameCount} packages: Standard→Essential, Premium→Professional, Luxury→Signature`);
          }
        } catch (err) {
          console.error("[Migration] Error renaming packages:", err);
        }

        await seedDefaultPackagesForAllUsers();

        try {
          const phoneResult = await db.execute(sql`
            UPDATE contacts SET phone = '+1' || RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 10)
            WHERE phone IS NOT NULL 
            AND phone != ''
            AND phone NOT LIKE '+1%'
            AND LENGTH(regexp_replace(phone, '[^0-9]', '', 'g')) >= 10
          `);
          const count = (phoneResult as any).rowCount || 0;
          if (count > 0) {
            console.log(`[Migration] Normalized ${count} phone numbers to +1 format`);
          }
        } catch (err) {
          console.error("[Migration] Error normalizing phone numbers:", err);
        }

        await runProductionDataMigration();

        await runAreaPhotosToPoolMigration();

        const { runProposal337TotalFix } = await import("./proposal337TotalFix");
        await runProposal337TotalFix();

        const { runProdSeedV2 } = await import("./prodSeedV2");
        await runProdSeedV2();

        await seedKasajProposal();

        await runProductionRatesExpansionSeed();
        await runKitchenCabinetsSeed();
        await runAdditionalPrimersAndPaintsSeed();
        await runEcoSpecPaintsSeed();

        await seedGamaPages();

        try {
          const wlEmail = 'gama@gamainteriorpainting.com';
          const wlResult = await db.execute(sql`
            UPDATE users SET white_label_status = 'active'
            WHERE email = ${wlEmail} AND (white_label_status IS NULL OR white_label_status != 'active')
          `);
          const wlCount = (wlResult as any).rowCount || 0;
          if (wlCount > 0) {
            await db.execute(sql`
              UPDATE company_settings SET white_label_enabled = true
              WHERE user_id IN (SELECT id FROM users WHERE email = ${wlEmail}) AND white_label_enabled = false
            `);
            console.log(`[Migration] Enabled Make It Your Own for ${wlEmail}`);
          }
        } catch (err) {
          console.error("[Migration] Error enabling admin white-label:", err);
        }

        try {
          const logoRows = await db.execute(sql`
            SELECT user_id, logo FROM company_settings WHERE logo IS NOT NULL AND logo LIKE 'data:%'
          `);
          const rows = (logoRows as any).rows || [];
          if (rows.length > 0) {
            console.log(`[Migration] Found ${rows.length} base64 logos to migrate to object storage`);
            const privateDir = process.env.PRIVATE_OBJECT_DIR || '';
            if (privateDir) {
              const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage.js");
              const { setObjectAclPolicy } = await import("./replit_integrations/object_storage/objectAcl.js");
              let migrated = 0;
              for (const row of rows) {
                try {
                  const base64Data = row.logo as string;
                  const matches = base64Data.match(/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,(.+)$/i);
                  if (!matches) continue;
                  const ext = matches[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
                  const buffer = Buffer.from(matches[2], 'base64');
                  const contentType = `image/${matches[1]}`;
                  const objectPath = `${privateDir}/logos/${row.user_id}.${ext}`;
                  const pathParts = objectPath.startsWith('/') ? objectPath.slice(1).split('/') : objectPath.split('/');
                  const bucketName = pathParts[0];
                  const objectName = pathParts.slice(1).join('/');
                  const bucket = objectStorageClient.bucket(bucketName);
                  const file = bucket.file(objectName);
                  await file.save(buffer, { contentType, resumable: false });
                  try { await setObjectAclPolicy(file, { owner: row.user_id, visibility: 'public' }); } catch (e) {}
                  const entityId = objectName.replace(/^\.private\//, '');
                  const hostedUrl = `https://app.fusephone.com/objects/${entityId}`;
                  await db.execute(sql`UPDATE company_settings SET logo = ${hostedUrl} WHERE user_id = ${row.user_id}`);
                  migrated++;
                } catch (logoErr) {
                  console.error(`[Migration] Failed to migrate logo for user ${row.user_id}:`, logoErr);
                }
              }
              console.log(`[Migration] Migrated ${migrated}/${rows.length} logos to object storage`);
            }
          }
        } catch (err) {
          console.error("[Migration] Error migrating logos:", err);
        }

        try {
          const jobTemplates = ['job_scheduled', 'job_reminder_day_before', 'job_crew_started'];
          for (const slug of jobTemplates) {
            await db.execute(sql`
              UPDATE message_templates
              SET content = REPLACE(content, '{{company_phone}}', '{{job_address}}' || E'\n\n' || '{{company_phone}}'),
                  email_content = REPLACE(email_content, 'Best regards,', '{{job_address}}' || E'\n\n' || 'Best regards,')
              WHERE slug = ${slug}
              AND content NOT LIKE '%job_address%'
            `);
          }
        } catch (err) {
          console.error("[Migration] Error adding job_address to templates:", err);
        }

        try {
          await db.execute(sql`
            UPDATE message_templates
            SET content = 'Hi {{client_name}}, this is {{company_name}}. Your job has been scheduled for {{scheduled_date}} at {{scheduled_time}}.' || E'\n\n' || '{{job_address}}' || E'\n\n' || 'We look forward to seeing you! Please let us know if you have any questions.' || E'\n\n' || '{{company_phone}}',
                email_content = 'Hi {{client_name}},' || E'\n\n' || 'Great news! Your job has been scheduled with {{company_name}}.' || E'\n\n' || 'Start Date: {{scheduled_date}}' || E'\n' || 'Time: {{scheduled_time}}' || E'\n' || '{{job_address}}' || E'\n\n' || 'Please let us know if you have any questions before we get started. You can reach us at {{company_phone}} or reply to this email.' || E'\n\n' || 'We look forward to getting started!' || E'\n\n' || 'Best regards,' || E'\n' || '{{company_name}}' || E'\n' || '{{company_phone}}' || E'\n' || '{{company_email}}',
                email_subject = 'Your Job is Scheduled for {{scheduled_date}} | {{company_name}}'
            WHERE slug = 'job_scheduled'
            AND content NOT LIKE '%scheduled_date%'
          `);
          console.log("[Migration] Fixed job_scheduled templates to include date/time placeholders");
        } catch (err) {
          console.error("[Migration] Error fixing job_scheduled template:", err);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS paint_colors (
              id SERIAL PRIMARY KEY,
              brand TEXT NOT NULL,
              code TEXT NOT NULL,
              name TEXT NOT NULL,
              hex_color TEXT NOT NULL,
              family TEXT NOT NULL,
              active BOOLEAN DEFAULT TRUE
            )
          `);
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS project_color_selections (
              id SERIAL PRIMARY KEY,
              user_id VARCHAR NOT NULL,
              project_id INTEGER NOT NULL,
              paint_color_id INTEGER,
              area TEXT NOT NULL,
              custom_color_name TEXT,
              custom_hex TEXT,
              notes TEXT,
              created_at TIMESTAMP DEFAULT NOW()
            )
          `);
          await db.execute(sql`
            ALTER TABLE paint_colors ADD COLUMN IF NOT EXISTS collection TEXT
          `);
          const versionCheck = await db.execute(sql`SELECT COUNT(*) as cnt FROM paint_colors WHERE collection IS NOT NULL`);
          const hasCollections = parseInt((versionCheck as any).rows?.[0]?.cnt || '0', 10) > 0;
          if (!hasCollections) {
            const { seedPaintColors } = await import("./paintColorSeed");
            await seedPaintColors();
          }
          await db.execute(sql`
            ALTER TABLE project_color_selections ADD COLUMN IF NOT EXISTS custom_image TEXT
          `);
          await db.execute(sql`
            ALTER TABLE project_color_selections ADD COLUMN IF NOT EXISTS sheen TEXT
          `);
          console.log("[Migration] Ensured paint_colors and project_color_selections tables");
        } catch (err) {
          console.error("[Migration] Error creating paint color tables:", err);
        }

        // message_groups feature removed — see server/routes.ts MESSAGE GROUPS (REMOVED) block.
        // Existing tables are intentionally left in the database; schema sync no longer creates them.

        try {
          await db.execute(sql`ALTER TABLE project_recipients ADD COLUMN IF NOT EXISTS removed_at TIMESTAMP`);
          console.log("[Migration] Ensured removed_at column on project_recipients");
        } catch (err) {
          console.error("[Migration] Error adding removed_at:", err);
        }

        try {
          const fixResult = await db.execute(sql`
            UPDATE projects SET stage = 'invoiced'
            WHERE id = 47 AND stage IN ('accepted', 'scheduled', 'in_progress')
          `);
          if (fixResult.rowCount && fixResult.rowCount > 0) {
            console.log("[Migration] Fixed project #47 (Samuel Frizell) stage to invoiced");
          }
        } catch (err) {
          console.error("[Migration] Error fixing project #47 stage:", err);
        }

        try {
          const stuckLeads = await db.execute(sql`
            UPDATE projects p
            SET stage = 'appointment_requested',
                stage_changed_at = NOW(),
                updated_at = NOW()
            WHERE p.stage = 'new_lead'
              AND EXISTS (
                SELECT 1 FROM appointments a
                WHERE a.contact_id = p.contact_id
                  AND a.user_id = p.user_id
              )
            RETURNING p.id, p.title
          `);
          const fixed = (stuckLeads as any).rows || [];
          if (fixed.length > 0) {
            for (const row of fixed) {
              console.log(`[FixStuckLeads] Advanced project ${row.id} (${row.title}) to appointment_requested`);
            }
          }
        } catch (err) {
          console.error("[FixStuckLeads] Error:", err);
        }

        try {
          const shortTokenDocs = await db.execute(sql`
            SELECT id FROM documents WHERE LENGTH(public_token) < 24
          `);
          if (shortTokenDocs.rows.length > 0) {
            const { nanoid } = await import("nanoid");
            for (const row of shortTokenDocs.rows) {
              const newToken = nanoid(24);
              await db.execute(sql`UPDATE documents SET public_token = ${newToken} WHERE id = ${row.id}`);
            }
            console.log(`[Migration] Upgraded ${shortTokenDocs.rows.length} document tokens to 24 chars`);
          }
          const shortTokenWOs = await db.execute(sql`
            SELECT id FROM work_orders WHERE LENGTH(public_token) < 24
          `);
          if (shortTokenWOs.rows.length > 0) {
            const { nanoid } = await import("nanoid");
            for (const row of shortTokenWOs.rows) {
              const newToken = nanoid(24);
              await db.execute(sql`UPDATE work_orders SET public_token = ${newToken} WHERE id = ${row.id}`);
            }
            console.log(`[Migration] Upgraded ${shortTokenWOs.rows.length} work order tokens to 24 chars`);
          }
        } catch (err) {
          console.error("[Migration] Error upgrading short tokens:", err);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS blocked_numbers (
              id SERIAL PRIMARY KEY,
              user_id VARCHAR NOT NULL,
              phone_number TEXT NOT NULL,
              label TEXT,
              created_at TIMESTAMP DEFAULT NOW()
            )
          `);
          await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS blocked_numbers_user_phone_idx ON blocked_numbers (user_id, phone_number)`);
          console.log("[Migration] Ensured blocked_numbers table");
        } catch (err) {
          console.error("[Migration] Error creating blocked_numbers table:", err);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS game_plan_city_projects (
              id SERIAL PRIMARY KEY,
              target_city_id INTEGER NOT NULL,
              project_title TEXT NOT NULL,
              project_city TEXT NOT NULL,
              completion_date TEXT,
              project_summary TEXT,
              project_images TEXT[] DEFAULT '{}',
              before_after_images JSONB,
              scope_of_work TEXT[] DEFAULT '{}',
              products_used TEXT[],
              project_timeline TEXT,
              project_result TEXT,
              testimonial TEXT,
              property_type TEXT,
              rooms_or_areas TEXT,
              sort_order INTEGER DEFAULT 0,
              published_to_page BOOLEAN DEFAULT false,
              created_at TIMESTAMP DEFAULT NOW(),
              updated_at TIMESTAMP DEFAULT NOW()
            )
          `);
          console.log("[Migration] Ensured game_plan_city_projects table");
        } catch (err) {
          console.error("[Migration] Error creating game_plan_city_projects table:", err);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS client_error_logs (
              id serial PRIMARY KEY,
              user_id varchar,
              error_code varchar(20),
              message text,
              stack text,
              component_stack text,
              url text,
              user_agent text,
              created_at timestamp DEFAULT now()
            )
          `);
          console.log("[Migration] Ensured client_error_logs table");
        } catch (err) {
          console.error("[Migration] Error creating client_error_logs table:", err);
        }

        try {
          const dupeCheckResult = await db.execute(sql`
            SELECT phone, user_id, COUNT(*) as cnt
            FROM contacts
            WHERE phone IS NOT NULL AND phone != ''
            GROUP BY phone, user_id HAVING COUNT(*) > 1
          `);
          const dupeGroups = (dupeCheckResult as any).rows || [];
          if (dupeGroups.length > 0) {
            const dupeRanked = sql`
              SELECT id, phone, user_id,
                ROW_NUMBER() OVER (
                  PARTITION BY phone, user_id
                  ORDER BY
                    CASE WHEN name IN ('New Lead', 'Thumbtack Lead', '') THEN 1 ELSE 0 END,
                    created_at ASC
                ) AS rn,
                FIRST_VALUE(id) OVER (
                  PARTITION BY phone, user_id
                  ORDER BY
                    CASE WHEN name IN ('New Lead', 'Thumbtack Lead', '') THEN 1 ELSE 0 END,
                    created_at ASC
                ) AS keep_id
              FROM contacts
              WHERE phone IS NOT NULL AND phone != ''
              AND phone IN (
                SELECT phone FROM contacts
                WHERE phone IS NOT NULL AND phone != ''
                GROUP BY phone, user_id HAVING COUNT(*) > 1
              )
            `;

            await db.execute(sql`
              WITH ranked AS (${dupeRanked}),
              dupes AS (SELECT id FROM ranked WHERE rn > 1)
              UPDATE scheduled_automations SET status = 'cancelled', error = 'Duplicate contact cleanup'
              WHERE contact_id IN (SELECT id FROM dupes) AND status = 'pending'
            `);

            const tables = ['communications', 'projects', 'documents', 'appointments'];
            let totalReassigned = 0;
            for (const table of tables) {
              try {
                const r = await db.execute(sql.raw(`
                  WITH ranked AS (
                    SELECT id, phone, user_id,
                      ROW_NUMBER() OVER (PARTITION BY phone, user_id ORDER BY CASE WHEN name IN ('New Lead', 'Thumbtack Lead', '') THEN 1 ELSE 0 END, created_at ASC) AS rn,
                      FIRST_VALUE(id) OVER (PARTITION BY phone, user_id ORDER BY CASE WHEN name IN ('New Lead', 'Thumbtack Lead', '') THEN 1 ELSE 0 END, created_at ASC) AS keep_id
                    FROM contacts WHERE phone IS NOT NULL AND phone != '' AND phone IN (SELECT phone FROM contacts WHERE phone IS NOT NULL AND phone != '' GROUP BY phone, user_id HAVING COUNT(*) > 1)
                  ),
                  dupes AS (SELECT id, keep_id FROM ranked WHERE rn > 1)
                  UPDATE ${table} SET contact_id = dupes.keep_id FROM dupes WHERE ${table}.contact_id = dupes.id
                `));
                totalReassigned += (r as any).rowCount || 0;
              } catch {}
            }

            const deleteResult = await db.execute(sql`
              WITH ranked AS (${dupeRanked})
              DELETE FROM contacts WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
            `);
            const deletedCount = (deleteResult as any).rowCount || 0;
            if (deletedCount > 0) {
              console.log(`[DupeCleanup] Removed ${deletedCount} duplicate contacts, reassigned ${totalReassigned} linked records`);
            }
          }
        } catch (err) {
          console.error("[DupeCleanup] Error cleaning duplicate contacts:", err);
        }

        try {
          const GAMA_UID = 'd919045f-db56-4f2b-abfc-6bdfe83e27b5';
          const existingDJ = await db.execute(sql`SELECT COUNT(*) as cnt FROM project_activities WHERE user_id = ${GAMA_UID} AND content LIKE 'Imported from DripJobs%'`);
          const djCount = parseInt((existingDJ as any).rows?.[0]?.cnt || '0', 10);
          if (djCount === 0) {
            const fs = await import('fs');
            const csvPath = 'attached_assets/Jobs_List_20260408_111323_1775735129949.csv';
            if (fs.existsSync(csvPath)) {
              console.log('[Migration] Running DripJobs import for Gama account...');
              const csvData = fs.readFileSync(csvPath, 'utf-8');

              function parseCSVLine(line: string): string[] {
                const result: string[] = [];
                let current = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                  const ch = line[i];
                  if (ch === '"') { inQuotes = !inQuotes; }
                  else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
                  else { current += ch; }
                }
                result.push(current.trim());
                return result;
              }

              function parseDollar(val: string): number {
                const cleaned = val.replace(/[$,()]/g, '').trim();
                const num = parseFloat(cleaned);
                return isNaN(num) ? 0 : Math.round(num * 100);
              }

              function parseDate(val: string): Date | null {
                if (!val || val === 'Accepted without signature' || val === 'N/A') return null;
                const d = new Date(val);
                return isNaN(d.getTime()) ? null : d;
              }

              function normalizePhone(phone: string): string {
                return phone.replace(/\D/g, '').slice(-10);
              }

              function estimateEndDate(startDate: Date, amountCents: number): string {
                const amount = amountCents / 100;
                let days: number;
                if (amount < 1000) days = 1;
                else if (amount < 2000) days = 2;
                else if (amount < 4000) days = 3;
                else if (amount < 6000) days = 5;
                else if (amount < 10000) days = 10;
                else if (amount < 20000) days = 15;
                else days = 21;
                const end = new Date(startDate);
                end.setDate(end.getDate() + days);
                return end.toISOString().split('T')[0];
              }

              const lines = csvData.split('\n').filter((l: string) => l.trim());
              const dataLines = lines.slice(1);

              const contactsResult = await db.execute(sql`SELECT id, phone, lead_source FROM contacts WHERE user_id = ${GAMA_UID} AND phone IS NOT NULL AND phone != ''`);
              const contactByPhone = new Map<string, any>();
              for (const c of (contactsResult as any).rows) {
                const norm = normalizePhone(c.phone);
                if (norm.length >= 10) contactByPhone.set(norm, c);
              }

              const maxProjNumResult = await db.execute(sql`SELECT COALESCE(MAX(project_number), 0) as max_num FROM projects WHERE user_id = ${GAMA_UID}`);
              let nextProjectNumber = parseInt((maxProjNumResult as any).rows?.[0]?.max_num || '0', 10) + 1;

              let projectsCreated = 0;
              let proposalsCreated = 0;
              let invoicesCreated = 0;
              let notMatched = 0;

              for (let i = 0; i < dataLines.length; i++) {
                const fields = parseCSVLine(dataLines[i]);
                if (fields.length < 22) continue;

                const [status, label, jobName, firstName, lastName, email, phone,
                  salesperson, projectManager, crew, proposalId, invoiceId,
                  invoiceStatus, amount, paid, balance, dealStage, dealStageDate,
                  proposalSignedDate, jobScheduleDate, jobStartDate, jobCompletionDate] = fields;

                const fullName = `${firstName} ${lastName}`.trim();
                const isVoided = invoiceStatus === 'Voided' || invoiceStatus === 'Cancelled';

                const normPhone = normalizePhone(phone);
                const contact = contactByPhone.get(normPhone);
                if (!contact) { notMatched++; continue; }

                const amountCents = parseDollar(amount);
                const signedDate = parseDate(proposalSignedDate);
                const stageDate = parseDate(dealStageDate);
                const startDate = signedDate || stageDate || new Date('2023-01-01');
                const scheduledDateStr = startDate.toISOString().split('T')[0];
                const endDateStr = estimateEndDate(startDate, amountCents);
                const completionDate = stageDate || signedDate || new Date();

                const projectTitle = jobName || `${fullName} - DripJobs Import`;
                const projectStage = isVoided ? 'cancelled' : 'completed';
                const projectSource = contact.lead_source || 'other';
                const projResult = await db.execute(sql`
                  INSERT INTO projects (user_id, contact_id, title, stage, source, total_amount, scheduled_date, scheduled_end_date, stage_changed_at, created_at, updated_at, project_number)
                  VALUES (${GAMA_UID}, ${contact.id}, ${projectTitle}, ${projectStage}, ${projectSource}, ${amountCents}, ${scheduledDateStr}, ${endDateStr}, ${completionDate}, ${startDate}, ${completionDate}, ${nextProjectNumber})
                  RETURNING id
                `);
                nextProjectNumber++;
                const projectId = (projResult as any).rows[0].id;
                projectsCreated++;

                const proposalUrl = proposalId ? `https://app.dripjobs.com/customerportal/proposals?customerId=${proposalId.replace('#', '')}` : '';
                const invoiceUrl = invoiceId ? `https://app.dripjobs.com/customerportal/invoices?customerId=${invoiceId.replace('#', '')}` : '';
                const urlLines = [
                  proposalUrl ? `Proposal URL: ${proposalUrl}` : '',
                  invoiceUrl ? `Invoice URL: ${invoiceUrl}` : '',
                ].filter(Boolean).join('\n');
                const activityContent = `Imported from DripJobs (Proposal #${proposalId}${invoiceId ? `, Invoice ${invoiceId}` : ''})\n${urlLines}`;
                await db.execute(sql`
                  INSERT INTO project_activities (user_id, project_id, type, content, created_at)
                  VALUES (${GAMA_UID}, ${projectId}, 'system', ${activityContent}, ${startDate})
                `);

                const { nanoid } = await import('nanoid');

                if (proposalId && proposalId.trim()) {
                  const proposalContent = JSON.stringify({
                    items: [{
                      id: crypto.randomUUID(),
                      description: projectTitle,
                      quantity: 1,
                      unitPrice: amountCents,
                      total: amountCents,
                    }],
                    notes: `Imported from DripJobs. Original Proposal: ${proposalId}`,
                  });
                  const proposalDocTitle = `Proposal - ${projectTitle}`;
                  const proposalStatus = signedDate ? 'accepted' : 'sent';
                  const proposalToken = nanoid(24);
                  await db.execute(sql`
                    INSERT INTO documents (user_id, contact_id, project_id, type, status, title, content, total_amount, signed_at, created_at, updated_at, public_token)
                    VALUES (${GAMA_UID}, ${contact.id}, ${projectId}, 'proposal', ${proposalStatus}, ${proposalDocTitle}, ${proposalContent}::jsonb, ${amountCents}, ${signedDate}, ${startDate}, ${completionDate}, ${proposalToken})
                  `);
                  proposalsCreated++;
                }

                if (invoiceId && invoiceId.trim()) {
                  const paymentSchedule = {
                    depositRequired: false,
                    depositType: 'fixed',
                    depositAmount: 0,
                    schedule: [{
                      label: 'Full Payment',
                      amount: amountCents / 100,
                      dueCondition: 'Upon completion',
                      paid: true,
                      paidAt: completionDate.toISOString(),
                    }],
                    showPaymentSchedule: false,
                  };

                  const docContent = JSON.stringify({
                    items: [{
                      id: crypto.randomUUID(),
                      description: projectTitle,
                      quantity: 1,
                      unitPrice: amountCents,
                      total: amountCents,
                    }],
                    notes: `Imported from DripJobs. Original Invoice: ${invoiceId}`,
                    paymentSettings: paymentSchedule,
                  });

                  const docTitle = `Invoice - ${projectTitle}`;
                  const docStatus = isVoided ? 'cancelled' : 'paid';
                  const docToken = nanoid(24);
                  await db.execute(sql`
                    INSERT INTO documents (user_id, contact_id, project_id, type, status, title, content, total_amount, signed_at, created_at, updated_at, public_token)
                    VALUES (${GAMA_UID}, ${contact.id}, ${projectId}, 'invoice', ${docStatus}, ${docTitle}, ${docContent}::jsonb, ${amountCents}, ${signedDate}, ${startDate}, ${completionDate}, ${docToken})
                  `);
                  invoicesCreated++;
                }
              }

              console.log(`[Migration] DripJobs import complete: ${projectsCreated} projects, ${proposalsCreated} proposals, ${invoicesCreated} invoices created. ${notMatched} not matched.`);
            }
          } else {
            console.log(`[Migration] DripJobs import already done (${djCount} projects exist)`);
          }
        } catch (err) {
          console.error("[Migration] DripJobs import error:", err);
        }

        try {
          const unlinkedDJ = await db.execute(sql`
            SELECT dp.id, dp.project_id, dp.file_name
            FROM document_photos dp
            WHERE dp.source = 'dripjobs' AND dp.document_id IS NULL AND dp.project_id IS NOT NULL
          `);
          const unlinkedRows = (unlinkedDJ as any).rows || [];
          if (unlinkedRows.length > 0) {
            console.log(`[Migration] Linking ${unlinkedRows.length} DripJobs PDFs to their documents...`);
            for (const row of unlinkedRows) {
              const isProposal = row.file_name?.includes('proposal');
              const docType = isProposal ? 'proposal' : 'invoice';
              const matchDoc = await db.execute(sql`
                SELECT id FROM documents WHERE project_id = ${row.project_id} AND type = ${docType} LIMIT 1
              `);
              const docId = (matchDoc as any).rows?.[0]?.id;
              if (docId) {
                await db.execute(sql`UPDATE document_photos SET document_id = ${docId} WHERE id = ${row.id}`);
              }
            }
            console.log(`[Migration] DripJobs PDF linking done`);
          }
        } catch (err) {
          console.error("[Migration] DripJobs PDF linking error:", err);
        }

        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS paint_orders (
              id SERIAL PRIMARY KEY,
              project_id INTEGER NOT NULL,
              user_id VARCHAR NOT NULL,
              items JSONB NOT NULL DEFAULT '[]',
              status TEXT NOT NULL DEFAULT 'draft',
              sent_at TIMESTAMP,
              sent_via TEXT,
              sent_to TEXT,
              notes TEXT,
              created_at TIMESTAMP DEFAULT NOW(),
              updated_at TIMESTAMP DEFAULT NOW()
            )
          `);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS paint_store_name TEXT`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS paint_store_phone TEXT`);
          await db.execute(sql`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS paint_store_email TEXT`);
          await db.execute(sql`ALTER TABLE paint_orders ADD COLUMN IF NOT EXISTS supplier_id INTEGER`);
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS suppliers (
              id SERIAL PRIMARY KEY,
              user_id VARCHAR NOT NULL,
              name TEXT NOT NULL,
              phone TEXT,
              email TEXT,
              notes TEXT,
              created_at TIMESTAMP DEFAULT NOW(),
              updated_at TIMESTAMP DEFAULT NOW()
            )
          `);
          console.log("[Migration] Ensured paint_orders, suppliers tables and paint store columns");
        } catch (err) {
          console.error("[Migration] Error creating paint_orders/suppliers:", err);
        }

        try {
          const bladerFix = await db.execute(sql`
            UPDATE color_submissions
            SET status = 'approved', customer_approved = true, customer_approved_at = NOW()
            WHERE id = 5 AND project_id = 292 AND status != 'approved'
          `);
          const rowCount = (bladerFix as any).rowCount || 0;
          if (rowCount > 0) {
            console.log("[Migration] Re-locked Adrian Blader color submission (ID 5)");
          }
        } catch (err) {
          console.error("[Migration] Blader fix error:", err);
        }

        try {
          await db.execute(sql`
            ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS new_sms_auto_reply_enabled BOOLEAN DEFAULT false;
            ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS new_sms_auto_reply_message TEXT;
          `);
          console.log("[Migration] Ensured new SMS auto-reply columns on company_settings");
        } catch (err) {
          console.error("[Migration] SMS auto-reply columns error:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE proposal_templates ADD COLUMN IF NOT EXISTS entry_order JSONB`);
          console.log("[Migration] Ensured entry_order column on proposal_templates");
        } catch (err) {
          console.error("[Migration] entry_order column error:", err);
        }

        // One-shot fix for orphan change orders that were created via the
        // (now-removed) project "+ Change Order" button. Each orphan is linked
        // to its parent proposal and rolled into the proposal/invoice/project
        // totals so it behaves like a normal CO. Idempotent: only runs while
        // source_document_id IS NULL on the target row.
        try {
          const orphanFixes: Array<{
            coId: number;
            proposalId: number;
            invoiceId: number | null;
            projectId: number;
            amount: number;
          }> = [
            { coId: 318, proposalId: 146, invoiceId: 317, projectId: 311, amount: 117997 },
            { coId: 112, proposalId: 32, invoiceId: 93, projectId: 47, amount: 20000 },
          ];
          for (const fix of orphanFixes) {
            const co: any = (await db.execute(sql`SELECT id, user_id, total_amount, content, source_document_id FROM documents WHERE id = ${fix.coId} AND type = 'change_order'`)).rows?.[0];
            if (!co || co.source_document_id) continue;
            if ((co.total_amount as number) !== fix.amount) {
              console.log(`[Migration] Skipping orphan CO ${fix.coId}: amount drift (db=${co.total_amount}, expected=${fix.amount})`);
              continue;
            }
            await db.execute(sql`UPDATE documents SET source_document_id = ${fix.proposalId} WHERE id = ${fix.coId}`);
            await db.execute(sql`UPDATE documents SET total_amount = total_amount + ${fix.amount} WHERE id = ${fix.proposalId}`);
            await db.execute(sql`UPDATE projects SET total_amount = COALESCE(total_amount, 0) + ${fix.amount} WHERE id = ${fix.projectId}`);
            if (fix.invoiceId) {
              const inv: any = (await db.execute(sql`SELECT id, total_amount, content FROM documents WHERE id = ${fix.invoiceId}`)).rows?.[0];
              if (inv) {
                const coItems = ((co.content?.items as any[]) || []).map((item: any) => ({ ...item, name: `[CO] ${item?.name || ''}` }));
                const invContent = inv.content || {};
                const newContent = { ...invContent, items: [...((invContent.items as any[]) || []), ...coItems] };
                await db.execute(sql`UPDATE documents SET total_amount = total_amount + ${fix.amount}, content = ${JSON.stringify(newContent)}::jsonb WHERE id = ${fix.invoiceId}`);
              }
            }
            console.log(`[Migration] Linked orphan CO ${fix.coId} -> proposal ${fix.proposalId} (+$${(fix.amount / 100).toFixed(2)})`);
          }

          // Wipe all documents on Gama Prueba test project (id 499) — user-requested cleanup of test data.
          // Also clears the proposal's stale linked_invoice_id pointer first to avoid dangling references.
          try {
            const gamaTestDocs: any = (await db.execute(sql`SELECT id, type, title FROM documents WHERE project_id = 499`)).rows || [];
            if (gamaTestDocs.length > 0) {
              await db.execute(sql`UPDATE documents SET linked_invoice_id = NULL, source_document_id = NULL WHERE project_id = 499`);
              await db.execute(sql`DELETE FROM payments WHERE document_id IN (SELECT id FROM documents WHERE project_id = 499)`);
              await db.execute(sql`DELETE FROM document_views WHERE document_id IN (SELECT id FROM documents WHERE project_id = 499)`);
              await db.execute(sql`DELETE FROM document_recipients WHERE document_id IN (SELECT id FROM documents WHERE project_id = 499)`);
              await db.execute(sql`DELETE FROM document_photos WHERE document_id IN (SELECT id FROM documents WHERE project_id = 499)`);
              await db.execute(sql`DELETE FROM color_submissions WHERE document_id IN (SELECT id FROM documents WHERE project_id = 499)`);
              await db.execute(sql`DELETE FROM scheduled_automations WHERE document_id IN (SELECT id FROM documents WHERE project_id = 499)`);
              await db.execute(sql`DELETE FROM shared_photo_links WHERE document_id IN (SELECT id FROM documents WHERE project_id = 499)`);
              await db.execute(sql`UPDATE jobs SET document_id = NULL WHERE document_id IN (SELECT id FROM documents WHERE project_id = 499)`);
              await db.execute(sql`UPDATE notifications SET document_id = NULL WHERE document_id IN (SELECT id FROM documents WHERE project_id = 499)`);
              await db.execute(sql`UPDATE communications SET document_id = NULL WHERE document_id IN (SELECT id FROM documents WHERE project_id = 499)`);
              await db.execute(sql`DELETE FROM documents WHERE project_id = 499`);
              await db.execute(sql`UPDATE projects SET total_amount = 0 WHERE id = 499`);
              console.log(`[Migration] Wiped ${gamaTestDocs.length} test documents from Gama Prueba (project 499)`);
            }
          } catch (err) {
            console.error("[Migration] Gama Prueba doc wipe error:", err);
          }

          // Delete the $0 draft orphan (project 48, CO #29) — no financial impact.
          const sam: any = (await db.execute(sql`SELECT id, total_amount, source_document_id, status FROM documents WHERE id = 29 AND type = 'change_order'`)).rows?.[0];
          if (sam && !sam.source_document_id && (sam.total_amount as number) === 0 && sam.status === 'draft') {
            await db.execute(sql`DELETE FROM documents WHERE id = 29`);
            console.log(`[Migration] Deleted empty orphan CO 29`);
          }
        } catch (err) {
          console.error("[Migration] Orphan CO fix error:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE surfaces ADD COLUMN IF NOT EXISTS sqft_per_unit DOUBLE PRECISION`);
          await db.execute(sql`
            UPDATE surfaces SET sqft_per_unit = CASE
              WHEN surface_key LIKE '%cabinet_doors%' THEN 6
              WHEN surface_key LIKE '%drawers%' THEN 3
              WHEN surface_key LIKE '%side_panels%' THEN 9
              WHEN surface_key LIKE '%shelves%' THEN 4.5
              WHEN surface_key LIKE '%filler_strips%' THEN 1.5
              WHEN surface_key LIKE '%crown_molding%' THEN 2
              WHEN surface_key LIKE '%cabinet_boxes%' THEN 12
              WHEN surface_key LIKE '%cabinet_interiors%' THEN 8
              WHEN surface_key LIKE '%islands%' THEN 24
              WHEN surface_key = 'doors' THEN 21
              WHEN surface_key = 'front_door' THEN 21
              WHEN surface_key LIKE '%exterior_doors%' THEN 21
              WHEN surface_key = 'shutters' THEN 8
              WHEN surface_key LIKE '%columns%' OR surface_key LIKE '%posts%' THEN 12
              WHEN surface_key = 'garage_door' THEN 112
              WHEN surface_key LIKE '%bollards%' THEN 6
              ELSE 1
            END
            WHERE unit = 'each' AND sqft_per_unit IS NULL
          `);
          console.log("[Migration] Ensured sqft_per_unit column on surfaces");
        } catch (err) {
          console.error("[Migration] Error adding sqft_per_unit:", err);
        }

        try {
          await db.execute(sql`ALTER TABLE surfaces ADD COLUMN IF NOT EXISTS pricing_mode VARCHAR DEFAULT 'production_rate'`);
          await db.execute(sql`ALTER TABLE surfaces ADD COLUMN IF NOT EXISTS price_per_unit DOUBLE PRECISION`);

          const flooringCheck = await db.execute(sql`SELECT COUNT(*) as cnt FROM surfaces WHERE estimate_type = 'Flooring Installation'`);
          const flooringCount = parseInt((flooringCheck as any).rows?.[0]?.cnt || '0', 10);
          if (flooringCount === 0) {
            const users = await db.execute(sql`SELECT id FROM users`);
            const userRows = (users as any).rows || [];
            for (const u of userRows) {
              const flooringSurfaces = [
                { name: 'Hardwood Floor', key: 'hardwood_floor', unit: 'sqft', rate: 40, coats: 1, cat: 'Hardwood', mode: 'per_unit', ppu: 6 },
                { name: 'Sanding', key: 'sanding', unit: 'sqft', rate: 80, coats: 1, cat: 'Hardwood', mode: 'per_unit', ppu: 2 },
                { name: 'Polyurethane / Finish', key: 'polyurethane_finish', unit: 'sqft', rate: 200, coats: 2, cat: 'Hardwood', mode: 'per_unit', ppu: 1.50 },
                { name: 'Laminate Floor', key: 'laminate_floor', unit: 'sqft', rate: 60, coats: 1, cat: 'Laminate', mode: 'per_unit', ppu: 4 },
                { name: 'Underlayment', key: 'underlayment', unit: 'sqft', rate: 100, coats: 1, cat: 'Prep', mode: 'per_unit', ppu: 1 },
                { name: 'Carpet Removal', key: 'carpet_removal', unit: 'sqft', rate: 100, coats: 1, cat: 'Demo', mode: 'per_unit', ppu: 1.50 },
              ];
              for (const s of flooringSurfaces) {
                await db.execute(sql`INSERT INTO surfaces (user_id, surface_name, surface_key, unit, production_rate_units_per_labor_hour, default_coats, estimate_type, rate_category, pricing_mode, price_per_unit, use_primer)
                  VALUES (${u.id}, ${s.name}, ${s.key}, ${s.unit}, ${s.rate}, ${s.coats}, 'Flooring Installation', ${s.cat}, ${s.mode}, ${s.ppu}, false)`);
              }
            }
            console.log("[Migration] Seeded Flooring Installation surfaces for all users");
          }
          console.log("[Migration] Ensured pricing_mode and price_per_unit columns on surfaces");

          // The previous iteration of this column was named
          // `default_preselect_assigned_crew`. Drop it so production
          // schemas converge on the correct semantics.
          await db.execute(sql`ALTER TABLE work_order_settings DROP COLUMN IF EXISTS default_preselect_assigned_crew`);
          await db.execute(sql`ALTER TABLE work_order_settings ADD COLUMN IF NOT EXISTS show_assigned_crew boolean NOT NULL DEFAULT false`);
          await db.execute(sql`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS show_assigned_crew boolean NOT NULL DEFAULT false`);
          console.log("[Migration] Ensured show_assigned_crew columns on work_order_settings and work_orders");

          // === Per-proposal ownership for colors and work orders ===
          // Add nullable document_id to colors/work-orders tables, then
          // backfill each row to the OLDEST proposal/estimate on the
          // project (per user preference for multi-proposal projects).
          await db.execute(sql`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS document_id integer`);
          await db.execute(sql`ALTER TABLE project_color_selections ADD COLUMN IF NOT EXISTS document_id integer`);
          await db.execute(sql`ALTER TABLE project_color_groups ADD COLUMN IF NOT EXISTS document_id integer`);

          // Backfill: for each table, attach NULL document_id rows to
          // the project's oldest proposal/estimate document. Projects
          // with no proposal yet stay NULL and will get attached when
          // their first proposal is created.
          const backfillSql = (table: string) => sql.raw(`
            UPDATE ${table} t
            SET document_id = sub.doc_id
            FROM (
              SELECT DISTINCT ON (project_id) project_id, id AS doc_id
              FROM documents
              WHERE type IN ('proposal', 'estimate')
              ORDER BY project_id, created_at ASC
            ) sub
            WHERE t.document_id IS NULL AND t.project_id = sub.project_id
          `);
          await db.execute(backfillSql("work_orders"));
          await db.execute(backfillSql("project_color_selections"));
          await db.execute(backfillSql("project_color_groups"));
          // color_submissions already has document_id; backfill any NULLs
          await db.execute(sql.raw(`
            UPDATE color_submissions t
            SET document_id = sub.doc_id
            FROM (
              SELECT DISTINCT ON (project_id) project_id, id AS doc_id
              FROM documents
              WHERE type IN ('proposal', 'estimate')
              ORDER BY project_id, created_at ASC
            ) sub
            WHERE t.document_id IS NULL AND t.project_id = sub.project_id
          `));
          console.log("[Migration] Per-proposal ownership: added document_id columns and backfilled colors/work_orders to oldest proposal");
        } catch (err) {
          console.error("[Migration] Error adding pricing columns:", err);
        }

        try {
          const fbCheck = await db.execute(sql`SELECT COUNT(*) as cnt FROM paint_colors WHERE brand = 'Farrow & Ball'`);
          const fbCount = parseInt((fbCheck as any).rows?.[0]?.cnt || '0', 10);
          if (fbCount < 132) {
            const { seedFarrowBallColors } = await import("./paintColorSeed");
            await seedFarrowBallColors();
            console.log("[Migration] Seeded Farrow & Ball paint colors");
          }
        } catch (err) {
          console.error("[Migration] Farrow & Ball seed error:", err);
        }

        try {
          const usersWithTax = await db.execute(sql`
            SELECT cs.user_id, cs.tax_rate, cs.company_name
            FROM company_settings cs
            WHERE cs.tax_rate IS NOT NULL AND cs.tax_rate != '' AND CAST(cs.tax_rate AS NUMERIC) > 0
            AND cs.user_id NOT IN (SELECT user_id FROM tax_profiles)
          `);
          const rows = (usersWithTax as any).rows || [];
          for (const row of rows) {
            await db.execute(sql`
              INSERT INTO tax_profiles (user_id, name, rate, is_default)
              VALUES (${row.user_id}, 'Default Tax', ${row.tax_rate}, true)
            `);
            console.log(`[Migration] Auto-created "Default Tax" profile for ${row.company_name || row.user_id} at ${row.tax_rate}%`);
          }
          if (rows.length > 0) {
            console.log(`[Migration] Seeded ${rows.length} default tax profile(s) from existing company tax rates`);
          }
        } catch (err) {
          console.error("[Migration] Tax profile seed error:", err);
        }

        startAutomationRunner(60000);
        startAffiliatePayoutScheduler();
        startAccountPurgeScheduler();
        startAttentionDigestScheduler();

        // Account-deletion lifecycle columns (Apple Guideline 5.1.1(v)).
        try {
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status varchar DEFAULT 'active'`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamp`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS scheduled_purge_at timestamp`);
          await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS purged_at timestamp`);
          await db.execute(sql`UPDATE users SET account_status = 'active' WHERE account_status IS NULL`);
          await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_scheduled_purge_at ON users(scheduled_purge_at) WHERE scheduled_purge_at IS NOT NULL`);
        } catch (err) {
          console.error("[Migration] Account-deletion columns error:", err);
        }

        try {
          const { runMigrations } = await import('stripe-replit-sync');
          const { getStripeSync } = await import('./stripeClient');
          
          console.log('[Stripe] Initializing schema...');
          await runMigrations({ databaseUrl: process.env.DATABASE_URL! });
          console.log('[Stripe] Schema ready');

          const stripeSync = await getStripeSync();

          // CRITICAL: Only register Stripe webhook URL from production deployments.
          // Previously this ran in dev too, causing the dev preview URL to overwrite
          // the production webhook config in Stripe — silently dropping every real
          // customer event (cancels, upgrades, payments) because dev was usually asleep.
          // Fixed May 19, 2026 after Denis Ramos cancellation was missed.
          if (process.env.REPLIT_DEPLOYMENT === '1') {
            const domain = process.env.REPLIT_DOMAINS?.split(',')[0];
            if (domain) {
              try {
                const webhookUrl = `https://${domain}/api/stripe/webhook`;
                const result = await stripeSync.findOrCreateManagedWebhook(webhookUrl);
                if (result?.webhook?.url) {
                  console.log(`[Stripe] Webhook configured: ${result.webhook.url}`);
                } else {
                  console.log('[Stripe] Webhook setup completed');
                }
              } catch (webhookErr: any) {
                console.log('[Stripe] Webhook setup skipped:', webhookErr.message || 'non-critical');
              }
            }
          } else {
            console.log('[Stripe] Webhook registration skipped (dev environment — production owns the webhook URL)');
          }

          stripeSync.syncBackfill()
            .then(() => console.log('[Stripe] Data synced'))
            .catch((err: any) => console.error('[Stripe] Sync error:', err));
        } catch (err) {
          console.error('[Stripe] Initialization error:', err);
        }
      })();
    },
  );
})();
