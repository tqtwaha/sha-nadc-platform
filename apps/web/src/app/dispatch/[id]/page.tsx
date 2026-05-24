import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { serviceClient } from '@/lib/supabase';
import { fmtDateTime, fmtRelative } from '@/lib/format';
import { type IncidentStatus } from '@/lib/incidents';
import { IncidentActions } from './IncidentActions';
import { RealtimeRefresh } from '@/components/RealtimeRefresh';

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

export default async function DispatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = serviceClient();

  const { data: inc, error } = await sb
    .from('incidents')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !inc) notFound();

  const [{ data: hospitals }, { data: events }, { data: unit }] = await Promise.all([
    sb
      .from('hospitals')
      .select('id, name, county, diversion_status, ed_capacity_pct')
      .in('diversion_status', ['open', 'caution'])
      .order('county')
      .limit(60),
    sb
      .from('dispatch_events')
      .select('id, event_type, event_note, created_at, actor_type')
      .eq('incident_id', id)
      .order('created_at', { ascending: true }),
    inc.unit_id
      ? sb
          .from('fleet_units')
          .select('id, type:unit_type, provider_id, zone, status')
          .eq('id', inc.unit_id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const hospitalOptions = (hospitals ?? []).map((h) => ({
    id: h.id,
    label: `${h.name} · ${h.county} · ${h.ed_capacity_pct}% cap${h.diversion_status !== 'open' ? ` (${h.diversion_status})` : ''}`,
  }));

  const lifecycle: Array<{ label: string; at: string | null }> = [
    { label: 'Created', at: inc.created_at },
    { label: 'Dispatched', at: inc.dispatched_at },
    { label: 'En route', at: inc.en_route_at },
    { label: 'On scene', at: inc.on_scene_at },
    { label: 'Transport', at: inc.transport_at },
    { label: 'At hospital', at: inc.at_hospital_at },
    { label: inc.status === 'cancelled' ? 'Cancelled' : 'Cleared', at: inc.cleared_at },
  ];

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Incident"
        subtitle={inc.display_id}
        apps={APPS}
        activeSlug="dispatch"
        rightSlot={
          <div className="flex items-center gap-2">
            <Chip tone={PRIORITY_TONE[inc.priority] ?? 'muted'}>P{inc.priority}</Chip>
            <Chip tone={STATUS_TONE[inc.status] ?? 'muted'}>
              {STATUS_LABEL[inc.status] ?? inc.status}
            </Chip>
          </div>
        }
      />

      <RealtimeRefresh tables={['incidents', 'dispatch_events', 'fleet_units']} />

      <section className="flex-1 px-6 py-6 max-w-screen-xl w-full mx-auto space-y-6">
        <Link href="/dispatch" className="text-xs font-mono text-t3 hover:text-t1">
          ← Back to queue
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Header card */}
            <div className="border border-line rounded-lg bg-bg1 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-[11px] text-t3 uppercase tracking-wider">
                    Chief complaint
                  </div>
                  <h2 className="font-display text-xl text-t1 mt-1">{inc.complaint}</h2>
                  <div className="font-mono text-[11px] text-t3 mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {inc.icd11 && <span>ICD-11: {inc.icd11}</span>}
                    {inc.determinant_level && (
                      <span>
                        MPDS: {inc.determinant_level}
                        {inc.determinant_code ? `-${inc.determinant_code}` : ''}
                      </span>
                    )}
                    {inc.requires_als && <span className="text-p2">ALS required</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[10px] text-t3 uppercase tracking-wider">
                    Created
                  </div>
                  <div className="text-t1 text-sm font-mono">{fmtDateTime(inc.created_at)}</div>
                  <div className="text-t3 text-[11px] font-mono">{fmtRelative(inc.created_at)}</div>
                </div>
              </div>
            </div>

            {/* Location + caller */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Panel title="Location">
                <KV label="Address" value={inc.address} />
                <KV label="County / zone" value={`${inc.county} · ${inc.zone}`} />
                {inc.landmark && <KV label="Landmark" value={inc.landmark} />}
                <KV label="GPS" value={`${inc.lat.toFixed(5)}, ${inc.lng.toFixed(5)}`} mono />
              </Panel>
              <Panel title="Caller & patient">
                <KV label="Caller" value={inc.caller_name ?? '—'} />
                <KV label="Phone" value={inc.caller_phone ?? '—'} mono />
                <KV label="Relation" value={inc.caller_relation ?? '—'} />
                <KV
                  label="Patient"
                  value={
                    inc.patient_age || inc.patient_sex
                      ? `${inc.patient_sex ?? '?'}, ${inc.patient_age ?? '?'}`
                      : '—'
                  }
                />
              </Panel>
            </div>

            {/* Unit + hospital */}
            <Panel title="Assignment">
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div>
                  <div className="font-mono text-[10px] text-t3 uppercase tracking-wider">
                    Ambulance
                  </div>
                  {unit ? (
                    <>
                      <div className="font-mono text-t1 text-lg">{unit.id}</div>
                      <div className="text-t3 text-[11px] font-mono">
                        {unit.type} · {unit.zone} · {unit.status}
                      </div>
                      <div className="text-t3 text-[11px] mt-0.5">{unit.provider_id}</div>
                    </>
                  ) : (
                    <div className="text-t3 text-sm italic">No unit assigned yet</div>
                  )}
                </div>
                <div>
                  <div className="font-mono text-[10px] text-t3 uppercase tracking-wider">
                    Hospital
                  </div>
                  {inc.hospital_id ? (
                    <Link
                      href={`/hospital/${inc.hospital_id}`}
                      className="font-mono text-g text-lg hover:underline"
                    >
                      {inc.hospital_id}
                    </Link>
                  ) : (
                    <div className="text-t3 text-sm italic">Not routed</div>
                  )}
                </div>
              </div>
            </Panel>

            {inc.notes && (
              <Panel title="Notes">
                <div className="text-sm text-t1 whitespace-pre-wrap">{inc.notes}</div>
              </Panel>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <Panel title="Actions">
              <IncidentActions
                incidentId={inc.id}
                status={inc.status as IncidentStatus}
                hasUnit={!!inc.unit_id}
                hospitalId={inc.hospital_id}
                hospitals={hospitalOptions}
              />
            </Panel>

            <Panel title="Lifecycle">
              <ol className="space-y-2">
                {lifecycle.map((t) => {
                  const done = !!t.at;
                  return (
                    <li key={t.label} className="flex items-start gap-3 text-sm">
                      <div className={[
                        'w-2 h-2 mt-1.5 rounded-full',
                        done ? 'bg-g' : 'bg-line',
                      ].join(' ')} />
                      <div className="flex-1">
                        <div className={done ? 'text-t1' : 'text-t3'}>{t.label}</div>
                        <div className="text-[11px] text-t3 font-mono">
                          {t.at ? fmtDateTime(t.at) : '—'}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Panel>

            {events && events.length > 0 && (
              <Panel title={`Audit (${events.length})`}>
                <ol className="space-y-2 text-xs">
                  {events.map((e) => (
                    <li key={e.id}>
                      <div className="flex items-center gap-2">
                        <Chip tone="muted" className="text-[9px]">
                          {e.event_type}
                        </Chip>
                        <span className="text-t3 font-mono text-[10px]">
                          {fmtRelative(e.created_at)}
                        </span>
                      </div>
                      {e.event_note && (
                        <div className="text-t2 mt-1 text-[11px]">{e.event_note}</div>
                      )}
                    </li>
                  ))}
                </ol>
              </Panel>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-line rounded-lg bg-bg1 p-5">
      <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function KV({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <div className="font-mono text-[10px] text-t3 uppercase tracking-wider w-28 flex-shrink-0">
        {label}
      </div>
      <div className={['text-t1 text-sm', mono && 'font-mono text-[12px]'].filter(Boolean).join(' ')}>
        {value}
      </div>
    </div>
  );
}
