'use server';

// PSAP intake — turn a call-taker form into a live incident.
// Maps the MPDS determinant level (E/D/C/B/A) to NACD priority 1-4 and
// inserts a 'pending' incident that the dispatch console picks up.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { COMPLAINTS, NAIROBI_ZONES, randomInZone } from '@sha-nadc/domain';
import { serviceClient } from '@/lib/supabase';
import { nextDisplayId } from '@/lib/incidents-server';
import { currentAgent } from '@/lib/auth';

const DETERMINANT_TO_PRIORITY: Record<string, 1 | 2 | 3 | 4> = {
  E: 1,
  D: 2,
  C: 3,
  B: 4,
  A: 4,
};

export async function createIncident(formData: FormData): Promise<void> {
  const sb = serviceClient();

  const complaintText = String(formData.get('complaint') ?? '').trim();
  const determinant = String(formData.get('determinant_level') ?? '').toUpperCase();
  const determinantCode = String(formData.get('determinant_code') ?? '').trim();
  const zoneId = String(formData.get('zone') ?? 'CBD');
  const county = String(formData.get('county') ?? 'Nairobi').trim();
  const address = String(formData.get('address') ?? '').trim();
  const landmark = String(formData.get('landmark') ?? '').trim();
  const callerName = String(formData.get('caller_name') ?? '').trim();
  const callerPhone = String(formData.get('caller_phone') ?? '').trim();
  const callerRelation = String(formData.get('caller_relation') ?? '').trim();
  const patientAgeRaw = String(formData.get('patient_age') ?? '').trim();
  const patientSex = String(formData.get('patient_sex') ?? '').trim().toUpperCase();
  const notes = String(formData.get('notes') ?? '').trim();

  if (!complaintText) redirect('/psap?error=' + encodeURIComponent('Complaint is required.'));
  if (!determinant || !DETERMINANT_TO_PRIORITY[determinant])
    redirect('/psap?error=' + encodeURIComponent('Determinant level required (E/D/C/B/A).'));
  if (!address) redirect('/psap?error=' + encodeURIComponent('Address is required.'));

  const cat = COMPLAINTS.find((c) => c.text === complaintText);
  const priority = DETERMINANT_TO_PRIORITY[determinant];
  const requiresAls = cat?.requiresAls ?? priority <= 2;

  const zone = NAIROBI_ZONES.find((z) => z.id === zoneId) ?? NAIROBI_ZONES[0]!;
  const { lat, lng } = randomInZone(zone);

  const displayId = await nextDisplayId();

  const ageVal = patientAgeRaw === '' ? null : Number(patientAgeRaw);
  const sexVal = ['M', 'F'].includes(patientSex) ? patientSex : null;
  const agent = await currentAgent();

  const insertRow = {
    display_id: displayId,
    priority,
    complaint: complaintText,
    icd11: cat?.icd11 ?? null,
    requires_als: requiresAls,
    determinant_code: determinantCode || null,
    determinant_level: determinant,
    lat,
    lng,
    address,
    landmark: landmark || null,
    county,
    zone: zone.id,
    caller_name: callerName || null,
    caller_phone: callerPhone || null,
    caller_relation: callerRelation || null,
    patient_age: ageVal,
    patient_sex: sexVal,
    status: 'pending',
    notes,
    source: 'psap',
    dispatcher_id: agent?.id ?? null,
  };

  const { data, error } = await sb
    .from('incidents')
    .insert(insertRow)
    .select('id, display_id')
    .single();
  if (error) redirect('/psap?error=' + encodeURIComponent(error.message));

  await sb.from('dispatch_events').insert({
    incident_id: data.id,
    event_type: 'created',
    event_note: `${displayId} ${complaintText} — P${priority} ${determinant}${determinantCode ? '-' + determinantCode : ''}`,
    actor_type: 'psap',
    payload: { source: 'psap_intake' },
  });

  revalidatePath('/psap');
  revalidatePath('/dispatch');
  redirect(`/dispatch?focus=${data.id}`);
}
