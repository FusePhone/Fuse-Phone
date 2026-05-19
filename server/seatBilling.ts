// Stripe paid-seat billing for the multi-user feature.
//
// Each owner has ONE Stripe Subscription. The base tier (Starter/Core/Elite)
// lives as the first subscription item. Extra paid seats are ADDITIONAL
// items on the same subscription so they bill on the same invoice with
// prorations. We identify our seat items by the parent product's
// `metadata.seat_type` ∈ {'field_worker','office'}.
//
// Public API:
//   - getOrCreateSeatPrice(stripe, seatType): returns Stripe priceId, creating
//     the product + monthly price on first use (cached per process).
//   - setSubscriptionSeatQuantity(stripe, subId, seatType, quantity): brings
//     the owner's subscription to the target quantity for that seat type
//     (creates / updates / removes the item as needed). Returns the resulting
//     quantity. Uses proration_behavior='create_prorations' so the customer
//     is charged immediately for the delta.
//   - readSubscriptionSeatCounts(stripe, subId): returns {field, office}
//     based on the current Stripe state. Used by the webhook to resync.

import {
  EXTRA_FIELD_WORKER_PRICE_CENTS,
  EXTRA_OFFICE_PRICE_CENTS,
} from "@shared/teamRoles";

export type SeatType = 'field_worker' | 'office';

const SEAT_CONFIG: Record<SeatType, { name: string; description: string; amountCents: number }> = {
  field_worker: {
    name: 'Extra Field Worker Seat',
    description: 'Additional Crew Lead or Field Employee seat for FusePhone Elite.',
    amountCents: EXTRA_FIELD_WORKER_PRICE_CENTS,
  },
  office: {
    name: 'Extra Office Seat',
    description: 'Additional Sales Rep, Project Manager, Office Manager, or custom-role seat for FusePhone Elite.',
    amountCents: EXTRA_OFFICE_PRICE_CENTS,
  },
};

// Process-wide cache so we don't list Stripe products on every request.
const priceCache: Partial<Record<SeatType, string>> = {};

async function ensureSeatProduct(stripe: any, seatType: SeatType): Promise<string> {
  const cfg = SEAT_CONFIG[seatType];
  const list = await stripe.products.list({ limit: 100, active: true });
  let product = list.data.find((p: any) => p.metadata?.seat_type === seatType);
  if (!product) {
    product = await stripe.products.create({
      name: cfg.name,
      description: cfg.description,
      metadata: { seat_type: seatType, kind: 'team_seat' },
    });
    console.log(`[SeatBilling] Created Stripe product for ${seatType}: ${product.id}`);
  }
  return product.id;
}

export async function getOrCreateSeatPrice(stripe: any, seatType: SeatType): Promise<string> {
  if (priceCache[seatType]) return priceCache[seatType]!;
  const productId = await ensureSeatProduct(stripe, seatType);
  const cfg = SEAT_CONFIG[seatType];
  const prices = await stripe.prices.list({ product: productId, limit: 100 });
  let price = prices.data.find(
    (p: any) => p.active && p.unit_amount === cfg.amountCents && p.recurring?.interval === 'month',
  );
  if (!price) {
    price = await stripe.prices.create({
      product: productId,
      unit_amount: cfg.amountCents,
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { seat_type: seatType, kind: 'team_seat' },
    });
    console.log(`[SeatBilling] Created Stripe price for ${seatType}: ${price.id} ($${cfg.amountCents / 100}/mo)`);
  }
  priceCache[seatType] = price.id as string;
  return price.id as string;
}

function isSeatItem(item: any, seatType?: SeatType): boolean {
  const meta = item?.price?.product?.metadata
    || item?.price?.metadata
    || {};
  if (seatType) return meta.seat_type === seatType;
  return meta.kind === 'team_seat' || ['field_worker', 'office'].includes(meta.seat_type);
}

export async function setSubscriptionSeatQuantity(
  stripe: any,
  subscriptionId: string,
  seatType: SeatType,
  targetQuantity: number,
): Promise<number> {
  if (targetQuantity < 0) throw new Error("Seat quantity cannot be negative");
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price.product'] });
  if (sub.status !== 'active' && sub.status !== 'trialing') {
    throw new Error(`Subscription is not active (status: ${sub.status}). Reactivate your plan before adding seats.`);
  }

  const existing = sub.items.data.find((it: any) => isSeatItem(it, seatType));
  const priceId = await getOrCreateSeatPrice(stripe, seatType);

  if (targetQuantity === 0) {
    if (existing) {
      await stripe.subscriptionItems.del(existing.id, { proration_behavior: 'create_prorations' });
    }
    return 0;
  }

  if (existing) {
    if (existing.quantity === targetQuantity && existing.price.id === priceId) return targetQuantity;
    await stripe.subscriptionItems.update(existing.id, {
      quantity: targetQuantity,
      price: priceId,
      proration_behavior: 'create_prorations',
    });
  } else {
    await stripe.subscriptionItems.create({
      subscription: subscriptionId,
      price: priceId,
      quantity: targetQuantity,
      proration_behavior: 'create_prorations',
    });
  }
  return targetQuantity;
}

export async function readSubscriptionSeatCounts(
  stripe: any,
  subscriptionId: string,
): Promise<{ field: number; office: number }> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price.product'] });
  let field = 0;
  let office = 0;
  for (const item of sub.items.data) {
    const meta = item?.price?.product?.metadata || item?.price?.metadata || {};
    if (meta.seat_type === 'field_worker') field += (item.quantity || 0);
    else if (meta.seat_type === 'office') office += (item.quantity || 0);
  }
  return { field, office };
}
