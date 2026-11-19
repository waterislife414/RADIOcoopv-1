import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from '@/lib/env';

let client: SupabaseClient | null = null;

/**
 * Service-role client. BYPASSES RLS — server-only, never import from a Client Component.
 * Used for public flows (booking, invoice token lookups, webhooks) after input validation.
 */
export function supabaseAdmin(): SupabaseClient {
  if (client) return client;
  client = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export const BUCKETS = {
  customerUploads: 'customer-uploads',
  inspectionPhotos: 'inspection-photos',
} as const;
