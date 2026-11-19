/**
 * Creates membership products + recurring prices in Stripe and prints the env lines.
 * Usage: STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup
 */
import 'dotenv/config';
import Stripe from 'stripe';
import { PLANS } from '../config/memberships';

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Set STRIPE_SECRET_KEY');
  const stripe = new Stripe(key);
  const lines: string[] = [];
  for (const plan of PLANS) {
    const product = await stripe.products.create({ name: `${plan.name} Membership`, description: plan.tagline, metadata: { plan_id: plan.id } });
    const monthly = await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: plan.monthlyCents, recurring: { interval: 'month' }, metadata: { plan_id: plan.id } });
    lines.push(`${plan.priceEnv.month}=${monthly.id}`);
    if (plan.annualCents !== null && plan.priceEnv.year) {
      const annual = await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: plan.annualCents, recurring: { interval: 'year' }, metadata: { plan_id: plan.id } });
      lines.push(`${plan.priceEnv.year}=${annual.id}`);
    }
  }
  console.log('\nAdd to .env.local / hosting env:\n' + lines.join('\n'));
}
main().catch((e) => { console.error(e); process.exit(1); });
