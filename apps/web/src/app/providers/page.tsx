import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { listProviders } from '@/lib/providers';
import { fmtKes } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ProvidersPage() {
  const rows = await listProviders();
  const totals = rows.reduce(
    (acc, r) => ({
      units: acc.units + r.totalUnits,
      claims: acc.claims + r.totalClaims,
      paid: acc.paid + r.totalKesPaid,
      pending: acc.pending + r.totalKesPending,
    }),
    { units: 0, claims: 0, paid: 0, pending: 0 },
  );

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Providers"
        subtitle="SHA-contracted ambulance operators"
        apps={APPS}
        activeSlug="providers"
        rightSlot={
          <Chip tone="info" className="font-mono normal-case">
            {rows.length} contracted
          </Chip>
        }
      />

      <section className="flex-1 px-6 py-6 max-w-screen-2xl w-full mx-auto space-y-6">
        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Fleet units" value={String(totals.units)} />
          <Kpi label="Lifetime claims" value={String(totals.claims)} />
          <Kpi label="Paid KES" value={fmtKes(totals.paid)} />
          <Kpi label="Pending KES" value={fmtKes(totals.pending)} tone="warn" />
        </div>

        {/* Table */}
        <div className="border border-line rounded-lg overflow-hidden bg-bg1">
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-t3 font-cond uppercase tracking-wider text-[11px]">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Provider</th>
                <th className="text-right px-4 py-2.5 font-semibold">Units</th>
                <th className="text-right px-4 py-2.5 font-semibold">ALS / BLS</th>
                <th className="text-right px-4 py-2.5 font-semibold">Active</th>
                <th className="text-right px-4 py-2.5 font-semibold">Claims</th>
                <th className="text-right px-4 py-2.5 font-semibold">Paid (KES)</th>
                <th className="text-right px-4 py-2.5 font-semibold">Pending (KES)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-bg2">
                  <td className="px-4 py-3">
                    <div className="text-t1 font-display font-medium">{r.name}</div>
                    <div className="text-t3 font-mono text-[10px]">{r.id}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-t1">{r.totalUnits}</td>
                  <td className="px-4 py-3 text-right font-mono text-[12px] text-t2">
                    <span className="text-g">{r.alsUnits}</span>
                    <span className="text-t4 mx-1">/</span>
                    <span className="text-b2">{r.blsUnits}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[12px] text-t2">
                    {r.activeUnits}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-t2">
                    {r.totalClaims}
                    {r.paidClaims > 0 && (
                      <span className="text-t4 ml-1 text-[11px]">({r.paidClaims} paid)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-t1">
                    {fmtKes(r.totalKesPaid)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-p2">
                    {r.totalKesPending > 0 ? fmtKes(r.totalKesPending) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Kpi({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warn' }) {
  return (
    <div className="border border-line rounded-lg bg-bg1 px-4 py-3">
      <div className="font-mono text-[10px] text-t3 uppercase tracking-wider">{label}</div>
      <div
        className={[
          'font-display text-2xl font-semibold mt-1',
          tone === 'warn' ? 'text-p2' : 'text-t1',
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  );
}
