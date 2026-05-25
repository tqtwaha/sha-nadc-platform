import { NextRequest, NextResponse } from 'next/server';
import { computeTariff } from '@sha-nadc/domain';
import { serviceClient } from '@/lib/supabase';
import { nextDisplayId } from '@/lib/incidents-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Demo replay — runs the full PSAP → dispatch → EMT → claim → SHA →
// M-Pesa → KRA lifecycle for ONE incident in a single round-trip.
// Returns a step-by-step log so the UI can toast each transition.
// Designed for stakeholder demos: one click, 10 seconds, every screen
// shows movement.

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

interface Step {
  at: number;
  label: string;
  detail: string;
  link?: string;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const sb = serviceClient();
  const t0 = Date.now();
  const steps: Step[] = [];
  const log = (label: string, detail: string, link?: string) =>
    steps.push({ at: Date.now() - t0, label, detail, link });

  // 1. PSAP CREATE — dramatic P1 cardiac arrest in Westlands
  const displayId = await nextDisplayId();
  const { data: inc, error: incErr } = await sb
    .from('incidents')
    .insert({
      display_id: displayId,
      priority: 1,
      complaint: 'Cardiac arrest',
      icd11: 'I46.9',
      requires_als: true,
      lat: -1.264 + (Math.random() - 0.5) * 0.01,
      lng: 36.8 + (Math.random() - 0.5) * 0.01,
      address: 'Westgate Shopping Mall, Westlands',
      county: 'Nairobi',
      zone: 'WEST',
      caller_name: 'Mary Wanjiku',
      caller_phone: '+254712345678',
      caller_relation: 'Bystander',
      patient_age: 58,
      patient_sex: 'M',
      status: 'pending',
      notes: 'DEMO REPLAY — automated end-to-end scenario',
      source: 'demo',
    })
    .select('id, display_id')
    .single();
  if (incErr || !inc) return NextResponse.json({ ok: false, error: incErr?.message ?? 'insert failed' }, { status: 500 });
  log('PSAP intake', `${inc.display_id} created · Westlands · cardiac arrest`, `/dispatch/${inc.id}`);

  // 2. DISPATCH — assign nearest ALS in WEST
  await wait(800);
  const { data: units } = await sb
    .from('fleet_units')
    .select('id, type:unit_type, provider_id')
    .eq('status', 'available')
    .eq('unit_type', 'ALS')
    .eq('zone', 'WEST')
    .limit(5);
  const unit = (units ?? [])[0] ?? null;
  if (!unit) {
    log('Dispatch', 'No ALS available in WEST — demo aborted');
    return NextResponse.json({ ok: false, steps });
  }
  await sb
    .from('incidents')
    .update({ unit_id: unit.id, status: 'dispatched', dispatched_at: new Date().toISOString() })
    .eq('id', inc.id);
  await sb.from('fleet_units').update({ status: 'dispatched' }).eq('id', unit.id);
  await sb.from('dispatch_events').insert({
    incident_id: inc.id,
    unit_id: unit.id,
    event_type: 'dispatched',
    event_note: `DEMO ${inc.display_id} → ${unit.id} (nearest ALS, in-zone)`,
    actor_type: 'system',
    payload: { demo: true },
  });
  log('Dispatch', `${unit.id} (ALS, Westlands) assigned in 0.8s`, `/dispatch/${inc.id}`);

  // 3-6. Lifecycle progression
  const phases = [
    { status: 'en_route', col: 'en_route_at', label: 'En route', wait: 1200 },
    { status: 'on_scene', col: 'on_scene_at', label: 'On scene', wait: 1500 },
    { status: 'transport', col: 'transport_at', label: 'Transport', wait: 1500 },
  ];
  for (const p of phases) {
    await wait(p.wait);
    await sb
      .from('incidents')
      .update({ status: p.status, [p.col]: new Date().toISOString() })
      .eq('id', inc.id);
    await sb.from('fleet_units').update({ status: p.status }).eq('id', unit.id);
    await sb.from('dispatch_events').insert({
      incident_id: inc.id,
      unit_id: unit.id,
      event_type: p.status,
      event_note: `DEMO ${inc.display_id} → ${p.label.toLowerCase()}`,
      actor_type: 'emt',
      payload: { demo: true },
    });
    log(p.label, `Crew updated ${p.label.toLowerCase()} status`);
  }

  // 7. Pick a hospital (KNH for cardiac)
  await wait(400);
  const { data: hospitals } = await sb
    .from('hospitals')
    .select('id, name')
    .eq('id', 'h001') // KNH if seeded, fall back to any open
    .maybeSingle();
  let hospital = hospitals;
  if (!hospital) {
    const { data: anyOpen } = await sb
      .from('hospitals')
      .select('id, name')
      .in('diversion_status', ['open'])
      .limit(1);
    hospital = (anyOpen ?? [])[0] ?? null;
  }
  if (hospital) {
    await sb.from('incidents').update({ hospital_id: hospital.id }).eq('id', inc.id);
    log('Route to hospital', `${hospital.name}`, `/hospital/${hospital.id}`);
  }

  // 8. CLEAR + BILL — mint claim
  await wait(900);
  const distance = 6.4;
  const tariff = computeTariff({ tariffType: 'ALS', distanceKm: distance, consumablesKes: 850 });
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const { data: last } = await sb
    .from('claims')
    .select('claim_number')
    .like('claim_number', `CLM-${today}-%`)
    .order('claim_number', { ascending: false })
    .limit(1);
  let next = 1;
  if (last && last.length > 0) {
    const tail = parseInt((last[0]!.claim_number as string).slice(`CLM-${today}-`.length), 10);
    if (!Number.isNaN(tail)) next = tail + 1;
  }
  const claimNumber = `CLM-${today}-${String(next).padStart(4, '0')}`;
  const { data: claim } = await sb
    .from('claims')
    .insert({
      claim_number: claimNumber,
      incident_id: inc.id,
      provider_id: unit.provider_id,
      unit_id: unit.id,
      hospital_id: hospital?.id ?? null,
      icd11: 'I46.9',
      chief_complaint: 'Cardiac arrest',
      tariff_type: 'ALS',
      base_kes: tariff.baseKes,
      distance_km: distance,
      per_km_kes: tariff.perKmKes,
      free_km: tariff.rate.freeKm,
      consumables_kes: tariff.consumablesKes,
      total_kes: tariff.totalKes,
      status: 'draft',
      notes: 'DEMO REPLAY · ROSC achieved en route',
      vitals: { hr: 132, bp_sys: 96, bp_dia: 58, spo2: 91, rr: 24, gcs: 13 },
    })
    .select('id')
    .single();
  await sb
    .from('incidents')
    .update({ status: 'cleared', cleared_at: new Date().toISOString() })
    .eq('id', inc.id);
  await sb.from('fleet_units').update({ status: 'available' }).eq('id', unit.id);
  log(
    'Cleared + billed',
    `${claimNumber} drafted · KES ${tariff.totalKes} (ALS ${distance}km + consumables)`,
    claim ? `/claims/${claim.id}` : undefined,
  );

  if (!claim) return NextResponse.json({ ok: true, steps, durationMs: Date.now() - t0 });

  // 9. SUBMIT TO SHA (stub)
  await wait(700);
  await sb.from('claims').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', claim.id);
  await sb.from('dispatch_events').insert({
    event_type: 'claim_submitted',
    event_note: `DEMO ${claimNumber} → SHA AfyaLink (stub)`,
    actor_type: 'system',
    payload: { demo: true, claim_id: claim.id },
  });
  log('SHA submission', 'Claim pushed to AfyaLink (stub adapter)');

  // 10. APPROVE
  await wait(500);
  await sb.from('claims').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', claim.id);
  await sb.from('dispatch_events').insert({
    event_type: 'claim_approved',
    event_note: `DEMO ${claimNumber} approved by SHA`,
    actor_type: 'system',
    payload: { demo: true, claim_id: claim.id },
  });
  log('SHA approval', 'Auto-approved by tariff matcher');

  // 11. M-PESA PAY (stub)
  await wait(700);
  const mpesaRef = `QXL${Math.random().toString(36).slice(2, 11).toUpperCase()}`;
  await sb
    .from('claims')
    .update({ status: 'paid', paid_at: new Date().toISOString(), mpesa_ref: mpesaRef })
    .eq('id', claim.id);
  await sb.from('dispatch_events').insert({
    event_type: 'payment_completed',
    event_note: `DEMO ${claimNumber} paid via M-Pesa Daraja (stub) · ref ${mpesaRef}`,
    actor_type: 'system',
    payload: { demo: true, claim_id: claim.id, mpesa_ref: mpesaRef },
  });
  log('M-Pesa payment', `${mpesaRef} · KES ${tariff.totalKes}`);

  // 12. KRA INVOICE (stub)
  await wait(500);
  const yr = new Date().getFullYear();
  const mo = String(new Date().getMonth() + 1).padStart(2, '0');
  const invSeq = Math.floor(Math.random() * 9000) + 1000;
  const invoiceNumber = `KRA-INV-${yr}${mo}-${invSeq}`;
  await sb.from('claims').update({ status: 'invoiced', invoice_number: invoiceNumber }).eq('id', claim.id);
  await sb.from('dispatch_events').insert({
    event_type: 'invoice_generated',
    event_note: `DEMO ${claimNumber} → KRA eTIMS (stub) · ${invoiceNumber}`,
    actor_type: 'system',
    payload: { demo: true, claim_id: claim.id, invoice_number: invoiceNumber },
  });
  log('KRA eTIMS', `${invoiceNumber} generated`);

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - t0,
    incident: { id: inc.id, display_id: inc.display_id },
    claim: { id: claim.id, claim_number: claimNumber, total_kes: tariff.totalKes },
    mpesa_ref: mpesaRef,
    invoice_number: invoiceNumber,
    steps,
  });
}

export const GET = POST;
