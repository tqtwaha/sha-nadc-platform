import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { serviceClient } from '@/lib/supabase';
import { fmtDateTime, fmtRelative } from '@/lib/format';
import { ACTIVE_STATUSES, type IncidentStatus } from '@/lib/incidents';
import { CrewActions } from './CrewActions';
import { RealtimeRefresh } from '@/components/RealtimeRefresh';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PRIORITY_TONE: Record<number, 'crit' | 'warn' | 'caution' | 'info'> = {
  1: 'crit',
  2: 'warn',
  3: 'caution',
  4: 'info',
};

export default async function EmtUnitPage({
  params,
  searchParams,
}: {
  params: Promise<{ unit: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { unit } = await params;
  const sp = await searchParams;
  const sb = serviceClient();

  const { data: unitRow, error: uErr } = await sb
    .from('fleet_units')
    .select('id, type, status, zone, provider_id')
    .eq('id', unit)
    .single();
  if (uErr || !unitRow) notFound();

  const { data: incidents } = await sb
    .from('incidents')
    .select('*')
    .eq('unit_id', unit)
    .in('status', ACTIVE_STATUSES as unknown as string[])
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(1);

  const inc = incidents?.[0];

  const { data: hospitals } = await sb
    .from('hospitals')
    .select('id, name, county, diversion_status, ed_capacity_pct')
    .in('diversion_status', ['open', 'caution'])
    .order('county')
    .limit(60);

  const hospitalOptions = (hospitals ?? []).map((h) => ({
    id: h.id,
    label: `${h.name} · ${h.county} · ${h.ed_capacity_pct}%`,
  }));

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title={`NADC · EMT · ${unit}`}
        subtitle={`${unitRow.type} · ${unitRow.zone}`}
        apps={APPS}
        activeSlug="emt"
        rightSlot={
          <Chip tone={inc ? 'warn' : 'ok'} className="font-mono normal-case">
            {inc ? inc.status : unitRow.status}
          </Chip>
        }
      />

      <RealtimeRefresh tables={['incidents']} />

      <section className="flex-1 px-4 py-5 max-w-2xl w-full mx-auto space-y-4">
        <Link href="/emt" className="text-xs font-mono text-t3 hover:text-t1">
          ← Switch unit
        </Link>

        {sp.error && (
          <div className="text-xs font-mono px-3 py-2 rounded-md bg-p1/10 text-p1 border border-p1/30">
            {sp.error}
          </div>
        )}

        {!inc && (
          <div className="border border-line rounded-lg bg-bg1 p-6 text-center">
            <div className="font-display text-lg text-t1">No active assignment</div>
            <div className="font-mono text-xs text-t3 mt-1">
              You are {unitRow.status}. When dispatch assigns this unit, the incident will
              appear here.
            </div>
          </div>
        )}

        {inc && (
          <>
            {/* Incident card */}
            <div className="border border-line rounded-lg bg-bg1 p-5">
              <div className="flex items-center justify-between">
                <Chip tone={PRIORITY_TONE[inc.priority] ?? 'muted'} className="text-base">
                  P{inc.priority}
                </Chip>
                <span className="font-mono text-[11px] text-t3">{inc.display_id}</span>
              </div>
              <h2 className="font-display text-xl text-t1 mt-3">{inc.complaint}</h2>
              <div className="font-mono text-[11px] text-t3 mt-1">
                {inc.icd11 && <>ICD-11 {inc.icd11} · </>}
                {inc.determinant_level}
                {inc.determinant_code && `-${inc.determinant_code}`}
                {inc.requires_als && <span className="text-p2 ml-2">ALS required</span>}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
                <Row label="Address" value={inc.address} />
                <Row label="Zone" value={`${inc.zone} · ${inc.county}`} />
                {inc.landmark && <Row label="Landmark" value={inc.landmark} />}
                <Row label="GPS" value={`${inc.lat.toFixed(5)}, ${inc.lng.toFixed(5)}`} mono />
              </div>

              {(inc.caller_name || inc.caller_phone) && (
                <div className="mt-3 pt-3 border-t border-line grid grid-cols-1 gap-2 text-sm">
                  {inc.caller_name && <Row label="Caller" value={inc.caller_name} />}
                  {inc.caller_phone && (
                    <Row label="Phone" value={inc.caller_phone} mono />
                  )}
                  {(inc.patient_age || inc.patient_sex) && (
                    <Row
                      label="Patient"
                      value={`${inc.patient_sex ?? '?'}, ${inc.patient_age ?? '?'}`}
                    />
                  )}
                </div>
              )}

              {inc.notes && (
                <div className="mt-3 pt-3 border-t border-line">
                  <div className="font-mono text-[10px] text-t3 uppercase tracking-wider mb-1">
                    Notes
                  </div>
                  <div className="text-sm text-t1 whitespace-pre-wrap">{inc.notes}</div>
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-line font-mono text-[10px] text-t3">
                Created {fmtDateTime(inc.created_at)} ({fmtRelative(inc.created_at)})
              </div>
            </div>

            {/* Actions */}
            <div className="border border-line rounded-lg bg-bg1 p-5">
              <CrewActions
                incidentId={inc.id}
                status={inc.status as IncidentStatus}
                unit={unit}
                unitType={unitRow.type as 'ALS' | 'BLS'}
                hospitalId={inc.hospital_id}
                hospitals={hospitalOptions}
              />
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="font-mono text-[10px] text-t3 uppercase tracking-wider w-20 flex-shrink-0 pt-0.5">
        {label}
      </div>
      <div
        className={['text-t1 flex-1', mono && 'font-mono text-[12px]'].filter(Boolean).join(' ')}
      >
        {value}
      </div>
    </div>
  );
}
