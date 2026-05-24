import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { getHospitalDetail } from '@/lib/hospitals';
import { fmtKes, fmtRelative, fmtDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DIVERSION_TONE: Record<string, 'crit' | 'warn' | 'caution' | 'ok'> = {
  open: 'ok',
  caution: 'caution',
  diverting: 'warn',
  bypass: 'crit',
};

const PRIORITY_TONE: Record<number, 'crit' | 'warn' | 'caution' | 'info' | 'muted'> = {
  1: 'crit',
  2: 'warn',
  3: 'caution',
  4: 'info',
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

export default async function HospitalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const h = await getHospitalDetail(id);
  if (!h) notFound();

  const cap = h.ed_capacity_pct;
  const capTone = cap < 50 ? 'bg-g' : cap < 75 ? 'bg-p3' : cap < 90 ? 'bg-p2' : 'bg-p1';

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Hospital"
        subtitle={h.name}
        apps={APPS}
        activeSlug="hospital"
        rightSlot={
          <Chip tone={DIVERSION_TONE[h.diversion_status] ?? 'info'}>
            {h.diversion_status}
          </Chip>
        }
      />

      <section className="flex-1 px-6 py-6 max-w-screen-2xl w-full mx-auto space-y-6">
        <Link href="/hospital" className="text-xs font-mono text-t3 hover:text-t1">
          ← All hospitals
        </Link>

        {/* Header */}
        <div className="border border-line rounded-lg bg-bg1 p-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-display text-2xl text-t1">{h.full_name}</div>
            <div className="font-mono text-[12px] text-t3 mt-1">
              {h.id} · {h.county} · Level {h.level}
              {h.is_national_referral ? ' · National referral' : ''}
            </div>
            {h.specialties.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {h.specialties.map((s) => (
                  <Chip key={s} tone="muted" className="text-[10px]">
                    {s}
                  </Chip>
                ))}
              </div>
            )}
          </div>
          <div className="w-48">
            <div className="font-mono text-[10px] text-t3 uppercase tracking-wider mb-1">
              ED capacity
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-bg3 rounded-pill overflow-hidden">
                <div className={`h-full ${capTone}`} style={{ width: `${cap}%` }} />
              </div>
              <span className="font-mono text-sm text-t1 w-10 text-right">{cap}%</span>
            </div>
          </div>
        </div>

        {/* Incoming + arrivals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title={`Incoming (${h.incoming.length})`}>
            {h.incoming.length === 0 ? (
              <Empty>No incidents en route to this hospital.</Empty>
            ) : (
              <div className="space-y-2">
                {h.incoming.map((i) => (
                  <IncidentRow key={i.id} i={i} />
                ))}
              </div>
            )}
          </Panel>

          <Panel title={`Recent arrivals (${h.recentArrivals.length})`}>
            {h.recentArrivals.length === 0 ? (
              <Empty>No recorded arrivals yet.</Empty>
            ) : (
              <div className="space-y-2">
                {h.recentArrivals.map((i) => (
                  <IncidentRow key={i.id} i={i} />
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Recent claims */}
        <Panel title={`Recent claims (${h.recentClaims.length})`}>
          {h.recentClaims.length === 0 ? (
            <Empty>No claims billed against this hospital yet.</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-t3 font-cond uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="text-left py-2 font-semibold">Claim #</th>
                  <th className="text-left py-2 font-semibold">Complaint</th>
                  <th className="text-left py-2 font-semibold">Status</th>
                  <th className="text-right py-2 font-semibold">Total</th>
                  <th className="text-right py-2 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {h.recentClaims.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="py-2">
                      <Link
                        href={`/claims/${c.id}`}
                        className="font-mono text-[12px] text-g hover:underline"
                      >
                        {c.claim_number}
                      </Link>
                    </td>
                    <td className="py-2 text-t1">{c.chief_complaint}</td>
                    <td className="py-2 text-t2 text-[12px]">{c.status}</td>
                    <td className="py-2 text-right font-mono font-semibold text-t1">
                      {fmtKes(c.total_kes)}
                    </td>
                    <td className="py-2 text-right text-t3 font-mono text-[11px]">
                      {fmtRelative(c.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
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

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-t3 font-mono text-xs py-3">{children}</div>;
}

function IncidentRow({
  i,
}: {
  i: {
    id: string;
    display_id: string;
    priority: number;
    complaint: string;
    status: string;
    unit_id: string | null;
    created_at: string;
    on_scene_at: string | null;
    transport_at: string | null;
  };
}) {
  const eta = etaText(i);
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-bg2 border border-line">
      <Chip tone={PRIORITY_TONE[i.priority] ?? 'muted'}>P{i.priority}</Chip>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-t3">{i.display_id}</span>
          <span className="text-t1 font-display truncate">{i.complaint}</span>
        </div>
        <div className="font-mono text-[10px] text-t3 mt-0.5">
          {STATUS_LABEL[i.status] ?? i.status}
          {i.unit_id && ` · ${i.unit_id}`}
          {eta && ` · ${eta}`}
        </div>
      </div>
      <div className="text-right text-t3 font-mono text-[10px]">{fmtDateTime(i.created_at)}</div>
    </div>
  );
}

function etaText(i: { status: string; transport_at: string | null; on_scene_at: string | null }) {
  if (i.status === 'transport' && i.transport_at) {
    const mins = Math.round((Date.now() - new Date(i.transport_at).getTime()) / 60_000);
    return `transport ${mins}m ago`;
  }
  if (i.status === 'on_scene' && i.on_scene_at) {
    const mins = Math.round((Date.now() - new Date(i.on_scene_at).getTime()) / 60_000);
    return `on scene ${mins}m`;
  }
  return null;
}
