import { describe, expect, it } from 'vitest';
import { buildSimIncident } from './incidents';

describe('buildSimIncident', () => {
  it('produces a valid IncidentCreate with displayId', () => {
    const i = buildSimIncident(1);
    expect(i.displayId).toMatch(/^INC-\d{4}-\d{6}$/);
    expect([1, 2, 3, 4]).toContain(i.priority);
    expect(i.complaint).toBeTruthy();
    expect(i.icd11).toBeTruthy();
    expect(typeof i.requiresAls).toBe('boolean');
    expect(i.lat).toBeGreaterThan(-2);
    expect(i.lat).toBeLessThan(0);
    expect(i.lng).toBeGreaterThan(36);
    expect(i.lng).toBeLessThan(37);
    expect(i.address).toBeTruthy();
    expect(i.county).toBeTruthy();
    expect(['CBD', 'WEST', 'EAST', 'STHB', 'LANG', 'KASA', 'EMBA', 'KARE']).toContain(i.zone);
    expect(i.patientAge).toBeGreaterThanOrEqual(18);
    expect(i.patientAge).toBeLessThanOrEqual(88);
    expect(['M', 'F']).toContain(i.patientSex);
    expect(i.source).toBe('sim');
  });

  it('sequence number pads to 6 digits in displayId', () => {
    expect(buildSimIncident(7).displayId).toMatch(/-000007$/);
    expect(buildSimIncident(123).displayId).toMatch(/-000123$/);
    expect(buildSimIncident(999999).displayId).toMatch(/-999999$/);
  });

  it('produces ALS-required incidents that match the complaint catalogue', () => {
    // Run a batch — at least one should be requiresAls
    const batch = Array.from({ length: 50 }, (_, i) => buildSimIncident(i));
    expect(batch.some((i) => i.requiresAls)).toBe(true);
  });

  it('w3w field is present and looks like three-word format', () => {
    const i = buildSimIncident(1);
    expect(i.w3w).toBeTruthy();
    // w3w format: lowercase.words.separated.by.dots — at minimum two dots
    expect((i.w3w ?? '').match(/\./g)?.length).toBeGreaterThanOrEqual(2);
  });
});
