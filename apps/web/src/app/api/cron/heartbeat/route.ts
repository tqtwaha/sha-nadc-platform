import { NextRequest, NextResponse } from 'next/server';
import { buildSimIncident, computeTariff } from '@sha-nadc/domain';
import { serviceClient } from '@/lib/supabase';
import { nextDisplayId } from '@/lib/incidents-server';
import { isEnabled } from '@/lib/flags';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Heartbeat — single endpoint Vercel Cron (or an external scheduler)
// hits on a schedule. Each call:
//   1. If sim_auto_tick is OFF → bail (kill switch).
//   2. Top up incidents to ~12-15 active if running low.
//   3. Advance 5-10 random active incidents one step.
//   4. transport → cleared mints a SHIF claim (same logic as /api/sim/tick).
//
// Auth: requires CRON_SECRET OR x-vercel-cron header.

const TARGET_ACTIVE = 14;
const MAX_SPAWN_PER_CALL = 5;
const ADVANCE_PER_CALL = 8;
const ACTIVE_STATUSES = ['pending', 'dispatched', 'en_route', 'on_scene', 'transport'];

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

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

async function spawnOne(sb: ReturnType<typeof serviceClient>) {
  const sim = buildSimIncident(Math.floor(Math.random() * 999999));
  const displayId = await nextDisplayId();
  const { error } = await sb.from('incidents').insert({
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
    source: 'heartbeat',
  });
  return !error;
}

async function nextClaimNumber(sb: ReturnType<typeof serviceClient>): Promise<string> {
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

async function advanceOne(sb: ReturnType<typeof serviceClient>) {
  const { data: candidates } = await sb
    .from('incidents')
    .select(
      'id, display_id, status, priority, zone, unit_id, hospital_id, requires_als, complaint, icd11',
    )
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: true })
    .limit(30);
  if (!candidates || candidates.length === 0) return null;
  const inc = candidates[Math.floor(Math.random() * candidates.length)]!;
  const target = NEXT_FOR[inc.status];
  if (!target) return null;

  // pending → dispatched: pick a unit
  if (inc.status === 'pending') {
    let { data: units } = await sb
      .from('fleet_units')
      .select('id, type:unit_type, zone')
      .eq('status', 'available')
      .eq('zone', inc.zone)
      .limit(10);
    if (!units || units.length === 0) {
      ({ data: units } = await sb
        .from('fleet_units')
        .select('id, type:unit_type, zone')
        .eq('status', 'available')
        .limit(20));
    }
    if (!units || units.length === 0) return null;
    const pick = inc.requires_als
      ? units.find((u) => u.type === 'ALS') ?? units[0]!
      : units[0]!;
    const now = new Date().toISOString();
    await sb
      .from('incidents')
      .update({ unit_id: pick.id, status: 'dispatched', dispatched_at: now })
      .eq('id', inc.id);
    await sb.from('fleet_units').update({ status: 'dispatched' }).eq('id', pick.id);
    await sb.from('dispatch_events').insert({
      incident_id: inc.id,
      unit_id: pick.id,
      event_type: 'dispatched',
      event_note: `${inc.display_id} → ${pick.id} (heartbeat)`,
      actor_type: 'system',
      payload: { heartbeat: true },
    });
    return { display_id: inc.display_id, from: 'pending', to: 'dispatched', unit: pick.id };
  }

  // on_scene → transport: also pick a hospital if not set
  let hospitalUpdate: Record<string, unknown> = {};
  if (inc.status === 'on_scene' && !inc.hospital_id) {
    const { data: hospitals } = await sb
      .from('hospitals')
      .select('id')
      .in('diversion_status', ['open', 'caution'])
      .limit(30);
    if (hospitals && hospitals.length > 0) {
      const h = hospitals[Math.floor(Math.random() * hospitals.length)]!;
      hospitalUpdate = { hospital_id: h.id };
    }
  }

  // transport → cleared: mint claim
  if (inc.status === 'transport') {
    const { data: unit } = await sb
      .from('fleet_units')
      .select('type:unit_type, provider_id')
      .eq('id', inc.unit_id as string)
      .single();
    const tariffType = (unit?.type as 'ALS' | 'BLS') ?? 'BLS';
    const distance = 5 + Math.round(Math.random() * 35);
    const consumables = Math.random() < 0.4 ? 200 + Math.floor(Math.random() * 800) : 0;
    const tariff = computeTariff({ tariffType, distanceKm: distance, consumablesKes: consumables });
    const claimNumber = await nextClaimNumber(sb);
    const now = new Date().toISOString();

    await sb.from('claims').insert({
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
    });
    await sb.from('incidents').update({ status: 'cleared', cleared_at: now }).eq('id', inc.id);
    if (inc.unit_id) await sb.from('fleet_units').update({ status: 'available' }).eq('id', inc.unit_id);
    await sb.from('dispatch_events').insert({
      incident_id: inc.id,
      unit_id: inc.unit_id,
      event_type: 'epcr_submitted',
      event_note: `${inc.display_id} cleared → ${claimNumber} (heartbeat, ${distance}km, KES ${tariff.totalKes})`,
      actor_type: 'system',
      payload: { heartbeat: true, claim_number: claimNumber, distance, tariff },
    });
    return { display_id: inc.display_id, from: 'transport', to: 'cleared', claim_number: claimNumber };
  }

  const tsCol = TS_FOR[target];
  const update: Record<string, unknown> = { status: target, ...hospitalUpdate };
  if (tsCol) update[tsCol] = new Date().toISOString();
  await sb.from('incidents').update(update).eq('id', inc.id);
  if (inc.unit_id) await sb.from('fleet_units').update({ status: target }).eq('id', inc.unit_id);
  await sb.from('dispatch_events').insert({
    incident_id: inc.id,
    unit_id: inc.unit_id,
    event_type: target,
    event_note: `${inc.display_id} → ${target} (heartbeat)`,
    actor_type: 'system',
    payload: { heartbeat: true },
  });
  return { display_id: inc.display_id, from: inc.status, to: target };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!(await isEnabled('sim_auto_tick'))) {
    return NextResponse.json({ ok: true, skipped: 'sim_auto_tick flag is off' });
  }
  const sb = serviceClient();
  const { count: active } = await sb
    .from('incidents')
    .select('id', { count: 'exact', head: true })
    .in('status', ACTIVE_STATUSES);

  // Top up
  const need = Math.max(0, TARGET_ACTIVE - (active ?? 0));
  const spawn = Math.min(MAX_SPAWN_PER_CALL, need);
  let spawned = 0;
  for (let i = 0; i < spawn; i += 1) if (await spawnOne(sb)) spawned += 1;

  // Advance
  const transitions: Array<Record<string, unknown>> = [];
  for (let i = 0; i < ADVANCE_PER_CALL; i += 1) {
    const r = await advanceOne(sb);
    if (!r) break;
    transitions.push(r);
  }

  return NextResponse.json({
    ok: true,
    activeBefore: active ?? 0,
    spawned,
    advanced: transitions.length,
    transitions,
  });
}

export const POST = GET;
