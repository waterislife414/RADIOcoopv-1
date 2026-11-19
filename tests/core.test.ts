import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUSINESS, BUSINESS_EMAIL } from '../config/business';
import { checkCoverage } from '../config/serviceArea';
import { computeTotals, balanceDueCents } from '../lib/invoice-math';
import { zonedToUtc, isOpenDay } from '../lib/time';
import { buildIcs } from '../lib/ics';
import { withUtm, qrSvg } from '../lib/qr';
import { bookingRef } from '../lib/ids';
import { parseCsv } from '../lib/csv';

test('email spelling is exact (dubios, not dubois)', () => {
  assert.equal(BUSINESS_EMAIL, 'kyledubios2412@gmail.com');
  assert.equal(BUSINESS.email, 'kyledubios2412@gmail.com');
});

test('coverage: in-radius, out-of-radius, unknown, invalid', () => {
  assert.equal(checkCoverage('36869', 4500).status, 'mobile');
  assert.equal(checkCoverage('31905', 4500).status, 'mobile');
  const opelika = checkCoverage('36801', 4500);
  assert.equal(opelika.status, 'shop-only');
  assert.equal(opelika.status === 'shop-only' && opelika.reason, 'outside-radius');
  const unknown = checkCoverage('90210', 4500);
  assert.equal(unknown.status === 'shop-only' && unknown.reason, 'not-listed');
  assert.equal(checkCoverage('3686', 4500).status, 'invalid');
});

test('invoice math: AL 9.75% parts-only, discount, deposit', () => {
  const t = computeTotals(
    [
      { type: 'labor', description: 'Alternator R&R', quantity: 1.5, unitPriceCents: 11000, taxable: false },
      { type: 'part', description: 'Alternator', quantity: 1, unitPriceCents: 21999, taxable: true },
      { type: 'fee', description: 'Mobile callout', quantity: 1, unitPriceCents: 4500, taxable: false },
      { type: 'discount', description: 'FIRSTMOBILE25', quantity: 1, unitPriceCents: 2500, taxable: false },
    ],
    97500,
  );
  assert.equal(t.laborCents, 16500);
  assert.equal(t.partsCents, 21999);
  assert.equal(t.discountCents, 2500);
  assert.equal(t.subtotalCents, 16500 + 21999 + 4500 - 2500);
  assert.equal(t.taxableCents, 21999);
  assert.equal(t.taxCents, Math.round((21999 * 97500) / 1_000_000)); // 2145
  assert.equal(t.totalCents, t.subtotalCents + t.taxCents);
  assert.equal(balanceDueCents({ total_cents: t.totalCents, deposit_applied_cents: 8900, amount_paid_cents: 0 }), t.totalCents - 8900);
});

test('invoice math: GA 9% fractional rate and 8.875% rounding', () => {
  assert.equal(computeTotals([{ type: 'part', description: 'x', quantity: 1, unitPriceCents: 10000, taxable: true }], 90000).taxCents, 900);
  assert.equal(computeTotals([{ type: 'part', description: 'x', quantity: 1, unitPriceCents: 10000, taxable: true }], 88750).taxCents, 888);
});

test('ET conversion handles DST', () => {
  assert.equal(zonedToUtc('2026-07-15', '09:00').toISOString(), '2026-07-15T13:00:00.000Z'); // EDT
  assert.equal(zonedToUtc('2026-12-15', '09:00').toISOString(), '2026-12-15T14:00:00.000Z'); // EST
  assert.equal(isOpenDay('2026-11-22'), false); // Sunday
  assert.equal(isOpenDay('2026-11-21'), true); // Saturday
});

test('ics is RFC-shaped', () => {
  const ics = buildIcs({ uid: 'KA-TEST@x', start: new Date('2026-12-01T14:00:00Z'), end: new Date('2026-12-01T16:00:00Z'), summary: 'Mobile, mechanic', description: 'a;b', location: 'Phenix City, AL', organizerName: 'Kyle', organizerEmail: 'kyledubios2412@gmail.com' });
  assert.match(ics, /DTSTART:20261201T140000Z\r\n/);
  assert.match(ics, /SUMMARY:Mobile\\, mechanic/);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('qr + utm', async () => {
  assert.equal(withUtm('https://x.com/?offer=TRUCK25', { source: 'truck' }), 'https://x.com/?offer=TRUCK25&utm_source=truck&utm_medium=qr');
  const svg = await qrSvg('https://x.com', { label: 'SCAN' });
  assert.match(svg, /^<svg[^>]+viewBox="0 0 \d+/);
  assert.match(svg, />SCAN<\/text>/);
});

test('booking ref format', () => {
  assert.match(bookingRef(), /^KA-[A-HJ-NP-Z2-9]{7}$/);
});

test('csv parser handles quotes, commas and newlines (Google Sheet export)', () => {
  const rows = parseCsv('"Service","Starting price ($)"\n"Brake Pads, per axle","149"\n"Say ""hi""","line1\nline2"\n');
  assert.deepEqual(rows[1], ['Brake Pads, per axle', '149']);
  assert.deepEqual(rows[2], ['Say "hi"', 'line1\nline2']);
});
