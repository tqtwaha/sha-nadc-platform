import { describe, expect, it } from 'vitest';
import { computeTariff, formatKes, TARIFFS } from './tariff';

describe('computeTariff', () => {
  it('returns just the base when distance is below the free threshold', () => {
    const r = computeTariff({ tariffType: 'BLS', distanceKm: 10 });
    expect(r.totalKes).toBe(TARIFFS.BLS.base);
    expect(r.chargeableKm).toBe(0);
    expect(r.perKmTotalKes).toBe(0);
  });

  it('charges per-km beyond the free threshold (BLS)', () => {
    const r = computeTariff({ tariffType: 'BLS', distanceKm: 30 });
    expect(r.chargeableKm).toBe(5);
    expect(r.perKmTotalKes).toBe(400);             // 5 * 80
    expect(r.totalKes).toBe(2000 + 400);
  });

  it('charges per-km beyond the free threshold (ALS)', () => {
    const r = computeTariff({ tariffType: 'ALS', distanceKm: 40 });
    expect(r.chargeableKm).toBe(15);
    expect(r.perKmTotalKes).toBe(1800);            // 15 * 120
    expect(r.totalKes).toBe(3500 + 1800);
  });

  it('adds consumables to the total', () => {
    const r = computeTariff({ tariffType: 'ALS', distanceKm: 20, consumablesKes: 750 });
    expect(r.consumablesKes).toBe(750);
    expect(r.totalKes).toBe(3500 + 0 + 750);       // under freeKm so per-km is 0
  });

  it('treats negative consumables as 0', () => {
    const r = computeTariff({ tariffType: 'BLS', distanceKm: 20, consumablesKes: -100 });
    expect(r.consumablesKes).toBe(0);
  });

  it('throws on negative distance', () => {
    expect(() => computeTariff({ tariffType: 'BLS', distanceKm: -1 })).toThrow();
  });

  it('throws on non-finite distance', () => {
    expect(() => computeTariff({ tariffType: 'BLS', distanceKm: NaN })).toThrow();
  });

  it('rounds chargeable amounts to whole shillings', () => {
    const r = computeTariff({ tariffType: 'BLS', distanceKm: 30.5 });
    // 5.5 km * 80 = 440 — already whole, but verify rounding logic
    expect(r.perKmTotalKes).toBe(Math.round(5.5 * 80));
  });
});

describe('formatKes', () => {
  it('thousand-separates with en-KE locale', () => {
    expect(formatKes(12345)).toBe('12,345');
    expect(formatKes(1500000)).toBe('1,500,000');
  });

  it('handles zero', () => {
    expect(formatKes(0)).toBe('0');
  });
});
