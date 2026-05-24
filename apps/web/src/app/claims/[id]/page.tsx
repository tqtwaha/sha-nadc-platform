import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { getClaim, type ClaimStatus } from '@/lib/claims';
import { fmtKes, fmtDateTime } from '@/lib/format';
import { ClaimActions } from './ClaimActions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUS_LABEL: Record<ClaimStatus, string> = {
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
  params: Promise<{ id: string }>;
}

export default async function ClaimDetailPage({ params }: PageProps) {
  const { id } = await params;
  const claim = await getClaim(id);
  if (!claim) notFound();

  const chargeableKm = Math.max(0, claim.distance_km - claim.free_km);
  const perKmTotal = Math.round(chargeableKm * claim.per_km_kes);

  const timeline: Array<{ label: string; at: string | null; tone: 'ok' | 'info' | 'muted' }> = [
    { label: 'Created', at: claim.created_at, tone: 'info' },
    { label: 'Submitted to SHA', at: claim.submitted_at, tone: 'info' },
    { label: 'Approved', at: claim.approved_at, tone: 'ok' },
    { label: 'Paid (M-Pesa)', at: claim.paid_at, tone: 'ok' },
    {
      label: claim.invoice_number ? `Invoiced · ${claim.invoice_number}` : 'Invoiced',
      at: claim.invoice_number ? claim.updated_at : null,
      tone: 'ok',
    },
  ];

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Claim"
        subtitle={claim.claim_number}
        apps={APPS}
        activeSlug="claims"
        rightSlot={<Chip tone={STATUS_TONE[claim.status]}>{STATUS_LABEL[claim.status]}</Chip>}
      />

      <section className="flex-1 px-6 py-6 max-w-screen-xl w-full mx-auto space-y-6">
        <Link href="/claims" className="text-xs font-mono text-t3 hover:text-t1">
          ← Back to claims
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: claim facts + pricing */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header card */}
            <div className="border border-line rounded-lg bg-bg1 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-[11px] text-t3 uppercase tracking-wider">
                    Chief complaint
                  </div>
                  <h2 className="font-display text-xl text-t1 mt-1">{claim.chief_complaint}</h2>
                  {claim.icd11 && (
                    <div className="font-mono text-[11px] text-t3 mt-1">
                      ICD-11: {claim.icd11}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-mono text-[11px] text-t3 uppercase tracking-wider">
                    Total
                  </div>
                  <div className="font-mono text-2xl text-t1 font-semibold">
                    {fmtKes(claim.total_kes)}
                  </div>
                  <div className="font-mono text-[10px] text-t3 mt-0.5">KES</div>
                </div>
              </div>
            </div>

            {/* Tariff breakdown */}
            <div className="border border-line rounded-lg bg-bg1 p-5">
              <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-3">
                Tariff breakdown · SHIF {claim.tariff_type}
              </h3>
              <table className="w-full text-sm">
                <tbody>
                  <RowKV
                    label={`Base fare (${claim.tariff_type})`}
                    value={fmtKes(claim.base_kes)}
                  />
                  <RowKV
                    label={`Distance · ${claim.distance_km} km (first ${claim.free_km} km free)`}
                    value={`${chargeableKm.toFixed(2)} km × KES ${claim.per_km_kes}`}
                  />
                  <RowKV label="Distance charge" value={fmtKes(perKmTotal)} />
                  <RowKV label="Consumables" value={fmtKes(claim.consumables_kes)} />
                  <RowKV label="Total" value={fmtKes(claim.total_kes)} bold />
                </tbody>
              </table>
            </div>

            {/* Linked entities */}
            <div className="border border-line rounded-lg bg-bg1 p-5">
              <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-3">
                Linked records
              </h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Field
                  label="Receiving hospital"
                  value={
                    claim.hospital_name ? (
                      <>
                        {claim.hospital_name}
                        {claim.hospital_county && (
                          <span className="text-t3 ml-1">· {claim.hospital_county}</span>
                        )}
                      </>
                    ) : (
                      '—'
                    )
                  }
                />
                <Field label="Ambulance unit" value={claim.unit_id ?? '—'} mono />
                <Field label="Provider ID" value={claim.provider_id ?? '—'} mono />
                <Field
                  label="Incident"
                  value={
                    claim.incident_id ? (
                      <Link
                        href={`/dispatch?incident=${claim.incident_id}`}
                        className="text-g hover:underline font-mono text-[12px]"
                      >
                        {claim.incident_id.slice(0, 8)}…
                      </Link>
                    ) : (
                      '—'
                    )
                  }
                />
                <Field label="M-Pesa reference" value={claim.mpesa_ref ?? '—'} mono />
                <Field label="KRA invoice" value={claim.invoice_number ?? '—'} mono />
              </dl>
              {claim.notes && (
                <div className="mt-4 pt-4 border-t border-line">
                  <div className="font-mono text-[11px] text-t3 uppercase tracking-wider mb-1">
                    Notes
                  </div>
                  <div className="text-t1 text-sm whitespace-pre-wrap">{claim.notes}</div>
                </div>
              )}
            </div>
          </div>

          {/* Right: actions + timeline */}
          <div className="space-y-6">
            <div className="border border-line rounded-lg bg-bg1 p-5">
              <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-3">
                Actions
              </h3>
              <ClaimActions id={claim.id} status={claim.status} />
            </div>

            <div className="border border-line rounded-lg bg-bg1 p-5">
              <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-3">
                Timeline
              </h3>
              <ol className="space-y-3">
                {timeline.map((t) => {
                  const done = !!t.at;
                  return (
                    <li key={t.label} className="flex items-start gap-3">
                      <div
                        className={[
                          'w-2 h-2 mt-1.5 rounded-full',
                          done ? 'bg-g' : 'bg-line',
                        ].join(' ')}
                      />
                      <div className="flex-1">
                        <div
                          className={[
                            'text-sm font-display',
                            done ? 'text-t1' : 'text-t3',
                          ].join(' ')}
                        >
                          {t.label}
                        </div>
                        <div className="text-[11px] text-t3 font-mono">
                          {t.at ? fmtDateTime(t.at) : 'pending'}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function RowKV({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <tr className="border-t border-line first:border-t-0">
      <td className={['py-2.5 text-t2', bold && 'text-t1 font-semibold'].filter(Boolean).join(' ')}>
        {label}
      </td>
      <td
        className={[
          'py-2.5 text-right font-mono',
          bold ? 'text-t1 font-semibold' : 'text-t1',
        ].join(' ')}
      >
        {value}
      </td>
    </tr>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="font-mono text-[11px] text-t3 uppercase tracking-wider mb-0.5">{label}</dt>
      <dd className={['text-t1 text-sm', mono && 'font-mono text-[12px]'].filter(Boolean).join(' ')}>
        {value}
      </dd>
    </div>
  );
}
