import { describe, expect, it } from 'vitest';
import { NAIROBI_ZONES, findZone, nearestZone, randomInZone } from './zones';

describe('NAIROBI_ZONES', () => {
  it('has 8 zones', () => {
    expect(NAIROBI_ZONES.length).toBe(8);
  });

  it('every zone has required fields', () => {
    for (const z of NAIROBI_ZONES) {
      expect(z.id).toMatch(/^[A-Z]{3,4}$/);
      expect(z.name).toBeTruthy();
      expect(z.county).toBe('Nairobi');
      expect(z.lat).toBeGreaterThan(-2);
      expect(z.lat).toBeLessThan(0);
      expect(z.lng).toBeGreaterThan(36);
      expect(z.lng).toBeLessThan(37);
      expect(z.radius).toBeGreaterThan(0);
    }
  });
});

describe('findZone', () => {
  it('returns a zone for a known id', () => {
    expect(findZone('CBD')?.id).toBe('CBD');
  });
  it('returns undefined for unknown id', () => {
    expect(findZone('ZZZZ')).toBeUndefined();
  });
});

describe('nearestZone', () => {
  it('returns CBD for a point at the CBD center', () => {
    const z = nearestZone(-1.2921, 36.8219);
    expect(z.id).toBe('CBD');
  });
  it('returns WEST for a point near Westlands center', () => {
    const z = nearestZone(-1.264, 36.8);
    expect(z.id).toBe('WEST');
  });
  it('returns one of the 8 zones for any plausible Nairobi coordinate', () => {
    const z = nearestZone(-1.3, 36.85);
    expect(NAIROBI_ZONES.find((x) => x.id === z.id)).toBeDefined();
  });
});

describe('randomInZone', () => {
  it('returns a point within zone radius', () => {
    const z = NAIROBI_ZONES[0]!;
    for (let i = 0; i < 50; i += 1) {
      const p = randomInZone(z);
      const dy = p.lat - z.lat;
      const dx = p.lng - z.lng;
      const d = Math.sqrt(dx * dx + dy * dy);
      expect(d).toBeLessThanOrEqual(z.radius + 1e-9);
    }
  });
  it('is deterministic with seeded rng', () => {
    const z = NAIROBI_ZONES[0]!;
    let seed = 1;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const a = randomInZone(z, rng);
    seed = 1;
    const rng2 = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const b = randomInZone(z, rng2);
    expect(a.lat).toBe(b.lat);
    expect(a.lng).toBe(b.lng);
  });
});
