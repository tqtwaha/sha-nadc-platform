'use server';

// EMT crew actions — wrappers around the dispatch state machine plus the
// "clear + create claim" finalizer that closes the loop from a completed
// transport into a billable SHIF claim. This is the operational join
// between dispatch and claims: when an EMT clears an incident, the claim
// row falls out automatically using the tariff calculator.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { computeTariff } from '@sha-nadc/domain';
import { serviceClient } from '@/lib/supabase';
import { setStatus, cancelIncident } from '../dispatch/actions';
import type { IncidentStatus } from '@/lib/incidents';

export async function emtSetStatus(incidentId: string, next: IncidentStatus, unit: string) {
  await setStatus(incidentId, next);
  revalidatePath(`/emt/${unit}`);
}

export async function emtCancel(incidentId: string, reason: string, unit: string) {
  await cancelIncident(incidentId, reason);
  revalidatePath(`/emt/${unit}`);
}

interface Vitals {
  hr?: number;
  bp_sys?: number;
  bp_dia?: number;
  spo2?: number;
  rr?: number;
  gcs?: number;
  temp_c?: number;
  bgl?: number;
}

interface ClearOpts {
  incidentId: string;
  unit: string;
  distanceKm: number;
  consumablesKes: number;
  hospitalId: string | null;
  notes: string;
  vitals?: Vitals;
}

export async function clearAndBill(opts: ClearOpts): Promise<void> {
  const sb = serviceClient();

  const { data: inc, error: iErr } = await sb
    .from('incidents')
    .select(
      'id, display_id, status, unit_id, complaint, icd11, requires_als, hospital_id, dispatcher_id',
    )
    .eq('id', opts.incidentId)
    .single();
  if (iErr || !inc) redirect(`/emt/${opts.unit}?error=` + encodeURIComponent(iErr?.message ?? 'Not found'));

  if (!['transport', 'on_scene'].includes(inc.status))
    redirect(`/emt/${opts.unit}?error=` + encodeURIComponent('Incident not in clearable state'));

  // Unit type drives tariff
  const { data: unitRow, error: uErr } = await sb
    .from('fleet_units')
    .select('type:unit_type, provider_id')
    .eq('id', inc.unit_id ?? opts.unit)
    .single();
  if (uErr || !unitRow) redirect(`/emt/${opts.unit}?error=` + encodeURIComponent(uErr?.message ?? 'Unit missing'));

  const tariff = computeTariff({
    tariffType: unitRow.type as 'ALS' | 'BLS',
    distanceKm: Math.max(0, opts.distanceKm),
    consumablesKes: Math.max(0, opts.consumablesKes),
  });

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `CLM-${today}-`;
  const { data: lastClaim } = await sb
    .from('claims')
    .select('claim_number')
    .like('claim_number', `${prefix}%`)
    .order('claim_number', { ascending: false })
    .limit(1);
  let next = 1;
  if (lastClaim && lastClaim.length > 0) {
    const tail = parseInt((lastClaim[0]!.claim_number as string).slice(prefix.length), 10);
    if (!Number.isNaN(tail)) next = tail + 1;
  }
  const claimNumber = `${prefix}${String(next).padStart(4, '0')}`;
  const finalHospital = opts.hospitalId || inc.hospital_id;

  const { data: claim, error: cErr } = await sb
    .from('claims')
    .insert({
      claim_number: claimNumber,
      incident_id: inc.id,
      provider_id: unitRow.provider_id,
      unit_id: inc.unit_id ?? opts.unit,
      hospital_id: finalHospital,
      icd11: inc.icd11,
      chief_complaint: inc.complaint,
      tariff_type: unitRow.type,
      base_kes: tariff.baseKes,
      distance_km: opts.distanceKm,
      per_km_kes: tariff.perKmKes,
      free_km: tariff.rate.freeKm,
      consumables_kes: tariff.consumablesKes,
      total_kes: tariff.totalKes,
      status: 'draft',
      notes: opts.notes,
      vitals: opts.vitals && Object.keys(opts.vitals).length > 0 ? opts.vitals : null,
    })
    .select('id')
    .single();
  if (cErr || !claim)
    redirect(`/emt/${opts.unit}?error=` + encodeURIComponent(cErr?.message ?? 'Claim insert failed'));

  // Now close the incident (sets cleared_at, frees the unit, writes event)
  await setStatus(inc.id, 'cleared');

  await sb.from('dispatch_events').insert({
    incident_id: inc.id,
    unit_id: inc.unit_id ?? opts.unit,
    event_type: 'epcr_submitted',
    event_note: `Claim ${claimNumber} drafted — ${unitRow.type} ${opts.distanceKm}km → KES ${tariff.totalKes}`,
    actor_type: 'emt',
    payload: { claim_id: claim.id, claim_number: claimNumber, tariff },
  });

  revalidatePath(`/emt/${opts.unit}`);
  revalidatePath('/dispatch');
  revalidatePath('/claims');
  redirect(`/claims/${claim.id}`);
}
