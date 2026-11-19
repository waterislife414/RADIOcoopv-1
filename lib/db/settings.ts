import 'server-only';
import { DEFAULT_RATES, type BusinessRates } from '@/config/business';
import { FALLBACK_PROMOS, type Promo } from '@/config/promos';
import { DEMO } from '@/lib/demo';
import { isSupabaseConfigured } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { BusinessSettingsRow, PromoRow, TaxPresetRow } from '@/lib/db/types';

export function rowToRates(r: BusinessSettingsRow): BusinessRates {
  return {
    diagnosticFeeCents: r.diagnostic_fee_cents,
    mobileCalloutFeeCents: r.mobile_callout_fee_cents,
    shopLaborRateCents: r.shop_labor_rate_cents,
    bookingDepositCents: r.booking_deposit_cents,
    mobileCapacityPerWindow: r.mobile_capacity_per_window,
    shopCapacityPerWindow: r.shop_capacity_per_window,
  };
}

/** Live rates with config fallback (keeps marketing pages up if the DB is unreachable). */
export async function getRates(): Promise<BusinessRates> {
  if (DEMO || !isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return DEFAULT_RATES;
  try {
    const { data, error } = await supabaseAdmin().from('business_settings').select('*').eq('id', 1).maybeSingle();
    if (error || !data) return DEFAULT_RATES;
    return rowToRates(data as BusinessSettingsRow);
  } catch {
    return DEFAULT_RATES;
  }
}

function isLive(p: PromoRow, now = Date.now()): boolean {
  if (!p.active) return false;
  if (p.starts_at && Date.parse(p.starts_at) > now) return false;
  if (p.ends_at && Date.parse(p.ends_at) <= now) return false;
  if (p.max_redemptions !== null && p.redemptions >= p.max_redemptions) return false;
  return true;
}

const toPromo = (p: PromoRow): Promo => ({
  code: p.code,
  title: p.title,
  description: p.description,
  discount_type: p.discount_type,
  amount_cents: p.amount_cents,
  percent_off: p.percent_off,
  scope: p.scope,
  service_id: p.service_id,
  first_time_only: p.first_time_only,
  featured: p.featured,
});

export async function getLivePromos(): Promise<Promo[]> {
  if (DEMO || !isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return [...FALLBACK_PROMOS];
  try {
    const { data, error } = await supabaseAdmin().from('promos').select('*').eq('active', true).order('sort');
    if (error || !data) return [...FALLBACK_PROMOS];
    return (data as PromoRow[]).filter((p) => isLive(p)).map(toPromo);
  } catch {
    return [...FALLBACK_PROMOS];
  }
}

export type PromoCheck = { ok: true; promo: Promo } | { ok: false; reason: string };

export async function validatePromo(
  code: string,
  ctx: { mode: 'mobile' | 'shop'; email?: string | null },
): Promise<PromoCheck> {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,24}$/.test(normalized)) return { ok: false, reason: 'That code doesn’t look right.' };
  if (DEMO) {
    const p = FALLBACK_PROMOS.find((x) => x.code === normalized);
    if (!p) return { ok: false, reason: 'That code is expired or not valid.' };
    if (p.scope !== 'any' && p.scope !== ctx.mode) return { ok: false, reason: `This offer is for ${p.scope} appointments only.` };
    return { ok: true, promo: p };
  }
  const db = supabaseAdmin();
  const { data } = await db.from('promos').select('*').eq('code', normalized).maybeSingle();
  const p = data as PromoRow | null;
  if (!p || !isLive(p)) return { ok: false, reason: 'That code is expired or not valid.' };
  if (p.scope !== 'any' && p.scope !== ctx.mode) {
    return { ok: false, reason: `This offer is for ${p.scope === 'mobile' ? 'mobile' : 'shop'} appointments only.` };
  }
  if (p.first_time_only && ctx.email) {
    const { data: cust } = await db.from('customers').select('id').eq('email', ctx.email.toLowerCase()).maybeSingle();
    if (cust) {
      const { count } = await db
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', (cust as { id: string }).id)
        .neq('status', 'cancelled');
      if ((count ?? 0) > 0) return { ok: false, reason: 'This offer is for first-time customers.' };
    }
  }
  return { ok: true, promo: toPromo(p) };
}

export async function getTaxPresets(activeOnly = true): Promise<TaxPresetRow[]> {
  const q = supabaseAdmin().from('tax_presets').select('*').order('is_default', { ascending: false }).order('name');
  const { data } = activeOnly ? await q.eq('active', true) : await q;
  return (data ?? []) as TaxPresetRow[];
}
