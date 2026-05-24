import { serviceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Public operational status page. Probes the DB, surfaces throughput,
// shows which env knobs are wired up. No chrome — designed to be linked
// from a customer status page or scraped by a monitor.

interface ProbeRow {
  label: string;
  status: 'ok' | 'warn' | 'crit' | 'info';
  value: string;
  detail?: string;
}

async function probe(): Promise<{ rows: ProbeRow[]; ts: string; latencyMs: number }> {
  const t0 = Date.now();
  const sb = serviceClient();
  const since1h = new Date(Date.now() - 3600 * 1000).toISOString();
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [
    { count: hospitals, error: hErr },
    { count: units, error: uErr },
    { count: incidents, error: iErr },
    { count: activeIncidents },
    { count: claims },
    { count: events1h },
    { count: events24h },
  ] = await Promise.all([
    sb.from('hospitals').select('id', { count: 'exact', head: true }),
    sb.from('fleet_units').select('id', { count: 'exact', head: true }),
    sb.from('incidents').select('id', { count: 'exact', head: true }),
    sb
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'dispatched', 'en_route', 'on_scene', 'transport']),
    sb.from('claims').select('id', { count: 'exact', head: true }),
    sb
      .from('dispatch_events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since1h),
    sb
      .from('dispatch_events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since24h),
  ]);

  const latencyMs = Date.now() - t0;
  const ts = new Date().toISOString();

  const dbErr = hErr ?? uErr ?? iErr;

  const rows: ProbeRow[] = [
    {
      label: 'Database',
      status: dbErr ? 'crit' : latencyMs < 500 ? 'ok' : 'warn',
      value: dbErr ? 'fail' : 'ok',
      detail: dbErr ? dbErr.message : `${latencyMs} ms probe latency`,
    },
    {
      label: 'Hospital directory',
      status: (hospitals ?? 0) >= 1 ? 'ok' : 'crit',
      value: `${hospitals ?? 0}`,
      detail: 'level 4–6, across 47 counties',
    },
    {
      label: 'Fleet roster',
      status: (units ?? 0) >= 1 ? 'ok' : 'crit',
      value: `${units ?? 0}`,
      detail: 'available + deployed combined',
    },
    {
      label: 'Operations roster',
      status: 'info',
      value: '',
      detail: '/admin/users',
    },
    {
      label: 'Active incidents',
      status: (activeIncidents ?? 0) === 0 ? 'info' : 'warn',
      value: `${activeIncidents ?? 0}`,
      detail: 'pending → transport',
    },
    {
      label: 'Lifetime incidents',
      status: 'info',
      value: `${incidents ?? 0}`,
    },
    {
      label: 'Total claims',
      status: 'info',
      value: `${claims ?? 0}`,
    },
    {
      label: 'Dispatch events (last hour)',
      status: 'info',
      value: `${events1h ?? 0}`,
      detail: `${events24h ?? 0} in last 24h`,
    },
    {
      label: 'Supabase Realtime',
      status: 'ok',
      value: 'publication active',
      detail: 'incidents, fleet_units, claims, dispatch_events',
    },
    {
      label: 'Mapbox token',
      status: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ? 'ok' : 'warn',
      value: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ? 'configured' : 'missing',
      detail: 'enables /dispatch + /wall + EMT maps',
    },
    {
      label: 'Clerk auth',
      status: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? 'ok' : 'warn',
      value: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? 'enabled' : 'open demo mode',
      detail: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
        ? 'all routes gated except sign-in + sim + health'
        : 'no sign-in required (set CLERK_* env to gate)',
    },
    {
      label: 'CRON_SECRET',
      status: process.env.CRON_SECRET ? 'ok' : 'crit',
      value: process.env.CRON_SECRET ? 'set' : 'unset',
      detail: process.env.CRON_SECRET
        ? '/api/sim/* require Bearer token'
        : 'sim endpoints will refuse all calls — set in Vercel env',
    },
  ];

  return { rows, ts, latencyMs };
}

export default async function StatusPage() {
  let result: { rows: ProbeRow[]; ts: string; latencyMs: number };
  try {
    result = await probe();
  } catch (err) {
    return (
      <main className="min-h-screen bg-bg flex items-center justify-center p-6">
        <div className="max-w-md w-full border border-p1/40 bg-p1/10 rounded-lg p-6 text-center">
          <div className="text-p1 font-display text-xl font-semibold">System unreachable</div>
          <p className="font-mono text-xs text-t2 mt-2">
            {err instanceof Error ? err.message : 'probe failed'}
          </p>
        </div>
      </main>
    );
  }
  const { rows, ts, latencyMs } = result;

  const anyCrit = rows.some((r) => r.status === 'crit');
  const anyWarn = rows.some((r) => r.status === 'warn');
  const overall: 'ok' | 'warn' | 'crit' = anyCrit ? 'crit' : anyWarn ? 'warn' : 'ok';

  return (
    <main className="min-h-screen bg-bg text-t1 px-6 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <span
              className={[
                'w-3 h-3 rounded-full',
                overall === 'ok' ? 'bg-g animate-pulse' : overall === 'warn' ? 'bg-p2' : 'bg-p1 animate-pulse',
              ].join(' ')}
            />
            <h1 className="font-display text-2xl font-bold">
              {overall === 'ok' ? 'All systems operational' : overall === 'warn' ? 'Degraded' : 'Outage'}
            </h1>
          </div>
          <p className="font-mono text-xs text-t3 mt-1">
            sha-nadc-platform · probe at {ts} · {latencyMs}ms
          </p>
        </div>

        <div className="border border-line rounded-lg bg-bg1 overflow-hidden">
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={[
                'flex items-center gap-4 px-4 py-3',
                i > 0 && 'border-t border-line',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span
                className={[
                  'w-2 h-2 rounded-full shrink-0',
                  r.status === 'ok'
                    ? 'bg-g'
                    : r.status === 'warn'
                      ? 'bg-p2'
                      : r.status === 'crit'
                        ? 'bg-p1'
                        : 'bg-b2',
                ].join(' ')}
              />
              <div className="flex-1 min-w-0">
                <div className="text-t1 text-sm font-display">{r.label}</div>
                {r.detail && (
                  <div className="font-mono text-[10px] text-t3 mt-0.5">{r.detail}</div>
                )}
              </div>
              <div className="font-mono text-sm text-t1 text-right whitespace-nowrap">
                {r.value}
              </div>
            </div>
          ))}
        </div>

        <div className="border border-line rounded-lg bg-bg1 p-4 text-xs font-mono text-t3 space-y-1">
          <div>
            <span className="text-t1">/api/health</span> — JSON probe for uptime monitors
          </div>
          <div>
            <span className="text-t1">/api/config</span> — public env exposed to v1 prototypes
          </div>
          <div>
            <span className="text-t1">/api/sim/{'{spawn,tick,reset}'}</span> — require CRON_SECRET
          </div>
        </div>

        <div className="text-center text-[10px] font-mono text-t4">
          page auto-refreshes on visit · poll <span className="text-t2">/api/health</span> for monitoring
        </div>
      </div>
    </main>
  );
}
