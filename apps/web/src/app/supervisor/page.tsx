import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import {
  getKpis,
  incidentsByCounty,
  recentEvents,
  dispatcherPerformance,
} from '@/lib/supervisor';
import { fmtRelative } from '@/lib/format';
import { RealtimeRefresh } from '@/components/RealtimeRefresh';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SupervisorPage() {
  const [kpis, counties, events, perf] = await Promise.all([
    getKpis(),
    incidentsByCounty(8),
    recentEvents(20),
    dispatcherPerformance(),
  ]);

  const utilization =
    kpis.totalUnits > 0 ? Math.round((kpis.deployedUnits / kpis.totalUnits) * 100) : 0;
  const slaTone: 'crit' | 'warn' | 'ok' =
    kpis.slaCompliancePct < 70 ? 'crit' : kpis.slaCompliancePct < 90 ? 'warn' : 'ok';

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Supervisor"
        subtitle="Floor analytics"
        apps={APPS}
        activeSlug="supervisor"
        rightSlot={
          <Chip tone={slaTone} className="font-mono normal-case">
            SLA {kpis.slaCompliancePct}%
          </Chip>
        }
      />

      <RealtimeRefresh tables={['incidents', 'fleet_units', 'dispatch_events']} />

      <section className="flex-1 px-6 py-6 max-w-screen-2xl w-full mx-auto space-y-6">
        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <Kpi label="Active" value={kpis.active} tone="info" />
          <Kpi label="P1 active" value={kpis.p1Active} tone={kpis.p1Active > 0 ? 'crit' : 'muted'} />
          <Kpi label="P2 active" value={kpis.p2Active} tone="warn" />
          <Kpi label="P3-4 active" value={kpis.p34Active} tone="caution" />
          <Kpi label="Pending" value={kpis.pending} tone={kpis.pending > 0 ? 'warn' : 'ok'} />
          <Kpi label="In field" value={kpis.inField} tone="info" />
          <Kpi label="Cleared 24h" value={kpis.cleared24h} tone="ok" />
          <Kpi
            label="Median dispatch"
            value={kpis.medianDispatchSecs === null ? '—' : `${kpis.medianDispatchSecs}s`}
            tone="muted"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Fleet utilization */}
          <div className="border border-line rounded-lg bg-bg1 p-5">
            <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-4">
              Fleet utilization
            </h3>
            <div className="flex items-center gap-4">
              <Donut pct={utilization} />
              <div className="flex-1 space-y-2 text-sm">
                <Row dot="bg-g" label="Available" value={kpis.availableUnits} />
                <Row dot="bg-p2" label="Deployed" value={kpis.deployedUnits} />
                <Row dot="bg-t4" label="Out of service" value={kpis.oosUnits} />
                <div className="pt-2 border-t border-line text-xs font-mono text-t3">
                  Total {kpis.totalUnits}
                </div>
              </div>
            </div>
          </div>

          {/* County distribution */}
          <div className="border border-line rounded-lg bg-bg1 p-5 lg:col-span-2">
            <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-4">
              Incidents by county
            </h3>
            <div className="space-y-2">
              {counties.length === 0 && (
                <div className="text-t3 font-mono text-xs">No incidents yet.</div>
              )}
              {counties.map((c) => {
                const max = counties[0]?.total ?? 1;
                const pct = Math.round((c.total / max) * 100);
                const p1Pct = (c.p1 / c.total) * 100;
                const p2Pct = (c.p2 / c.total) * 100;
                return (
                  <div key={c.county} className="grid grid-cols-[120px_1fr_auto] items-center gap-3">
                    <div className="text-t1 font-display text-sm truncate">{c.county}</div>
                    <div className="h-2 bg-bg3 rounded-pill overflow-hidden relative" style={{ width: `${pct}%` }}>
                      <div className="absolute inset-0 flex">
                        <div className="bg-p1 h-full" style={{ width: `${p1Pct}%` }} />
                        <div className="bg-p2 h-full" style={{ width: `${p2Pct}%` }} />
                        <div className="bg-b2 h-full flex-1" />
                      </div>
                    </div>
                    <div className="text-t2 font-mono text-[11px]">
                      {c.total}
                      <span className="text-p1 ml-1">{c.p1}</span>
                      <span className="text-p2 ml-1">{c.p2}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Dispatcher performance */}
          <div className="border border-line rounded-lg bg-bg1 p-5 lg:col-span-2">
            <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-4">
              Dispatcher performance
            </h3>
            {perf.length === 0 ? (
              <div className="text-t3 font-mono text-xs">
                No dispatcher-attributed incidents yet (all sim incidents are unassigned to a
                specific dispatcher).
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-t3 font-cond uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="text-left py-2 font-semibold">Dispatcher</th>
                    <th className="text-right py-2 font-semibold">Handled</th>
                    <th className="text-right py-2 font-semibold">P1 handled</th>
                    <th className="text-right py-2 font-semibold">Avg dispatch</th>
                  </tr>
                </thead>
                <tbody>
                  {perf.map((p) => (
                    <tr key={p.dispatcher_id} className="border-t border-line">
                      <td className="py-2 text-t1 font-display">{p.display_name}</td>
                      <td className="py-2 text-right font-mono text-t1">{p.handled}</td>
                      <td className="py-2 text-right font-mono text-p1">{p.p1_handled}</td>
                      <td className="py-2 text-right font-mono text-t2">
                        {p.avg_dispatch_secs === null ? '—' : `${p.avg_dispatch_secs}s`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Recent events feed */}
          <div className="border border-line rounded-lg bg-bg1 p-5">
            <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-4">
              Activity feed
            </h3>
            {events.length === 0 ? (
              <div className="text-t3 font-mono text-xs">
                No events recorded. Workflow actions in /claims write here.
              </div>
            ) : (
              <ol className="space-y-3">
                {events.map((e) => (
                  <li key={e.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      <Chip tone={tonefor(e.event_type)}>{e.event_type.replace(/_/g, ' ')}</Chip>
                      <span className="text-t3 font-mono text-[10px]">
                        {fmtRelative(e.created_at)}
                      </span>
                    </div>
                    {e.event_note && (
                      <div className="text-t2 mt-1 ml-1 text-[12px]">{e.event_note}</div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function tonefor(eventType: string): 'crit' | 'warn' | 'caution' | 'ok' | 'info' | 'muted' {
  if (eventType.includes('reject') || eventType.includes('cancel')) return 'crit';
  if (eventType.includes('dispute')) return 'warn';
  if (eventType.includes('paid') || eventType.includes('approved') || eventType.includes('cleared'))
    return 'ok';
  if (eventType.includes('bulk') || eventType.includes('invoice')) return 'info';
  return 'muted';
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: 'crit' | 'warn' | 'caution' | 'ok' | 'info' | 'muted';
}) {
  const toneClass = {
    crit: 'text-p1',
    warn: 'text-p2',
    caution: 'text-p3',
    ok: 'text-g',
    info: 'text-b2',
    muted: 'text-t1',
  }[tone];
  return (
    <div className="border border-line rounded-lg bg-bg1 px-3 py-3">
      <div className="font-mono text-[10px] text-t3 uppercase tracking-wider truncate">
        {label}
      </div>
      <div className={`font-display text-2xl font-semibold mt-0.5 ${toneClass}`}>{value}</div>
    </div>
  );
}

function Row({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-pill ${dot}`} />
      <span className="text-t2 flex-1">{label}</span>
      <span className="font-mono text-t1">{value}</span>
    </div>
  );
}

function Donut({ pct }: { pct: number }) {
  // CSS conic-gradient donut — no svg, no library.
  const bg = `conic-gradient(var(--g) 0% ${pct}%, var(--bg3) ${pct}% 100%)`;
  return (
    <div
      className="relative w-24 h-24 rounded-full flex items-center justify-center"
      style={{ backgroundImage: bg }}
    >
      <div className="absolute inset-2 rounded-full bg-bg1 flex flex-col items-center justify-center">
        <div className="font-display text-xl font-semibold text-t1">{pct}%</div>
        <div className="font-mono text-[9px] uppercase tracking-wider text-t3">deployed</div>
      </div>
    </div>
  );
}
