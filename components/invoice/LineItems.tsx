import { LINE_TYPE_LABEL, balanceDueCents } from '@/lib/invoice-math';
import type { InvoiceWithRelations } from '@/lib/db/types';
import { formatCents, formatPpm } from '@/lib/money';

const GROUP_ORDER = ['labor', 'part', 'fee', 'supply', 'discount'] as const;

export function LineItems({ inv, compact = false }: { inv: InvoiceWithRelations; compact?: boolean }) {
  const groups = GROUP_ORDER.map((t) => ({ type: t, items: inv.items.filter((i) => i.type === t) })).filter((g) => g.items.length);
  const balance = balanceDueCents(inv);

  return (
    <div className="text-sm">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-slate-900 text-left text-xs uppercase tracking-wider text-slate-500">
            <th className="py-2 font-bold">Item</th>
            <th className="py-2 text-right font-bold">{compact ? 'Qty' : 'Qty / Hrs'}</th>
            <th className="hidden py-2 text-right font-bold sm:table-cell">Rate</th>
            <th className="py-2 text-right font-bold">Amount</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.type}>
            <tr>
              <td colSpan={4} className="pb-1 pt-4 text-xs font-extrabold uppercase tracking-wider text-amber-700">
                {g.type === 'labor' ? 'Labor' : g.type === 'part' ? 'Parts' : g.type === 'fee' ? 'Fees' : g.type === 'supply' ? 'Shop supplies' : 'Discounts'}
              </td>
            </tr>
            {g.items.map((i) => (
              <tr key={i.id} className="border-b border-slate-200 align-top">
                <td className="py-2 pr-2">
                  {i.description}
                  {i.taxable && <span className="ml-1 text-[10px] font-bold text-slate-400" title="Taxable">T</span>}
                  <span className="block text-xs text-slate-500 sm:hidden">
                    {i.type === 'labor' ? `${i.quantity} hr × ${formatCents(i.unit_price_cents)}` : i.quantity !== 1 ? `${i.quantity} × ${formatCents(i.unit_price_cents)}` : LINE_TYPE_LABEL[i.type]}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{i.quantity}</td>
                <td className="hidden py-2 text-right tabular-nums sm:table-cell">{formatCents(i.unit_price_cents)}{i.type === 'labor' ? '/hr' : ''}</td>
                <td className={`py-2 text-right font-semibold tabular-nums ${i.line_total_cents < 0 ? 'text-emerald-700' : ''}`}>{formatCents(i.line_total_cents)}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>

      <dl className="ml-auto mt-4 w-full max-w-xs space-y-1 tabular-nums">
        <div className="flex justify-between"><dt className="text-slate-600">Subtotal</dt><dd>{formatCents(inv.subtotal_cents)}</dd></div>
        <div className="flex justify-between">
          <dt className="text-slate-600">Sales tax <span className="text-xs">({inv.tax_name || 'Tax'} · {formatPpm(inv.tax_rate_ppm)} on {formatCents(inv.taxable_cents)})</span></dt>
          <dd>{formatCents(inv.tax_cents)}</dd>
        </div>
        <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-base font-extrabold"><dt>Total</dt><dd>{formatCents(inv.total_cents)}</dd></div>
        {inv.deposit_applied_cents > 0 && (
          <div className="flex justify-between text-emerald-700"><dt>Deposit applied</dt><dd>−{formatCents(inv.deposit_applied_cents)}</dd></div>
        )}
        {inv.amount_paid_cents > 0 && (
          <div className="flex justify-between text-emerald-700"><dt>Paid</dt><dd>−{formatCents(inv.amount_paid_cents)}</dd></div>
        )}
        <div className="flex justify-between text-base font-extrabold"><dt>Balance due</dt><dd>{formatCents(balance)}</dd></div>
      </dl>
    </div>
  );
}
