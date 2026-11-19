'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { DEMO, demoSetInvoice } from '@/lib/demo';
import { estimateApprovedOwnerEmail } from '@/lib/email-templates';
import { OWNER_INBOX, sendEmail } from '@/lib/email';
import { absoluteUrl } from '@/lib/env';
import { getInvoiceByToken } from '@/lib/invoices';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatET } from '@/lib/time';
import { firstIssue, signatureSchema } from '@/lib/validation';

export type ApproveState = { ok: boolean; error?: string };

export async function approveEstimate(token: string, _prev: ApproveState, formData: FormData): Promise<ApproveState> {
  const parsed = signatureSchema.safeParse({ signature: formData.get('signature'), consent: formData.get('consent') });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error).message };

  const inv = await getInvoiceByToken(token);
  if (!inv) return { ok: false, error: 'Estimate not found.' };
  if (inv.status !== 'sent') return { ok: false, error: inv.status === 'approved' || inv.status === 'paid' ? 'Already approved.' : 'This estimate can’t be approved right now.' };

  if (DEMO) {
    await demoSetInvoice({ status: 'approved', approved_signature: parsed.data.signature, approved_at: new Date().toISOString() });
    revalidatePath(`/invoice/${token}`);
    return { ok: true };
  }

  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '').split(',')[0]?.trim() || null;
  const approvedAt = new Date();
  const db = supabaseAdmin();

  // Conditional update guards against double-submit races.
  const { data: updated, error } = await db
    .from('invoices')
    .update({
      status: 'approved',
      approved_at: approvedAt.toISOString(),
      approved_signature: parsed.data.signature,
      approved_ip: ip,
      approved_user_agent: h.get('user-agent')?.slice(0, 300) ?? null,
    })
    .eq('id', inv.id)
    .eq('status', 'sent')
    .select('id');
  if (error) return { ok: false, error: 'Could not save approval. Please try again.' };
  if (!updated || updated.length === 0) return { ok: false, error: 'Already approved.' };

  if (inv.booking_id) {
    await db.from('bookings').update({ status: 'approved' }).eq('id', inv.booking_id).in('status', ['new', 'estimate_sent']);
  }

  const mail = estimateApprovedOwnerEmail({
    number: inv.number ?? inv.id,
    customer: inv.customer?.full_name ?? 'Customer',
    signature: parsed.data.signature,
    approvedAt: formatET(approvedAt),
    totalCents: inv.total_cents,
    adminUrl: absoluteUrl(`/admin/invoices/${inv.id}`),
  });
  await sendEmail({ to: OWNER_INBOX, ...mail });

  revalidatePath(`/invoice/${token}`);
  return { ok: true };
}
