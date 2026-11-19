import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DEMO } from '@/lib/demo';
import { createMembershipCheckout, membershipPriceId } from '@/lib/stripe';

const schema = z.object({ plan: z.enum(['daily_driver', 'family', 'fleet']), interval: z.enum(['month', 'year']) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pick a plan.' }, { status: 400 });
  const { plan, interval } = parsed.data;
  if (DEMO) return NextResponse.json({ url: '/memberships?status=success' });
  if (!membershipPriceId(plan, interval)) {
    return NextResponse.json({ error: 'That plan isn’t available online yet — call or email us to sign up.' }, { status: 409 });
  }
  try {
    const session = await createMembershipCheckout(plan, interval);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('[checkout/membership]', e);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 });
  }
}
