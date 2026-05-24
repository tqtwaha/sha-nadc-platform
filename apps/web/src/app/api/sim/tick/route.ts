import { NextRequest, NextResponse } from 'next/server';
import { computeTariff } from '@sha-nadc/domain';
import { serviceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Walks one (or a few) active incident(s) forward one step in the lifecycle.
// Designed to be hit by an external cron at ~1-2 minute intervals so the
// wall feels alive without anyone clicking. Each call:
//   - pending     → dispatched   (assigns nearest available unit)
//   - dispatched  → en_route
//   - en_route    → on_scene
//   - on_scene    → transport    (also routes to a random open hospital)
//   - transport   → cleared      (creates a draft SHIF claim)
// Picks `?n=3` (1-10) random active incidents per call and advances each.
//
// Auth: same CRON_SECRET pattern as /api/sim/spawn.

const MAX_N = 10;
const NEXT_FOR: Record<string, string> = {
  pending: 'dispatched',
  dispatched: 'en_route',
  en_route: 'on_scene',
  on_scene: 'transport',
  transport: 'cleared',
};
const TS_FOR: Record<string, string | null> = {
  dispatched: 'dispatched_at',
  en_route: 'en_route_at',
  on_scene: 'on_scene_at',
  transport: 'transport_at',
  cleared: 'cleared_at',
};

async function pickAvailableUnit(zone: string, requiresAls: boolean) {
  const sb = serviceClient();
  let { data } = await sb
    .from('fleet_units')
    .select('id, type:unit_type, zone')
    .eq('status', 'available')
    .eq('zone', zone)
    .limit(20);
  if (!data || data.length === 0) {
    ({ data } = await sb
      .from('fleet_units')
      .select('id, type:unit_type, zone')
      .eq('status', 'available')
      .limit(20));
  }
  if (!data || data.length === 0) return null;
  if (requiresAls) {
    const als = data.find((u) => u.type === 'ALS');
    if (als) return als;
  }
  return data[Math.floor(Math.random() * data.length)] ?? null;
}

async function pickOpenHospital() {
  const sb = serviceClient();
  const { data } = await sb
    .from('hospitals')
    .select('id, name')
    .in('diversion_status', ['open', 'caution'])
    .limit(50);
  if (!data || data.length === 0) return null;
  return data[Math.floor(Math.random() * data.length)] ?? null;
}

async function nextClaimNumber(): Promise<string> {
  const sb = serviceClient();
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `CLM-${today}-`;
  const { data } = await sb
    .from('claims')
    .select('claim_number')
    .like('claim_number', `${prefix}%`)
    .order('claim_number', { ascending: false })
    .limit(1);
  let next = 1;
  if (data && data.length > 0) {
    const tail = parseInt((data[0]!.claim_number as string).slice(prefix.length), 10);
    if (!Number.isNaN(tail)) next = tail + 1;
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
}

interface AdvanceResult {
  incidentId: string;
  display_id: string;
  from: string;
  to: string;
  unit_id: string | null;
  hospital_id: string | null;
  claim_id?: string;
  note?: string;
}

async function advanceOne(): Promise<AdvanceResult | null> {
  const sb = serviceClient();
  const { data: candidates } = await sb
    .from('incidents')
    .select(
      'id, display_id, status, priority, zone, unit_id, hospital_id, requires_als, complaint, icd11',
    )
    .in('status', ['pending', 'dispatched', 'en_route', 'on_scene', 'transport'])
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(50);
  if (!candidates || candidates.length === 0) return null;

  const inc = candidates[Math.floor(Math.random() * candidates.length)]!;
  const target = NEXT_FOR[inc.status];
  if (!target) return null;

  // pending → dispatched: assign nearest unit
  if (inc.status === 'pending') {
    const unit = await pickAvailableUnit(inc.zone, inc.requires_als);
    if (!unit) return null;
    const now = new Date().toISOString();
    await sb
      .from('incidents')
      .update({ unit_id: unit.id, status: 'dispatched', dispatched_at: now })
      .eq('id', inc.id);
    await sb.from('fleet_units').update({ status: 'dispatched' }).eq('id', unit.id);
    await sb.from('dispatch_events').insert({
      incident_id: inc.id,
      unit_id: unit.id,
      event_type: 'dispatched',
      event_note: `${inc.display_id} → ${unit.id} (sim)`,
      actor_type: 'system',
      payload: { sim: true },
    });
    return {
      incidentId: inc.id,
      display_id: inc.display_id,
      from: 'pending',
      to: 'dispatched',
      unit_id: unit.id,
      hospital_id: inc.hospital_id,
    };
  }

  // on_scene → transport: also pick a hospital if not set
  let hospitalUpdate: Record<string, unknown> = {};
  if (inc.status === 'on_scene' && !inc.hospital_id) {
    const h = await pickOpenHospital();
    if (h) hospitalUpdate = { hospital_id: h.id };
  }

  // transport → cleared: mint a claim
  if (inc.status === 'transport') {
    const { data: unit } = await sb
      .from('fleet_units')
      .select('id, type:unit_type, provider_id')
      .eq('id', inc.unit_id as string)
      .single();
    const tariffType = (unit?.type as 'ALS' | 'BLS') ?? 'BLS';
    const distance = 5 + Math.round(Math.random() * 35); // 5-40km
    const consumables = Math.random() < 0.4 ? 200 + Math.floor(Math.random() * 800) : 0;
    const tariff = computeTariff({
      tariffType,
      distanceKm: distance,
      consumablesKes: consumables,
    });
    const claimNumber = await nextClaimNumber();
    const now = new Date().toISOString();

    const { data: claim, error: claimErr } = await sb
      .from('claims')
      .insert({
        claim_number: claimNumber,
        incident_id: inc.id,
        provider_id: unit?.provider_id ?? null,
        unit_id: inc.unit_id,
        hospital_id: inc.hospital_id,
        icd11: inc.icd11,
        chief_complaint: inc.complaint,
        tariff_type: tariffType,
        base_kes: tariff.baseKes,
        distance_km: distance,
        per_km_kes: tariff.perKmKes,
        free_km: tariff.rate.freeKm,
        consumables_kes: tariff.consumablesKes,
        total_kes: tariff.totalKes,
        status: 'draft',
        notes: '',
      })
      .select('id')
      .single();
    if (claimErr) {
      return {
        incidentId: inc.id,
        display_id: inc.display_id,
        from: inc.status,
        to: 'transport',
        unit_id: inc.unit_id,
        hospital_id: inc.hospital_id,
        note: `claim insert failed: ${claimErr.message}`,
      };
    }

    await sb
      .from('incidents')
      .update({ status: 'cleared', cleared_at: now })
      .eq('id', inc.id);
    if (inc.unit_id)
      await sb.from('fleet_units').update({ status: 'available' }).eq('id', inc.unit_id);
    await sb.from('dispatch_events').insert({
      incident_id: inc.id,
      unit_id: inc.unit_id,
      event_type: 'epcr_submitted',
      event_note: `${inc.display_id} cleared, claim ${claimNumber} (sim, ${distance}km, KES ${tariff.totalKes})`,
      actor_type: 'system',
      payload: { sim: true, claim_id: claim?.id, claim_number: claimNumber, distance, tariff },
    });

    return {
      incidentId: inc.id,
      display_id: inc.display_id,
      from: 'transport',
      to: 'cleared',
      unit_id: inc.unit_id,
      hospital_id: inc.hospital_id,
      claim_id: claim?.id,
      note: `claim ${claimNumber} for KES ${tariff.totalKes}`,
    };
  }

  // generic forward transition
  const tsCol = TS_FOR[target];
  const update: Record<string, unknown> = { status: target, ...hospitalUpdate };
  if (tsCol) update[tsCol] = new Date().toISOString();
  await sb.from('incidents').update(update).eq('id', inc.id);
  if (inc.unit_id) {
    await sb.from('fleet_units').update({ status: target }).eq('id', inc.unit_id);
  }
  await sb.from('dispatch_events').insert({
    incident_id: inc.id,
    unit_id: inc.unit_id,
    event_type: target,
    event_note: `${inc.display_id} → ${target} (sim)`,
    actor_type: 'system',
    payload: { sim: true },
  });
  return {
    incidentId: inc.id,
    display_id: inc.display_id,
    from: inc.status,
    to: target,
    unit_id: inc.unit_id,
    hospital_id: (hospitalUpdate.hospital_id as string) ?? inc.hospital_id,
  };
}

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized — set CRON_SECRET and send Authorization: Bearer …' },
      { status: 401 },
    );
  }

  const n = Math.min(MAX_N, Math.max(1, Number(req.nextUrl.searchParams.get('n') ?? '3')));
  const advanced: AdvanceResult[] = [];
  for (let i = 0; i < n; i += 1) {
    const r = await advanceOne();
    if (!r) break;
    advanced.push(r);
  }

  return NextResponse.json({
    ok: true,
    requested: n,
    advanced: advanced.length,
    transitions: advanced,
  });
}

export const POST = GET;
