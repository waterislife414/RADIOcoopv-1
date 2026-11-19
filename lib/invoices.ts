import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeItem, type InspectionPhotoRow, type InvoiceItemRow, type InvoiceWithRelations } from '@/lib/db/types';
import { DEMO, DEMO_INVOICE_TOKEN, demoInvoice, demoPhotos } from '@/lib/demo';
import { BUCKETS, supabaseAdmin } from '@/lib/supabase/admin';

export const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

export const INVOICE_SELECT = '*, customer:customers(*), vehicle:vehicles(*), items:invoice_items(*)';

export function normalizeInvoice(raw: unknown): InvoiceWithRelations {
  const inv = raw as InvoiceWithRelations;
  return {
    ...inv,
    items: [...(inv.items ?? [])].map((i: InvoiceItemRow) => normalizeItem(i)).sort((a, b) => a.sort - b.sort),
  };
}

export async function getInvoiceByToken(token: string): Promise<InvoiceWithRelations | null> {
  if (!TOKEN_RE.test(token)) return null;
  if (DEMO) return token === DEMO_INVOICE_TOKEN ? demoInvoice() : null;
  const { data } = await supabaseAdmin().from('invoices').select(INVOICE_SELECT).eq('token', token).maybeSingle();
  return data ? normalizeInvoice(data) : null;
}

export type SignedPhoto = InspectionPhotoRow & { url: string | null };

/** DVI photos for an invoice (and its booking), with 1-hour signed URLs from the private bucket. */
export async function getSignedInspectionPhotos(
  ids: { invoiceId?: string | null; bookingId?: string | null },
  maybeClient?: SupabaseClient,
): Promise<SignedPhoto[]> {
  if (DEMO) return ids.invoiceId ? demoPhotos() : [];
  const client = maybeClient ?? supabaseAdmin();
  const filters: string[] = [];
  if (ids.invoiceId) filters.push(`invoice_id.eq.${ids.invoiceId}`);
  if (ids.bookingId) filters.push(`booking_id.eq.${ids.bookingId}`);
  if (filters.length === 0) return [];
  const { data } = await client.from('inspection_photos').select('*').or(filters.join(',')).order('sort').order('created_at');
  const rows = (data ?? []) as InspectionPhotoRow[];
  if (rows.length === 0) return [];
  const { data: signed } = await client.storage.from(BUCKETS.inspectionPhotos).createSignedUrls(rows.map((r) => r.storage_path), 3600);
  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const order = { red: 0, yellow: 1, green: 2 } as const;
  return rows
    .map((r) => ({ ...r, url: byPath.get(r.storage_path) ?? null }))
    .sort((a, b) => order[a.rating] - order[b.rating] || a.sort - b.sort);
}
