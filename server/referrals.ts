import { db } from "./db";
import { users } from "@shared/models/auth";
import { referrals } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const REFERRAL_CREDIT_CENTS = 1000; // $10
const REFERRAL_DISCOUNT_CENTS = 1000; // $10 off first month for new user

export function slugifyName(first?: string | null, last?: string | null, fallback?: string): string {
  const raw = [first, last].filter(Boolean).join(' ') || fallback || 'friend';
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 30) || 'friend';
}

export async function generateUniqueReferralCode(first?: string | null, last?: string | null, email?: string | null): Promise<string> {
  const base = slugifyName(first, last, email?.split('@')[0]);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.referralCode, candidate));
    if (!existing) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function findReferrerByCode(code?: string | null): Promise<{ id: string; referralRole: string | null } | null> {
  if (!code) return null;
  const trimmed = String(code).trim().toLowerCase();
  if (!trimmed) return null;
  const [u] = await db
    .select({ id: users.id, referralRole: users.referralRole })
    .from(users)
    .where(eq(users.referralCode, trimmed));
  return u || null;
}

/**
 * Credit the referrer for a paid first month, idempotent.
 * - If referrer is a regular user: $10 account credit
 * - If referrer is an affiliate: skipped here; affiliate commission flow handles it
 */
export async function creditReferralOnFirstPayment(referredUserId: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, referredUserId));
  if (!user || !user.referredByUserId) return;

  // Idempotency: only credit if no existing 'credited' row for this referee
  const [existing] = await db.select().from(referrals).where(eq(referrals.referredUserId, referredUserId));
  if (existing && existing.status === 'credited') return;

  const [referrer] = await db.select().from(users).where(eq(users.id, user.referredByUserId));
  if (!referrer) return;

  // Affiliates use their own commission flow, not this $10 credit
  if (referrer.referralRole === 'affiliate') return;

  if (existing) {
    await db
      .update(referrals)
      .set({ status: 'credited', creditedAt: new Date() })
      .where(eq(referrals.id, existing.id));
  } else {
    await db.insert(referrals).values({
      referrerUserId: referrer.id,
      referredUserId,
      status: 'credited',
      creditedAt: new Date(),
    });
  }

  await db
    .update(users)
    .set({ referralCreditCents: sql`COALESCE(${users.referralCreditCents}, 0) + ${REFERRAL_CREDIT_CENTS}` })
    .where(eq(users.id, referrer.id));

  console.log(`[Referrals] Credited $${REFERRAL_CREDIT_CENTS / 100} to referrer ${referrer.id} for referred user ${referredUserId}`);
}

export async function recordPendingReferral(referrerUserId: string, referredUserId: string): Promise<void> {
  if (referrerUserId === referredUserId) return;
  const [existing] = await db.select().from(referrals).where(eq(referrals.referredUserId, referredUserId));
  if (existing) return;
  await db.insert(referrals).values({
    referrerUserId,
    referredUserId,
    status: 'pending',
  });
}

export async function getOrCreateReferralDiscountCoupon(stripe: any): Promise<string> {
  // One reusable coupon for $10 off first month
  const couponId = 'fp_referral_10_off_first';
  try {
    const existing = await stripe.coupons.retrieve(couponId);
    if (existing && !existing.deleted) return existing.id;
  } catch (e: any) {
    if (e?.code !== 'resource_missing' && e?.statusCode !== 404) throw e;
  }
  const created = await stripe.coupons.create({
    id: couponId,
    amount_off: REFERRAL_DISCOUNT_CENTS,
    currency: 'usd',
    duration: 'once',
    name: '$10 Friend Referral',
    metadata: { source: 'referral_program' },
  });
  return created.id;
}

export const REFERRAL_DISCOUNT_AMOUNT_CENTS = REFERRAL_DISCOUNT_CENTS;
export const REFERRAL_REWARD_CENTS = REFERRAL_CREDIT_CENTS;
