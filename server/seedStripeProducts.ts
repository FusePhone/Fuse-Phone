import { getUncachableStripeClient } from './stripeClient';

const NEW_PRICES = {
  starter: { amount: 3999, name: 'FusePhone Starter' },
  core: { amount: 8999, name: 'FusePhone Core' },
  elite: { amount: 14900, name: 'FusePhone Elite' },
} as const;

async function ensureProduct(
  stripe: any,
  tier: 'starter' | 'core' | 'elite',
  description: string,
) {
  const products = await stripe.products.list({ limit: 100, active: true });
  let product = products.data.find((p: any) => p.metadata?.tier === tier)
    || products.data.find((p: any) => p.name?.toLowerCase().includes(tier));
  if (!product) {
    product = await stripe.products.create({
      name: NEW_PRICES[tier].name,
      description,
      metadata: { tier },
    });
    console.log(`  Created product ${tier}: ${product.id}`);
  } else {
    console.log(`  Found product ${tier}: ${product.id}`);
  }
  return product;
}

async function ensureNewPriceAndDeprecateOld(
  stripe: any,
  productId: string,
  tier: 'starter' | 'core' | 'elite',
) {
  const target = NEW_PRICES[tier].amount;
  const prices = await stripe.prices.list({ product: productId, limit: 100 });

  const newPrice = prices.data.find(
    (p: any) =>
      p.active && p.unit_amount === target && p.recurring?.interval === 'month',
  );

  let createdId: string;
  if (newPrice) {
    console.log(`  ${tier} v2 price already exists: ${newPrice.id} ($${target / 100})`);
    createdId = newPrice.id;
  } else {
    const created = await stripe.prices.create({
      product: productId,
      unit_amount: target,
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { tier, version: 'v2' },
    });
    console.log(`  Created v2 price for ${tier}: ${created.id} ($${target / 100})`);
    createdId = created.id;
  }

  await stripe.products.update(productId, { default_price: createdId });
  console.log(`  Set ${tier} product default_price to v2 price`);

  for (const p of prices.data) {
    if (p.id === createdId) continue;
    if (!p.active) continue;
    if (p.recurring?.interval !== 'month') continue;
    try {
      await stripe.prices.update(p.id, {
        active: false,
        metadata: { ...(p.metadata || {}), deprecated: 'true', deprecated_at: new Date().toISOString() },
      });
      console.log(`  Deactivated old ${tier} price: ${p.id} ($${(p.unit_amount || 0) / 100}) — existing subscriptions are unaffected`);
    } catch (err: any) {
      console.log(`  Skipped deactivating ${p.id}: ${err.message}`);
    }
  }
}

async function main() {
  const stripe = await getUncachableStripeClient();
  console.log('Setting up new pricing tiers (Starter $39.99 / Core $89.99 / Elite $149)...');
  console.log('Existing subscriptions stay on their current price — Stripe only blocks NEW signups from deactivated prices.\n');

  const starter = await ensureProduct(stripe, 'starter', 'Essential CRM, signatures, unlimited photos with annotations (limited time, fair use), 10 AI estimates/month, Gmail & Calendar, online booking');
  const core = await ensureProduct(stripe, 'core', 'Everything in Starter plus Stripe payments, unlimited photos with annotations (limited time, fair use), 20 AI estimates/month, AI receipt scanner, basic time tracking');
  const elite = await ensureProduct(stripe, 'elite', 'Full CRM with VoIP, SMS, all integrations, production rates, multi-user, GamePlan, Fuse Assistant');

  console.log('\nStarter:');
  await ensureNewPriceAndDeprecateOld(stripe, starter.id, 'starter');
  console.log('\nCore:');
  await ensureNewPriceAndDeprecateOld(stripe, core.id, 'core');
  console.log('\nElite:');
  await ensureNewPriceAndDeprecateOld(stripe, elite.id, 'elite');

  console.log('\nDone. New signups will be charged the new prices. Existing 14 users keep their current pricing.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
