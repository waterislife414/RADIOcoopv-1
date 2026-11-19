'use client';

/**
 * Zero-cost booking delivery for LAUNCH mode:
 * 1) the request is saved to Netlify Forms (free; Netlify emails it to the team inbox), and
 * 2) the customer sends it straight to Kyle's phone by text (prefilled) or email.
 * No database, no payment processor, no email service.
 */
import { CalendarPlus, CircleCheck, Mail, MapPin, MessageSquare, Phone } from 'lucide-react';
import { BUSINESS, BUSINESS_EMAIL, telHref } from '@/config/business';
import { WINDOW_BY_ID } from '@/config/scheduling';
import { buildIcs } from '@/lib/ics';
import { formatDateISO, windowRange } from '@/lib/time';

export type LaunchRequest = {
  ref: string;
  name: string;
  phone: string;
  email: string;
  mode: 'mobile' | 'shop';
  address: string;
  location: string;
  keyDrop: boolean;
  vehicle: string;
  services: string;
  symptoms: string;
  date: string;
  windowId: string;
  promo: string;
};

export function whenLabel(r: Pick<LaunchRequest, 'date' | 'windowId'>): string {
  const w = WINDOW_BY_ID.get(r.windowId);
  return `${formatDateISO(r.date)}, ${w?.label ?? ''}`.trim();
}

/** Short enough for one text message thread; Kyle gets everything he needs to call back. */
export function requestText(r: LaunchRequest): string {
  const lines = [
    `Repair request ${r.ref}`,
    `${r.name} · ${r.phone}`,
    r.mode === 'mobile' ? `Mobile: ${r.address || 'see location'}` : `Shop drop-off${r.keyDrop ? ' (after-hours key drop)' : ''}`,
    r.location ? `Location: ${r.location}` : '',
    `Vehicle: ${r.vehicle}`,
    `Need: ${[r.services, r.symptoms.slice(0, 220)].filter(Boolean).join(' — ')}`,
    `When: ${whenLabel(r)}`,
    r.promo ? `Promo: ${r.promo}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

export async function saveToNetlifyForms(r: LaunchRequest, botField: string): Promise<boolean> {
  const body = new URLSearchParams({
    'form-name': 'booking',
    'bot-field': botField,
    subject: `Repair request ${r.ref}: ${r.vehicle}`,
    name: r.name,
    phone: r.phone,
    email: r.email,
    ref: r.ref,
    mode: r.mode,
    address: r.address,
    location: r.location,
    vehicle: r.vehicle,
    services: r.services,
    when: whenLabel(r),
    promo: r.promo,
    details: requestText(r),
  });
  try {
    const res = await fetch('/__forms.html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function downloadIcs(r: LaunchRequest) {
  const w = WINDOW_BY_ID.get(r.windowId);
  if (!w) return;
  const { start, end } = windowRange(r.date, w);
  const ics = buildIcs({
    uid: `${r.ref}@duboisautorescue`,
    start,
    end,
    summary: `${BUSINESS.shortName}: ${r.vehicle}`,
    description: `Repair request ${r.ref}. Kyle will confirm by text. ${BUSINESS.phone.display}`,
    location: r.mode === 'mobile' ? r.address || r.location : `${BUSINESS.address.city}, ${BUSINESS.address.region}`,
    organizerName: BUSINESS.name,
    organizerEmail: BUSINESS_EMAIL,
  });
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${r.ref}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LaunchSent({ r, saved }: { r: LaunchRequest; saved: boolean }) {
  const text = requestText(r);
  const smsHref = `sms:${BUSINESS.phone.e164}?&body=${encodeURIComponent(text)}`;
  const mailHref = `mailto:${BUSINESS_EMAIL}?subject=${encodeURIComponent(`Repair request ${r.ref}`)}&body=${encodeURIComponent(text)}`;
  return (
    <section className="space-y-5">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-extrabold text-emerald-600">
          <CircleCheck className="h-5 w-5" aria-hidden /> {saved ? 'Request received' : 'Almost done'}
        </p>
        <h1 className="font-display mt-2 text-3xl">{saved ? `Thanks, ${r.name.split(' ')[0]}.` : 'One more tap.'}</h1>
        <p className="mt-2 text-slate-600">
          {saved
            ? 'For the fastest answer, text it to Kyle now. He confirms your time by text.'
            : 'We couldn’t send it online. Tap “Text it to Kyle” and hit send in Messages.'}
        </p>
        <div className="mt-4 rounded-xl bg-slate-900 p-4 text-white">
          <p className="text-xs font-bold text-slate-400">Your reference</p>
          <p className="font-mono text-2xl font-black tracking-widest text-amber-400">{r.ref}</p>
          <p className="mt-2 text-sm text-slate-200">{r.vehicle} · {whenLabel(r)}</p>
        </div>
        <div className="mt-5 grid gap-3">
          <a href={smsHref} className="flex h-16 items-center justify-center gap-2 rounded-xl bg-amber-500 text-lg font-extrabold text-slate-900 hover:bg-amber-400">
            <MessageSquare className="h-6 w-6" aria-hidden /> Text it to Kyle
          </a>
          <div className="grid grid-cols-2 gap-3">
            <a href={telHref} className="flex h-12 items-center justify-center gap-2 rounded-lg border-2 border-slate-900 font-bold">
              <Phone className="h-5 w-5" aria-hidden /> Call
            </a>
            <a href={mailHref} className="flex h-12 items-center justify-center gap-2 rounded-lg border-2 border-slate-900 font-bold">
              <Mail className="h-5 w-5" aria-hidden /> Email
            </a>
          </div>
          <button type="button" onClick={() => downloadIcs(r)} className="flex h-12 items-center justify-center gap-2 rounded-lg bg-slate-100 font-bold text-slate-700">
            <CalendarPlus className="h-5 w-5" aria-hidden /> Add to my calendar
          </button>
        </div>
        {r.mode === 'mobile' && !r.location && (
          <p className="mt-4 flex items-start gap-2 text-sm text-slate-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden /> Stuck somewhere without an address? In the text thread, share your location pin with Kyle.
          </p>
        )}
      </div>
      <p className="text-center text-sm text-slate-500">
        Questions? Call {BUSINESS.phone.display}. {BUSINESS.guarantee.display}
      </p>
    </section>
  );
}
