// Auth bridge — turns the current Clerk user into an `agents` row.
// Auto-provisions on first server-rendered hit so freshly-signed-in
// users immediately have a dispatcher_id available to write against.
//
// Falls back to null when Clerk isn't configured (demo mode) — callers
// should treat that as "anonymous" and skip attribution.

import 'server-only';
import { auth, currentUser } from '@clerk/nextjs/server';
import { serviceClient } from './supabase';

export interface CurrentAgent {
  id: string;
  display_name: string;
  email: string | null;
  role: 'call_taker' | 'dispatcher' | 'senior_dispatcher' | 'supervisor' | 'admin';
  clerk_user_id: string;
}

const clerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export async function currentAgent(): Promise<CurrentAgent | null> {
  if (!clerkConfigured) return null;

  const { userId } = await auth();
  if (!userId) return null;

  const sb = serviceClient();

  // Look up existing row by clerk_user_id
  const { data: existing } = await sb
    .from('agents')
    .select('id, display_name, email, role, clerk_user_id')
    .eq('clerk_user_id', userId)
    .maybeSingle();
  if (existing) return existing as CurrentAgent;

  // Auto-provision — fetch Clerk profile and insert
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? null;
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
    email?.split('@')[0] ||
    'Operator';

  // If we already have a seed agent with the same email, claim it
  if (email) {
    const { data: byEmail } = await sb
      .from('agents')
      .select('id, display_name, email, role, clerk_user_id')
      .eq('email', email)
      .maybeSingle();
    if (byEmail) {
      const { data: updated } = await sb
        .from('agents')
        .update({ clerk_user_id: userId })
        .eq('id', byEmail.id)
        .select('id, display_name, email, role, clerk_user_id')
        .single();
      return updated as CurrentAgent;
    }
  }

  const { data: created, error } = await sb
    .from('agents')
    .insert({
      display_name: displayName,
      email,
      role: 'dispatcher',
      status: 'ready',
      clerk_user_id: userId,
    })
    .select('id, display_name, email, role, clerk_user_id')
    .single();
  if (error) {
    console.warn('[auth] failed to provision agent:', error.message);
    return null;
  }
  return created as CurrentAgent;
}
