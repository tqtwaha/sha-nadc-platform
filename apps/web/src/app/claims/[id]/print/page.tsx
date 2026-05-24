import { notFound } from 'next/navigation';
import { getClaim } from '@/lib/claims';
import { fmtKes, fmtDateTime } from '@/lib/format';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Print-only claim view. Renders a single A4-friendly page with no
// platform chrome. User opens this page, hits Cmd+P, browser saves
// as PDF. No headless render dep, no PDF library.

export default async function PrintableClaim({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const claim = await getClaim(id);
  if (!claim) notFound();

  const chargeableKm = Math.max(0, claim.distance_km - claim.free_km);
  const perKmTotal = Math.round(chargeableKm * claim.per_km_kes);

  const timeline: Array<{ label: string; at: string | null }> = [
    { label: 'Drafted', at: claim.created_at },
    { label: 'Submitted to SHA', at: claim.submitted_at },
    { label: 'Approved', at: claim.approved_at },
    { label: 'Paid (M-Pesa)', at: claim.paid_at },
    { label: claim.invoice_number ? `Invoiced (KRA): ${claim.invoice_number}` : 'Invoiced', at: claim.invoice_number ? claim.updated_at : null },
  ];

  return (
    <main className="print-claim">
      <style>{`
        @page { size: A4; margin: 18mm; }
        @media print {
          body { background: white !important; }
        }
        .print-claim {
          background: white;
          color: #111;
          font-family: 'Exo 2', system-ui, sans-serif;
          max-width: 780px;
          margin: 24px auto;
          padding: 32px;
          font-size: 12px;
          line-height: 1.45;
        }
        .print-claim h1 { font-size: 22px; font-weight: 800; margin: 0; }
        .print-claim h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #555; margin: 24px 0 6px; }
        .print-claim hr { border: 0; border-top: 1px solid #ddd; margin: 12px 0; }
        .print-claim table { width: 100%; border-collapse: collapse; }
        .print-claim td, .print-claim th { padding: 6px 8px; text-align: left; vertical-align: top; }
        .print-claim th { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #777; font-weight: 600; }
        .print-claim td.num { text-align: right; font-family: 'JetBrains Mono', monospace; }
        .print-claim .row { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; }
        .print-claim .kv { display: grid; grid-template-columns: 140px 1fr; column-gap: 16px; row-gap: 4px; font-size: 12px; }
        .print-claim .kv .k { color: #777; text-transform: uppercase; font-size: 10px; letter-spacing: 1px; padding-top: 2px; }
        .print-claim .total-row td { padding: 10px 8px; border-top: 2px solid #111; font-weight: 700; }
        .print-claim .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .print-claim .sign { margin-top: 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
        .print-claim .sign .box { border-top: 1px solid #888; padding-top: 4px; font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: 1px; }
        .print-claim .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
        .print-claim .no-print { display: block; }
        @media print { .print-claim .no-print { display: none !important; } }
      `}</style>

      <div className="no-print" style={{ textAlign: 'right', marginBottom: 16 }}>
        <PrintButton />
      </div>

      <div className="row">
        <div>
          <h1>Ambulance Transport Claim</h1>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
            Social Health Authority of Kenya · NADC
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 700 }}>
            {claim.claim_number}
          </div>
          <div style={{ fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>
            Status:{' '}
            <span
              className="badge"
              style={{
                background:
                  claim.status === 'paid' || claim.status === 'invoiced' || claim.status === 'approved'
                    ? '#50C02022'
                    : claim.status === 'rejected'
                      ? '#FF3B3022'
                      : '#27AAE122',
                color:
                  claim.status === 'paid' || claim.status === 'invoiced' || claim.status === 'approved'
                    ? '#3DA818'
                    : claim.status === 'rejected'
                      ? '#FF3B30'
                      : '#27AAE1',
              }}
            >
              {claim.status.replace('_', ' ')}
            </span>
          </div>
        </div>
      </div>

      <h2>Encounter</h2>
      <div className="kv">
        <div className="k">Chief complaint</div>
        <div>{claim.chief_complaint}</div>
        {claim.icd11 && (
          <>
            <div className="k">ICD-11</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace' }}>{claim.icd11}</div>
          </>
        )}
        <div className="k">Tariff</div>
        <div>SHIF {claim.tariff_type}</div>
        <div className="k">Provider</div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace' }}>{claim.provider_id ?? '—'}</div>
        <div className="k">Ambulance unit</div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace' }}>{claim.unit_id ?? '—'}</div>
        <div className="k">Receiving hospital</div>
        <div>{claim.hospital_name ?? '—'}{claim.hospital_county ? ` · ${claim.hospital_county}` : ''}</div>
      </div>

      <h2>Tariff breakdown</h2>
      <table>
        <thead>
          <tr>
            <th>Component</th>
            <th>Calculation</th>
            <th style={{ textAlign: 'right' }}>KES</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Base fare ({claim.tariff_type})</td>
            <td>Flat</td>
            <td className="num">{fmtKes(claim.base_kes)}</td>
          </tr>
          <tr>
            <td>Distance</td>
            <td>
              {claim.distance_km} km – {claim.free_km} km free = {chargeableKm.toFixed(2)} km × KES {claim.per_km_kes}
            </td>
            <td className="num">{fmtKes(perKmTotal)}</td>
          </tr>
          <tr>
            <td>Consumables</td>
            <td>O₂, drugs, dressings</td>
            <td className="num">{fmtKes(claim.consumables_kes)}</td>
          </tr>
          <tr className="total-row">
            <td>TOTAL</td>
            <td></td>
            <td className="num">{fmtKes(claim.total_kes)}</td>
          </tr>
        </tbody>
      </table>

      {claim.vitals && Object.keys(claim.vitals).length > 0 && (
        <>
          <h2>Vitals at handoff</h2>
          <div className="grid-3">
            {claim.vitals.hr !== undefined && <V label="HR" value={`${claim.vitals.hr} bpm`} />}
            {(claim.vitals.bp_sys !== undefined || claim.vitals.bp_dia !== undefined) && (
              <V
                label="BP"
                value={`${claim.vitals.bp_sys ?? '—'}/${claim.vitals.bp_dia ?? '—'} mmHg`}
              />
            )}
            {claim.vitals.spo2 !== undefined && <V label="SpO₂" value={`${claim.vitals.spo2}%`} />}
            {claim.vitals.rr !== undefined && <V label="RR" value={`${claim.vitals.rr}/min`} />}
            {claim.vitals.gcs !== undefined && <V label="GCS" value={`${claim.vitals.gcs}/15`} />}
            {claim.vitals.temp_c !== undefined && <V label="Temp" value={`${claim.vitals.temp_c} °C`} />}
            {claim.vitals.bgl !== undefined && <V label="BGL" value={`${claim.vitals.bgl} mmol/L`} />}
          </div>
        </>
      )}

      {claim.notes && (
        <>
          <h2>Notes</h2>
          <div style={{ whiteSpace: 'pre-wrap' }}>{claim.notes}</div>
        </>
      )}

      <h2>Timeline</h2>
      <table>
        <tbody>
          {timeline.map((t) => (
            <tr key={t.label}>
              <td style={{ width: '40%', color: t.at ? '#111' : '#aaa' }}>{t.label}</td>
              <td style={{ fontFamily: 'JetBrains Mono, monospace', color: '#555' }}>
                {t.at ? fmtDateTime(t.at) : '—'}
              </td>
            </tr>
          ))}
          {claim.mpesa_ref && (
            <tr>
              <td>M-Pesa reference</td>
              <td style={{ fontFamily: 'JetBrains Mono, monospace' }}>{claim.mpesa_ref}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="sign">
        <div className="box">EMT crew signature</div>
        <div className="box">Receiving clinician signature</div>
      </div>

      <hr style={{ marginTop: 32 }} />
      <div style={{ fontSize: 9, color: '#999', textAlign: 'center' }}>
        Generated {fmtDateTime(new Date().toISOString())} · sha-nadc-platform · Kenya SHA / NADC
      </div>
    </main>
  );
}

function V({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: '1px solid #ccc',
        borderRadius: 6,
        padding: '8px 10px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 9, color: '#777', textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
