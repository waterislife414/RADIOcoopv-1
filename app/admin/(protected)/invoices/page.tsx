import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import type { CustomerRow, InvoiceRow, InvoiceStatus } from '@/lib/db/types';
import { balanceDueCents } from '@/lib/invoice-math';
import { formatCents } from '@/lib/money';
import { formatET } from '@/lib/time';

const BADGE: Record<InvoiceStatus, string> = {
  draft: 'bg-slate-200 text-slate-700',
  sent: 'bg-amber-100 text-amber-800',
  approved: 'bg-sky-100 text-sky-800',
  paid: 'bg-emerald-500 text-white',
  void: 'bg-slate-300 text-slate-500 line-through',
};

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  let q = supabase.from('invoices').select('*, customer:customers(full_name)').order('created_at', { ascending: false }).limit(200);
  if (sp.status && ['draft', 'sent', 'approved', 'paid', 'void'].includes(sp.status)) q = q.eq('status', sp.status);
  const { data } = await q;
  const rows = (data ?? []) as (InvoiceRow & { customer: Pick<CustomerRow, 'full_name'> | null })[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl">Estimates & invoices</h1>
        <Link href="/admin/invoices/new" className="flex h-10 items-center gap-1 rounded-lg bg-amber-500 px-4 text-sm font-extrabold text-slate-900"><Plus className="h-4 w-4" aria-hidden />New estimate</Link>
      </div>
      <div className="flex gap-1 overflow-x-auto text-sm font-bold">
        {['all', 'draft', 'sent', 'approved', 'paid', 'void'].map((s) => (
          <Link key={s} href={s === 'all' ? '/admin/invoices' : `/admin/invoices?status=${s}`}
            className={`rounded-lg px-3 py-1.5 capitalize ${(sp.status ?? 'all') === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}>{s}</Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="p-3">Number</th><th className="p-3">Customer</th><th className="p-3">Status</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Balance</th><th className="hidden p-3 md:table-cell">Created</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3 font-mono font-bold"><Link href={`/admin/invoices/${r.id}`} className="hover:underline">{r.number}</Link></td>
                <td className="p-3">{r.customer?.full_name}</td>
                <td className="p-3"><span className={`rounded px-2 py-0.5 text-xs font-bold capitalize ${BADGE[r.status]}`}>{r.status}</span></td>
                <td className="p-3 text-right tabular-nums">{formatCents(r.total_cents)}</td>
                <td className="p-3 text-right tabular-nums">{formatCents(balanceDueCents(r))}</td>
                <td className="hidden p-3 text-slate-500 md:table-cell">{formatET(r.created_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">No invoices yet. Build one from a job or start a new estimate.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
