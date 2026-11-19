import { NextResponse } from 'next/server';
import { validatePromo } from '@/lib/db/settings';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code') ?? '';
  const mode = url.searchParams.get('mode') === 'shop' ? 'shop' : 'mobile';
  const email = url.searchParams.get('email');
  try {
    const result = await validatePromo(code, { mode, email });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[promos/validate]', e);
    return NextResponse.json({ ok: false, reason: 'Could not check that code right now.' }, { status: 503 });
  }
}
