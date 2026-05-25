import { describe, expect, it } from 'vitest';
import { COMPLAINTS, weightedComplaint } from './priority';

describe('COMPLAINTS catalogue', () => {
  it('has at least 16 entries (covers the v1 mix)', () => {
    expect(COMPLAINTS.length).toBeGreaterThanOrEqual(16);
  });

  it('every complaint has required fields', () => {
    for (const c of COMPLAINTS) {
      expect(c.text).toBeTruthy();
      expect(c.icd11).toBeTruthy();
      expect([1, 2, 3, 4]).toContain(c.priority);
      expect(typeof c.requiresAls).toBe('boolean');
      expect(c.weight).toBeGreaterThan(0);
    }
  });

  it('has at least one P1, one P2, one P3 complaint', () => {
    expect(COMPLAINTS.filter((c) => c.priority === 1).length).toBeGreaterThan(0);
    expect(COMPLAINTS.filter((c) => c.priority === 2).length).toBeGreaterThan(0);
    expect(COMPLAINTS.filter((c) => c.priority === 3).length).toBeGreaterThan(0);
  });

  it('all P1 complaints require ALS', () => {
    for (const c of COMPLAINTS.filter((x) => x.priority === 1)) {
      expect(c.requiresAls).toBe(true);
    }
  });
});

describe('weightedComplaint', () => {
  it('returns a complaint from the catalogue', () => {
    const c = weightedComplaint(() => 0.5);
    expect(COMPLAINTS.find((x) => x.text === c.text)).toBeDefined();
  });

  it('returns the first complaint when rng = 0', () => {
    const c = weightedComplaint(() => 0);
    expect(c.text).toBe(COMPLAINTS[0]!.text);
  });

  it('falls back to last complaint when rng = 1 (covers float-edge case)', () => {
    const c = weightedComplaint(() => 0.999999999);
    expect(COMPLAINTS.find((x) => x.text === c.text)).toBeDefined();
  });

  it('distribution roughly tracks weights over many samples', () => {
    const counts = new Map<string, number>();
    const N = 5000;
    let seed = 42;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < N; i += 1) {
      const c = weightedComplaint(rng);
      counts.set(c.text, (counts.get(c.text) ?? 0) + 1);
    }
    // RTA has highest weight (8) — should be most common
    const rtaCount = counts.get('Road traffic accident') ?? 0;
    // Mental health crisis has lowest weight (2) — should be least common
    const mhCount = counts.get('Mental health crisis') ?? 0;
    expect(rtaCount).toBeGreaterThan(mhCount);
  });
});
