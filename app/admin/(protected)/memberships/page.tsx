import { PLAN_BY_ID } from '@/config/memberships';
import { requireAdmin } from '@/lib/auth';
import type { CustomerRow, MembershipRow } from '@/lib/db/types';
import { formatCentsShort } from '@/lib/money';
import { formatET } from '@/lib/time';

export default async function MembershipsAdmin() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from('memberships').select('*, customer:customers(full_name, email, phone)').order('created_at', { ascending: false });
  const rows = (data ?? []) as (MembershipRow & { customer: Pick<CustomerRow, 'full_name' | 'email' | 'phone'> | null })[];
  const active = rows.filter((r) => r.status === 'active' || r.status === 'trialing');
  const mrr = active.reduce((s, r) => s + (r.interval === 'year' ? Math.round((r.unit_amount_cents ?? 0) / 12) : r.unit_amount_cents ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="font-display text-2xl">Members</h1>
        <p className="text-sm font-bold">{active.length} active · {formatCentsShort(mrr)} MRR</p>
      </div>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="p-3">Member</th><th className="p-3">Plan</th><th className="p-3">Status</th><th className="p-3">Renews</th><th className="p-3">Perks used</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-3"><p className="font-bold">{r.customer?.full_name ?? '—'}</p><p className="text-xs text-slate-500">{r.customer?.email} {r.customer?.phone}</p></td>
                <td className="p-3">{PLAN_BY_ID.get(r.plan)?.name ?? r.plan} <span className="text-xs text-slate-500">/{r.interval}</span></td>
                <td className="p-3"><span className={`rounded px-2 py-0.5 text-xs font-bold ${r.status === 'active' ? 'bg-emerald-500 text-white' : r.status === 'past_due' ? 'bg-red-100 text-red-700' : 'bg-slate-200'}`}>{r.status}</span>{r.cancel_at_period_end && <span className="ml-1 text-xs text-red-600">cancels</span>}</td>
                <td className="p-3 text-xs">{r.current_period_end ? formatET(r.current_period_end) : '—'}</td>
                <td className="p-3 text-xs">Oil {r.oil_changes_used}/2 · Callouts {r.callouts_waived_used}/2</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">No members yet. Share /memberships with your regulars.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
