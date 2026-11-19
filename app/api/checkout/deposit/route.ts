import { NextResponse } from 'next/server';
import { SERVICE_BY_ID } from '@/config/services';
import { getBookingByRef, vehicleLabel } from '@/lib/bookings';
import { createDepositCheckout } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatDateISO } from '@/lib/time';

/** Retry a deposit payment from the confirmation page (e.g. customer cancelled Checkout). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { ref?: string } | null;
  const b = body?.ref ? await getBookingByRef(body.ref.toUpperCase()) : null;
  if (!b || b.status === 'cancelled') return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
  if (b.deposit_status === 'paid') return NextResponse.json({ error: 'Deposit already paid.' }, { status: 409 });
  if (b.deposit_cents <= 0 || !b.customer?.email) return NextResponse.json({ error: 'No deposit due.' }, { status: 400 });

  const services = b.service_ids.map((id) => SERVICE_BY_ID.get(id)?.name ?? id).join(', ') || 'Diagnosis';
  const session = await createDepositCheckout({
    bookingId: b.id,
    ref: b.ref,
    amountCents: b.deposit_cents,
    email: b.customer.email,
    summary: `${vehicleLabel(b.vehicle)} · ${services} · ${formatDateISO(b.scheduled_date)} ${b.window_label}`,
  });
  await supabaseAdmin().from('bookings').update({ stripe_checkout_session_id: session.id, deposit_status: 'pending' }).eq('id', b.id);
  return NextResponse.json({ url: session.url });
}
