import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertEnv } from './assertEnv';

// Server-only. Uses the service-role key — bypasses RLS entirely.
// Used by: cron jobs, sim seeder, admin operations.
// MUST NOT be imported from a client component. If you do, Next.js will
// bundle the service-role key into the browser JS and every visitor can
// take over the database.
export function serviceClient(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error(
      '[supabase] serviceClient() called from the browser. ' +
        'The service-role key bypasses RLS — never expose it to clients. ' +
        'Move this call to a server component, route handler, or cron.',
    );
  }
  const url = assertEnv('NEXT_PUBLIC_SUPABASE_URL');
  const svc = assertEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, svc, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
