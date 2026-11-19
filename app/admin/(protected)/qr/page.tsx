import { BUSINESS } from '@/config/business';
import { QrStudio } from '@/components/admin/QrStudio';
import { requireAdmin } from '@/lib/auth';
import type { CustomerRow, InvoiceRow } from '@/lib/db/types';
import { siteUrl } from '@/lib/env';

export default async function QrPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from('invoices')
    .select('token, number, customer:customers(full_name)')
    .in('status', ['sent', 'approved'])
    .order('created_at', { ascending: false })
    .limit(50);
  const invoices = ((data ?? []) as unknown as (Pick<InvoiceRow, 'token' | 'number'> & { customer: Pick<CustomerRow, 'full_name'> | null })[]).map((i) => ({
    token: i.token,
    number: i.number ?? '',
    customer: i.customer?.full_name ?? '',
  }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl">QR Marketing Studio</h1>
        <p className="text-sm text-slate-600">Every code is UTM-tagged, so bookings show which placement they came from on the jobs board.</p>
      </div>
      <QrStudio siteUrl={siteUrl()} googleReviewUrl={BUSINESS.googleReviewUrl} phone={BUSINESS.phone.display} invoices={invoices} />
    </div>
  );
}
