import Link from 'next/link';
import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { serviceClient } from '@/lib/supabase';
import { fmtRelative } from '@/lib/format';
import { ACTIVE_STATUSES, type IncidentStatus } from '@/lib/incidents';
import { QueueActions } from './QueueActions';
import { RealtimeRefresh } from '@/components/RealtimeRefresh';
import { DispatchMap } from '@/components/DispatchMap';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PRIORITY_TONE: Record<number, 'crit' | 'warn' | 'caution' | 'info'> = {
  1: 'crit',
  2: 'warn',
  3: 'caution',
  4: 'info',
};

const STATUS_TONE: Record<string, 'crit' | 'warn' | 'caution' | 'ok' | 'info' | 'muted'> = {
  pending: 'crit',
  dispatched: 'warn',
  en_route: 'info',
  on_scene: 'ok',
  transport: 'info',
  cleared: 'muted',
  cancelled: 'muted',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  dispatched: 'Dispatched',
  en_route: 'En route',
  on_scene: 'On scene',
  transport: 'Transport',
  cleared: 'Cleared',
  cancelled: 'Cancelled',
};

interface PageProps {
  searchParams: Promise<{ focus?: string; show?: 'active' | 'all' }>;
}

export default async function DispatchPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const show = sp.show ?? 'active';
  const sb = serviceClient();

  let q = sb
    .from('incidents')
    .select(
      'id, display_id, priority, complaint, status, county, zone, unit_id, hospital_id, address, lat, lng, created_at, dispatched_at',
    )
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });
  if (show === 'active') q = q.in('status', ACTIVE_STATUSES as unknown as string[]);
  const { data, error } = await q.limit(200);
  if (error) throw error;
  const rows = data ?? [];

  // Map markers — only active incidents that have GPS, plus all available units
  const mapIncidents = rows
    .filter((r) => ACTIVE_STATUSES.includes(r.status as (typeof ACTIVE_STATUSES)[number]))
    .map((r) => ({
      id: r.id,
      display_id: r.display_id,
      priority: r.priority as 1 | 2 | 3 | 4,
      complaint: r.complaint,
      status: r.status,
      lat: r.lat,
      lng: r.lng,
      unit_id: r.unit_id,
    }));

  const { data: mapUnits } = await sb
    .from('fleet_units')
    .select('id, type:unit_type, lat:current_lat, lng:current_lng, status')
    .in('status', ['available', 'dispatched', 'en_route', 'on_scene', 'transport'])
    .limit(300);

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Dispatch"
        subtitle="Active incident queue"
        apps={APPS}
        activeSlug="dispatch"
        rightSlot={
          <Chip
            tone={counts.pending && counts.pending > 0 ? 'crit' : 'info'}
            className="font-mono normal-case"
          >
            {counts.pending ?? 0} pending
          </Chip>
        }
      />

      <RealtimeRefresh tables={['incidents', 'fleet_units']} />

      <section className="flex-1 px-6 py-6 max-w-screen-2xl w-full mx-auto space-y-4">
        {/* Status chip strip */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Toggle current={show} value="active" label="Active only" />
          <Toggle current={show} value="all" label="All" />
          <span className="text-t4 mx-2">·</span>
          {(['pending', 'dispatched', 'en_route', 'on_scene', 'transport'] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <Chip tone={STATUS_TONE[s] ?? 'muted'}>{STATUS_LABEL[s]}</Chip>
              <span className="font-mono text-t1">{counts[s] ?? 0}</span>
            </span>
          ))}
          <div className="ml-auto">
            <Link
              href="/psap"
              className="px-3 py-1.5 rounded-md bg-g/15 hover:bg-g/25 text-g border border-g/40 font-display font-medium"
            >
              + New incident
            </Link>
          </div>
        </div>

        {/* Live map */}
        <DispatchMap
          incidents={mapIncidents}
          units={(mapUnits ?? []).map((u) => ({
            id: u.id,
            type: u.type as 'ALS' | 'BLS',
            lat: u.lat,
            lng: u.lng,
            status: u.status,
          }))}
          height="420px"
        />

        {/* Queue table */}
        <div className="border border-line rounded-lg overflow-hidden bg-bg1">
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-t3 font-cond uppercase tracking-wider text-[11px]">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold">Pri</th>
                <th className="text-left px-3 py-2.5 font-semibold">Incident</th>
                <th className="text-left px-3 py-2.5 font-semibold">Complaint</th>
                <th className="text-left px-3 py-2.5 font-semibold">Zone</th>
                <th className="text-left px-3 py-2.5 font-semibold">Status</th>
                <th className="text-left px-3 py-2.5 font-semibold">Unit</th>
                <th className="text-right px-3 py-2.5 font-semibold">Age</th>
                <th className="text-right px-3 py-2.5 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-t3 font-mono text-xs">
                    Queue is clear.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const isFocus = sp.focus === r.id;
                return (
                  <tr
                    key={r.id}
                    className={[
                      'border-t border-line transition-colors',
                      isFocus ? 'bg-g/10' : 'hover:bg-bg2',
                    ].join(' ')}
                  >
                    <td className="px-3 py-2.5">
                      <Chip tone={PRIORITY_TONE[r.priority] ?? 'muted'}>P{r.priority}</Chip>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px]">
                      <Link href={`/dispatch/${r.id}`} className="text-t1 hover:text-g">
                        {r.display_id}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-t1">{r.complaint}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-t2">
                      {r.zone}
                      <span className="text-t4 ml-1">· {r.county}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Chip tone={STATUS_TONE[r.status] ?? 'muted'}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Chip>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-t2">
                      {r.unit_id ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-t3 font-mono text-[11px]">
                      {fmtRelative(r.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <QueueActions
                        incidentId={r.id}
                        status={r.status as IncidentStatus}
                        hasUnit={!!r.unit_id}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {sp.focus && (
          <div className="text-xs font-mono text-t3">
            Focused on <span className="text-g">{sp.focus.slice(0, 8)}…</span> —{' '}
            <Link href="/dispatch" className="text-t2 hover:underline">clear focus</Link>
          </div>
        )}
      </section>
    </main>
  );
}

function Toggle({
  current,
  value,
  label,
}: {
  current: string;
  value: string;
  label: string;
}) {
  const active = current === value;
  return (
    <Link
      href={`/dispatch?show=${value}`}
      className={[
        'px-3 py-1.5 rounded-pill border text-xs font-display',
        active ? 'bg-g/15 text-g border-g/40' : 'bg-bg1 text-t2 border-line hover:text-t1',
      ].join(' ')}
    >
      {label}
    </Link>
  );
}
