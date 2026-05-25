import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { getProviderDetail } from '@/lib/provider-detail';
import { fmtKes, fmtRelative, fmtDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UNIT_STATUS_TONE: Record<string, 'crit' | 'warn' | 'caution' | 'ok' | 'info' | 'muted'> = {
  available: 'ok',
  dispatched: 'warn',
  en_route: 'info',
  on_scene: 'caution',
  transport: 'info',
  off_duty: 'muted',
  maintenance: 'muted',
  standby: 'muted',
};

const CLAIM_STATUS_TONE: Record<string, 'crit' | 'warn' | 'caution' | 'ok' | 'info' | 'muted'> = {
  draft: 'muted',
  submitted: 'info',
  approved: 'ok',
  disputed: 'warn',
  rejected: 'crit',
  pending_payment: 'caution',
  paid: 'ok',
  invoiced: 'info',
};

export default async function ProviderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await getProviderDetail(id);
  if (!p) notFound();

  const m = p.metrics;
  const utilization = m.totalUnits > 0 ? Math.round((m.deployedUnits / m.totalUnits) * 100) : 0;

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Provider"
        subtitle={p.name}
        apps={APPS}
        activeSlug="providers"
        rightSlot={
          <Chip tone="info" className="font-mono normal-case">
            {p.id}
          </Chip>
        }
      />

      <section className="flex-1 px-6 py-6 max-w-screen-2xl w-full mx-auto space-y-6">
        <Link href="/providers" className="text-xs font-mono text-t3 hover:text-t1">
          ← All providers
        </Link>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Kpi label="Fleet" value={m.totalUnits} tone="text-t1" />
          <Kpi label="ALS / BLS" value={`${m.alsUnits} / ${m.blsUnits}`} tone="text-t1" small />
          <Kpi label="Available" value={m.availableUnits} tone="text-g" />
          <Kpi label="Deployed" value={`${utilization}%`} tone="text-p2" />
          <Kpi label="Runs 7d" value={m.runsLast7d} tone="text-b2" />
          <Kpi label="Avg km" value={m.avgDistanceKm} tone="text-t1" />
          <Kpi
            label="Revenue 30d"
            value={fmtKes(m.revenueLast30d)}
            tone="text-g"
            mono
          />
        </div>

        {/* Fleet roster table */}
        <div className="border border-line rounded-lg overflow-hidden bg-bg1">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3">
              Fleet roster
            </h3>
            <div className="text-xs font-mono text-t3">
              {m.availableUnits} avail · {m.deployedUnits} deployed · {m.offDutyUnits} off
            </div>
          </div>
          {p.units.length === 0 && (
            <div className="px-4 py-12 text-center text-t3 font-mono text-xs">
              No units in this fleet yet.
            </div>
          )}
          {p.units.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-bg2 text-t3 font-cond uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Unit</th>
                  <th className="text-left px-3 py-2 font-semibold">Type</th>
                  <th className="text-left px-3 py-2 font-semibold">Zone</th>
                  <th className="text-left px-3 py-2 font-semibold">Status</th>
                  <th className="text-left px-3 py-2 font-semibold">Crew</th>
                  <th className="text-left px-3 py-2 font-semibold">Fuel</th>
                  <th className="text-left px-3 py-2 font-semibold">Active call</th>
                  <th className="text-right px-3 py-2 font-semibold">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {p.units.map((u) => (
                  <tr key={u.id} className="border-t border-line hover:bg-bg2">
                    <td className="px-3 py-2.5">
                      <Link href={`/emt/${u.id}`} className="font-mono text-[12px] text-t1 hover:text-g">
                        {u.id}
                      </Link>
                      {u.anomaly && (
                        <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-p2 align-middle" title="Anomaly flagged" />
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Chip tone={u.type === 'ALS' ? 'crit' : 'info'}>{u.type}</Chip>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[12px] text-t2">
                      {u.zone}
                      <span className="text-t4 ml-1">· {u.county}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Chip tone={UNIT_STATUS_TONE[u.status] ?? 'muted'}>
                        {u.status.replace('_', ' ')}
                      </Chip>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[12px] text-t2">{u.crew_count}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-bg3 rounded-pill overflow-hidden">
                          <div
                            className={`h-full ${u.fuel_pct < 25 ? 'bg-p1' : u.fuel_pct < 50 ? 'bg-p2' : 'bg-g'}`}
                            style={{ width: `${u.fuel_pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] text-t2">{u.fuel_pct}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px]">
                      {u.current_incident_id ? (
                        <Link
                          href={`/dispatch/${u.current_incident_id}`}
                          className="text-g hover:underline"
                        >
                          inc·{u.current_incident_id.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-t4">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-t3 font-mono text-[11px]">
                      {fmtRelative(u.last_seen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent claims + invoicing summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 border border-line rounded-lg overflow-hidden bg-bg1">
            <div className="px-4 py-3 border-b border-line flex items-center justify-between">
              <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3">
                Recent claims ({p.recentClaims.length})
              </h3>
              <div className="text-xs font-mono text-t3">
                {m.paidClaims} paid · {m.pendingClaims} in workflow
              </div>
            </div>
            {p.recentClaims.length === 0 ? (
              <div className="px-4 py-10 text-center text-t3 font-mono text-xs">
                No claims billed against this provider yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-t3 font-cond uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Claim #</th>
                    <th className="text-left px-3 py-2 font-semibold">Complaint</th>
                    <th className="text-left px-3 py-2 font-semibold">Type</th>
                    <th className="text-right px-3 py-2 font-semibold">km</th>
                    <th className="text-right px-3 py-2 font-semibold">KES</th>
                    <th className="text-left px-3 py-2 font-semibold">Status</th>
                    <th className="text-right px-3 py-2 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {p.recentClaims.map((c) => (
                    <tr key={c.id} className="border-t border-line hover:bg-bg2">
                      <td className="px-3 py-2 font-mono text-[12px]">
                        <Link href={`/claims/${c.id}`} className="text-g hover:underline">
                          {c.claim_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-t1 text-sm truncate max-w-[180px]">
                        {c.chief_complaint}
                      </td>
                      <td className="px-3 py-2 text-t2 font-mono text-[11px]">{c.tariff_type}</td>
                      <td className="px-3 py-2 text-right font-mono text-t2 text-[11px]">
                        {c.distance_km}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-t1">
                        {fmtKes(c.total_kes)}
                      </td>
                      <td className="px-3 py-2">
                        <Chip tone={CLAIM_STATUS_TONE[c.status] ?? 'muted'} className="text-[10px]">
                          {c.status.replace('_', ' ')}
                        </Chip>
                      </td>
                      <td className="px-3 py-2 text-right text-t3 font-mono text-[10px]">
                        {fmtRelative(c.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Invoicing summary */}
          <div className="border border-line rounded-lg bg-bg1 p-5">
            <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-4">
              Invoicing summary
            </h3>
            <div className="space-y-3 text-sm">
              <Row label="Lifetime claims" value={String(m.lifetimeClaims)} />
              <Row label="Paid / invoiced" value={String(m.paidClaims)} />
              <Row label="In workflow" value={String(m.pendingClaims)} />
              <div className="pt-3 border-t border-line">
                <div className="text-xs font-mono text-t3 uppercase tracking-wider">
                  Revenue (last 30 days)
                </div>
                <div className="font-mono text-2xl font-semibold text-g mt-1 tabular-nums">
                  KES {fmtKes(m.revenueLast30d)}
                </div>
              </div>
              <div>
                <div className="text-xs font-mono text-t3 uppercase tracking-wider">
                  Revenue (lifetime)
                </div>
                <div className="font-mono text-xl text-t1 mt-1 tabular-nums">
                  KES {fmtKes(m.revenueLifetime)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[11px] font-mono text-t3 text-center pt-6 border-t border-line">
          Provider snapshot at {fmtDateTime(new Date().toISOString())} ·
          {' '}provider id <span className="text-t1">{p.id}</span>
        </p>
      </section>
    </main>
  );
}

function Kpi({
  label,
  value,
  tone,
  mono = false,
  small = false,
}: {
  label: string;
  value: string | number;
  tone: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="border border-line rounded-lg bg-bg1 px-4 py-3">
      <div className="font-mono text-[10px] text-t3 uppercase tracking-wider">{label}</div>
      <div
        className={[
          'font-display font-bold mt-1 tabular-nums',
          small ? 'text-lg' : 'text-2xl',
          mono ? 'font-mono text-lg' : '',
          tone,
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-t2">{label}</span>
      <span className="font-mono text-t1">{value}</span>
    </div>
  );
}
