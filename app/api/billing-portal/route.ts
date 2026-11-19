import { NextResponse } from 'next/server';
import { createPortalFromCheckoutSession } from '@/lib/stripe';

/** Opens the Stripe Customer Portal for the customer who just finished membership Checkout. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { sessionId?: string } | null;
  const sessionId = body?.sessionId ?? '';
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return NextResponse.json({ error: 'Invalid session.' }, { status: 400 });
  try {
    return NextResponse.json({ url: await createPortalFromCheckoutSession(sessionId) });
  } catch (e) {
    console.error('[billing-portal]', e);
    return NextResponse.json({ error: 'Could not open billing portal.' }, { status: 502 });
  }
}
