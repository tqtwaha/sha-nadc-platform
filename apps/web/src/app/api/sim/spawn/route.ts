import { NextRequest, NextResponse } from 'next/server';
import { buildSimIncident } from '@sha-nadc/domain';
import { serviceClient } from '@/lib/supabase';
import { nextDisplayId } from '@/lib/incidents-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Spawns N sim incidents into the live DB. Intended for:
//   1. Keeping the demo populated during stakeholder reviews
//   2. Vercel Cron (set CRON_SECRET and hit on a schedule)
//   3. Manual top-ups via curl
//
// Auth: if CRON_SECRET is set in env, requests must send
//   Authorization: Bearer <CRON_SECRET>
// (Vercel Cron sends this header automatically.)
// If CRON_SECRET is not set, the endpoint is open — fine for demo
// surfaces but harden before going production.

const MAX_N = 10;

function isAuthorized(req: NextRequest): boolean {
  // Vercel Cron always sends this header on internal cron calls
  if (req.headers.get('x-vercel-cron') === '1') return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // closed by default in production
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized — set CRON_SECRET and send Authorization: Bearer …' },
      { status: 401 },
    );
  }

  const n = Math.min(MAX_N, Math.max(1, Number(req.nextUrl.searchParams.get('n') ?? '1')));
  const sb = serviceClient();

  const created: Array<{ id: string; display_id: string; complaint: string; priority: number }> = [];

  for (let i = 0; i < n; i += 1) {
    const sim = buildSimIncident(Math.floor(Math.random() * 999999));
    const displayId = await nextDisplayId();

    const { data, error } = await sb
      .from('incidents')
      .insert({
        display_id: displayId,
        priority: sim.priority,
        complaint: sim.complaint,
        icd11: sim.icd11,
        requires_als: sim.requiresAls,
        lat: sim.lat,
        lng: sim.lng,
        address: sim.address,
        w3w: sim.w3w,
        county: sim.county,
        zone: sim.zone,
        patient_age: sim.patientAge,
        patient_sex: sim.patientSex,
        status: 'pending',
        notes: sim.notes,
        source: 'sim',
      })
      .select('id, display_id, complaint, priority')
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    created.push(data);

    await sb.from('dispatch_events').insert({
      incident_id: data.id,
      event_type: 'created',
      event_note: `${data.display_id} ${data.complaint} (sim)`,
      actor_type: 'system',
      payload: { source: 'sim_spawn' },
    });
  }

  return NextResponse.json({
    ok: true,
    spawned: created.length,
    incidents: created,
  });
}

// Allow POST too — many cron services prefer it.
export const POST = GET;
