// SHIF ambulance tariff calculator.
//
// Kenya's Social Health Insurance Fund (SHIF) reimburses ambulance
// transport on a two-part rate:
//   - flat base fee covering the first `freeKm` (default 25)
//   - per-km charge for everything beyond
//
// Ported and simplified from v1 lib/nadc-state.js claim helpers.
// All values KES; all distances km. Pure function — no side effects.

import type { ClaimTariffType } from '@sha-nadc/types';

export interface TariffRate {
  base:   number;
  perKm:  number;
  freeKm: number;
}

export const TARIFFS: Record<ClaimTariffType, TariffRate> = {
  ALS: { base: 3500, perKm: 120, freeKm: 25 },
  BLS: { base: 2000, perKm: 80,  freeKm: 25 },
};

export interface TariffInput {
  tariffType:     ClaimTariffType;
  distanceKm:     number;
  consumablesKes?: number;
}

export interface TariffBreakdown {
  baseKes:         number;
  distanceKm:      number;
  chargeableKm:    number;
  perKmKes:        number;
  perKmTotalKes:   number;
  consumablesKes:  number;
  totalKes:        number;
  rate:            TariffRate;
}

/**
 * Compute the claim total for an ambulance transport.
 * Throws on invalid input (negative distance, unknown tariff type).
 */
export function computeTariff(input: TariffInput): TariffBreakdown {
  if (!Number.isFinite(input.distanceKm) || input.distanceKm < 0) {
    throw new Error(`tariff: distanceKm must be non-negative, got ${input.distanceKm}`);
  }
  const rate = TARIFFS[input.tariffType];
  if (!rate) throw new Error(`tariff: unknown tariffType "${input.tariffType}"`);

  const chargeableKm   = Math.max(0, input.distanceKm - rate.freeKm);
  const perKmTotalKes  = Math.round(chargeableKm * rate.perKm);
  const consumablesKes = Math.max(0, Math.round(input.consumablesKes ?? 0));
  const totalKes       = rate.base + perKmTotalKes + consumablesKes;

  return {
    baseKes:        rate.base,
    distanceKm:     input.distanceKm,
    chargeableKm,
    perKmKes:       rate.perKm,
    perKmTotalKes,
    consumablesKes,
    totalKes,
    rate,
  };
}

/**
 * Format KES money for display. No currency symbol — caller adds "KES" or "Ksh"
 * to match the surrounding UI tone.
 */
export function formatKes(amount: number): string {
  return amount.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}
