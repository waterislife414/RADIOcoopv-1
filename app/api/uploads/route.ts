import { NextResponse } from 'next/server';
import { DEMO } from '@/lib/demo';
import { safeFileName } from '@/lib/ids';
import { BUCKETS, supabaseAdmin } from '@/lib/supabase/admin';
import { firstIssue, uploadRequestSchema } from '@/lib/validation';

/**
 * Issues a one-time signed upload URL into the private `customer-uploads` bucket.
 * The browser uploads directly to Supabase Storage (no file bytes pass through this server).
 */
export async function POST(req: Request) {
  const parsed = uploadRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error).message }, { status: 400 });

  const month = new Date().toISOString().slice(0, 7);
  const path = `pending/${month}/${crypto.randomUUID()}-${safeFileName(parsed.data.filename)}`;
  if (DEMO) return NextResponse.json({ demo: true, path });
  const { data, error } = await supabaseAdmin().storage.from(BUCKETS.customerUploads).createSignedUploadUrl(path);
  if (error || !data) {
    console.error('[uploads]', error);
    return NextResponse.json({ error: 'Upload unavailable right now.' }, { status: 503 });
  }
  return NextResponse.json({ bucket: BUCKETS.customerUploads, path: data.path, token: data.token });
}
