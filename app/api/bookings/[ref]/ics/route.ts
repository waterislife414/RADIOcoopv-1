import { BUSINESS, BUSINESS_EMAIL, publicShopAddress } from '@/config/business';
import { SERVICE_BY_ID } from '@/config/services';
import { getBookingByRef, vehicleLabel } from '@/lib/bookings';
import { absoluteUrl } from '@/lib/env';
import { buildIcs } from '@/lib/ics';

export async function GET(_req: Request, ctx: { params: Promise<{ ref: string }> }) {
  const { ref } = await ctx.params;
  const b = await getBookingByRef(ref.toUpperCase());
  if (!b || b.status === 'cancelled') return new Response('Not found', { status: 404 });

  const services = b.service_ids.map((id) => SERVICE_BY_ID.get(id)?.name ?? id).join(', ') || 'Diagnosis';
  const location =
    b.mode === 'mobile'
      ? `${b.service_street}, ${b.service_city}, ${b.service_state} ${b.service_zip}`
      : `${BUSINESS.name} — ${publicShopAddress().line}`;
  const ics = buildIcs({
    uid: `${b.ref}@kylesauto`,
    start: new Date(b.scheduled_start),
    end: new Date(b.scheduled_end),
    summary: `${b.mode === 'mobile' ? 'Mobile mechanic' : 'Shop drop-off'}: ${vehicleLabel(b.vehicle)}`,
    description: `${BUSINESS.name}\nRef ${b.ref}\nArrival window: ${b.window_label}\nServices: ${services}\nQuestions: ${BUSINESS.phone.display}`,
    location,
    organizerName: BUSINESS.name,
    organizerEmail: BUSINESS_EMAIL,
    url: absoluteUrl(`/book/confirmation/${b.ref}`),
  });
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${b.ref}.ics"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
