import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// Anon-key Supabase client for the mobile app. EXPO_PUBLIC_* vars are
// inlined into the JS bundle at build time, same as Next's
// NEXT_PUBLIC_*. The service-role key MUST NOT be referenced here — the
// app is publicly distributable.

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!url || !anon) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY not set — DB calls will fail.',
  );
}

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: { params: { eventsPerSecond: 5 } },
});

export const ACTIVE_STATUSES = [
  'pending',
  'dispatched',
  'en_route',
  'on_scene',
  'transport',
] as const;
