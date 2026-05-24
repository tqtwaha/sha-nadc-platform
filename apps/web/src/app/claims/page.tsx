import Link from 'next/link';
import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { listClaims, statusCounts, type ClaimStatus } from '@/lib/claims';
import { fmtKes, fmtRelative } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUSES: (ClaimStatus | 'all')[] = [
  'all',
  'draft',
  'submitted',
  'approved',
  'disputed',
  'rejected',
  'pending_payment',
  'paid',
  'invoiced',
];

const STATUS_LABEL: Record<ClaimStatus | 'all', string> = {
  all: 'All',
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  disputed: 'Disputed',
  rejected: 'Rejected',
  pending_payment: 'Pending payment',
  paid: 'Paid',
  invoiced: 'Invoiced',
};

const STATUS_TONE: Record<ClaimStatus, 'crit' | 'warn' | 'caution' | 'ok' | 'info' | 'muted'> = {
  draft: 'muted',
  submitted: 'info',
  approved: 'ok',
  disputed: 'warn',
  rejected: 'crit',
  pending_payment: 'caution',
  paid: 'ok',
  invoiced: 'info',
};

interface PageProps {
  searchParams: Promise<{ status?: string; q?: string }>;
}

export default async function ClaimsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const status = (sp.status ?? 'all') as ClaimStatus | 'all';
  const search = sp.q ?? '';

  const [{ rows, total }, counts] = await Promise.all([
    listClaims({ status, search, limit: 100 }),
    statusCounts(),
  ]);

  const totalKes = rows.reduce((acc, r) => acc + r.total_kes, 0);

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Claims"
        subtitle="SHA payments"
        apps={APPS}
        activeSlug="claims"
        rightSlot={
          <Chip tone="info" className="font-mono normal-case tracking-wide">
            {total} total
          </Chip>
        }
      />

      <section className="flex-1 px-6 py-6 max-w-screen-2xl w-full mx-auto">
        {/* Status filter bar */}
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {STATUSES.map((s) => {
            const active = s === status;
            const cnt = counts[s] ?? 0;
            return (
              <Link
                key={s}
                href={{ pathname: '/claims', query: { ...(s !== 'all' ? { status: s } : {}), ...(search ? { q: search } : {}) } }}
                className={[
                  'flex items-center gap-2 px-3 py-1.5 rounded-pill border text-sm font-display font-medium',
                  active
                    ? 'bg-g/15 text-g border-g/40'
                    : 'bg-bg1 text-t2 border-line hover:bg-bg2 hover:text-t1',
                ].join(' ')}
              >
                {STATUS_LABEL[s]}
                <span
                  className={[
                    'font-mono text-[10px] px-1.5 rounded-sm',
                    active ? 'bg-g/20 text-g' : 'bg-white/[0.06] text-t3',
                  ].join(' ')}
                >
                  {cnt}
                </span>
              </Link>
            );
          })}
          <div className="ml-auto text-t3 font-mono text-[11px] tracking-wide uppercase">
            Total visible: <span className="text-t1">{fmtKes(totalKes)}</span>
          </div>
        </div>

        {/* Table */}
        <div className="border border-line rounded-lg overflow-hidden bg-bg1">
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-t3 font-cond uppercase tracking-wider text-[11px]">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Claim #</th>
                <th className="text-left px-4 py-2.5 font-semibold">Complaint</th>
                <th className="text-left px-4 py-2.5 font-semibold">Hospital</th>
                <th className="text-left px-4 py-2.5 font-semibold">Unit</th>
                <th className="text-right px-4 py-2.5 font-semibold">Distance</th>
                <th className="text-right px-4 py-2.5 font-semibold">Total</th>
                <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                <th className="text-right px-4 py-2.5 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-t3 font-mono text-xs">
                    No claims found{status !== 'all' ? ` with status "${STATUS_LABEL[status]}"` : ''}.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-line hover:bg-bg2 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-[12px] text-t1">
                    <Link href={`/claims/${r.id}`} className="hover:text-g">
                      {r.claim_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-t1">{r.chief_complaint}</td>
                  <td className="px-4 py-3 text-t2">
                    {r.hospital_name ?? '—'}
                    {r.hospital_county && (
                      <span className="text-t4 ml-1">· {r.hospital_county}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-t2">
                    {r.unit_id ?? '—'}
                    {r.tariff_type && <span className="text-t4 ml-1">· {r.tariff_type}</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[12px] text-t2">
                    {r.distance_km} km
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-t1">
                    {fmtKes(r.total_kes)}
                  </td>
                  <td className="px-4 py-3">
                    <Chip tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Chip>
                  </td>
                  <td className="px-4 py-3 text-right text-t3 font-mono text-[11px]">
                    {fmtRelative(r.created_at)}
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
