import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Wipes simulation-generated data back to a clean baseline so the demo
// can be replayed. Default behavior:
//   - delete all incidents where source IN ('sim','psap','sim_spawn')
//   - delete all claims (since they cascade SET NULL on incidents anyway,
//     and we only ever auto-create from sim)
//   - delete sim-tagged dispatch_events (payload->>sim = true)
//   - reset every fleet_unit to status='available'
//
// Hospitals + agents + the 270-unit roster are untouched.
//
// Use ?keep=24 to keep incidents from the last N hours (default 0).
// Use ?wipeClaims=false to skip claim deletion.
// Use ?wipeEvents=false to skip event deletion.
//
// Auth: CRON_SECRET MUST be set. Unlike /spawn and /tick (which are safe
// to leave open), /reset deletes data so we refuse to run if no secret is
// configured rather than defaulting to "open".

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET && req.headers.get('x-vercel-cron') !== '1') {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not configured — reset disabled' },
      { status: 503 },
    );
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const sb = serviceClient();
  const sp = req.nextUrl.searchParams;
  const keepHours = Math.max(0, Number(sp.get('keep') ?? '0'));
  const wipeClaims = sp.get('wipeClaims') !== 'false';
  const wipeEvents = sp.get('wipeEvents') !== 'false';

  const cutoff = new Date(Date.now() - keepHours * 3600 * 1000).toISOString();

  let claimsDeleted = 0;
  if (wipeClaims) {
    const { count, error } = await sb
      .from('claims')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff);
    if (error) return NextResponse.json({ ok: false, step: 'claims', error: error.message }, { status: 500 });
    claimsDeleted = count ?? 0;
  }

  let eventsDeleted = 0;
  if (wipeEvents) {
    const { count, error } = await sb
      .from('dispatch_events')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff);
    if (error) return NextResponse.json({ ok: false, step: 'events', error: error.message }, { status: 500 });
    eventsDeleted = count ?? 0;
  }

  const { count: incidentsDeleted, error: iErr } = await sb
    .from('incidents')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);
  if (iErr) return NextResponse.json({ ok: false, step: 'incidents', error: iErr.message }, { status: 500 });

  const { error: fErr } = await sb
    .from('fleet_units')
    .update({ status: 'available', current_incident_id: null })
    .neq('status', 'available');
  if (fErr) return NextResponse.json({ ok: false, step: 'fleet', error: fErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    cutoff,
    keepHours,
    incidentsDeleted: incidentsDeleted ?? 0,
    claimsDeleted,
    eventsDeleted,
  });
}

export const GET = POST;
