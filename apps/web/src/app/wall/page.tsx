import { serviceClient } from '@/lib/supabase';
import { getKpis, incidentsByCounty, recentEvents } from '@/lib/supervisor';
import { ACTIVE_STATUSES } from '@/lib/incidents';
import { fmtRelative } from '@/lib/format';
import { AutoRefresh } from './AutoRefresh';
import { Clock } from './Clock';
import { RealtimeRefresh } from '@/components/RealtimeRefresh';
import { DispatchMap } from '@/components/DispatchMap';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Suppress the topbar / app switcher entirely — this surface is meant for
// LED walls, not interactive navigation. Pure data density.

const PRIORITY_BG: Record<number, string> = {
  1: 'bg-p1/20 border-p1/40 text-p1',
  2: 'bg-p2/20 border-p2/40 text-p2',
  3: 'bg-p3/20 border-p3/40 text-p3',
  4: 'bg-b2/15 border-b2/40 text-b2',
};

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-p1',
  dispatched: 'bg-p2',
  en_route: 'bg-b2',
  on_scene: 'bg-g',
  transport: 'bg-b2',
};

export default async function WallPage() {
  const sb = serviceClient();
  const [
    kpis,
    counties,
    events,
    { data: active },
    { data: hospitals },
    { data: mapIncidents },
    { data: mapUnits },
    { data: mapHospitals },
  ] = await Promise.all([
    getKpis(),
    incidentsByCounty(8),
    recentEvents(10),
    sb
      .from('incidents')
      .select('id, display_id, priority, complaint, status, zone, county, unit_id, created_at')
      .in('status', ACTIVE_STATUSES as unknown as string[])
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(12),
    sb
      .from('hospitals')
      .select('id, name, county, ed_capacity_pct, diversion_status, level')
      .order('level', { ascending: false })
      .order('ed_capacity_pct', { ascending: false })
      .limit(10),
    sb
      .from('incidents')
      .select('id, display_id, priority, complaint, status, lat, lng, unit_id')
      .in('status', ACTIVE_STATUSES as unknown as string[])
      .limit(200),
    sb
      .from('fleet_units')
      .select('id, type:unit_type, lat:current_lat, lng:current_lng, status')
      .in('status', ['available', 'dispatched', 'en_route', 'on_scene', 'transport'])
      .limit(300),
    sb
      .from('hospitals')
      .select('id, name, level, lat, lng, ed_capacity_pct, diversion_status')
      .limit(100),
  ]);

  const utilization =
    kpis.totalUnits > 0 ? Math.round((kpis.deployedUnits / kpis.totalUnits) * 100) : 0;
  const slaTone =
    kpis.slaCompliancePct < 70 ? 'text-p1' : kpis.slaCompliancePct < 90 ? 'text-p2' : 'text-g';

  return (
    <main className="min-h-screen bg-bg text-t1 px-6 py-5 flex flex-col gap-4">
      <AutoRefresh intervalMs={30_000} />
      <RealtimeRefresh tables={['incidents', 'fleet_units', 'dispatch_events']} />

      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 bg-p1 rounded-full animate-pulse" />
          <div>
            <div className="font-display text-2xl font-semibold text-t1 leading-none">
              SHA · NADC
            </div>
            <div className="font-mono text-[10px] text-t3 uppercase tracking-[0.3em] mt-1">
              National Ambulance Dispatch Centre · LIVE
            </div>
          </div>
        </div>
        <div className="flex items-center gap-8">
          <Metric label="SLA" value={`${kpis.slaCompliancePct}%`} tone={slaTone} />
          <Metric label="P1 active" value={kpis.p1Active} tone="text-p1" />
          <Metric label="Deployed" value={`${utilization}%`} tone="text-b2" />
          <Clock />
        </div>
      </header>

      {/* Big KPI tiles row */}
      <div className="grid grid-cols-6 gap-3">
        <BigTile label="Active incidents" value={kpis.active} accent="text-b2" />
        <BigTile label="Pending" value={kpis.pending} accent={kpis.pending > 0 ? 'text-p1' : 'text-t1'} />
        <BigTile label="In field" value={kpis.inField} accent="text-p2" />
        <BigTile label="Available units" value={kpis.availableUnits} accent="text-g" />
        <BigTile label="Cleared 24h" value={kpis.cleared24h} accent="text-g" />
        <BigTile
          label="Median dispatch"
          value={kpis.medianDispatchSecs === null ? '—' : `${kpis.medianDispatchSecs}s`}
          accent="text-t1"
        />
      </div>

      {/* Body grid */}
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* Map (centerpiece) */}
        <section className="col-span-8 flex flex-col gap-4 min-h-0">
          <div className="flex-1 min-h-0">
            <DispatchMap
              incidents={(mapIncidents ?? []).map((i) => ({
                id: i.id,
                display_id: i.display_id,
                priority: i.priority as 1 | 2 | 3 | 4,
                complaint: i.complaint,
                status: i.status,
                lat: i.lat,
                lng: i.lng,
                unit_id: i.unit_id,
              }))}
              units={(mapUnits ?? []).map((u) => ({
                id: u.id,
                type: u.type as 'ALS' | 'BLS',
                lat: u.lat,
                lng: u.lng,
                status: u.status,
              }))}
              hospitals={(mapHospitals ?? []).map((h) => ({
                id: h.id,
                name: h.name,
                level: h.level,
                lat: h.lat,
                lng: h.lng,
                ed_capacity_pct: h.ed_capacity_pct,
                diversion_status: h.diversion_status as 'open' | 'caution' | 'diverting' | 'bypass',
              }))}
              height="100%"
            />
          </div>

          {/* Bottom strip: top 4 active incidents */}
          <div className="grid grid-cols-4 gap-2 max-h-32">
            {(active ?? []).slice(0, 4).map((i) => (
              <div
                key={i.id}
                className={`border rounded-md p-2.5 ${PRIORITY_BG[i.priority] ?? 'border-line'}`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="font-semibold text-base">P{i.priority}</span>
                  <span className="text-t3">{i.display_id}</span>
                </div>
                <div className="text-t1 font-display text-sm mt-1 truncate">{i.complaint}</div>
                <div className="text-t3 font-mono text-[10px] mt-1 flex items-center gap-1.5 truncate">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[i.status] ?? 'bg-t4'}`} />
                  <span className="truncate">{i.status} · {i.zone} · {i.unit_id ?? '—'}</span>
                </div>
              </div>
            ))}
            {(active?.length ?? 0) === 0 && (
              <div className="col-span-4 text-center text-t3 font-mono py-6 border border-line rounded-md">
                Queue is clear.
              </div>
            )}
          </div>
        </section>

        {/* Right column */}
        <section className="col-span-4 grid grid-rows-2 gap-4 min-h-0">
          {/* Fleet + county */}
          <div className="border border-line rounded-lg bg-bg1 p-5 grid grid-cols-2 gap-4">
            <div>
              <h3 className="font-cond uppercase tracking-[0.2em] text-xs text-t3 mb-3">
                Fleet
              </h3>
              <BigDonut pct={utilization} />
              <div className="mt-3 space-y-1.5 text-sm">
                <FleetRow dot="bg-g" label="Avail" value={kpis.availableUnits} />
                <FleetRow dot="bg-p2" label="Deploy" value={kpis.deployedUnits} />
                <FleetRow dot="bg-t4" label="OOS" value={kpis.oosUnits} />
              </div>
            </div>
            <div>
              <h3 className="font-cond uppercase tracking-[0.2em] text-xs text-t3 mb-3">
                Counties
              </h3>
              <div className="space-y-1.5">
                {counties.slice(0, 6).map((c) => {
                  const max = counties[0]?.total ?? 1;
                  const pct = (c.total / max) * 100;
                  return (
                    <div key={c.county} className="grid grid-cols-[60px_1fr_24px] items-center gap-2 text-xs">
                      <div className="truncate text-t1">{c.county}</div>
                      <div className="h-1.5 bg-bg3 rounded-pill overflow-hidden">
                        <div className="h-full bg-b2" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="font-mono text-t2 text-right text-[11px]">{c.total}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Hospital + events */}
          <div className="border border-line rounded-lg bg-bg1 p-5 grid grid-cols-2 gap-4 overflow-hidden">
            <div className="overflow-hidden flex flex-col">
              <h3 className="font-cond uppercase tracking-[0.2em] text-xs text-t3 mb-3">
                Top hospitals
              </h3>
              <div className="space-y-1.5 overflow-hidden">
                {(hospitals ?? []).map((h) => {
                  const cap = h.ed_capacity_pct;
                  const capCls =
                    h.diversion_status !== 'open'
                      ? 'bg-p1'
                      : cap < 50
                        ? 'bg-g'
                        : cap < 75
                          ? 'bg-p3'
                          : cap < 90
                            ? 'bg-p2'
                            : 'bg-p1';
                  return (
                    <div key={h.id} className="flex items-center gap-2 text-xs">
                      <div className={`w-1.5 h-3 rounded-sm ${capCls}`} />
                      <div className="text-t1 truncate flex-1">{h.name}</div>
                      <div className="font-mono text-t3 text-[10px]">{cap}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="overflow-hidden flex flex-col">
              <h3 className="font-cond uppercase tracking-[0.2em] text-xs text-t3 mb-3">
                Activity
              </h3>
              <div className="space-y-1.5 overflow-hidden">
                {events.length === 0 && (
                  <div className="text-t3 font-mono text-xs">No recent events.</div>
                )}
                {events.slice(0, 8).map((e) => (
                  <div key={e.id} className="text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-t2">{e.event_type.replace(/_/g, ' ')}</span>
                      <span className="font-mono text-t4 text-[9px]">
                        {fmtRelative(e.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="text-right leading-none">
      <div className={`font-display text-3xl font-semibold ${tone} tabular-nums`}>{value}</div>
      <div className="font-mono text-[10px] text-t3 uppercase tracking-[0.2em] mt-1">{label}</div>
    </div>
  );
}

function BigTile({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div className="border border-line rounded-lg bg-bg1 px-4 py-3">
      <div className="font-mono text-[10px] text-t3 uppercase tracking-[0.2em]">{label}</div>
      <div className={`font-display text-4xl font-bold mt-1 tabular-nums ${accent}`}>{value}</div>
    </div>
  );
}

function FleetRow({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-pill ${dot}`} />
      <span className="text-t2 flex-1 text-xs">{label}</span>
      <span className="font-mono text-t1">{value}</span>
    </div>
  );
}

function BigDonut({ pct }: { pct: number }) {
  const bg = `conic-gradient(var(--p2) 0% ${pct}%, var(--bg3) ${pct}% 100%)`;
  return (
    <div
      className="relative w-28 h-28 rounded-full flex items-center justify-center"
      style={{ backgroundImage: bg }}
    >
      <div className="absolute inset-2 rounded-full bg-bg1 flex flex-col items-center justify-center">
        <div className="font-display text-2xl font-bold text-t1">{pct}%</div>
        <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-t3">deployed</div>
      </div>
    </div>
  );
}
