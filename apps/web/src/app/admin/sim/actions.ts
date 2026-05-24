'use server';

// Server Actions for the /admin/sim panel. Call the local /api/sim/*
// endpoints with the CRON_SECRET injected server-side so the operator
// doesn't need to paste it. Used by the panel + can be wired to any
// future control surface.

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

interface Result {
  ok: boolean;
  message: string;
  payload?: unknown;
}

async function callSim(endpoint: string): Promise<Result> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, message: 'CRON_SECRET not set in Vercel env — sim endpoints are locked.' };
  }
  // Resolve absolute URL from incoming request headers
  const hdrs = await headers();
  const host = hdrs.get('host');
  const proto = hdrs.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  const url = `${proto}://${host}${endpoint}`;

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) return { ok: false, message: String(data.error ?? `HTTP ${r.status}`), payload: data };
    return { ok: true, message: summarize(endpoint, data), payload: data };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'fetch failed' };
  }
}

function summarize(endpoint: string, data: Record<string, unknown>): string {
  if (endpoint.startsWith('/api/sim/spawn')) return `Spawned ${data.spawned ?? 0} incidents`;
  if (endpoint.startsWith('/api/sim/tick'))
    return `Advanced ${data.advanced ?? 0}/${data.requested ?? 0} incidents`;
  if (endpoint.startsWith('/api/sim/reset'))
    return `Cleared ${data.incidentsDeleted ?? 0} incidents, ${data.claimsDeleted ?? 0} claims, ${data.eventsDeleted ?? 0} events`;
  return 'OK';
}

function rev() {
  revalidatePath('/admin/sim');
  revalidatePath('/wall');
  revalidatePath('/dispatch');
  revalidatePath('/supervisor');
  revalidatePath('/');
}

export async function simSpawn(n: number): Promise<Result> {
  const r = await callSim(`/api/sim/spawn?n=${n}`);
  if (r.ok) rev();
  return r;
}
export async function simTick(n: number): Promise<Result> {
  const r = await callSim(`/api/sim/tick?n=${n}`);
  if (r.ok) rev();
  return r;
}
export async function simReset(): Promise<Result> {
  const r = await callSim(`/api/sim/reset?keep=0&wipeClaims=true&wipeEvents=true`);
  if (r.ok) rev();
  return r;
}
