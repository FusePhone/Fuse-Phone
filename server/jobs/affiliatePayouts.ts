import Stripe from "stripe";
import { db } from "../db";
import { affiliates, affiliateCommissions, affiliatePayouts } from "@shared/schema";
import { and, eq, isNull, lt, sql } from "drizzle-orm";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-09-30.acacia" as any })
  : null;

const HOLD_DAYS = 7;
const MIN_PAYOUT_CENTS = 2500;

async function processOneAffiliate(affiliateId: number, stripeAccountId: string, periodStart: Date, periodEnd: Date) {
  const holdCutoff = new Date(Date.now() - HOLD_DAYS * 24 * 60 * 60 * 1000);

  const eligible = await db
    .select({
      id: affiliateCommissions.id,
      amountCents: affiliateCommissions.amountCents,
    })
    .from(affiliateCommissions)
    .where(
      and(
        eq(affiliateCommissions.affiliateId, affiliateId),
        isNull(affiliateCommissions.payoutId),
        lt(affiliateCommissions.earnedAt, holdCutoff),
      ),
    );

  if (eligible.length === 0) return;

  const totalCents = eligible.reduce((sum, c) => sum + (c.amountCents || 0), 0);
  if (totalCents < MIN_PAYOUT_CENTS) {
    console.log(`[AffiliatePayouts] Affiliate ${affiliateId} balance ${totalCents}¢ below minimum, rolling forward`);
    return;
  }

  const [payout] = await db
    .insert(affiliatePayouts)
    .values({
      affiliateId,
      amountCents: totalCents,
      periodStart,
      periodEnd,
      status: "processing",
    })
    .returning();

  await db
    .update(affiliateCommissions)
    .set({ payoutId: payout.id })
    .where(
      and(
        eq(affiliateCommissions.affiliateId, affiliateId),
        isNull(affiliateCommissions.payoutId),
        lt(affiliateCommissions.earnedAt, holdCutoff),
      ),
    );

  if (!stripe) {
    console.warn(`[AffiliatePayouts] Stripe not configured; payout ${payout.id} left in 'processing'`);
    return;
  }

  try {
    const transfer = await stripe.transfers.create({
      amount: totalCents,
      currency: "usd",
      destination: stripeAccountId,
      description: `Fuse Phone affiliate payout #${payout.id}`,
      metadata: { affiliateId: String(affiliateId), payoutId: String(payout.id) },
    });

    await db
      .update(affiliatePayouts)
      .set({ status: "paid", stripeTransferId: transfer.id, paidAt: new Date() })
      .where(eq(affiliatePayouts.id, payout.id));

    console.log(`[AffiliatePayouts] Paid ${totalCents}¢ to affiliate ${affiliateId} (transfer ${transfer.id})`);
  } catch (err: any) {
    const reason = err?.message || "Unknown Stripe error";
    console.error(`[AffiliatePayouts] Transfer failed for affiliate ${affiliateId}: ${reason}`);

    await db
      .update(affiliatePayouts)
      .set({ status: "failed", failureReason: reason })
      .where(eq(affiliatePayouts.id, payout.id));

    await db
      .update(affiliateCommissions)
      .set({ payoutId: null })
      .where(eq(affiliateCommissions.payoutId, payout.id));
  }
}

export async function runMonthlyAffiliatePayouts(): Promise<{ processed: number; skipped: number }> {
  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const eligibleAffiliates = await db
    .select({
      id: affiliates.id,
      stripeConnectAccountId: affiliates.stripeConnectAccountId,
      stripeOnboardingComplete: affiliates.stripeOnboardingComplete,
      status: affiliates.status,
    })
    .from(affiliates)
    .where(eq(affiliates.status, "approved"));

  let processed = 0;
  let skipped = 0;

  for (const a of eligibleAffiliates) {
    if (!a.stripeConnectAccountId || !a.stripeOnboardingComplete) {
      skipped++;
      continue;
    }
    try {
      await processOneAffiliate(a.id, a.stripeConnectAccountId, periodStart, periodEnd);
      processed++;
    } catch (err) {
      console.error(`[AffiliatePayouts] Error for affiliate ${a.id}:`, err);
      skipped++;
    }
  }

  console.log(`[AffiliatePayouts] Monthly run complete: ${processed} processed, ${skipped} skipped`);
  return { processed, skipped };
}

let lastRunYearMonth: string | null = null;

export function startAffiliatePayoutScheduler() {
  const checkAndRun = async () => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${now.getMonth() + 1}`;
    if (now.getDate() === 1 && now.getHours() === 0 && lastRunYearMonth !== ym) {
      lastRunYearMonth = ym;
      console.log("[AffiliatePayouts] Triggering monthly payout run");
      try {
        await runMonthlyAffiliatePayouts();
      } catch (err) {
        console.error("[AffiliatePayouts] Monthly run failed:", err);
      }
    }
  };

  setInterval(checkAndRun, 60 * 60 * 1000);
  console.log("[AffiliatePayouts] Scheduler started (checks hourly, runs on 1st of month at 00:xx)");
}
