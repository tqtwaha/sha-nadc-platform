import type { Incident, IncidentSource, IncidentCreate, Priority, PatientSex } from '@sha-nadc/types';
import { NAIROBI_ZONES, randomInZone } from './zones';
import { COMPLAINTS, weightedComplaint } from './priority';

// Generate a random sim incident. Real human-created incidents come from
// PSAP / dispatch screens via NACDState.createIncident in v1; in v2 those
// flow through tRPC and reuse the IncidentCreate Zod schema.

function pad(n: number, w: number): string {
  return n.toString().padStart(w, '0');
}

const W3W_WORDS = [
  'table', 'cancer', 'pegs', 'mango', 'thunder', 'kite', 'gentle', 'rapid',
  'silver', 'mist', 'tiger', 'cloud', 'bright', 'forest', 'echo', 'quiet',
];

function randomW3W(): string {
  const r = () => W3W_WORDS[Math.floor(Math.random() * W3W_WORDS.length)]!;
  return `///${r()}.${r()}.${r()}`;
}

/**
 * Build a single random incident. Caller provides the next sequence number
 * (so the engine can decide whether to source from DB MAX(seq) or in-memory).
 */
export function buildSimIncident(seq: number): IncidentCreate & { displayId: string } {
  const zone = NAIROBI_ZONES[Math.floor(Math.random() * NAIROBI_ZONES.length)]!;
  const pos = randomInZone(zone);
  const c = weightedComplaint();
  const sex: PatientSex = Math.random() < 0.5 ? 'M' : 'F';
  const now = new Date();
  return {
    displayId: `INC-${now.getFullYear()}-${pad(seq, 6)}`,
    priority: c.priority as Priority,
    complaint: c.text,
    icd11: c.icd11,
    requiresAls: c.requiresAls,
    lat: pos.lat,
    lng: pos.lng,
    address: `${zone.name}, ${zone.county} County`,
    w3w: randomW3W(),
    county: zone.county,
    zone: zone.id,
    patientAge: 18 + Math.floor(Math.random() * 70),
    patientSex: sex,
    source: 'sim' as IncidentSource,
    notes: '',
  };
}

export { COMPLAINTS };
