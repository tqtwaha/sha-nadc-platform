import Link from 'next/link';
import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { serviceClient } from '@/lib/supabase';
import { fmtDateTime, fmtRelative } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Compliance / SLA review surface. Lists raw dispatch_events with
// filters for event_type and actor_type. Joins agent display_name when
// available so reviewers see who did what.

const ACTOR_TONE: Record<string, 'crit' | 'warn' | 'caution' | 'ok' | 'info' | 'muted'> = {
  dispatcher: 'info',
  supervisor: 'warn',
  emt: 'ok',
  system: 'muted',
  psap: 'caution',
  provider: 'info',
};

const EVENT_TONE = (type: string): 'crit' | 'warn' | 'caution' | 'ok' | 'info' | 'muted' => {
  if (type.includes('reject') || type.includes('cancel')) return 'crit';
  if (type.includes('dispute')) return 'warn';
  if (type.includes('paid') || type.includes('approved') || type.includes('cleared')) return 'ok';
  if (type.includes('bulk') || type.includes('invoice') || type.includes('epcr')) return 'info';
  return 'muted';
};

interface PageProps {
  searchParams: Promise<{ event?: string; actor?: string; limit?: string }>;
}

export default async function AuditPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const limit = Math.min(500, Math.max(20, Number(sp.limit ?? '100')));
  const sb = serviceClient();

  let q = sb
    .from('dispatch_events')
    .select('id, event_type, event_note, actor_type, agent_id, incident_id, unit_id, created_at, payload')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (sp.event) q = q.eq('event_type', sp.event);
  if (sp.actor) q = q.eq('actor_type', sp.actor);

  const { data: events, error } = await q;
  if (error) throw error;

  // Pull distinct event types + actor types for filter chips
  const eventTypes = Array.from(new Set((events ?? []).map((e) => e.event_type))).sort();
  const actorTypes = Array.from(new Set((events ?? []).map((e) => e.actor_type))).sort();

  // Bulk-fetch agent names for any event with agent_id
  const agentIds = Array.from(
    new Set((events ?? []).map((e) => e.agent_id).filter((x): x is string => !!x)),
  );
  let agentNames = new Map<string, string>();
  if (agentIds.length > 0) {
    const { data: agents } = await sb
      .from('agents')
      .select('id, display_name')
      .in('id', agentIds);
    agentNames = new Map((agents ?? []).map((a) => [a.id, a.display_name]));
  }

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Audit"
        subtitle="Dispatch event log"
        apps={APPS}
        activeSlug="admin"
        rightSlot={
          <Chip tone="info" className="font-mono normal-case">
            {events?.length ?? 0} shown
          </Chip>
        }
      />

      <section className="flex-1 px-6 py-6 max-w-screen-2xl w-full mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link href="/admin" className="text-t3 hover:text-t1 font-mono">
            ← Admin
          </Link>
          <span className="text-t4 mx-1">·</span>
          <span className="font-mono text-t3 uppercase tracking-wider">Events:</span>
          <FilterChip current={sp.event} value="" label="all" />
          {eventTypes.map((e) => (
            <FilterChip key={e} current={sp.event} value={e} label={e} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono text-t3 uppercase tracking-wider">Actor:</span>
          <FilterChip current={sp.actor} value="" label="any" paramName="actor" />
          {actorTypes.map((a) => (
            <FilterChip key={a} current={sp.actor} value={a} label={a} paramName="actor" />
          ))}
        </div>

        <div className="border border-line rounded-lg overflow-hidden bg-bg1">
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-t3 font-cond uppercase tracking-wider text-[11px]">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold">When</th>
                <th className="text-left px-3 py-2.5 font-semibold">Event</th>
                <th className="text-left px-3 py-2.5 font-semibold">Actor</th>
                <th className="text-left px-3 py-2.5 font-semibold">Who</th>
                <th className="text-left px-3 py-2.5 font-semibold">Linked</th>
                <th className="text-left px-3 py-2.5 font-semibold">Note</th>
              </tr>
            </thead>
            <tbody>
              {(events ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-t3 font-mono text-xs">
                    No events match this filter.
                  </td>
                </tr>
              )}
              {(events ?? []).map((e) => (
                <tr key={e.id} className="border-t border-line hover:bg-bg2">
                  <td className="px-3 py-2.5 align-top text-t3 font-mono text-[11px] whitespace-nowrap">
                    {fmtDateTime(e.created_at)}
                    <div className="text-t4 text-[10px]">{fmtRelative(e.created_at)}</div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <Chip tone={EVENT_TONE(e.event_type)} className="text-[10px]">
                      {e.event_type.replace(/_/g, ' ')}
                    </Chip>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <Chip tone={ACTOR_TONE[e.actor_type] ?? 'muted'} className="text-[10px]">
                      {e.actor_type}
                    </Chip>
                  </td>
                  <td className="px-3 py-2.5 align-top text-t2 text-[12px]">
                    {e.agent_id ? agentNames.get(e.agent_id) ?? '—' : '—'}
                  </td>
                  <td className="px-3 py-2.5 align-top font-mono text-[11px]">
                    {e.incident_id && (
                      <Link
                        href={`/dispatch/${e.incident_id}`}
                        className="text-g hover:underline block"
                      >
                        inc·{e.incident_id.slice(0, 8)}
                      </Link>
                    )}
                    {e.unit_id && <div className="text-t3">{e.unit_id}</div>}
                  </td>
                  <td className="px-3 py-2.5 align-top text-t2 text-[12px]">
                    {e.event_note ?? <span className="text-t4">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-[11px] font-mono text-t3 text-right">
          Showing latest {events?.length ?? 0} of {limit} max ·{' '}
          <Link href={`/admin/audit?limit=500${sp.event ? '&event=' + sp.event : ''}${sp.actor ? '&actor=' + sp.actor : ''}`} className="text-g hover:underline">
            show 500
          </Link>
        </div>
      </section>
    </main>
  );
}

function FilterChip({
  current,
  value,
  label,
  paramName = 'event',
}: {
  current?: string;
  value: string;
  label: string;
  paramName?: string;
}) {
  const active = (current ?? '') === value;
  const href = value
    ? `/admin/audit?${paramName}=${encodeURIComponent(value)}`
    : '/admin/audit';
  return (
    <Link
      href={href}
      className={[
        'px-2.5 py-1 rounded-pill border text-[11px] font-mono',
        active ? 'bg-g/15 text-g border-g/40' : 'bg-bg1 text-t2 border-line hover:text-t1',
      ].join(' ')}
    >
      {label}
    </Link>
  );
}
