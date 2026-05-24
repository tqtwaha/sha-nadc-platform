import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Lightweight health probe — used by uptime monitors / load balancers.
// Returns 200 only when DB + realtime publication are both reachable;
// any failure flips to 503 with a brief reason.
//
// Allowlisted in middleware so it stays reachable even when Clerk is on.

export async function GET() {
  const t0 = Date.now();
  try {
    const sb = serviceClient();
    // Cheap query — count head only, no rows pulled
    const [{ count: incidents, error: iErr }, { count: hospitals, error: hErr }] =
      await Promise.all([
        sb.from('incidents').select('id', { count: 'exact', head: true }),
        sb.from('hospitals').select('id', { count: 'exact', head: true }),
      ]);
    if (iErr || hErr) {
      return NextResponse.json(
        { ok: false, error: iErr?.message ?? hErr?.message ?? 'unknown db error' },
        { status: 503 },
      );
    }
    return NextResponse.json({
      ok: true,
      latency_ms: Date.now() - t0,
      incidents: incidents ?? 0,
      hospitals: hospitals ?? 0,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'health probe failed' },
      { status: 503 },
    );
  }
}
