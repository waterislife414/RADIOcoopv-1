import { InvoiceBuilder, type BuilderInitial } from '@/components/admin/InvoiceBuilder';
import { requireAdmin } from '@/lib/auth';
import { rowToRates } from '@/lib/db/settings';
import type { BusinessSettingsRow, TaxPresetRow } from '@/lib/db/types';

export default async function NewInvoicePage() {
  const { supabase } = await requireAdmin();
  const [{ data: presets }, { data: settings }] = await Promise.all([
    supabase.from('tax_presets').select('*').eq('active', true).order('is_default', { ascending: false }),
    supabase.from('business_settings').select('*').eq('id', 1).single(),
  ]);
  const rates = rowToRates(settings as BusinessSettingsRow);
  const list = (presets ?? []) as TaxPresetRow[];
  const initial: BuilderInitial = {
    id: null, bookingId: null, customerId: null, vehicleId: null, mode: 'shop',
    customer: { name: '', email: '', phone: '' },
    vehicle: { year: '', make: '', model: '', engine: '', vin: '' },
    odometer: '', taxPresetId: list.find((p) => p.is_default)?.id ?? list[0]?.id ?? '', notes: '',
    depositAppliedCents: 0, lines: [], locked: false,
  };
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl">New estimate</h1>
      <InvoiceBuilder initial={initial} presets={list} rates={{ laborCents: rates.shopLaborRateCents, calloutCents: rates.mobileCalloutFeeCents, diagnosticCents: rates.diagnosticFeeCents }} />
    </div>
  );
}
