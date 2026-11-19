import 'server-only';
import { BUSINESS } from '@/config/business';
import type { Promo, PromoScope, DiscountType } from '@/config/promos';
import { SERVICES, type Service } from '@/config/services';
import { parseCsv } from '@/lib/csv';

/**
 * Kyle's Google Sheet ("Dubois Automotive Rescue — Website Editor") as a free CMS.
 * Tabs: Prices, Specials, Fees, Settings. Read via the gviz CSV endpoint (sheet must be
 * shared "Anyone with the link: Viewer"). Cached 5 minutes. Any failure → config defaults,
 * so a broken sheet can never take the site down.
 */
const SHEET_ID = process.env.SITE_SHEET_ID ?? '';
const REVALIDATE = 300;

async function tab(name: string): Promise<string[][] | null> {
  if (!SHEET_ID) return null;
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(name)}`;
    const res = await fetch(url, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.trimStart().startsWith('<')) return null; // sign-in page = sheet not shared
    const rows = parseCsv(text).map((r) => r.map((c) => c.trim()));
    return rows.length > 1 ? rows.slice(1) : null; // drop header
  } catch {
    return null;
  }
}

const yes = (v: string | undefined) => /^(y|yes|true|1|on)$/i.test(v ?? '');
const money = (v: string | undefined): number | null => {
  const n = Number((v ?? '').replace(/[^0-9.]/g, ''));
  return (v ?? '').trim() === '' || !Number.isFinite(n) ? null : Math.round(n * 100);
};

export type PricedService = Omit<Service, 'startingAtCents'> & { startingAtCents: number | null };

/** Services with Kyle's prices; blank price = "Call for quote"; "no" in Show = hidden. */
export async function getServices(): Promise<PricedService[]> {
  const rows = await tab('Prices');
  if (!rows) return [...SERVICES];
  const byId = new Map(rows.map((r) => [r[6] ?? '', r]));
  const out: PricedService[] = [];
  for (const s of SERVICES) {
    const r = byId.get(s.id);
    if (!r) { out.push(s); continue; }
    if ((r[5] ?? '') !== '' && !yes(r[5])) continue;
    out.push({
      ...s,
      name: r[0] || s.name,
      startingAtCents: money(r[1]),
      duration: r[2] || s.duration,
      blurb: r[3] || s.blurb,
      mode: /shop/i.test(r[4] ?? '') ? 'shop' : /mobile/i.test(r[4] ?? '') ? 'mobile' : s.mode,
    });
  }
  return out;
}

/** Active specials, or null when the sheet is unavailable (caller falls back to config). */
export async function getSheetPromos(): Promise<Promo[] | null> {
  const rows = await tab('Specials');
  if (!rows) return null;
  const out: Promo[] = [];
  for (const r of rows) {
    const code = (r[0] ?? '').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (code.length < 3 || !r[1] || !yes(r[7])) continue;
    const t = (r[3] ?? '').toLowerCase();
    const discount_type: DiscountType = t.includes('percent') ? 'percent' : t.includes('dollar') ? 'fixed' : 'freebie';
    const amt = Number((r[4] ?? '').replace(/[^0-9.]/g, '')) || 0;
    const who = (r[5] ?? '').toLowerCase();
    const scope: PromoScope = who.includes('mobile') ? 'mobile' : who.includes('shop') ? 'shop' : 'any';
    out.push({
      code, title: r[1], description: r[2] || null, discount_type,
      amount_cents: discount_type === 'fixed' ? Math.round(amt * 100) : 0,
      percent_off: discount_type === 'percent' ? Math.min(100, Math.round(amt)) : 0,
      scope, service_id: code.startsWith('OIL') ? 'oil-change' : null, first_time_only: false, featured: yes(r[6]),
    });
  }
  return out;
}

export type SheetFees = { diagnosticFeeCents?: number; mobileCalloutFeeCents?: number; shopLaborRateCents?: number };

export async function getSheetFees(): Promise<SheetFees> {
  const rows = await tab('Fees');
  if (!rows) return {};
  const out: SheetFees = {};
  for (const r of rows) {
    const k = (r[0] ?? '').toLowerCase();
    const v = money(r[1]);
    if (v === null) continue;
    if (k.includes('diagnostic')) out.diagnosticFeeCents = v;
    else if (k.includes('callout') || k.includes('trip')) out.mobileCalloutFeeCents = v;
    else if (k.includes('labor')) out.shopLaborRateCents = v;
  }
  return out;
}

export type SiteSettings = { banner: string; paymentNote: string; googleReviewUrl: string | null };

export async function getSiteSettings(): Promise<SiteSettings> {
  const rows = await tab('Settings');
  const get = (key: string) => rows?.find((r) => (r[0] ?? '').toLowerCase().startsWith(key))?.[1]?.trim() ?? '';
  const review = get('google review');
  const configReview = BUSINESS.googleReviewUrl.includes('YOUR_LINK') ? null : BUSINESS.googleReviewUrl;
  return {
    banner: rows ? get('banner') : '',
    paymentNote: get('how customers pay') || 'Pay when the job is done.',
    googleReviewUrl: /^https:\/\//.test(review) ? review : configReview,
  };
}
