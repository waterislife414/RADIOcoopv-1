import 'server-only';
import { redirect } from 'next/navigation';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';

/** Gate for every admin page and server action. Uses the user's JWT so RLS (is_admin()) also applies. */
export async function requireAdmin(): Promise<{ supabase: SupabaseClient; user: User }> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');
  const { data: isAdmin, error } = await supabase.rpc('is_admin');
  if (error || isAdmin !== true) redirect('/admin/login?error=not_admin');
  return { supabase, user };
}
