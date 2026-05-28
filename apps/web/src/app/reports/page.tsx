import Link from 'next/link';
import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { getReports } from '@/lib/reports';
import { fmtKes } from '@/lib/format';
import { RealtimeRefresh } from '@/components/RealtimeRefresh';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmtSec(s: number | null): string {
  if (s === null) return '—';
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + 'm' + (r ? ' ' + r + 's' : '');
}

const STATUS_TONE: Record<string, 'crit' | 'warn' | 'caution' | 'ok' | 'info' | 'muted'> = {
  draft: 'muted', submitted: 'info', approved: 'ok', disputed: 'warn',
  rejected: 'crit', pending_payment: 'caution', paid: 'ok', invoiced: 'info',
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const sp = await searchParams;
  const windowHours = Math.min(168, Math.max(1, Number(sp.window ?? '24')));
  const r = await getReports(windowHours);

  const maxVol = Math.max(1, ...r.volumeByHour.map((b) => b.count));

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Reports"
        subtitle="SLA + analytics"
        apps={APPS}
        activeSlug="reports"
        rightSlot={
          <div className="flex items-center gap-1.5">
            {[24, 72, 168].map((h) => (
              <Link
                key={h}
                href={`/reports?window=${h}`}
                className={[
                  'px-2.5 py-1 rounded-pill text-xs font-display border',
                  windowHours === h ? 'bg-g/15 text-g border-g/40' : 'bg-bg1 text-t2 border-line hover:text-t1',
                ].join(' ')}
              >
                {h === 24 ? '24h' : h === 72 ? '3d' : '7d'}
              </Link>
            ))}
          </div>
        }
      />

      <RealtimeRefresh tables={['incidents', 'claims', 'dispatch_events']} fallbackMs={30000} />

      <section className="flex-1 px-6 py-6 max-w-screen-2xl w-full mx-auto space-y-6">
        <Link href="/" className="text-xs font-mono text-t3 hover:text-t1">← Launchpad</Link>

        {/* Response-time headline */}
        <div>
          <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-3">
            Response times · last {windowHours}h · n={r.responseTimes.sampleN}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Dispatch p50" value={fmtSec(r.responseTimes.dispatchP50)} tone="text-g" />
            <Kpi label="Dispatch p90" value={fmtSec(r.responseTimes.dispatchP90)} tone="text-p2" />
            <Kpi label="Scene arrival p50" value={fmtSec(r.responseTimes.sceneP50)} tone="text-b2" />
            <Kpi label="Scene arrival p90" value={fmtSec(r.responseTimes.sceneP90)} tone="text-p2" />
          </div>
        </div>

        {/* SLA compliance by priority */}
        <div className="border border-line rounded-lg bg-bg1 p-5">
          <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-4">
            SLA compliance — dispatch decision within target
          </h3>
          <div className="space-y-3">
            {r.slaByPriority.map((s) => {
              const tone = s.compliancePct >= 90 ? 'bg-g' : s.compliancePct >= 70 ? 'bg-p2' : 'bg-p1';
              return (
                <div key={s.priority} className="grid grid-cols-[80px_1fr_120px] items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Chip tone={s.priority === 1 ? 'crit' : s.priority === 2 ? 'warn' : 'caution'}>
                      P{s.priority}
                    </Chip>
                    <span className="font-mono text-[10px] text-t3">≤{s.targetSec}s</span>
                  </div>
                  <div className="h-2.5 bg-bg3 rounded-pill overflow-hidden">
                    <div className={`h-full ${tone}`} style={{ width: `${s.compliancePct}%` }} />
                  </div>
                  <div className="text-right font-mono text-[12px] text-t2">
                    <span className="text-t1 font-semibold">{s.compliancePct}%</span>
                    <span className="text-t4"> · {s.metSla}/{s.total}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Volume by hour */}
        <div className="border border-line rounded-lg bg-bg1 p-5">
          <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-4">
            Incident volume by hour
          </h3>
          <div className="flex items-end gap-1 h-40">
            {r.volumeByHour.map((b, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 group">
                <div className="w-full flex flex-col justify-end" style={{ height: '100%' }}>
                  {b.p1 > 0 && (
                    <div
                      className="w-full bg-p1 rounded-t-sm"
                      style={{ height: `${(b.p1 / maxVol) * 100}%` }}
                      title={`${b.p1} P1`}
                    />
                  )}
                  <div
                    className="w-full bg-b2/70"
                    style={{ height: `${((b.count - b.p1) / maxVol) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-[8px] text-t4 group-hover:text-t2">
                  {b.hour}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] font-mono text-t3">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-p1 rounded-sm" /> P1</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-b2/70 rounded-sm" /> P2–4</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Claims by status */}
          <div className="border border-line rounded-lg bg-bg1 p-5">
            <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-4">
              Claims · {r.totals.claims} total · {fmtKes(r.totals.claimsKes)} KES
            </h3>
            {r.claimsByStatus.length === 0 ? (
              <div className="text-t3 font-mono text-xs">No claims in this window.</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {r.claimsByStatus.map((c) => (
                    <tr key={c.status} className="border-t border-line first:border-t-0">
                      <td className="py-2">
                        <Chip tone={STATUS_TONE[c.status] ?? 'muted'}>{c.status.replace('_', ' ')}</Chip>
                      </td>
                      <td className="py-2 text-right font-mono text-t1">{c.count}</td>
                      <td className="py-2 text-right font-mono text-t2 text-[12px]">{fmtKes(c.kes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-3 pt-3 border-t border-line text-xs font-mono text-t3">
              Paid + invoiced: <span className="text-g">{fmtKes(r.totals.paidKes)} KES</span>
            </div>
          </div>

          {/* Provider leaderboard */}
          <div className="border border-line rounded-lg bg-bg1 p-5">
            <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-4">
              Provider leaderboard (by runs)
            </h3>
            {r.providerPerf.length === 0 ? (
              <div className="text-t3 font-mono text-xs">No provider activity in this window.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-t3 font-cond uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="text-left py-1 font-semibold">Provider</th>
                    <th className="text-right py-1 font-semibold">Runs</th>
                    <th className="text-right py-1 font-semibold">Avg km</th>
                    <th className="text-right py-1 font-semibold">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {r.providerPerf.slice(0, 10).map((p) => (
                    <tr key={p.id} className="border-t border-line">
                      <td className="py-2">
                        <Link href={`/providers/${p.id}`} className="text-t1 hover:text-g text-[13px]">
                          {p.name}
                        </Link>
                      </td>
                      <td className="py-2 text-right font-mono text-t1">{p.runs}</td>
                      <td className="py-2 text-right font-mono text-t2 text-[12px]">{p.avgDistanceKm}</td>
                      <td className="py-2 text-right font-mono text-g text-[12px]">{fmtKes(p.revenueKes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Incidents" value={String(r.totals.incidents)} tone="text-b2" />
          <Kpi label="Active" value={String(r.totals.active)} tone="text-p2" />
          <Kpi label="Cleared" value={String(r.totals.cleared)} tone="text-g" />
          <Kpi label="Cancelled" value={String(r.totals.cancelled)} tone="text-t3" />
          <Kpi label="Claims KES" value={fmtKes(r.totals.claimsKes)} tone="text-g" mono />
        </div>
      </section>
    </main>
  );
}

function Kpi({ label, value, tone, mono = false }: { label: string; value: string; tone: string; mono?: boolean }) {
  return (
    <div className="border border-line rounded-lg bg-bg1 px-4 py-3">
      <div className="font-mono text-[10px] text-t3 uppercase tracking-wider">{label}</div>
      <div className={['font-display font-bold mt-1 tabular-nums', mono ? 'text-lg font-mono' : 'text-2xl', tone].join(' ')}>
        {value}
      </div>
    </div>
  );
}
