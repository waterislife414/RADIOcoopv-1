import 'server-only';
import { BUSINESS, BUSINESS_EMAIL } from '@/config/business';
import { formatCents } from '@/lib/money';
import { LINE_TYPE_LABEL, type LineType } from '@/lib/invoice-math';

export const esc = (s: string | null | undefined) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

type Email = { subject: string; html: string; text: string };

function layout(title: string, body: string, cta?: { label: string; href: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif;color:#0F172A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden">
<tr><td style="background:#0F172A;padding:20px 24px;color:#FFFFFF;font-weight:800;font-size:18px;letter-spacing:.3px">
${esc(BUSINESS.name)}<div style="height:3px;width:56px;background:#F59E0B;margin-top:10px"></div></td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 12px;font-size:22px">${esc(title)}</h1>${body}
${cta ? `<p style="margin:24px 0"><a href="${esc(cta.href)}" style="background:#F59E0B;color:#0F172A;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:8px;display:inline-block">${esc(cta.label)}</a></p>` : ''}
</td></tr>
<tr><td style="background:#1E293B;color:#CBD5E1;padding:16px 24px;font-size:12px;line-height:1.6">
${esc(BUSINESS.name)} · ${esc(BUSINESS.address.city)}, ${esc(BUSINESS.address.region)} ${esc(BUSINESS.address.postalCode)}<br>
${esc(BUSINESS.phone.display)} · <a href="mailto:${BUSINESS_EMAIL}" style="color:#FCD34D">${BUSINESS_EMAIL}</a><br>
${esc(BUSINESS.hours.display)} · ${esc(BUSINESS.guarantee.short)}</td></tr>
</table></td></tr></table></body></html>`;
}

const row = (k: string, v: string) =>
  `<tr><td style="padding:6px 0;color:#475569;width:38%;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-weight:600">${v}</td></tr>`;
const table = (rows: string) => `<table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px">${rows}</table>`;

export type BookingEmailData = {
  ref: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  mode: 'mobile' | 'shop';
  dateLabel: string;
  windowLabel: string;
  vehicle: string;
  services: string[];
  symptoms: string | null;
  serviceAddress: string | null;
  parkingNotes: string | null;
  afterHoursKeyDrop: boolean;
  shopAddress: string;
  paymentChoice: 'deposit' | 'estimate';
  depositCents: number;
  promoCode: string | null;
  mediaCount: number;
  utmSource: string | null;
  confirmationUrl: string;
  icsUrl: string;
  adminUrl: string;
};

export function bookingCustomerEmail(d: BookingEmailData): Email {
  const first = d.customerName.split(' ')[0] ?? d.customerName;
  const where = d.mode === 'mobile' ? `We come to you: ${esc(d.serviceAddress)}` : `Shop drop-off: ${esc(d.shopAddress)}`;
  const body = `<p>Thanks, ${esc(first)} — your ${d.mode === 'mobile' ? 'mobile repair' : 'shop'} appointment request is in. Kyle will confirm by text or call.</p>
${table(
  row('Reference', `<span style="font-family:monospace">${esc(d.ref)}</span>`) +
    row('When', `${esc(d.dateLabel)}<br>${esc(d.windowLabel)} <span style="color:#B45309">(Eastern Time)</span>`) +
    row('Where', where) +
    row('Vehicle', esc(d.vehicle)) +
    row('Services', esc(d.services.join(', ') || 'Diagnosis')) +
    (d.promoCode ? row('Promo', esc(d.promoCode)) : '') +
    row('Payment', d.paymentChoice === 'deposit' ? `Refundable deposit ${formatCents(d.depositCents)} (credited to your invoice)` : 'Free estimate first — nothing charged yet'),
)}
<p style="font-size:13px;color:#475569">You will get an itemized digital estimate to approve before any work starts. Diagnostic fee is waived when you approve the repair — and if Kyle can’t find or fix the problem, you don’t pay.</p>
<p style="font-size:13px"><a href="${esc(d.icsUrl)}">Add to calendar (.ics)</a></p>`;
  return {
    subject: `Booked: ${d.dateLabel}, ${d.windowLabel} — ${d.ref}`,
    html: layout('Your appointment request is in', body, { label: 'View booking', href: d.confirmationUrl }),
    text: `Booking ${d.ref}\n${d.dateLabel} ${d.windowLabel} (ET)\n${d.mode === 'mobile' ? `Address: ${d.serviceAddress}` : `Shop: ${d.shopAddress}`}\nVehicle: ${d.vehicle}\nServices: ${d.services.join(', ')}\n\nView: ${d.confirmationUrl}\nCalendar: ${d.icsUrl}\n\nQuestions? Reply to this email or call ${BUSINESS.phone.display}.`,
  };
}

export function bookingOwnerEmail(d: BookingEmailData): Email {
  const body = table(
    row('Ref', esc(d.ref)) +
      row('Mode', d.mode === 'mobile' ? '🚚 MOBILE' : '🔧 SHOP') +
      row('When', `${esc(d.dateLabel)} · ${esc(d.windowLabel)}`) +
      row('Customer', `${esc(d.customerName)}<br><a href="tel:${esc(d.customerPhone)}">${esc(d.customerPhone)}</a><br>${esc(d.customerEmail)}`) +
      (d.mode === 'mobile' ? row('Address', esc(d.serviceAddress)) + row('Parking', esc(d.parkingNotes || '—')) : row('After-hours key drop', d.afterHoursKeyDrop ? 'YES' : 'No')) +
      row('Vehicle', esc(d.vehicle)) +
      row('Services', esc(d.services.join(', ') || '—')) +
      row('Symptoms', esc(d.symptoms || '—')) +
      row('Uploads', `${d.mediaCount} file(s)`) +
      row('Payment', d.paymentChoice === 'deposit' ? `Deposit ${formatCents(d.depositCents)} (pending until paid)` : 'Estimate first') +
      row('Promo', esc(d.promoCode || '—')) +
      row('Source', esc(d.utmSource || 'direct')),
  );
  return {
    subject: `New ${d.mode} booking ${d.ref} — ${d.dateLabel} ${d.windowLabel}`,
    html: layout('New booking', body, { label: 'Open in admin', href: d.adminUrl }),
    text: `New ${d.mode} booking ${d.ref}\n${d.dateLabel} ${d.windowLabel}\n${d.customerName} ${d.customerPhone} ${d.customerEmail}\n${d.vehicle}\n${d.services.join(', ')}\n${d.symptoms ?? ''}\n${d.adminUrl}`,
  };
}

export function estimateEmail(d: { name: string; number: string; vehicle: string; totalCents: number; url: string }): Email {
  const body = `<p>Hi ${esc(d.name.split(' ')[0])}, your itemized estimate for the <strong>${esc(d.vehicle)}</strong> is ready.</p>
${table(row('Estimate', esc(d.number)) + row('Estimated total', formatCents(d.totalCents)))}
<p style="font-size:13px;color:#475569">Review the line items and inspection photos, then tap <strong>Approve Estimate</strong>. No work starts without your OK.</p>`;
  return {
    subject: `Your estimate ${d.number} is ready to review`,
    html: layout('Your estimate is ready', body, { label: 'Review & approve', href: d.url }),
    text: `Your estimate ${d.number} (${formatCents(d.totalCents)}) for the ${d.vehicle} is ready: ${d.url}`,
  };
}

export function estimateApprovedOwnerEmail(d: { number: string; customer: string; signature: string; approvedAt: string; totalCents: number; adminUrl: string }): Email {
  const body = table(
    row('Estimate', esc(d.number)) + row('Customer', esc(d.customer)) + row('Signed as', esc(d.signature)) + row('Approved', esc(d.approvedAt)) + row('Total', formatCents(d.totalCents)),
  );
  return {
    subject: `✅ Approved: ${d.number} (${formatCents(d.totalCents)})`,
    html: layout('Estimate approved — clear to start', body, { label: 'Open invoice', href: d.adminUrl }),
    text: `${d.customer} approved ${d.number} as "${d.signature}" at ${d.approvedAt}. ${d.adminUrl}`,
  };
}

export type ReceiptEmailData = {
  number: string;
  customerName: string;
  vehicle: string;
  vin: string | null;
  odometer: number | null;
  items: { type: LineType; description: string; quantity: number; line_total_cents: number }[];
  subtotalCents: number;
  taxCents: number;
  taxName: string;
  totalCents: number;
  depositAppliedCents: number;
  paidCents: number;
  paidAt: string;
  transactionId: string;
  receiptUrl: string;
};

export function receiptEmail(d: ReceiptEmailData): Email {
  const lines = d.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #E2E8F0">${esc(LINE_TYPE_LABEL[i.type])}: ${esc(i.description)}${i.type === 'labor' ? ` (${i.quantity} hr)` : i.quantity !== 1 ? ` ×${i.quantity}` : ''}</td><td style="padding:6px 0;border-bottom:1px solid #E2E8F0;text-align:right">${formatCents(i.line_total_cents)}</td></tr>`,
    )
    .join('');
  const body = `<p>Thank you, ${esc(d.customerName.split(' ')[0])}. Payment received — this is your official receipt.</p>
${table(row('Receipt', esc(d.number)) + row('Vehicle', esc(d.vehicle)) + (d.vin ? row('VIN', `<span style="font-family:monospace">${esc(d.vin)}</span>`) : '') + (d.odometer ? row('Odometer', `${d.odometer.toLocaleString('en-US')} mi`) : '') + row('Paid', esc(d.paidAt)) + row('Transaction ID', `<span style="font-family:monospace;font-size:12px">${esc(d.transactionId)}</span>`))}
<table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;margin-top:16px">${lines}
<tr><td style="padding:6px 0">Subtotal</td><td style="text-align:right">${formatCents(d.subtotalCents)}</td></tr>
<tr><td style="padding:6px 0">Sales tax (${esc(d.taxName)})</td><td style="text-align:right">${formatCents(d.taxCents)}</td></tr>
${d.depositAppliedCents ? `<tr><td style="padding:6px 0">Deposit applied</td><td style="text-align:right">−${formatCents(d.depositAppliedCents)}</td></tr>` : ''}
<tr><td style="padding:8px 0;font-weight:800">Paid today</td><td style="text-align:right;font-weight:800">${formatCents(d.paidCents)}</td></tr></table>
`;
  return {
    subject: `Receipt ${d.number} — ${BUSINESS.name}`,
    html: layout('Payment received', body, { label: 'View / print receipt', href: d.receiptUrl }),
    text: `Receipt ${d.number}\nVehicle: ${d.vehicle}\nPaid: ${formatCents(d.paidCents)} on ${d.paidAt}\nTransaction: ${d.transactionId}\n${d.receiptUrl}`,
  };
}

export function ownerPaymentEmail(d: { number: string; customer: string; paidCents: number; transactionId: string; adminUrl: string }): Email {
  return {
    subject: `💵 Paid: ${d.number} — ${formatCents(d.paidCents)}`,
    html: layout('Invoice paid', table(row('Invoice', esc(d.number)) + row('Customer', esc(d.customer)) + row('Amount', formatCents(d.paidCents)) + row('Stripe', esc(d.transactionId))), { label: 'Open invoice', href: d.adminUrl }),
    text: `${d.customer} paid ${d.number}: ${formatCents(d.paidCents)} (${d.transactionId})`,
  };
}

export function membershipWelcomeEmail(d: { name: string; planName: string; interval: 'month' | 'year'; bookUrl: string }): Email {
  const body = `<p>Welcome aboard${d.name ? `, ${esc(d.name.split(' ')[0])}` : ''}! Your <strong>${esc(d.planName)}</strong> membership (${d.interval === 'year' ? 'annual' : 'monthly'}) is active.</p>
<p>Mention you’re a member when booking and Kyle will apply your perks (priority dispatch, waived callouts, labor discount). Manage billing anytime from the link in your Stripe receipt.</p>`;
  return {
    subject: `You're in: ${d.planName} membership`,
    html: layout('Membership active', body, { label: 'Book your first service', href: d.bookUrl }),
    text: `Your ${d.planName} membership is active. Book: ${d.bookUrl}`,
  };
}
