import 'server-only';
import { Resend } from 'resend';
import { BUSINESS, BUSINESS_EMAIL } from '@/config/business';
import { optionalEnv } from '@/lib/env';

let client: Resend | null = null;

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

/**
 * Transactional send. reply_to is ALWAYS kyledubios2412@gmail.com (exact spelling).
 * Never throws — booking/payment flows must not fail because email did.
 */
export async function sendEmail(msg: { to: string | string[]; subject: string; html: string; text: string }): Promise<SendResult> {
  const key = optionalEnv('RESEND_API_KEY');
  const from = optionalEnv('EMAIL_FROM');
  if (!key || !from) {
    console.warn('[email] RESEND_API_KEY / EMAIL_FROM not set — skipped:', msg.subject);
    return { ok: false, error: 'email-not-configured' };
  }
  client ??= new Resend(key);
  try {
    const { data, error } = await client.emails.send({
      from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      replyTo: BUSINESS_EMAIL,
      headers: { 'X-Entity-Ref-ID': `${Date.now()}` },
    });
    if (error) {
      console.error('[email] send failed', error);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id ?? null };
  } catch (e) {
    console.error('[email] send threw', e);
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}

export const OWNER_INBOX = BUSINESS_EMAIL;
export const BRAND_NAME = BUSINESS.name;
