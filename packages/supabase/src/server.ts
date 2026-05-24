import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertEnv } from './assertEnv';

// Used in Next.js Server Components + Route Handlers + Server Actions.
// Anon key — still respects RLS. Use serviceClient() for admin paths.
export function serverClient(): SupabaseClient {
  const url  = assertEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anon = assertEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
