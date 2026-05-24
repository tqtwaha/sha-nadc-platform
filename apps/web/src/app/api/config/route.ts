import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Public-config shim for the v1 prototypes living in public/legacy/.
// v1's lib/nadc-state.js calls fetch('/api/config') on boot and expects
// supabaseUrl + supabaseAnonKey to wire up Realtime. Returns the same
// JSON shape as v1's api/config.js so the legacy prototypes connect to
// the v2 Supabase backend with no other code changes.

export async function GET() {
  return NextResponse.json({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
    mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '',
    env: process.env.NODE_ENV ?? 'production',
  });
}
