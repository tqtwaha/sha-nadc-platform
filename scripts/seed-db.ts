#!/usr/bin/env tsx
/**
 * scripts/seed-db.ts
 *
 * Populates a fresh v2 Supabase project with sim data: 270 fleet units,
 * 12 initial active incidents, 10 agents. Idempotent on fleet (upsert on
 * id) so re-runs are safe; incidents are additive (creates new ones).
 *
 *   pnpm dlx tsx scripts/seed-db.ts
 *
 * Reads SUPABASE env from apps/web/.env.local — same file as the web app.
 */

import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildFleetRoster, buildSimIncident, NAIROBI_ZONES, computeTariff } from '@sha-nadc/domain';

loadDotenv({ path: resolve(process.cwd(), 'apps/web/.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !svc) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('Did you fill in apps/web/.env.local?');
  process.exit(1);
}

const sb = createClient(url, svc, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function seedFleet() {
  const fleet = buildFleetRoster();
  console.log(`Seeding ${fleet.length} fleet units…`);
  const rows = fleet.map((u) => ({
    id: u.id,
    unit_type: u.type,
    status: u.status,
    current_lat: u.lat,
    current_lng: u.lng,
    target_lat: u.targetLat,
    target_lng: u.targetLng,
    zone: u.zone,
    county: u.county,
    crew_count: u.crewCount,
    provider_id: u.providerId,
    provider_name: u.providerName,
    fuel_pct: u.fuelPct,
    anomaly: u.anomaly,
    anomaly_desc: u.anomalyDesc,
    last_seen: u.updatedAt,
  }));
  const { error } = await sb.from('fleet_units').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
  console.log('  ✓ fleet_units upserted');
}

async function seedAgents() {
  const agents = [
    { name: 'D. Mwangi',     role: 'dispatcher',          status: 'on_call', ext: '101' },
    { name: 'N. Achieng',    role: 'dispatcher',          status: 'ready',   ext: '102' },
    { name: 'B. Kamau',      role: 'senior_dispatcher',   status: 'on_call', ext: '103' },
    { name: 'M. Otieno',     role: 'call_taker',          status: 'on_call', ext: '201' },
    { name: 'L. Wambui',     role: 'call_taker',          status: 'ready',   ext: '202' },
    { name: 'J. Kiprop',     role: 'call_taker',          status: 'break',   ext: '203' },
    { name: 'A. Hassan',     role: 'call_taker',          status: 'ready',   ext: '204' },
    { name: 'P. Njeri',      role: 'supervisor',          status: 'on_call', ext: '301' },
    { name: 'F. Mutua',      role: 'supervisor',          status: 'ready',   ext: '302' },
    { name: 'C. Wanjiku',    role: 'admin',               status: 'ready',   ext: '901' },
  ];
  console.log(`Seeding ${agents.length} agents…`);
  // Upsert by display_name to make re-runs idempotent.
  const rows = agents.map((a) => ({
    display_name: a.name,
    role: a.role,
    status: a.status,
    extension: a.ext,
    email: `${a.name.toLowerCase().replace(/\W+/g, '.')}@nadc.health.go.ke`,
    shift_started_at: new Date(Date.now() - Math.random() * 6 * 3600 * 1000).toISOString(),
  }));
  // Upsert by email — re-runs are safe, Clerk-linked rows (no email collision)
  // stay intact.
  const { error } = await sb.from('agents').upsert(rows, { onConflict: 'email' });
  if (error) throw error;
  console.log('  ✓ agents seeded');
}

async function seedIncidents(count = 12) {
  console.log(`Seeding ${count} initial incidents…`);
  // Order by display_id DESC — zero-padded so alphabetical works as numeric.
  const { data: lastInc } = await sb
    .from('incidents')
    .select('display_id')
    .order('display_id', { ascending: false })
    .limit(1);
  let seq = 1;
  if (lastInc?.length) {
    const last = lastInc[0]!.display_id as string;
    const m = last.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1]!, 10) + 1;
  }

  const rows = Array.from({ length: count }, (_, i) => {
    const inc = buildSimIncident(seq + i);
    // Vary statuses so the dashboard isn't all "pending"
    const cycle = ['pending', 'dispatched', 'en_route', 'on_scene', 'transport', 'at_hospital'];
    const status = cycle[i % cycle.length]!;
    return {
      display_id: inc.displayId,
      priority: inc.priority,
      complaint: inc.complaint,
      icd11: inc.icd11 ?? null,
      requires_als: inc.requiresAls ?? false,
      lat: inc.lat,
      lng: inc.lng,
      address: inc.address,
      w3w: inc.w3w ?? null,
      county: inc.county,
      zone: inc.zone,
      patient_age: inc.patientAge ?? null,
      patient_sex: inc.patientSex ?? null,
      status,
      source: 'sim',
      notes: inc.notes ?? '',
      dispatched_at: status !== 'pending' ? new Date(Date.now() - i * 60_000).toISOString() : null,
      en_route_at:   ['en_route', 'on_scene', 'transport', 'at_hospital'].includes(status)
        ? new Date(Date.now() - i * 50_000).toISOString() : null,
      on_scene_at:   ['on_scene', 'transport', 'at_hospital'].includes(status)
        ? new Date(Date.now() - i * 40_000).toISOString() : null,
      transport_at:  ['transport', 'at_hospital'].includes(status)
        ? new Date(Date.now() - i * 20_000).toISOString() : null,
      at_hospital_at: status === 'at_hospital'
        ? new Date(Date.now() - i * 5_000).toISOString() : null,
    };
  });
  const { error } = await sb.from('incidents').insert(rows);
  if (error) throw error;
  console.log(`  ✓ ${count} incidents created (seq ${seq}–${seq + count - 1})`);
}

async function seedClaims(count = 30) {
  console.log(`Seeding ${count} sample claims…`);
  // Get a sample of hospitals + providers for varied claims
  const { data: hospitals } = await sb.from('hospitals').select('id, name').limit(20);
  const { data: units } = await sb.from('fleet_units').select('id, unit_type, provider_id').limit(50);

  if (!hospitals?.length || !units?.length) {
    console.log('  ⚠ skipping — hospitals or fleet not seeded yet');
    return;
  }

  // Spread claims across statuses so the dashboard has variety
  const statuses = [
    'draft','draft','draft',
    'submitted','submitted','submitted','submitted',
    'approved','approved','approved','approved','approved',
    'disputed','disputed',
    'rejected',
    'pending_payment','pending_payment','pending_payment',
    'paid','paid','paid','paid',
    'invoiced','invoiced',
  ];

  const complaints = [
    { text: 'Cardiac arrest',         icd: 'I46.9' },
    { text: 'Road traffic accident',  icd: 'V89'   },
    { text: 'Stroke / CVA suspected', icd: 'I64'   },
    { text: 'Obstetric emergency',    icd: 'O67'   },
    { text: 'Respiratory distress',   icd: 'R06.0' },
    { text: 'Chest pain',             icd: 'R07.4' },
    { text: 'Severe burns',           icd: 'T31'   },
    { text: 'Seizure',                icd: 'R56.9' },
  ];

  // Find next claim sequence — claim_number sorts lexicographically.
  const { data: lastClaim } = await sb
    .from('claims')
    .select('claim_number')
    .order('claim_number', { ascending: false })
    .limit(1);
  let seq = 1000;
  if (lastClaim?.length) {
    const m = (lastClaim[0]!.claim_number as string).match(/-(\d+)$/);
    if (m) seq = parseInt(m[1]!, 10) + 1;
  }

  const now = Date.now();
  const rows = Array.from({ length: count }, (_, i) => {
    const status = statuses[i % statuses.length]!;
    const unit = units[Math.floor(Math.random() * units.length)]!;
    const hospital = hospitals[Math.floor(Math.random() * hospitals.length)]!;
    const complaint = complaints[Math.floor(Math.random() * complaints.length)]!;
    const tariffType = (unit.unit_type as 'ALS' | 'BLS');
    const distanceKm = +(Math.random() * 35 + 3).toFixed(1);
    const consumables = Math.random() < 0.4 ? Math.floor(Math.random() * 800) + 100 : 0;
    const tariff = computeTariff({ tariffType, distanceKm, consumablesKes: consumables });

    const createdDaysAgo = Math.floor(Math.random() * 14);
    const createdAt = new Date(now - createdDaysAgo * 86400_000).toISOString();
    const submitted = ['submitted','approved','disputed','rejected','pending_payment','paid','invoiced'].includes(status);
    const approved  = ['approved','pending_payment','paid','invoiced'].includes(status);
    const paid      = ['paid','invoiced'].includes(status);
    const invoiced  = status === 'invoiced';

    const yr  = new Date(createdAt).getFullYear();
    const mo  = String(new Date(createdAt).getMonth() + 1).padStart(2, '0');
    return {
      claim_number:   `CLM-${yr}-${mo}-${seq + i}`,
      provider_id:    unit.provider_id,
      unit_id:        unit.id,
      hospital_id:    hospital.id,
      icd11:          complaint.icd,
      chief_complaint: complaint.text,
      tariff_type:    tariffType,
      base_kes:       tariff.baseKes,
      distance_km:    distanceKm,
      per_km_kes:     tariff.perKmKes,
      free_km:        tariff.rate.freeKm,
      consumables_kes: consumables,
      total_kes:      tariff.totalKes,
      status,
      notes:          '',
      submitted_at:   submitted ? new Date(now - createdDaysAgo * 86400_000 + 3600_000).toISOString() : null,
      approved_at:    approved  ? new Date(now - createdDaysAgo * 86400_000 + 7200_000).toISOString() : null,
      paid_at:        paid      ? new Date(now - createdDaysAgo * 86400_000 + 86400_000).toISOString() : null,
      invoice_number: invoiced  ? `KRA-INV-${yr}${mo}-${seq + i}` : null,
      mpesa_ref:      paid      ? `QXL${Math.random().toString(36).slice(2, 11).toUpperCase()}` : null,
      created_at:     createdAt,
    };
  });

  const { error } = await sb.from('claims').insert(rows);
  if (error) throw error;
  console.log(`  ✓ ${count} claims seeded (CLM-…-${seq}…${seq + count - 1})`);
}

async function main() {
  console.log('\n→ Seeding SHA NADC v2 Supabase\n');
  await seedFleet();
  await seedAgents();
  await seedIncidents(12);
  await seedClaims(30);

  const counts = await Promise.all([
    sb.from('hospitals').select('id', { count: 'exact', head: true }),
    sb.from('fleet_units').select('id', { count: 'exact', head: true }),
    sb.from('agents').select('id', { count: 'exact', head: true }),
    sb.from('incidents').select('id', { count: 'exact', head: true }),
    sb.from('claims').select('id', { count: 'exact', head: true }),
  ]);
  console.log('\n  Row counts after seed:');
  console.log(`    hospitals:   ${counts[0].count}`);
  console.log(`    fleet_units: ${counts[1].count}`);
  console.log(`    agents:      ${counts[2].count}`);
  console.log(`    incidents:   ${counts[3].count}`);
  console.log(`    claims:      ${counts[4].count}`);
  console.log(`    zones (in-mem): ${NAIROBI_ZONES.length}\n`);
}

main().catch((e) => {
  console.error('\nseed-db failed:', e);
  process.exit(1);
});
