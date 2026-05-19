import type { Express, Request, Response } from "express";
import { db } from "./db";
import { users } from "@shared/models/auth";
import {
  referrals,
  giftCardRequests,
  affiliates,
  affiliateReferrals,
  affiliateCommissions,
  affiliatePayouts,
  insertAffiliateSchema,
} from "@shared/schema";
import { eq, and, desc, sql, gte, isNull } from "drizzle-orm";
import { isAuthenticated } from "./customAuth";
import { sendSystemEmail } from "./systemEmail";
import { sendPushToUser } from "./pushNotifications";

function getUserId(req: any): string {
  return (req.session as any)?.userId || (req as any).user?.id;
}

function getAppBaseUrl(): string {
  if (process.env.REPLIT_DEPLOYMENT === '1' && process.env.REPLIT_DOMAINS) {
    const domains = process.env.REPLIT_DOMAINS.split(',');
    const domain = domains.find(d => !d.includes('.replit.')) || domains[0];
    return `https://${domain}`;
  }
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return 'http://localhost:5000';
}

function getAffiliateBaseUrl(): string {
  // In production, the affiliate program lives on its own subdomain.
  if (process.env.REPLIT_DEPLOYMENT === '1') return 'https://affiliate.fusephone.com';
  // In dev, fall back to legacy /affiliate path on the dev host.
  return getAppBaseUrl();
}

async function notifyAdminsOfAffiliateApplication(payload: {
  fullName: string;
  email: string;
  socialPlatform?: string | null;
  socialHandle?: string | null;
  followerCount?: number | null;
  websiteUrl?: string | null;
  applicationNotes?: string | null;
}): Promise<void> {
  try {
    const admins = await db
      .select({ id: users.id, email: users.email, firstName: users.firstName })
      .from(users)
      .where(eq(users.isAdmin, true));

    const baseUrl = getAppBaseUrl();
    const adminLink = `${baseUrl}/admin/affiliates`;

    const lines: string[] = [];
    lines.push(`<p><strong>${escapeHtml(payload.fullName)}</strong> just applied to be an affiliate.</p>`);
    lines.push(`<table style="border-collapse:collapse;font-size:14px"><tbody>`);
    lines.push(`<tr><td style="padding:4px 12px 4px 0;color:#666">Email</td><td style="padding:4px 0">${escapeHtml(payload.email)}</td></tr>`);
    if (payload.socialPlatform || payload.socialHandle) {
      lines.push(`<tr><td style="padding:4px 12px 4px 0;color:#666">Social</td><td style="padding:4px 0">${escapeHtml(payload.socialPlatform || '')} ${payload.socialHandle ? '@' + escapeHtml(payload.socialHandle) : ''}</td></tr>`);
    }
    if (payload.followerCount) {
      lines.push(`<tr><td style="padding:4px 12px 4px 0;color:#666">Followers</td><td style="padding:4px 0">${payload.followerCount.toLocaleString()}</td></tr>`);
    }
    if (payload.websiteUrl) {
      lines.push(`<tr><td style="padding:4px 12px 4px 0;color:#666">Website</td><td style="padding:4px 0"><a href="${escapeAttr(payload.websiteUrl)}">${escapeHtml(payload.websiteUrl)}</a></td></tr>`);
    }
    lines.push(`</tbody></table>`);
    if (payload.applicationNotes) {
      lines.push(`<p style="margin-top:12px"><strong>Why they applied:</strong><br>${escapeHtml(payload.applicationNotes).replace(/\n/g, '<br>')}</p>`);
    }
    lines.push(`<p style="margin-top:20px"><a href="${adminLink}" style="display:inline-block;padding:10px 18px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Review application</a></p>`);

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px">
        <h2 style="margin:0 0 12px;font-size:18px">New affiliate application</h2>
        ${lines.join('\n')}
      </div>`;

    await Promise.all(
      admins.map(async (admin) => {
        if (admin.email) {
          sendSystemEmail(admin.email, `New affiliate application: ${payload.fullName}`, html, 'Fuse Phone Affiliates').catch((err) => {
            console.error('[Affiliate] admin email failed', err);
          });
        }
        sendPushToUser(admin.id, {
          title: 'New affiliate application',
          body: `${payload.fullName} just applied. Tap to review.`,
          url: '/admin/affiliates',
          tag: 'affiliate-application',
        }).catch((err) => {
          console.error('[Affiliate] admin push failed', err);
        });
      })
    );
  } catch (err) {
    console.error('[Affiliate] notifyAdminsOfAffiliateApplication failed', err);
  }
}

async function sendAffiliateApprovalEmail(toEmail: string, fullName: string, isExistingUser: boolean): Promise<void> {
  if (!toEmail) return;
  try {
    const affBase = getAffiliateBaseUrl();
    const loginUrl = `${affBase}/login`;

    const accessBlock = `<p>Sign in to your affiliate portal using this email address: <strong>${escapeHtml(toEmail)}</strong>. No password needed — we'll email you a 6-digit code each time.</p>
       <ol style="padding-left:20px;margin:8px 0">
         <li>Open <a href="${loginUrl}" style="color:#10b981">${escapeHtml(loginUrl.replace(/^https?:\/\//, ''))}</a> (or tap the button below).</li>
         <li>Enter <strong>${escapeHtml(toEmail)}</strong> and tap "Email me a code".</li>
         <li>Type the 6-digit code we send you.</li>
         <li>You'll land on your affiliate dashboard — copy your referral link and set up Stripe payouts.</li>
       </ol>
       <p style="margin-top:18px"><a href="${loginUrl}" style="display:inline-block;padding:12px 22px;background:#10b981;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Open my affiliate portal</a></p>
       <p style="font-size:13px;color:#666;margin-top:8px">Button not working? Copy and paste this link into your browser:<br><a href="${loginUrl}" style="color:#10b981;word-break:break-all">${escapeHtml(loginUrl)}</a></p>`;

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px;line-height:1.55">
        <h2 style="margin:0 0 14px;font-size:22px">You're in, ${escapeHtml(fullName.split(' ')[0] || 'there')} 🎉</h2>
        <p>Welcome to the Fuse Phone Affiliate Program. Your application has been <strong>approved</strong>.</p>
        <p>You'll earn <strong>10% recurring commission</strong> on every paying contractor you refer — for the first 12 months of their subscription.</p>
        ${accessBlock}
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="font-size:13px;color:#666">Questions? Just reply to this email. We're excited to grow with you.</p>
        <p style="font-size:13px;color:#666">— The Fuse Phone Team</p>
      </div>`;

    await sendSystemEmail(toEmail, "You're approved - welcome to the Fuse Phone Affiliate Program", html, 'Fuse Phone Affiliates');
  } catch (err) {
    console.error('[Affiliate] approval email failed', err);
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

async function ensureAdmin(req: Request, res: Response): Promise<{ id: string } | null> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  const [u] = await db.select({ id: users.id, isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId));
  if (!u || !u.isAdmin) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  return { id: u.id };
}

export function registerReferralRoutes(app: Express) {
  /** Public: look up a referral slug (used by /auth?ref=) to display the referrer name on the banner */
  app.get("/api/public/referral/:code", async (req, res) => {
    try {
      const code = String(req.params.code || "").toLowerCase();
      if (!code) return res.status(400).json({ message: "Code required" });
      const [u] = await db
        .select({ firstName: users.firstName, lastName: users.lastName, referralRole: users.referralRole })
        .from(users)
        .where(eq(users.referralCode, code));
      if (!u) return res.status(404).json({ message: "Not found" });
      const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || "a friend";
      res.json({ name, isAffiliate: u.referralRole === "affiliate" });
    } catch (e) {
      res.status(500).json({ message: "Lookup failed" });
    }
  });

  /** Authenticated: My referral summary — code, link, balance, count of paying friends */
  app.get("/api/referrals/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const [u] = await db.select().from(users).where(eq(users.id, userId));
      if (!u) return res.status(404).json({ message: "Not found" });

      const [{ paying }] = await db
        .select({ paying: sql<number>`count(*)::int` })
        .from(referrals)
        .where(and(eq(referrals.referrerUserId, userId), eq(referrals.status, "credited")));
      const [{ pending }] = await db
        .select({ pending: sql<number>`count(*)::int` })
        .from(referrals)
        .where(and(eq(referrals.referrerUserId, userId), eq(referrals.status, "pending")));

      const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "";
      const proto = ((req.headers["x-forwarded-proto"] as string) || req.protocol || "https").split(",")[0];
      const link = u.referralCode ? `${proto}://${host}/r/${u.referralCode}` : null;

      res.json({
        referralCode: u.referralCode,
        referralLink: link,
        creditCents: u.referralCreditCents || 0,
        payingFriends: paying || 0,
        pendingFriends: pending || 0,
        role: u.referralRole || "user",
        eligibleForAffiliate: (paying || 0) >= 10 && (u.referralRole || "user") !== "affiliate",
      });
    } catch (e) {
      console.error("[Referrals] /me failed", e);
      res.status(500).json({ message: "Failed" });
    }
  });

  /** Apply current referral credit balance as a Stripe customer balance credit */
  app.post("/api/referrals/use-credit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const [u] = await db.select().from(users).where(eq(users.id, userId));
      if (!u) return res.status(404).json({ message: "Not found" });
      const cents = u.referralCreditCents || 0;
      if (cents <= 0) return res.status(400).json({ message: "No credit to apply" });
      if (!u.stripeCustomerId) return res.status(400).json({ message: "Set up billing first to use credit" });

      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();

      // Negative amount = credit on customer balance
      await stripe.customers.createBalanceTransaction(u.stripeCustomerId, {
        amount: -cents,
        currency: "usd",
        description: `Fuse Phone referral credit ($${(cents / 100).toFixed(2)})`,
      });

      await db.update(users).set({ referralCreditCents: 0 }).where(eq(users.id, userId));
      res.json({ ok: true, appliedCents: cents });
    } catch (e: any) {
      console.error("[Referrals] use-credit failed", e);
      res.status(500).json({ message: e?.message || "Failed to apply credit" });
    }
  });

  /** Queue a gift card request (Tremendous integration deferred) */
  app.post("/api/gift-cards/request", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const [u] = await db.select().from(users).where(eq(users.id, userId));
      if (!u) return res.status(404).json({ message: "Not found" });
      const cents = u.referralCreditCents || 0;
      if (cents <= 0) return res.status(400).json({ message: "No balance to redeem" });

      const [row] = await db
        .insert(giftCardRequests)
        .values({ userId, amountCents: cents, status: "requested", notes: req.body?.notes || null })
        .returning();
      // Move balance into "requested" — zero local credit so it can't be double-spent
      await db.update(users).set({ referralCreditCents: 0 }).where(eq(users.id, userId));
      res.json({ ok: true, request: row });
    } catch (e: any) {
      console.error("[Referrals] gift-card request failed", e);
      res.status(500).json({ message: "Failed to submit request" });
    }
  });

  // ============= Affiliate =============

  /** Submit an affiliate application (public — no login required) */
  app.post("/api/affiliate/apply", async (req: any, res) => {
    try {
      // Optional: detect existing logged-in contractor session
      const sessionUserId = (req?.session?.user?.claims?.sub) || (req?.user?.claims?.sub) || null;
      let linkedUserId: string | null = sessionUserId || null;
      let prefillName: string | null = null;
      let prefillEmail: string | null = null;

      if (linkedUserId) {
        const [u] = await db.select().from(users).where(eq(users.id, linkedUserId));
        if (u) {
          prefillName = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || null;
          prefillEmail = u.email || null;
          // If this contractor already applied, block duplicates
          const [existing] = await db.select().from(affiliates).where(eq(affiliates.userId, linkedUserId));
          if (existing) return res.status(409).json({ message: "Application already on file", status: existing.status });
        } else {
          linkedUserId = null;
        }
      }

      const email = (req.body?.email || prefillEmail || "").toString().trim().toLowerCase();
      const fullName = (req.body?.fullName || prefillName || "").toString().trim();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "A valid email is required" });
      }
      if (!fullName) {
        return res.status(400).json({ message: "Your full name is required" });
      }
      if (!req.body?.agreedToTerms) {
        return res.status(400).json({ message: "You must agree to the Affiliate Terms" });
      }

      // Block duplicate guest applications by email
      if (!linkedUserId) {
        const [dupe] = await db.select().from(affiliates).where(eq(affiliates.email, email));
        if (dupe) return res.status(409).json({ message: "An application with this email is already on file", status: dupe.status });
      }

      const parsed = insertAffiliateSchema.safeParse({
        userId: linkedUserId,
        email,
        phone: req.body?.phone || null,
        fullName,
        socialHandle: req.body?.socialHandle || null,
        socialPlatform: req.body?.socialPlatform || null,
        followerCount: req.body?.followerCount ? Number(req.body.followerCount) : null,
        websiteUrl: req.body?.websiteUrl || null,
        applicationNotes: req.body?.applicationNotes || null,
      });
      if (!parsed.success) return res.status(400).json({ message: "Invalid application", errors: parsed.error.flatten() });

      const [row] = await db.insert(affiliates).values(parsed.data).returning();

      notifyAdminsOfAffiliateApplication({
        fullName: row.fullName || fullName,
        email: row.email || email,
        socialPlatform: row.socialPlatform,
        socialHandle: row.socialHandle,
        followerCount: row.followerCount,
        websiteUrl: row.websiteUrl,
        applicationNotes: row.applicationNotes,
      }).catch((err) => console.error('[Affiliate] admin notify failed', err));

      res.json({ ok: true, affiliate: row });
    } catch (e: any) {
      console.error("[Affiliate] apply failed", e);
      res.status(500).json({ message: "Failed to submit application" });
    }
  });

  /** Get my affiliate status (or null) */
  app.get("/api/affiliate/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const [a] = await db.select().from(affiliates).where(eq(affiliates.userId, userId));
      if (!a) return res.json({ affiliate: null });

      // Aggregate stats
      const [{ signups }] = await db
        .select({ signups: sql<number>`count(*)::int` })
        .from(affiliateReferrals)
        .where(eq(affiliateReferrals.affiliateId, a.id));
      const [{ active }] = await db
        .select({ active: sql<number>`count(*)::int` })
        .from(affiliateReferrals)
        .where(and(eq(affiliateReferrals.affiliateId, a.id), eq(affiliateReferrals.status, "active")));
      const [{ totalEarnedCents }] = await db
        .select({ totalEarnedCents: sql<number>`COALESCE(SUM(amount_cents), 0)::int` })
        .from(affiliateCommissions)
        .where(eq(affiliateCommissions.affiliateId, a.id));
      const [{ unpaidCents }] = await db
        .select({ unpaidCents: sql<number>`COALESCE(SUM(amount_cents), 0)::int` })
        .from(affiliateCommissions)
        .where(and(eq(affiliateCommissions.affiliateId, a.id), isNull(affiliateCommissions.payoutId)));

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const [{ thisMonthCents }] = await db
        .select({ thisMonthCents: sql<number>`COALESCE(SUM(amount_cents), 0)::int` })
        .from(affiliateCommissions)
        .where(and(eq(affiliateCommissions.affiliateId, a.id), gte(affiliateCommissions.earnedAt, monthStart)));

      const payouts = await db
        .select()
        .from(affiliatePayouts)
        .where(eq(affiliatePayouts.affiliateId, a.id))
        .orderBy(desc(affiliatePayouts.createdAt))
        .limit(20);

      // Payouts are considered "open" once the platform Stripe profile is
      // complete. We detect that either via an explicit env flag the platform
      // owner can flip on, or by the existence of any affiliate that has
      // already successfully created a Connect account (proves Stripe accepted
      // the platform). This lets affiliates share their link immediately and
      // hides the "Set up payouts" button until it actually works.
      let payoutsEnabled = process.env.AFFILIATE_PAYOUTS_ENABLED === 'true';
      if (!payoutsEnabled) {
        try {
          const [{ n }] = await db
            .select({ n: sql<number>`count(*)::int` })
            .from(affiliates)
            .where(sql`${affiliates.stripeConnectAccountId} IS NOT NULL`);
          if ((n || 0) > 0) payoutsEnabled = true;
        } catch (_) {}
      }

      res.json({
        affiliate: a,
        payoutsEnabled,
        stats: {
          signups,
          active,
          totalEarnedCents,
          unpaidCents,
          thisMonthCents,
        },
        payouts,
      });
    } catch (e) {
      console.error("[Affiliate] /me failed", e);
      res.status(500).json({ message: "Failed" });
    }
  });

  /** Start Stripe Connect Express onboarding for affiliate payouts */
  app.post("/api/affiliate/connect/onboard", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const [a] = await db.select().from(affiliates).where(eq(affiliates.userId, userId));
      if (!a) return res.status(404).json({ message: "Apply to the affiliate program first" });
      if (a.status !== "approved") return res.status(403).json({ message: "Application not approved yet" });

      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();
      const [u] = await db.select().from(users).where(eq(users.id, userId));

      let acctId = a.stripeConnectAccountId || null;
      if (!acctId) {
        const acct = await stripe.accounts.create({
          type: "express",
          email: u?.email || undefined,
          capabilities: { transfers: { requested: true } },
          business_type: "individual",
          metadata: { affiliateId: String(a.id), userId },
        });
        acctId = acct.id;
        await db.update(affiliates).set({ stripeConnectAccountId: acctId }).where(eq(affiliates.id, a.id));
      }

      const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "";
      const proto = ((req.headers["x-forwarded-proto"] as string) || req.protocol || "https").split(",")[0];
      const link = await stripe.accountLinks.create({
        account: acctId!,
        refresh_url: `${proto}://${host}/affiliate/dashboard?connect=refresh`,
        return_url: `${proto}://${host}/affiliate/dashboard?connect=return`,
        type: "account_onboarding",
      });
      res.json({ url: link.url });
    } catch (e: any) {
      console.error("[Affiliate] connect onboard failed", e);
      res.status(500).json({ message: e?.message || "Onboarding failed" });
    }
  });

  // ============= Admin =============

  app.get("/api/admin/affiliates", isAuthenticated, async (req: any, res) => {
    if (!(await ensureAdmin(req, res))) return;
    const rows = await db
      .select({
        a: affiliates,
        userEmail: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(affiliates)
      .leftJoin(users, eq(users.id, affiliates.userId))
      .orderBy(desc(affiliates.createdAt));

    // Aggregate per-affiliate stats in parallel
    const enriched = await Promise.all(
      rows.map(async (row) => {
        const aid = row.a.id;
        const [signupsRow] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(affiliateReferrals)
          .where(eq(affiliateReferrals.affiliateId, aid));
        const [activeRow] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(affiliateReferrals)
          .where(and(eq(affiliateReferrals.affiliateId, aid), eq(affiliateReferrals.status, "active")));
        const [earnedRow] = await db
          .select({ cents: sql<number>`COALESCE(SUM(amount_cents), 0)::int` })
          .from(affiliateCommissions)
          .where(eq(affiliateCommissions.affiliateId, aid));
        const [unpaidRow] = await db
          .select({ cents: sql<number>`COALESCE(SUM(amount_cents), 0)::int` })
          .from(affiliateCommissions)
          .where(and(eq(affiliateCommissions.affiliateId, aid), isNull(affiliateCommissions.payoutId)));
        const [paidOutRow] = await db
          .select({ cents: sql<number>`COALESCE(SUM(amount_cents), 0)::int` })
          .from(affiliatePayouts)
          .where(and(eq(affiliatePayouts.affiliateId, aid), eq(affiliatePayouts.status, "paid")));
        const [lastPayout] = await db
          .select()
          .from(affiliatePayouts)
          .where(eq(affiliatePayouts.affiliateId, aid))
          .orderBy(desc(affiliatePayouts.createdAt))
          .limit(1);
        return {
          ...row,
          stats: {
            signups: signupsRow?.n || 0,
            active: activeRow?.n || 0,
            totalEarnedCents: earnedRow?.cents || 0,
            unpaidCents: unpaidRow?.cents || 0,
            paidOutCents: paidOutRow?.cents || 0,
            lastPayoutAt: lastPayout?.paidAt || lastPayout?.createdAt || null,
            lastPayoutStatus: lastPayout?.status || null,
          },
        };
      })
    );

    res.json({ affiliates: enriched });
  });

  /** Admin: update an affiliate's commission rate (basis points) and/or admin notes */
  app.patch("/api/admin/affiliates/:id", isAuthenticated, async (req: any, res) => {
    if (!(await ensureAdmin(req, res))) return;
    try {
      const id = Number(req.params.id);
      const { commissionBps, adminNotes } = req.body || {};
      const update: any = {};
      if (commissionBps !== undefined) {
        const n = Number(commissionBps);
        if (!Number.isFinite(n) || n < 0 || n > 10000) {
          return res.status(400).json({ message: "commissionBps must be between 0 and 10000 (0–100%)" });
        }
        update.commissionBps = Math.round(n);
      }
      if (adminNotes !== undefined) update.adminNotes = adminNotes || null;
      if (Object.keys(update).length === 0) return res.status(400).json({ message: "Nothing to update" });

      const [a] = await db.select().from(affiliates).where(eq(affiliates.id, id));
      if (!a) return res.status(404).json({ message: "Not found" });
      await db.update(affiliates).set(update).where(eq(affiliates.id, id));
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[Affiliate] admin update failed", e);
      res.status(500).json({ message: e?.message || "Failed" });
    }
  });

  app.get("/api/admin/gift-cards", isAuthenticated, async (req: any, res) => {
    if (!(await ensureAdmin(req, res))) return;
    const rows = await db
      .select({
        r: giftCardRequests,
        userEmail: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(giftCardRequests)
      .leftJoin(users, eq(users.id, giftCardRequests.userId))
      .orderBy(desc(giftCardRequests.createdAt));
    res.json({ requests: rows });
  });

  app.post("/api/admin/affiliates/:id/decision", isAuthenticated, async (req: any, res) => {
    if (!(await ensureAdmin(req, res))) return;
    try {
      const id = Number(req.params.id);
      const { decision, reason } = req.body || {};
      if (!["approved", "rejected", "paused"].includes(decision)) {
        return res.status(400).json({ message: "decision must be approved/rejected/paused" });
      }
      const [a] = await db.select().from(affiliates).where(eq(affiliates.id, id));
      if (!a) return res.status(404).json({ message: "Not found" });

      const update: any = { status: decision };
      if (decision === "approved") update.approvedAt = new Date();
      if (decision === "rejected") update.rejectionReason = reason || null;
      await db.update(affiliates).set(update).where(eq(affiliates.id, id));

      if (decision === "approved") {
        if (a.userId) {
          await db.update(users).set({ referralRole: "affiliate" }).where(eq(users.id, a.userId));
        }
        const recipientEmail = (a.email || '').trim();
        if (recipientEmail) {
          let existingUser = false;
          if (a.userId) {
            existingUser = true;
          } else {
            const [u] = await db.select({ id: users.id }).from(users).where(sql`LOWER(${users.email}) = LOWER(${recipientEmail})`);
            if (u) {
              existingUser = true;
              await db.update(users).set({ referralRole: "affiliate" }).where(eq(users.id, u.id));
              await db.update(affiliates).set({ userId: u.id }).where(eq(affiliates.id, id));
            } else {
              // No Fuse Phone account exists for this email. Auto-create an
              // affiliate-only user so OTP login on the affiliate portal works.
              // No trial / no subscription — they exist purely to access the
              // affiliate dashboard.
              const nameParts = (a.fullName || '').trim().split(/\s+/);
              const firstName = nameParts[0] || null;
              const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;
              try {
                const [newUser] = await db
                  .insert(users)
                  .values({
                    email: recipientEmail.toLowerCase(),
                    firstName,
                    lastName,
                    authProvider: 'affiliate',
                    referralRole: 'affiliate',
                    subscriptionTier: 'starter',
                    subscriptionStatus: 'inactive',
                    trialEndsAt: null,
                  } as any)
                  .returning({ id: users.id });
                if (newUser?.id) {
                  await db.update(affiliates).set({ userId: newUser.id }).where(eq(affiliates.id, id));
                  existingUser = true;
                }
              } catch (createErr) {
                console.error('[Affiliate] failed to auto-create affiliate user', createErr);
              }
            }
          }
          sendAffiliateApprovalEmail(recipientEmail, a.fullName || '', existingUser)
            .catch((err) => console.error('[Affiliate] approval email failed', err));
        }
      } else if ((decision === "rejected" || decision === "paused") && a.userId) {
        // Demote back to regular user (only if currently 'affiliate')
        await db
          .update(users)
          .set({ referralRole: "user" })
          .where(and(eq(users.id, a.userId), eq(users.referralRole, "affiliate")));
      }
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[Affiliate] admin decision failed", e);
      res.status(500).json({ message: "Failed" });
    }
  });

  app.post("/api/admin/gift-cards/:id/decision", isAuthenticated, async (req: any, res) => {
    if (!(await ensureAdmin(req, res))) return;
    try {
      const id = Number(req.params.id);
      const { decision, notes } = req.body || {};
      if (!["approved", "sent", "declined"].includes(decision)) {
        return res.status(400).json({ message: "decision must be approved/sent/declined" });
      }
      const [r] = await db.select().from(giftCardRequests).where(eq(giftCardRequests.id, id));
      if (!r) return res.status(404).json({ message: "Not found" });

      const update: any = { status: decision };
      if (decision === "sent") update.fulfilledAt = new Date();
      if (notes) update.notes = notes;
      await db.update(giftCardRequests).set(update).where(eq(giftCardRequests.id, id));

      // If declined, refund balance back to user
      if (decision === "declined") {
        await db
          .update(users)
          .set({ referralCreditCents: sql`COALESCE(${users.referralCreditCents}, 0) + ${r.amountCents}` })
          .where(eq(users.id, r.userId));
      }
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[GiftCards] admin decision failed", e);
      res.status(500).json({ message: "Failed" });
    }
  });
}

/**
 * Called from invoice.paid webhook for affiliate-referred users.
 * Creates a 10% commission row, only within the 12-month window from firstPaidAt.
 */
export async function recordAffiliateCommissionIfApplicable(
  referredUserId: string,
  invoice: { id?: string | null; amount_paid?: number | null; subscription?: any }
): Promise<void> {
  if (!invoice?.amount_paid || invoice.amount_paid <= 0) return;
  const [u] = await db.select().from(users).where(eq(users.id, referredUserId));
  if (!u || !u.referredByUserId) return;
  const [referrer] = await db
    .select({ referralRole: users.referralRole })
    .from(users)
    .where(eq(users.id, u.referredByUserId));
  if (!referrer || referrer.referralRole !== "affiliate") return;

  const [a] = await db.select().from(affiliates).where(eq(affiliates.userId, u.referredByUserId));
  if (!a || a.status !== "approved") return;

  // Find or create the affiliate_referrals row
  let [ar] = await db
    .select()
    .from(affiliateReferrals)
    .where(eq(affiliateReferrals.referredUserId, referredUserId));
  if (!ar) {
    const now = new Date();
    const ends = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    const [created] = await db
      .insert(affiliateReferrals)
      .values({
        affiliateId: a.id,
        referredUserId,
        status: "active",
        firstPaidAt: now,
        commissionEndsAt: ends,
      })
      .returning();
    ar = created;
  } else if (!ar.firstPaidAt) {
    const now = new Date();
    const ends = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    await db
      .update(affiliateReferrals)
      .set({ status: "active", firstPaidAt: now, commissionEndsAt: ends })
      .where(eq(affiliateReferrals.id, ar.id));
    ar = { ...ar, firstPaidAt: now, commissionEndsAt: ends, status: "active" };
  }

  // Stop commissioning past the 12-month window
  if (ar.commissionEndsAt && new Date() > ar.commissionEndsAt) return;

  // Idempotency: skip if we already recorded this invoice
  if (invoice.id) {
    const [existing] = await db
      .select()
      .from(affiliateCommissions)
      .where(eq(affiliateCommissions.stripeInvoiceId, invoice.id));
    if (existing) return;
  }

  const bps = a.commissionBps ?? 1000;
  if (bps <= 0) {
    console.log(`[Affiliate] Affiliate ${a.id} commission rate is 0; skipping`);
    return;
  }
  const commissionCents = Math.floor((invoice.amount_paid * bps) / 10000);
  if (commissionCents <= 0) return;

  await db.insert(affiliateCommissions).values({
    affiliateId: a.id,
    affiliateReferralId: ar.id,
    stripeInvoiceId: invoice.id || null,
    customerPaymentCents: invoice.amount_paid,
    amountCents: commissionCents,
  });
  console.log(`[Affiliate] Recorded $${(commissionCents / 100).toFixed(2)} commission for affiliate ${a.id} from invoice ${invoice.id}`);
}
