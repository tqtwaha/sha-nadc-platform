// Aggregations for the landing page launchpad — one round trip each so
// the home page renders quickly with live operational counts.

import 'server-only';
import { serviceClient } from './supabase';

export interface AppCount {
  slug: string;
  count: number;
  caption: string;
}

export interface LandingSnapshot {
  appCounts: AppCount[];
  kpis: {
    activeIncidents: number;
    p1Active: number;
    availableUnits: number;
    deployedUnits: number;
    totalUnits: number;
    claimsToday: number;
    paidKesToday: number;
  };
  topP1: Array<{
    id: string;
    display_id: string;
    complaint: string;
    zone: string;
    status: string;
    unit_id: string | null;
  }>;
}

export async function getLandingSnapshot(): Promise<LandingSnapshot> {
  const sb = serviceClient();
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since6h = new Date(Date.now() - 6 * 3600 * 1000).toISOString();

  const [
    { data: incidents },
    { data: units },
    { data: agents },
    { data: hospitals },
    { data: claims },
    { data: topP1 },
  ] = await Promise.all([
    sb.from('incidents').select('priority, status, created_at, source'),
    sb.from('fleet_units').select('status'),
    sb.from('agents').select('id'),
    sb.from('hospitals').select('id'),
    sb.from('claims').select('status, total_kes, created_at'),
    sb
      .from('incidents')
      .select('id, display_id, complaint, zone, status, unit_id')
      .eq('priority', 1)
      .in('status', ['pending', 'dispatched', 'en_route', 'on_scene', 'transport'])
      .order('created_at', { ascending: true })
      .limit(3),
  ]);

  const incs = incidents ?? [];
  const active = incs.filter((i) =>
    ['pending', 'dispatched', 'en_route', 'on_scene', 'transport'].includes(i.status),
  );
  const p1Active = active.filter((i) => i.priority === 1).length;
  const pendingNow = incs.filter((i) => i.status === 'pending').length;
  const psapCalls6h = incs.filter(
    (i) => i.source === 'psap' && i.created_at >= since6h,
  ).length;
  const cleared24h = incs.filter(
    (i) => i.status === 'cleared' && i.created_at >= since24h,
  ).length;

  const u = units ?? [];
  const available = u.filter((x) => x.status === 'available').length;
  const deployed = u.filter((x) =>
    ['dispatched', 'en_route', 'on_scene', 'transport'].includes(x.status),
  ).length;

  const cls = claims ?? [];
  const claimsToday = cls.filter((c) => c.created_at >= since24h).length;
  const claimsPending = cls.filter((c) =>
    ['draft', 'submitted', 'approved', 'pending_payment'].includes(c.status),
  ).length;
  const paidToday = cls
    .filter((c) => c.created_at >= since24h && (c.status === 'paid' || c.status === 'invoiced'))
    .reduce((a, c) => a + (c.total_kes ?? 0), 0);

  const appCounts: AppCount[] = [
    { slug: 'wall', count: active.length, caption: `${active.length} active` },
    { slug: 'psap', count: psapCalls6h, caption: `${psapCalls6h} calls 6h` },
    {
      slug: 'dispatch',
      count: pendingNow,
      caption: pendingNow > 0 ? `${pendingNow} pending` : 'queue clear',
    },
    { slug: 'supervisor', count: cleared24h, caption: `${cleared24h} cleared 24h` },
    { slug: 'emt', count: deployed, caption: `${deployed}/${u.length} deployed` },
    { slug: 'hospital', count: hospitals?.length ?? 0, caption: `${hospitals?.length ?? 0} listed` },
    { slug: 'claims', count: claimsPending, caption: `${claimsPending} in workflow` },
    { slug: 'providers', count: 10, caption: '10 contracted' },
    { slug: 'admin', count: agents?.length ?? 0, caption: `${agents?.length ?? 0} agents` },
  ];

  return {
    appCounts,
    kpis: {
      activeIncidents: active.length,
      p1Active,
      availableUnits: available,
      deployedUnits: deployed,
      totalUnits: u.length,
      claimsToday,
      paidKesToday: paidToday,
    },
    topP1: (topP1 ?? []) as LandingSnapshot['topP1'],
  };
}
