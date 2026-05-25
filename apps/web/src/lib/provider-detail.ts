// Provider drill-down — for /providers/[id] detail page. Pulls the full
// fleet roster + recent claims + revenue rollups for one operator.

import 'server-only';
import { PROVIDERS } from '@sha-nadc/domain';
import { serviceClient } from './supabase';

export interface ProviderUnit {
  id: string;
  type: 'ALS' | 'BLS';
  status: string;
  zone: string;
  county: string;
  crew_count: number;
  fuel_pct: number;
  anomaly: boolean;
  current_incident_id: string | null;
  last_seen: string;
}

export interface ProviderClaim {
  id: string;
  claim_number: string;
  chief_complaint: string;
  status: string;
  tariff_type: 'ALS' | 'BLS';
  distance_km: number;
  total_kes: number;
  created_at: string;
  paid_at: string | null;
}

export interface ProviderDetail {
  id: string;
  name: string;
  units: ProviderUnit[];
  recentClaims: ProviderClaim[];
  metrics: {
    totalUnits: number;
    alsUnits: number;
    blsUnits: number;
    availableUnits: number;
    deployedUnits: number;
    offDutyUnits: number;
    lifetimeClaims: number;
    paidClaims: number;
    pendingClaims: number;
    revenueLast30d: number;
    revenueLifetime: number;
    avgDistanceKm: number;
    runsLast7d: number;
  };
}

export async function getProviderDetail(id: string): Promise<ProviderDetail | null> {
  const meta = PROVIDERS.find((p) => p.id === id);
  if (!meta) return null;

  const sb = serviceClient();
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const [{ data: units }, { data: claims }, { data: recent7d }] = await Promise.all([
    sb
      .from('fleet_units')
      .select(
        'id, type:unit_type, status, zone, county, crew_count, fuel_pct, anomaly, current_incident_id, last_seen',
      )
      .eq('provider_id', id)
      .order('id'),
    sb
      .from('claims')
      .select(
        'id, claim_number, chief_complaint, status, tariff_type, distance_km, total_kes, created_at, paid_at',
      )
      .eq('provider_id', id)
      .order('created_at', { ascending: false })
      .limit(25),
    sb
      .from('claims')
      .select('total_kes, distance_km, status, created_at')
      .eq('provider_id', id)
      .gte('created_at', since7d),
  ]);

  const uList = (units ?? []) as ProviderUnit[];
  const cList = (claims ?? []) as ProviderClaim[];
  const recent = recent7d ?? [];

  const paid30 = (claims ?? [])
    .filter((c) => c.paid_at && c.paid_at >= since30d)
    .reduce((a, c) => a + (c.total_kes ?? 0), 0);
  const paidAll = (claims ?? [])
    .filter((c) => c.status === 'paid' || c.status === 'invoiced')
    .reduce((a, c) => a + (c.total_kes ?? 0), 0);
  const distances = (claims ?? []).map((c) => c.distance_km ?? 0).filter((d) => d > 0);
  const avgDistance = distances.length
    ? Math.round((distances.reduce((a, b) => a + b, 0) / distances.length) * 10) / 10
    : 0;

  return {
    id: meta.id,
    name: meta.name,
    units: uList,
    recentClaims: cList,
    metrics: {
      totalUnits: uList.length,
      alsUnits: uList.filter((u) => u.type === 'ALS').length,
      blsUnits: uList.filter((u) => u.type === 'BLS').length,
      availableUnits: uList.filter((u) => u.status === 'available').length,
      deployedUnits: uList.filter((u) =>
        ['dispatched', 'en_route', 'on_scene', 'transport'].includes(u.status),
      ).length,
      offDutyUnits: uList.filter((u) =>
        ['off_duty', 'maintenance', 'standby'].includes(u.status),
      ).length,
      lifetimeClaims: cList.length,
      paidClaims: cList.filter((c) => c.status === 'paid' || c.status === 'invoiced').length,
      pendingClaims: cList.filter((c) =>
        ['draft', 'submitted', 'approved', 'pending_payment'].includes(c.status),
      ).length,
      revenueLast30d: paid30,
      revenueLifetime: paidAll,
      avgDistanceKm: avgDistance,
      runsLast7d: recent.length,
    },
  };
}
