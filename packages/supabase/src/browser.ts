import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertEnv } from './assertEnv';

let _client: SupabaseClient | null = null;

// Browser-side singleton — uses anon key, respects RLS.
// Safe to call from any client component.
export function browserClient(): SupabaseClient {
  if (_client) return _client;
  const url  = assertEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anon = assertEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  _client = createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return _client;
}
