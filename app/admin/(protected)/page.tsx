import Link from 'next/link';
import { CalendarClock, ChevronRight, CircleDollarSign, FileText, Phone, Truck, Users, Warehouse } from 'lucide-react';
import { SERVICE_BY_ID } from '@/config/services';
import { requireAdmin } from '@/lib/auth';
import { vehicleLabel } from '@/lib/bookings';
import { getActiveJobs, getDashboardStats } from '@/lib/db/admin-queries';
import { BOOKING_FLOW, BOOKING_STATUS_LABEL } from '@/lib/db/types';
import { formatCentsShort } from '@/lib/money';
import { formatDateISO } from '@/lib/time';
import { advanceBooking } from './actions';

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const sp = await searchParams;
  const mode = sp.mode === 'mobile' || sp.mode === 'shop' ? sp.mode : null;
  const { supabase } = await requireAdmin();
  const [stats, jobs] = await Promise.all([getDashboardStats(supabase), getActiveJobs(supabase, mode)]);

  const tiles = [
    { label: 'Jobs today', value: String(stats.jobsToday), icon: CalendarClock },
    { label: 'Unpaid invoices', value: `${stats.unpaidCount} · ${formatCentsShort(stats.unpaidCents)}`, icon: FileText },
    { label: 'Revenue this month', value: formatCentsShort(stats.revenueMtdCents), sub: `YTD ${formatCentsShort(stats.revenueYtdCents)}`, icon: CircleDollarSign },
    { label: 'Active members', value: String(stats.activeMembers), sub: `${formatCentsShort(stats.mrrCents)} MRR`, icon: Users },
  ];

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(({ label, value, sub, icon: Icon }) => (
          <div key={label} className="rounded-xl bg-white p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-xs font-bold text-slate-500"><Icon className="h-4 w-4" aria-hidden />{label}</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{value}</p>
            {sub && <p className="text-xs font-semibold text-slate-500">{sub}</p>}
          </div>
        ))}
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl">Jobs board</h1>
          <div className="flex gap-1 rounded-lg bg-white p-1 text-sm font-bold shadow-sm">
            {[
              { v: null, label: 'All' },
              { v: 'mobile', label: 'Mobile' },
              { v: 'shop', label: 'Shop' },
            ].map(({ v, label }) => (
              <Link key={label} href={v ? `/admin?mode=${v}` : '/admin'} className={`rounded-md px-3 py-1.5 ${mode === v ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>{label}</Link>
            ))}
          </div>
        </div>

        <div className="mt-4 flex snap-x gap-4 overflow-x-auto pb-4">
          {BOOKING_FLOW.map((status, idx) => {
            const col = jobs.filter((j) => j.status === status);
            const next = BOOKING_FLOW[idx + 1];
            return (
              <div key={status} className="w-[85vw] max-w-[300px] shrink-0 snap-start rounded-xl bg-slate-200/70 p-2 sm:w-72">
                <h2 className="flex items-center justify-between px-2 py-1 text-sm font-extrabold">
                  {BOOKING_STATUS_LABEL[status]} <span className="rounded-full bg-white px-2 text-xs">{col.length}</span>
                </h2>
                <ul className="mt-2 space-y-2">
                  {col.map((j) => (
                    <li key={j.id} className="rounded-lg bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/admin/jobs/${j.id}`} className="font-bold leading-tight hover:underline">{vehicleLabel(j.vehicle)}</Link>
                        {j.mode === 'mobile'
                          ? <Truck className="h-4 w-4 shrink-0 text-amber-600" aria-label="Mobile" />
                          : <Warehouse className="h-4 w-4 shrink-0 text-slate-500" aria-label="Shop" />}
                      </div>
                      <p className="text-xs text-slate-500">{formatDateISO(j.scheduled_date)} · {j.window_label}</p>
                      <p className="mt-1 text-sm">{j.customer?.full_name}</p>
                      <p className="line-clamp-2 text-xs text-slate-600">{j.service_ids.map((id) => SERVICE_BY_ID.get(id)?.name ?? id).join(', ') || j.symptoms}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        {j.customer?.phone && (
                          <a href={`tel:${j.customer.phone}`} className="flex items-center gap-1 text-xs font-bold text-slate-700"><Phone className="h-3.5 w-3.5" aria-hidden />Call</a>
                        )}
                        {next && (
                          <form action={advanceBooking}>
                            <input type="hidden" name="id" value={j.id} />
                            <button className="flex items-center gap-0.5 rounded-md bg-slate-900 px-2 py-1 text-xs font-bold text-white">
                              {BOOKING_STATUS_LABEL[next]} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </form>
                        )}
                      </div>
                    </li>
                  ))}
                  {col.length === 0 && <li className="px-2 py-4 text-center text-xs text-slate-500">Nothing here</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
