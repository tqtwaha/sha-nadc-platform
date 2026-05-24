'use server';

// Dispatch workflow actions. Each writes the incident row, flips unit
// state when relevant, and logs an audit event. Closest-unit assignment
// prefers in-zone units, then any available unit, with ALS preference
// when the incident requires it.

import { revalidatePath } from 'next/cache';
import { serviceClient } from '@/lib/supabase';
import { NEXT_STATUSES, STATUS_TIMESTAMP, type IncidentStatus } from '@/lib/incidents';

interface Result {
  ok: boolean;
  message: string;
}

async function logEvent(
  incidentId: string,
  unitId: string | null,
  eventType: string,
  note: string,
  actor: 'dispatcher' | 'system' = 'dispatcher',
  payload: Record<string, unknown> = {},
) {
  const sb = serviceClient();
  await sb.from('dispatch_events').insert({
    incident_id: incidentId,
    unit_id: unitId,
    event_type: eventType,
    event_note: note,
    actor_type: actor,
    payload,
  });
}

function revalidateDispatch(id: string) {
  revalidatePath('/dispatch');
  revalidatePath(`/dispatch/${id}`);
  revalidatePath('/supervisor');
}

export async function assignNearestUnit(incidentId: string): Promise<Result> {
  const sb = serviceClient();
  const { data: inc, error: iErr } = await sb
    .from('incidents')
    .select('id, display_id, zone, requires_als, status, unit_id')
    .eq('id', incidentId)
    .single();
  if (iErr) return { ok: false, message: iErr.message };
  if (inc.unit_id) return { ok: false, message: 'Already assigned' };
  if (inc.status !== 'pending') return { ok: false, message: 'Not in pending status' };

  // 1) try in-zone available units, preferring ALS when required
  let { data: candidates, error: uErr } = await sb
    .from('fleet_units')
    .select('id, type:unit_type, status, zone')
    .eq('status', 'available')
    .eq('zone', inc.zone);
  if (uErr) return { ok: false, message: uErr.message };

  if (!candidates || candidates.length === 0) {
    // fallback: any available unit
    const { data: anyAvail, error: aErr } = await sb
      .from('fleet_units')
      .select('id, type:unit_type, status, zone')
      .eq('status', 'available')
      .limit(20);
    if (aErr) return { ok: false, message: aErr.message };
    candidates = anyAvail ?? [];
  }
  if (candidates.length === 0) return { ok: false, message: 'No available units' };

  // prefer ALS for ALS-required incidents, otherwise any
  let pick = inc.requires_als
    ? candidates.find((u) => u.type === 'ALS') ?? candidates[0]!
    : candidates[0]!;

  const now = new Date().toISOString();
  const { error: u2Err } = await sb
    .from('incidents')
    .update({ unit_id: pick.id, status: 'dispatched', dispatched_at: now })
    .eq('id', incidentId);
  if (u2Err) return { ok: false, message: u2Err.message };

  await sb.from('fleet_units').update({ status: 'dispatched' }).eq('id', pick.id);
  await logEvent(
    incidentId,
    pick.id,
    'dispatched',
    `${inc.display_id} → ${pick.id} (${pick.type}, ${pick.zone})`,
    'dispatcher',
    { in_zone: pick.zone === inc.zone },
  );

  revalidateDispatch(incidentId);
  return { ok: true, message: `Dispatched ${pick.id}` };
}

const UNIT_STATUS_FOR_INCIDENT: Record<IncidentStatus, string | null> = {
  pending: 'available',
  dispatched: 'dispatched',
  en_route: 'en_route',
  on_scene: 'on_scene',
  transport: 'transport',
  cleared: 'available',
  cancelled: 'available',
};

export async function setStatus(incidentId: string, newStatus: IncidentStatus): Promise<Result> {
  const sb = serviceClient();
  const { data: inc, error } = await sb
    .from('incidents')
    .select('id, display_id, status, unit_id')
    .eq('id', incidentId)
    .single();
  if (error) return { ok: false, message: error.message };

  const allowed = NEXT_STATUSES[inc.status as IncidentStatus];
  if (!allowed.includes(newStatus))
    return { ok: false, message: `Cannot go ${inc.status} → ${newStatus}` };

  const now = new Date().toISOString();
  const tsCol = STATUS_TIMESTAMP[newStatus];
  const update: Record<string, unknown> = { status: newStatus };
  if (tsCol) update[tsCol] = now;

  const { error: uErr } = await sb.from('incidents').update(update).eq('id', incidentId);
  if (uErr) return { ok: false, message: uErr.message };

  // Roll the unit's own status forward / release on terminal states
  if (inc.unit_id) {
    const unitStatus = UNIT_STATUS_FOR_INCIDENT[newStatus];
    if (unitStatus) await sb.from('fleet_units').update({ status: unitStatus }).eq('id', inc.unit_id);
  }

  await logEvent(
    incidentId,
    inc.unit_id,
    newStatus,
    `${inc.display_id} → ${newStatus}`,
  );
  revalidateDispatch(incidentId);
  return { ok: true, message: `Status: ${newStatus}` };
}

export async function setHospital(incidentId: string, hospitalId: string): Promise<Result> {
  const sb = serviceClient();
  const { data: inc, error } = await sb
    .from('incidents')
    .select('id, display_id, unit_id')
    .eq('id', incidentId)
    .single();
  if (error) return { ok: false, message: error.message };

  const { error: uErr } = await sb
    .from('incidents')
    .update({ hospital_id: hospitalId })
    .eq('id', incidentId);
  if (uErr) return { ok: false, message: uErr.message };

  await logEvent(
    incidentId,
    inc.unit_id,
    'hospital_changed',
    `${inc.display_id} routing to ${hospitalId}`,
    'dispatcher',
    { hospital_id: hospitalId },
  );
  revalidateDispatch(incidentId);
  return { ok: true, message: `Routed to ${hospitalId}` };
}

export async function cancelIncident(incidentId: string, reason: string): Promise<Result> {
  const sb = serviceClient();
  const { data: inc, error } = await sb
    .from('incidents')
    .select('id, display_id, unit_id, status')
    .eq('id', incidentId)
    .single();
  if (error) return { ok: false, message: error.message };
  if (inc.status === 'cleared' || inc.status === 'cancelled')
    return { ok: false, message: 'Already closed' };

  const now = new Date().toISOString();
  const { error: uErr } = await sb
    .from('incidents')
    .update({ status: 'cancelled', cleared_at: now, notes: reason || 'Cancelled' })
    .eq('id', incidentId);
  if (uErr) return { ok: false, message: uErr.message };

  if (inc.unit_id) await sb.from('fleet_units').update({ status: 'available' }).eq('id', inc.unit_id);
  await logEvent(incidentId, inc.unit_id, 'cancelled', `${inc.display_id} cancelled: ${reason}`);
  revalidateDispatch(incidentId);
  return { ok: true, message: 'Cancelled' };
}
