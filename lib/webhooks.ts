import 'server-only';
import type Stripe from 'stripe';
import { PLAN_BY_ID, type Interval, type PlanId } from '@/config/memberships';
import { vehicleLabel } from '@/lib/bookings';
import type { BookingRow, CustomerRow, InvoiceRow, MembershipStatus } from '@/lib/db/types';
import { membershipWelcomeEmail, ownerPaymentEmail, receiptEmail } from '@/lib/email-templates';
import { OWNER_INBOX, sendEmail } from '@/lib/email';
import { absoluteUrl } from '@/lib/env';
import { balanceDueCents } from '@/lib/invoice-math';
import { INVOICE_SELECT, normalizeInvoice } from '@/lib/invoices';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatET } from '@/lib/time';

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : v?.id ?? null);

/** Returns false if this event was already processed (idempotency). */
export async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const { error } = await supabaseAdmin().from('stripe_events').insert({ id: event.id, type: event.type });
  if (!error) return true;
  if (error.code === '23505') return false;
  throw error;
}

export async function releaseEvent(eventId: string): Promise<void> {
  await supabaseAdmin().from('stripe_events').delete().eq('id', eventId);
}

async function chargeIdFor(paymentIntentId: string | null): Promise<string | null> {
  if (!paymentIntentId) return null;
  const pi = await stripe().paymentIntents.retrieve(paymentIntentId);
  return idOf(pi.latest_charge);
}

export async function handleCheckoutPaid(session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return;
  const kind = session.metadata?.kind;
  if (kind === 'deposit') return handleDeposit(session);
  if (kind === 'invoice') return handleInvoicePayment(session);
  if (kind === 'membership') return handleMembershipCheckout(session);
}

async function handleDeposit(session: Stripe.Checkout.Session): Promise<void> {
  const bookingId = session.metadata?.booking_id;
  if (!bookingId) return;
  await supabaseAdmin()
    .from('bookings')
    .update({
      deposit_status: 'paid',
      deposit_paid_cents: session.amount_total ?? 0,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: idOf(session.payment_intent),
    })
    .eq('id', bookingId);
}

async function handleInvoicePayment(session: Stripe.Checkout.Session): Promise<void> {
  const invoiceId = session.metadata?.invoice_id;
  if (!invoiceId) return;
  const db = supabaseAdmin();
  const { data: raw } = await db.from('invoices').select(INVOICE_SELECT).eq('id', invoiceId).maybeSingle();
  if (!raw) return;
  const inv = normalizeInvoice(raw);

  const paymentIntentId = idOf(session.payment_intent);
  const chargeId = await chargeIdFor(paymentIntentId).catch(() => null);
  const paid = session.amount_total ?? 0;
  const amountPaid = inv.amount_paid_cents + paid;
  const fullyPaid = balanceDueCents({ ...inv, amount_paid_cents: amountPaid }) === 0;
  const paidAt = new Date();

  const patch: Partial<InvoiceRow> = {
    amount_paid_cents: amountPaid,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    stripe_charge_id: chargeId,
    ...(fullyPaid ? { status: 'paid' as const, paid_at: paidAt.toISOString() } : {}),
  };
  await db.from('invoices').update(patch).eq('id', inv.id);
  if (fullyPaid && inv.booking_id) await db.from('bookings').update({ status: 'paid' }).eq('id', inv.booking_id);

  const transactionId = [paymentIntentId, chargeId].filter(Boolean).join(' · ') || session.id;
  const to = inv.customer?.email ?? session.customer_details?.email ?? null;
  const receipt = receiptEmail({
    number: inv.number ?? inv.id,
    customerName: inv.customer?.full_name ?? 'Customer',
    vehicle: vehicleLabel(inv.vehicle),
    vin: inv.vehicle?.vin ?? null,
    odometer: inv.odometer,
    items: inv.items,
    subtotalCents: inv.subtotal_cents,
    taxCents: inv.tax_cents,
    taxName: inv.tax_name,
    totalCents: inv.total_cents,
    depositAppliedCents: inv.deposit_applied_cents,
    paidCents: paid,
    paidAt: formatET(paidAt),
    transactionId,
    receiptUrl: absoluteUrl(`/invoice/${inv.token}/receipt`),
  });
  const owner = ownerPaymentEmail({
    number: inv.number ?? inv.id,
    customer: inv.customer?.full_name ?? 'Customer',
    paidCents: paid,
    transactionId,
    adminUrl: absoluteUrl(`/admin/invoices/${inv.id}`),
  });
  await Promise.allSettled([
    ...(to ? [sendEmail({ to, ...receipt })] : []),
    sendEmail({ to: OWNER_INBOX, ...owner }),
  ]);
}

async function findOrCreateCustomer(email: string | null, name: string | null, phone: string | null, stripeCustomerId: string | null): Promise<CustomerRow | null> {
  const db = supabaseAdmin();
  if (email) {
    const { data } = await db.from('customers').select('*').eq('email', email.toLowerCase()).maybeSingle();
    if (data) {
      const c = data as CustomerRow;
      if (stripeCustomerId && !c.stripe_customer_id) await db.from('customers').update({ stripe_customer_id: stripeCustomerId }).eq('id', c.id);
      return c;
    }
  }
  const { data, error } = await db
    .from('customers')
    .insert({ full_name: name || email || 'Member', email: email?.toLowerCase() ?? null, phone, stripe_customer_id: stripeCustomerId })
    .select('*')
    .single();
  if (error) {
    console.error('[webhook] customer insert', error);
    return null;
  }
  return data as CustomerRow;
}

function subscriptionFields(sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  return {
    status: sub.status as MembershipStatus,
    stripe_price_id: item?.price.id ?? null,
    unit_amount_cents: item?.price.unit_amount ?? null,
    current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
  };
}

async function handleMembershipCheckout(session: Stripe.Checkout.Session): Promise<void> {
  const subId = idOf(session.subscription);
  if (!subId) return;
  const planId = (session.metadata?.plan_id ?? 'daily_driver') as PlanId;
  const interval = (session.metadata?.interval ?? 'month') as Interval;
  const plan = PLAN_BY_ID.get(planId);
  const sub = await stripe().subscriptions.retrieve(subId);
  const details = session.customer_details;
  const customer = await findOrCreateCustomer(details?.email ?? null, details?.name ?? null, details?.phone ?? null, idOf(session.customer));

  await supabaseAdmin()
    .from('memberships')
    .upsert(
      {
        customer_id: customer?.id ?? null,
        plan: planId,
        interval,
        vehicles_allowed: plan?.vehiclesAllowed ?? 1,
        stripe_customer_id: idOf(session.customer),
        stripe_subscription_id: sub.id,
        ...subscriptionFields(sub),
      },
      { onConflict: 'stripe_subscription_id' },
    );

  if (details?.email) {
    const mail = membershipWelcomeEmail({ name: details.name ?? '', planName: plan?.name ?? 'Membership', interval, bookUrl: absoluteUrl('/book') });
    await sendEmail({ to: details.email, ...mail });
  }
  await sendEmail({
    to: OWNER_INBOX,
    subject: `New member: ${plan?.name ?? planId} (${interval})`,
    html: `<p>${details?.name ?? ''} ${details?.email ?? ''} ${details?.phone ?? ''} joined <strong>${plan?.name ?? planId}</strong> (${interval}).</p>`,
    text: `${details?.name ?? ''} ${details?.email ?? ''} joined ${plan?.name ?? planId} (${interval}).`,
  });
}

export async function handleSubscriptionChange(sub: Stripe.Subscription): Promise<void> {
  const { data } = await supabaseAdmin()
    .from('memberships')
    .update(subscriptionFields(sub))
    .eq('stripe_subscription_id', sub.id)
    .select('id');
  if (!data || data.length === 0) {
    // Subscription created outside Checkout (e.g. Dashboard) — record it.
    const planId = (sub.metadata?.plan_id ?? 'fleet') as PlanId;
    await supabaseAdmin().from('memberships').upsert(
      {
        plan: planId,
        interval: (sub.items.data[0]?.price.recurring?.interval === 'year' ? 'year' : 'month') as Interval,
        vehicles_allowed: PLAN_BY_ID.get(planId)?.vehiclesAllowed ?? 1,
        stripe_customer_id: idOf(sub.customer),
        stripe_subscription_id: sub.id,
        ...subscriptionFields(sub),
      },
      { onConflict: 'stripe_subscription_id' },
    );
  }
}

export async function handleRefund(charge: Stripe.Charge): Promise<void> {
  const pi = idOf(charge.payment_intent);
  if (!pi) return;
  const db = supabaseAdmin();
  const { data } = await db.from('bookings').select('id, deposit_paid_cents').eq('stripe_payment_intent_id', pi).maybeSingle();
  const b = data as Pick<BookingRow, 'id' | 'deposit_paid_cents'> | null;
  if (b && charge.amount_refunded >= b.deposit_paid_cents) await db.from('bookings').update({ deposit_status: 'refunded' }).eq('id', b.id);
}
