import type { Unit, UnitType } from '@sha-nadc/types';
import { NAIROBI_ZONES, randomInZone } from './zones';

// Port of v1's _generateFleet — 150 units across 8 Nairobi zones plus
// 120 'E+ Emergency Medical Services' units (270 total). 40% ALS, 60% BLS.
// The provider mix mirrors what Kenya's actual ambulance market looks like.

const PROVIDERS = [
  { id: 'PRV001', name: 'AMREF Flying Doctors' },
  { id: 'PRV002', name: 'St John Ambulance Kenya' },
  { id: 'PRV003', name: 'Kenya Red Cross' },
  { id: 'PRV004', name: 'Flare Emergency Response' },
  { id: 'PRV005', name: 'Nairobi County EMS' },
  { id: 'PRV006', name: 'Kiambu County EMS' },
  { id: 'PRV007', name: 'Africa Air Rescue' },
  { id: 'PRV008', name: 'E+ Emergency Medical Services' },
  { id: 'PRV009', name: 'AAR Healthcare' },
  { id: 'PRV010', name: 'Avenue Healthcare EMS' },
] as const;

function pad(n: number, width: number): string {
  return n.toString().padStart(width, '0');
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export interface SeedFleetOptions {
  /** Base unit count, default 150 (A-001..A-150). */
  baseCount?: number;
  /** Additional E+ EMS units, default 120 (EP-001..EP-120). */
  ePlusCount?: number;
  /** Probability a unit is anomaly-flagged (low fuel, etc.). 0..1 */
  anomalyRate?: number;
}

/**
 * Build the full fleet roster as plain Unit records.
 * Pure function — no DB writes here; that lives in the cron seeder.
 */
export function buildFleetRoster(opts: SeedFleetOptions = {}): Unit[] {
  const baseCount  = opts.baseCount  ?? 150;
  const ePlusCount = opts.ePlusCount ?? 120;
  const anomalyRate = opts.anomalyRate ?? 0.02;
  const now = new Date().toISOString();

  const units: Unit[] = [];

  // Main fleet — round-robin across zones.
  for (let s = 1; s <= baseCount; s++) {
    const zone = NAIROBI_ZONES[(s - 1) % NAIROBI_ZONES.length]!;
    const pos = randomInZone(zone);
    const type: UnitType = s % 5 < 2 ? 'ALS' : 'BLS'; // 40% ALS
    const providerIdx = (s - 1) % PROVIDERS.length;
    const provider = PROVIDERS[providerIdx]!;
    units.push({
      id: `A-${pad(s, 3)}`,
      type,
      status: 'available',
      lat: pos.lat,
      lng: pos.lng,
      targetLat: null,
      targetLng: null,
      zone: zone.id,
      county: zone.county,
      crewCount: 2,
      providerName: provider.name,
      providerId: provider.id,
      fuelPct: randInt(40, 100),
      anomaly: Math.random() < anomalyRate,
      anomalyDesc: null,
      incidentId: null,
      routeWaypoints: null,
      waypointIdx: 0,
      updatedAt: now,
    });
  }

  // E+ EMS reinforcement fleet.
  const ePlus = PROVIDERS.find((p) => p.id === 'PRV008')!;
  for (let s = 1; s <= ePlusCount; s++) {
    const zone = NAIROBI_ZONES[s % NAIROBI_ZONES.length]!;
    const pos = randomInZone(zone);
    units.push({
      id: `EP-${pad(s, 3)}`,
      type: s % 2 === 0 ? 'ALS' : 'BLS',
      status: 'available',
      lat: pos.lat,
      lng: pos.lng,
      targetLat: null,
      targetLng: null,
      zone: zone.id,
      county: zone.county,
      crewCount: 2,
      providerName: ePlus.name,
      providerId: ePlus.id,
      fuelPct: randInt(55, 100),
      anomaly: false,
      anomalyDesc: null,
      incidentId: null,
      routeWaypoints: null,
      waypointIdx: 0,
      updatedAt: now,
    });
  }

  return units;
}

export { PROVIDERS };
