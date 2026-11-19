import { NextResponse } from 'next/server';
import { vehicleLabel } from '@/lib/bookings';
import { DEMO, demoSetInvoice } from '@/lib/demo';
import { balanceDueCents } from '@/lib/invoice-math';
import { getInvoiceByToken } from '@/lib/invoices';
import { createInvoiceCheckout } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  const inv = body?.token ? await getInvoiceByToken(body.token) : null;
  if (!inv) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  if (inv.status !== 'approved') {
    return NextResponse.json({ error: inv.status === 'paid' ? 'Already paid — thank you!' : 'Please approve the estimate first.' }, { status: 409 });
  }
  const balance = balanceDueCents(inv);
  if (balance < 50) return NextResponse.json({ error: 'Nothing due.' }, { status: 409 });

  if (DEMO) {
    await demoSetInvoice({ status: 'paid', paid_at: new Date().toISOString() });
    return NextResponse.json({ url: `/invoice/${inv.token}` });
  }

  try {
    const session = await createInvoiceCheckout({
      invoiceId: inv.id,
      invoiceNumber: inv.number ?? inv.id.slice(0, 8),
      token: inv.token,
      balanceCents: balance,
      email: inv.customer?.email ?? null,
      vehicleLabel: vehicleLabel(inv.vehicle),
    });
    await supabaseAdmin().from('invoices').update({ stripe_checkout_session_id: session.id }).eq('id', inv.id);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('[checkout/invoice]', e);
    return NextResponse.json({ error: 'Payment is unavailable right now. Please call us.' }, { status: 502 });
  }
}
