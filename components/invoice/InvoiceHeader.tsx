import { BUSINESS, BUSINESS_EMAIL, fullShopAddress } from '@/config/business';
import { vehicleLabel } from '@/lib/bookings';
import type { InvoiceWithRelations } from '@/lib/db/types';

export function InvoiceHeader({ inv, title }: { inv: InvoiceWithRelations; title: string }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <p className="font-display text-xl">{BUSINESS.name}</p>
        <p className="text-sm text-slate-600">
          {fullShopAddress()}
          <br />
          {BUSINESS.phone.display} · <a href={`mailto:${BUSINESS_EMAIL}`} className="underline">{BUSINESS_EMAIL}</a>
        </p>
      </div>
      <div className="sm:text-right">
        <p className="text-xs font-extrabold uppercase tracking-widest text-amber-700">{title}</p>
        <p className="font-mono text-lg font-bold">{inv.number}</p>
        <p className="text-xs text-slate-500">{inv.mode === 'mobile' ? 'Mobile service' : 'Shop service'}</p>
      </div>
      <div className="rounded-lg bg-slate-50 p-3 text-sm print:bg-white print:p-0">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer</p>
        <p className="font-semibold">{inv.customer?.full_name}</p>
        {inv.customer?.phone && <p>{inv.customer.phone}</p>}
        {inv.customer?.email && <p className="break-all">{inv.customer.email}</p>}
      </div>
      <div className="rounded-lg bg-slate-50 p-3 text-sm print:bg-white print:p-0 sm:text-right">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Vehicle</p>
        <p className="font-semibold">{vehicleLabel(inv.vehicle)}{inv.vehicle?.engine ? ` · ${inv.vehicle.engine}` : ''}</p>
        {inv.vehicle?.vin && <p className="font-mono text-xs">VIN {inv.vehicle.vin}</p>}
        {inv.odometer != null && <p>Odometer {inv.odometer.toLocaleString('en-US')} mi</p>}
      </div>
    </div>
  );
}
