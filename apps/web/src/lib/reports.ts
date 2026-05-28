// Analytics aggregations for /reports — the response-time + throughput
// surface SHA uses to evaluate ambulance service performance.
// All computed server-side in a few round-trips; no client compute.

import 'server-only';
import { PROVIDERS } from '@sha-nadc/domain';
import { serviceClient } from './supabase';

function pctl(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[idx] ?? 0);
}

// SHIF / NADC response-time targets (seconds) for P1 dispatch decision.
const SLA_DISPATCH_TARGET: Record<number, number> = { 1: 60, 2: 120, 3: 300, 4: 600 };

export interface ReportsData {
  windowHours: number;
  totals: {
    incidents: number;
    active: number;
    cleared: number;
    cancelled: number;
    claims: number;
    claimsKes: number;
    paidKes: number;
  };
  responseTimes: {
    dispatchP50: number | null;
    dispatchP90: number | null;
    sceneP50: number | null;
    sceneP90: number | null;
    sampleN: number;
  };
  slaByPriority: Array<{
    priority: number;
    targetSec: number;
    total: number;
    metSla: number;
    compliancePct: number;
  }>;
  volumeByHour: Array<{ hour: string; count: number; p1: number }>;
  claimsByStatus: Array<{ status: string; count: number; kes: number }>;
  providerPerf: Array<{
    id: string;
    name: string;
    runs: number;
    avgDistanceKm: number;
    revenueKes: number;
  }>;
}

export async function getReports(windowHours = 24): Promise<ReportsData> {
  const sb = serviceClient();
  const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

  const [{ data: incidents }, { data: claims }] = await Promise.all([
    sb
      .from('incidents')
      .select(
        'priority, status, created_at, dispatched_at, on_scene_at, cleared_at',
      )
      .gte('created_at', since)
      .limit(5000),
    sb
      .from('claims')
      .select('status, total_kes, distance_km, provider_id, paid_at, created_at')
      .gte('created_at', since)
      .limit(5000),
  ]);

  const inc = incidents ?? [];
  const cl = claims ?? [];

  // ── Totals
  const active = inc.filter((i) =>
    ['pending', 'dispatched', 'en_route', 'on_scene', 'transport'].includes(i.status),
  ).length;
  const cleared = inc.filter((i) => i.status === 'cleared').length;
  const cancelled = inc.filter((i) => i.status === 'cancelled').length;
  const claimsKes = cl.reduce((a, c) => a + (c.total_kes ?? 0), 0);
  const paidKes = cl
    .filter((c) => c.status === 'paid' || c.status === 'invoiced')
    .reduce((a, c) => a + (c.total_kes ?? 0), 0);

  // ── Response times (seconds)
  const dispatchLags: number[] = [];
  const sceneLags: number[] = [];
  for (const i of inc) {
    if (i.dispatched_at && i.created_at) {
      dispatchLags.push(
        (new Date(i.dispatched_at).getTime() - new Date(i.created_at).getTime()) / 1000,
      );
    }
    if (i.on_scene_at && i.created_at) {
      sceneLags.push(
        (new Date(i.on_scene_at).getTime() - new Date(i.created_at).getTime()) / 1000,
      );
    }
  }
  dispatchLags.sort((a, b) => a - b);
  sceneLags.sort((a, b) => a - b);

  // ── SLA by priority (dispatch decision within target)
  const slaByPriority = [1, 2, 3, 4].map((priority) => {
    const targetSec = SLA_DISPATCH_TARGET[priority] ?? 300;
    const withDispatch = inc.filter(
      (i) => i.priority === priority && i.dispatched_at && i.created_at,
    );
    const metSla = withDispatch.filter((i) => {
      const lag =
        (new Date(i.dispatched_at as string).getTime() - new Date(i.created_at).getTime()) / 1000;
      return lag <= targetSec;
    }).length;
    return {
      priority,
      targetSec,
      total: withDispatch.length,
      metSla,
      compliancePct: withDispatch.length === 0 ? 100 : Math.round((metSla / withDispatch.length) * 100),
    };
  });

  // ── Volume by hour (last min(windowHours,24))
  const hours = Math.min(windowHours, 24);
  const buckets: Array<{ hour: string; count: number; p1: number }> = [];
  const now = new Date();
  for (let h = hours - 1; h >= 0; h -= 1) {
    const start = new Date(now.getTime() - (h + 1) * 3600 * 1000);
    const end = new Date(now.getTime() - h * 3600 * 1000);
    const inBucket = inc.filter((i) => {
      const t = new Date(i.created_at).getTime();
      return t >= start.getTime() && t < end.getTime();
    });
    buckets.push({
      hour: String(end.getHours()).padStart(2, '0') + ':00',
      count: inBucket.length,
      p1: inBucket.filter((i) => i.priority === 1).length,
    });
  }

  // ── Claims by status
  const statusMap = new Map<string, { count: number; kes: number }>();
  for (const c of cl) {
    const s = statusMap.get(c.status) ?? { count: 0, kes: 0 };
    s.count += 1;
    s.kes += c.total_kes ?? 0;
    statusMap.set(c.status, s);
  }
  const claimsByStatus = [...statusMap.entries()]
    .map(([status, v]) => ({ status, count: v.count, kes: v.kes }))
    .sort((a, b) => b.count - a.count);

  // ── Provider performance
  const providerPerf = PROVIDERS.map((p) => {
    const pClaims = cl.filter((c) => c.provider_id === p.id);
    const dists = pClaims.map((c) => c.distance_km ?? 0).filter((d) => d > 0);
    const revenue = pClaims
      .filter((c) => c.status === 'paid' || c.status === 'invoiced')
      .reduce((a, c) => a + (c.total_kes ?? 0), 0);
    return {
      id: p.id,
      name: p.name,
      runs: pClaims.length,
      avgDistanceKm: dists.length
        ? Math.round((dists.reduce((a, b) => a + b, 0) / dists.length) * 10) / 10
        : 0,
      revenueKes: revenue,
    };
  })
    .filter((p) => p.runs > 0)
    .sort((a, b) => b.runs - a.runs);

  return {
    windowHours,
    totals: {
      incidents: inc.length,
      active,
      cleared,
      cancelled,
      claims: cl.length,
      claimsKes,
      paidKes,
    },
    responseTimes: {
      dispatchP50: pctl(dispatchLags, 50),
      dispatchP90: pctl(dispatchLags, 90),
      sceneP50: pctl(sceneLags, 50),
      sceneP90: pctl(sceneLags, 90),
      sampleN: dispatchLags.length,
    },
    slaByPriority,
    volumeByHour: buckets,
    claimsByStatus,
    providerPerf,
  };
}
