import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PLAN_BY_ID } from '@/config/memberships';
import type { BookingWithRelations, InvoiceRow, MembershipRow } from '@/lib/db/types';
import { balanceDueCents } from '@/lib/invoice-math';
import { todayISO } from '@/lib/time';

export type DashboardStats = {
  activeMembers: number;
  mrrCents: number;
  unpaidCount: number;
  unpaidCents: number;
  revenueMtdCents: number;
  revenueYtdCents: number;
  jobsToday: number;
};

export async function getDashboardStats(db: SupabaseClient): Promise<DashboardStats> {
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01T00:00:00-05:00`;
  const yearStart = `${today.slice(0, 4)}-01-01T00:00:00-05:00`;

  const [members, unpaid, paidYtd, todayJobs] = await Promise.all([
    db.from('memberships').select('plan, interval, status, unit_amount_cents').in('status', ['active', 'trialing', 'past_due']),
    db.from('invoices').select('total_cents, deposit_applied_cents, amount_paid_cents').in('status', ['sent', 'approved']),
    db.from('invoices').select('total_cents, paid_at').eq('status', 'paid').gte('paid_at', yearStart),
    db.from('bookings').select('id', { count: 'exact', head: true }).eq('scheduled_date', today).neq('status', 'cancelled'),
  ]);

  const m = (members.data ?? []) as Pick<MembershipRow, 'plan' | 'interval' | 'status' | 'unit_amount_cents'>[];
  const mrrCents = m.reduce((sum, r) => {
    const amount = r.unit_amount_cents ?? (r.interval === 'year' ? PLAN_BY_ID.get(r.plan)?.annualCents ?? 0 : PLAN_BY_ID.get(r.plan)?.monthlyCents ?? 0);
    return sum + (r.interval === 'year' ? Math.round(amount / 12) : amount);
  }, 0);

  const u = (unpaid.data ?? []) as Pick<InvoiceRow, 'total_cents' | 'deposit_applied_cents' | 'amount_paid_cents'>[];
  const p = (paidYtd.data ?? []) as Pick<InvoiceRow, 'total_cents' | 'paid_at'>[];

  return {
    activeMembers: m.filter((r) => r.status !== 'past_due').length,
    mrrCents,
    unpaidCount: u.length,
    unpaidCents: u.reduce((s, r) => s + balanceDueCents(r), 0),
    revenueYtdCents: p.reduce((s, r) => s + r.total_cents, 0),
    revenueMtdCents: p.filter((r) => r.paid_at && r.paid_at >= monthStart).reduce((s, r) => s + r.total_cents, 0),
    jobsToday: todayJobs.count ?? 0,
  };
}

export async function getActiveJobs(db: SupabaseClient, mode: 'mobile' | 'shop' | null): Promise<BookingWithRelations[]> {
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  let q = db
    .from('bookings')
    .select('*, customer:customers(*), vehicle:vehicles(*)')
    .neq('status', 'cancelled')
    .or(`status.neq.paid,updated_at.gte.${since}`)
    .order('scheduled_start', { ascending: true })
    .limit(200);
  if (mode) q = q.eq('mode', mode);
  const { data } = await q;
  return (data ?? []) as BookingWithRelations[];
}
