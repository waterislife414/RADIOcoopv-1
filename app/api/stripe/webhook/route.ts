import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { constructWebhookEvent } from '@/lib/stripe';
import { claimEvent, handleCheckoutPaid, handleRefund, handleSubscriptionChange, releaseEvent } from '@/lib/webhooks';

/**
 * Stripe → Dashboard → Webhooks → endpoint `${SITE}/api/stripe/webhook` with events:
 * checkout.session.completed, checkout.session.async_payment_succeeded,
 * customer.subscription.updated, customer.subscription.deleted, charge.refunded
 */
export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(await req.text(), signature);
  } catch (e) {
    console.error('[webhook] signature verification failed', e);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (!(await claimEvent(event))) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await handleCheckoutPaid(event.data.object);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionChange(event.data.object);
        break;
      case 'charge.refunded':
        await handleRefund(event.data.object);
        break;
      default:
        break;
    }
  } catch (e) {
    console.error(`[webhook] ${event.type} failed`, e);
    await releaseEvent(event.id); // let Stripe retry
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
