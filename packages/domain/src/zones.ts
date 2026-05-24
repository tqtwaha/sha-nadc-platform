// Nairobi operational zones — used by the sim for unit spawn + incident
// hot-spots. Each zone has a centre, radius (in degrees), and an average
// response time the sim uses to weight incident generation.
//
// Ported from v1 lib/nadc-state.js KENYA_ZONES (Nairobi subset).
// Full 47-county zone seed lands in Phase 3 when we wire providers.

export interface Zone {
  id:       string;
  name:     string;
  county:   string;
  lat:      number;
  lng:      number;
  radius:   number;       // degrees; ~0.02 ≈ 2.2 km at the equator
  avgMins:  number;       // average response baseline for sim
  weight:   number;       // probability weight when picking incidents
}

export const NAIROBI_ZONES: readonly Zone[] = [
  { id: 'CBD',  name: 'Nairobi CBD',     county: 'Nairobi', lat: -1.2921, lng: 36.8219, radius: 0.025, avgMins: 7.4,  weight: 5 },
  { id: 'WEST', name: 'Westlands',       county: 'Nairobi', lat: -1.2640, lng: 36.8000, radius: 0.022, avgMins: 8.0,  weight: 4 },
  { id: 'EAST', name: 'Eastlands',       county: 'Nairobi', lat: -1.2800, lng: 36.8620, radius: 0.028, avgMins: 9.1,  weight: 5 },
  { id: 'STHB', name: 'South B / C',     county: 'Nairobi', lat: -1.3120, lng: 36.8350, radius: 0.020, avgMins: 8.5,  weight: 3 },
  { id: 'LANG', name: "Lang'ata / Karen",county: 'Nairobi', lat: -1.3420, lng: 36.7580, radius: 0.026, avgMins: 10.2, weight: 3 },
  { id: 'KASA', name: 'Kasarani',        county: 'Nairobi', lat: -1.2200, lng: 36.8980, radius: 0.024, avgMins: 9.8,  weight: 3 },
  { id: 'EMBA', name: 'Embakasi',        county: 'Nairobi', lat: -1.3200, lng: 36.9020, radius: 0.026, avgMins: 9.5,  weight: 4 },
  { id: 'KARE', name: 'Karen',           county: 'Nairobi', lat: -1.3640, lng: 36.7120, radius: 0.018, avgMins: 11.0, weight: 2 },
] as const;

export function findZone(id: string): Zone | undefined {
  return NAIROBI_ZONES.find((z) => z.id === id);
}

export function nearestZone(lat: number, lng: number): Zone {
  let best = NAIROBI_ZONES[0]!;
  let bestD = Infinity;
  for (const z of NAIROBI_ZONES) {
    const dy = z.lat - lat;
    const dx = z.lng - lng;
    const d = dy * dy + dx * dx;
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

export function randomInZone(z: Zone, rnd: () => number = Math.random): { lat: number; lng: number } {
  const angle = rnd() * 2 * Math.PI;
  const r = Math.sqrt(rnd()) * z.radius;
  return {
    lat: z.lat + r * Math.cos(angle),
    lng: z.lng + r * Math.sin(angle),
  };
}
