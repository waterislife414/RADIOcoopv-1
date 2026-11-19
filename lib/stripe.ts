import 'server-only';
import Stripe from 'stripe';
import { absoluteUrl, optionalEnv, requireEnv } from '@/lib/env';
import { PLAN_BY_ID, type Interval, type PlanId } from '@/config/memberships';

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!client) {
    client = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
      appInfo: { name: 'kyles-auto-mobile-repair', version: '1.0.0' },
      maxNetworkRetries: 2,
    });
  }
  return client;
}

export type CheckoutKind = 'deposit' | 'invoice' | 'membership';

/**
 * Card + Apple Pay + Google Pay are served automatically by Checkout's dynamic payment methods
 * (enable wallets in Dashboard → Settings → Payment methods). No payment_method_types pinning.
 */
export async function createDepositCheckout(args: {
  bookingId: string;
  ref: string;
  amountCents: number;
  email: string;
  summary: string;
}): Promise<Stripe.Checkout.Session> {
  const metadata = { kind: 'deposit' satisfies CheckoutKind, booking_id: args.bookingId, booking_ref: args.ref };
  return stripe().checkout.sessions.create({
    mode: 'payment',
    customer_email: args.email,
    client_reference_id: args.bookingId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: args.amountCents,
          product_data: {
            name: `Refundable booking deposit — ${args.ref}`,
            description: `${args.summary}. Credited to your final invoice; refundable if you cancel 24h+ before your window.`,
          },
        },
      },
    ],
    metadata,
    payment_intent_data: { metadata, description: `Booking deposit ${args.ref}` },
    success_url: absoluteUrl(`/book/confirmation/${args.ref}?deposit=success`),
    cancel_url: absoluteUrl(`/book/confirmation/${args.ref}?deposit=cancelled`),
  });
}

export async function createInvoiceCheckout(args: {
  invoiceId: string;
  invoiceNumber: string;
  token: string;
  balanceCents: number;
  email: string | null;
  vehicleLabel: string;
}): Promise<Stripe.Checkout.Session> {
  const metadata = { kind: 'invoice' satisfies CheckoutKind, invoice_id: args.invoiceId, invoice_number: args.invoiceNumber };
  return stripe().checkout.sessions.create({
    mode: 'payment',
    ...(args.email ? { customer_email: args.email } : {}),
    client_reference_id: args.invoiceId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: args.balanceCents,
          product_data: { name: `Invoice ${args.invoiceNumber}`, description: args.vehicleLabel || 'Auto repair services' },
        },
      },
    ],
    metadata,
    payment_intent_data: { metadata, description: `Invoice ${args.invoiceNumber}` },
    success_url: absoluteUrl(`/invoice/${args.token}?paid=1`),
    cancel_url: absoluteUrl(`/invoice/${args.token}`),
  });
}

export function membershipPriceId(planId: PlanId, interval: Interval): string | null {
  const plan = PLAN_BY_ID.get(planId);
  if (!plan) return null;
  const envName = plan.priceEnv[interval];
  return envName ? optionalEnv(envName) : null;
}

export async function createMembershipCheckout(planId: PlanId, interval: Interval): Promise<Stripe.Checkout.Session> {
  const priceId = membershipPriceId(planId, interval);
  if (!priceId) throw new Error(`No Stripe price configured for ${planId}/${interval}`);
  const metadata = { kind: 'membership' satisfies CheckoutKind, plan_id: planId, interval };
  return stripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    phone_number_collection: { enabled: true },
    metadata,
    subscription_data: { metadata },
    success_url: absoluteUrl('/memberships?status=success&session_id={CHECKOUT_SESSION_ID}'),
    cancel_url: absoluteUrl('/memberships?status=cancelled'),
  });
}

/** Portal access only for the customer who just completed Checkout (session id is the proof). */
export async function createPortalFromCheckoutSession(sessionId: string): Promise<string> {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!customer || session.mode !== 'subscription') throw new Error('Not a membership checkout');
  const portal = await stripe().billingPortal.sessions.create({ customer, return_url: absoluteUrl('/memberships') });
  return portal.url;
}

export function constructWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  return stripe().webhooks.constructEvent(rawBody, signature, requireEnv('STRIPE_WEBHOOK_SECRET'));
}
