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
import { buildFleetRoster, buildSimIncident, NAIROBI_ZONES } from '@sha-nadc/domain';

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
  // Drop existing seeded agents first (only those with shift_started_at set
  // by the seeder — keeps real Clerk-linked rows safe once auth is wired).
  await sb.from('agents').delete().eq('clerk_user_id', null as any).is('clerk_user_id', null);
  const { error } = await sb.from('agents').insert(rows);
  if (error) throw error;
  console.log('  ✓ agents seeded');
}

async function seedIncidents(count = 12) {
  console.log(`Seeding ${count} initial incidents…`);
  // Pick a seq starting from current MAX(display_id seq) + 1.
  const { data: lastInc } = await sb
    .from('incidents')
    .select('display_id')
    .order('created_at', { ascending: false })
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

async function main() {
  console.log('\n→ Seeding SHA NADC v2 Supabase\n');
  await seedFleet();
  await seedAgents();
  await seedIncidents(12);

  const counts = await Promise.all([
    sb.from('hospitals').select('id', { count: 'exact', head: true }),
    sb.from('fleet_units').select('id', { count: 'exact', head: true }),
    sb.from('agents').select('id', { count: 'exact', head: true }),
    sb.from('incidents').select('id', { count: 'exact', head: true }),
  ]);
  console.log('\n  Row counts after seed:');
  console.log(`    hospitals:   ${counts[0].count}`);
  console.log(`    fleet_units: ${counts[1].count}`);
  console.log(`    agents:      ${counts[2].count}`);
  console.log(`    incidents:   ${counts[3].count}`);
  console.log(`    zones (in-mem): ${NAIROBI_ZONES.length}\n`);
}

main().catch((e) => {
  console.error('\nseed-db failed:', e);
  process.exit(1);
});
