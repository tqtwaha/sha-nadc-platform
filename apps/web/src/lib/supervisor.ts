// Aggregations for the floor supervisor screen — pure reads against the
// existing tables. Each helper is a single round-trip and returns a typed
// shape so the page can render without further reshape.

import 'server-only';
import { serviceClient } from './supabase';

export interface SupervisorKpis {
  active: number;
  p1Active: number;
  p2Active: number;
  p34Active: number;
  pending: number;
  inField: number;
  cleared24h: number;
  cancelled24h: number;
  totalUnits: number;
  availableUnits: number;
  deployedUnits: number;
  oosUnits: number;
  slaCompliancePct: number; // p1 dispatched within 60s of created
  medianDispatchSecs: number | null;
}

const ACTIVE_STATUSES = ['pending', 'dispatched', 'en_route', 'on_scene', 'transport'];
const IN_FIELD_STATUSES = ['dispatched', 'en_route', 'on_scene', 'transport'];

export async function getKpis(): Promise<SupervisorKpis> {
  const sb = serviceClient();
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [{ data: incidents, error: iErr }, { data: units, error: uErr }] = await Promise.all([
    sb
      .from('incidents')
      .select('priority, status, created_at, dispatched_at, cleared_at'),
    sb.from('fleet_units').select('status'),
  ]);
  if (iErr) throw iErr;
  if (uErr) throw uErr;

  const all = incidents ?? [];
  const active = all.filter((i) => ACTIVE_STATUSES.includes(i.status));
  const inField = all.filter((i) => IN_FIELD_STATUSES.includes(i.status));

  const dispatchedP1 = all.filter(
    (i) => i.priority === 1 && i.dispatched_at && i.created_at,
  );
  const slaHits = dispatchedP1.filter((i) => {
    const lag = new Date(i.dispatched_at as string).getTime() - new Date(i.created_at).getTime();
    return lag <= 60_000; // 60s SLA for P1
  });
  const slaCompliancePct = dispatchedP1.length === 0
    ? 100
    : Math.round((slaHits.length / dispatchedP1.length) * 100);

  const dispatchLags = all
    .filter((i) => i.dispatched_at && i.created_at)
    .map(
      (i) =>
        (new Date(i.dispatched_at as string).getTime() - new Date(i.created_at).getTime()) / 1000,
    )
    .sort((a, b) => a - b);
  const medianDispatchSecs =
    dispatchLags.length === 0
      ? null
      : Math.round(dispatchLags[Math.floor(dispatchLags.length / 2)] ?? 0);

  const cleared24h = all.filter(
    (i) => i.status === 'cleared' && i.cleared_at && i.cleared_at >= since24h,
  ).length;
  const cancelled24h = all.filter(
    (i) => i.status === 'cancelled' && i.cleared_at && i.cleared_at >= since24h,
  ).length;

  const u = units ?? [];
  return {
    active: active.length,
    p1Active: active.filter((i) => i.priority === 1).length,
    p2Active: active.filter((i) => i.priority === 2).length,
    p34Active: active.filter((i) => i.priority >= 3).length,
    pending: all.filter((i) => i.status === 'pending').length,
    inField: inField.length,
    cleared24h,
    cancelled24h,
    totalUnits: u.length,
    availableUnits: u.filter((x) => x.status === 'available').length,
    deployedUnits: u.filter((x) =>
      ['dispatched', 'en_route', 'on_scene', 'transport'].includes(x.status),
    ).length,
    oosUnits: u.filter((x) => ['off_duty', 'maintenance', 'standby'].includes(x.status)).length,
    slaCompliancePct,
    medianDispatchSecs,
  };
}

export interface CountyBucket {
  county: string;
  total: number;
  p1: number;
  p2: number;
  p34: number;
}

export async function incidentsByCounty(limit = 10): Promise<CountyBucket[]> {
  const sb = serviceClient();
  const { data, error } = await sb.from('incidents').select('priority, county');
  if (error) throw error;

  const buckets = new Map<string, CountyBucket>();
  for (const r of data ?? []) {
    const b = buckets.get(r.county) ?? {
      county: r.county,
      total: 0,
      p1: 0,
      p2: 0,
      p34: 0,
    };
    b.total += 1;
    if (r.priority === 1) b.p1 += 1;
    else if (r.priority === 2) b.p2 += 1;
    else b.p34 += 1;
    buckets.set(r.county, b);
  }
  return [...buckets.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

export interface RecentEvent {
  id: string;
  event_type: string;
  event_note: string | null;
  actor_type: string;
  created_at: string;
  incident_id: string | null;
  unit_id: string | null;
}

export async function recentEvents(limit = 20): Promise<RecentEvent[]> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from('dispatch_events')
    .select('id, event_type, event_note, actor_type, created_at, incident_id, unit_id')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as RecentEvent[];
}

export interface DispatcherPerf {
  dispatcher_id: string | null;
  display_name: string;
  handled: number;
  avg_dispatch_secs: number | null;
  p1_handled: number;
}

export async function dispatcherPerformance(): Promise<DispatcherPerf[]> {
  const sb = serviceClient();
  const [{ data: incidents, error: iErr }, { data: agents, error: aErr }] = await Promise.all([
    sb
      .from('incidents')
      .select('dispatcher_id, priority, created_at, dispatched_at')
      .not('dispatcher_id', 'is', null),
    sb.from('agents').select('id, display_name, role'),
  ]);
  if (iErr) throw iErr;
  if (aErr) throw aErr;

  const nameById = new Map((agents ?? []).map((a) => [a.id, a.display_name]));
  const groups = new Map<string, typeof incidents>();
  for (const r of incidents ?? []) {
    const key = r.dispatcher_id as string;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const rows: DispatcherPerf[] = [];
  for (const [id, arr] of groups.entries()) {
    const lags = (arr ?? [])
      .filter((r) => r.dispatched_at && r.created_at)
      .map(
        (r) =>
          (new Date(r.dispatched_at as string).getTime() - new Date(r.created_at).getTime()) /
          1000,
      );
    const avg = lags.length === 0 ? null : Math.round(lags.reduce((a, b) => a + b, 0) / lags.length);
    rows.push({
      dispatcher_id: id,
      display_name: nameById.get(id) ?? 'Unknown',
      handled: arr?.length ?? 0,
      avg_dispatch_secs: avg,
      p1_handled: (arr ?? []).filter((r) => r.priority === 1).length,
    });
  }

  return rows.sort((a, b) => b.handled - a.handled);
}
