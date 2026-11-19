import { NextResponse } from 'next/server';
import { BookingError, createBooking } from '@/lib/bookings';
import { bookingSchema, firstIssue } from '@/lib/validation';

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const parsed = bookingSchema.safeParse(json);
  if (!parsed.success) {
    const { field, message } = firstIssue(parsed.error);
    return NextResponse.json({ error: message, field }, { status: 400 });
  }
  try {
    const result = await createBooking(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof BookingError) {
      return NextResponse.json({ error: e.message, code: e.code, field: e.field }, { status: e.status });
    }
    console.error('[bookings] create failed', e);
    return NextResponse.json({ error: 'Something went wrong. Call us and we’ll book you by phone.' }, { status: 500 });
  }
}
