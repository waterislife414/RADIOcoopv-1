import { NextResponse } from 'next/server';
import { BOOKING_WINDOWS } from '@/config/scheduling';
import { slotUsage } from '@/lib/bookings';
import { getRates } from '@/lib/db/settings';
import { isDateInBookingRange, isWindowBookable } from '@/lib/time';

export const dynamic = 'force-dynamic';

export type AvailabilityResponse = {
  date: string;
  mode: 'mobile' | 'shop';
  windows: { id: string; label: string; available: boolean; remaining: number }[];
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get('date') ?? '';
  const mode = url.searchParams.get('mode') === 'shop' ? 'shop' : 'mobile';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isDateInBookingRange(date)) {
    return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
  }
  try {
    const [rates, usage] = await Promise.all([getRates(), slotUsage(date, mode)]);
    const cap = mode === 'mobile' ? rates.mobileCapacityPerWindow : rates.shopCapacityPerWindow;
    const body: AvailabilityResponse = {
      date,
      mode,
      windows: BOOKING_WINDOWS.map((w) => {
        const remaining = Math.max(0, cap - (usage.get(w.id) ?? 0));
        return { id: w.id, label: w.label, remaining, available: remaining > 0 && isWindowBookable(date, w) };
      }),
    };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[availability]', e);
    return NextResponse.json({ error: 'Availability unavailable.' }, { status: 503 });
  }
}
