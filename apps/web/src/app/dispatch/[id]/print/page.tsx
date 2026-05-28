import { notFound } from 'next/navigation';
import { serviceClient } from '@/lib/supabase';
import { fmtDateTime } from '@/lib/format';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Incident audit-trail PDF view — full lifecycle + dispatch_events +
// linked claim. SHA case-review artefact. Cmd+P → save as PDF.

export default async function IncidentPrint({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = serviceClient();

  const { data: inc, error } = await sb.from('incidents').select('*').eq('id', id).single();
  if (error || !inc) notFound();

  const [{ data: events }, { data: claim }, { data: hospital }, { data: vitals }] = await Promise.all([
    sb
      .from('dispatch_events')
      .select('event_type, event_note, actor_type, created_at')
      .eq('incident_id', id)
      .order('created_at', { ascending: true }),
    sb.from('claims').select('*').eq('incident_id', id).maybeSingle(),
    inc.hospital_id
      ? sb.from('hospitals').select('name, county, level').eq('id', inc.hospital_id).maybeSingle()
      : Promise.resolve({ data: null }),
    sb
      .from('clinical_observations')
      .select('recorded_at, heart_rate, bp_systolic, bp_diastolic, spo2, respiratory_rate')
      .eq('incident_id', id)
      .order('recorded_at', { ascending: true }),
  ]);

  const lifecycle: Array<{ label: string; at: string | null }> = [
    { label: 'Created (PSAP)', at: inc.created_at },
    { label: 'Dispatched', at: inc.dispatched_at },
    { label: 'En route', at: inc.en_route_at },
    { label: 'On scene', at: inc.on_scene_at },
    { label: 'Transport', at: inc.transport_at },
    { label: inc.status === 'cancelled' ? 'Cancelled' : 'Cleared', at: inc.cleared_at },
  ];

  return (
    <main className="print-doc">
      <style>{`
        @page { size: A4; margin: 18mm; }
        @media print { body { background: white !important; } .no-print { display: none !important; } }
        .print-doc { background:#fff; color:#111; font-family:'Exo 2',system-ui,sans-serif; max-width:780px; margin:24px auto; padding:32px; font-size:12px; line-height:1.5; }
        .print-doc h1 { font-size:22px; font-weight:800; margin:0; }
        .print-doc h2 { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:2px; color:#555; margin:22px 0 6px; }
        .print-doc table { width:100%; border-collapse:collapse; }
        .print-doc td, .print-doc th { padding:5px 8px; text-align:left; vertical-align:top; border-bottom:1px solid #eee; }
        .print-doc th { font-size:10px; text-transform:uppercase; letter-spacing:1px; color:#777; }
        .print-doc .row { display:flex; justify-content:space-between; align-items:flex-end; gap:24px; }
        .print-doc .kv { display:grid; grid-template-columns:150px 1fr; row-gap:4px; }
        .print-doc .kv .k { color:#777; text-transform:uppercase; font-size:10px; letter-spacing:1px; }
        .print-doc .mono { font-family:'JetBrains Mono',monospace; }
        .print-doc .pri { display:inline-block; padding:3px 10px; border-radius:5px; font-weight:700; color:#fff; }
      `}</style>

      <div className="no-print" style={{ textAlign: 'right', marginBottom: 16 }}>
        <PrintButton />
      </div>

      <div className="row">
        <div>
          <h1>Incident Case Record</h1>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
            Social Health Authority of Kenya · National Ambulance Dispatch Centre
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 15, fontWeight: 700 }}>{inc.display_id}</div>
          <div className="pri" style={{ background: inc.priority === 1 ? '#FF3B30' : inc.priority === 2 ? '#FF8C00' : '#F5B100', marginTop: 4 }}>
            Priority {inc.priority}
          </div>
        </div>
      </div>

      <h2>Encounter</h2>
      <div className="kv">
        <div className="k">Complaint</div><div>{inc.complaint}</div>
        {inc.icd11 && (<><div className="k">ICD-11</div><div className="mono">{inc.icd11}</div></>)}
        {inc.determinant_level && (<><div className="k">MPDS</div><div className="mono">{inc.determinant_level}{inc.determinant_code ? '-' + inc.determinant_code : ''}</div></>)}
        <div className="k">ALS required</div><div>{inc.requires_als ? 'Yes' : 'No'}</div>
        <div className="k">Status</div><div>{inc.status}</div>
      </div>

      <h2>Location & caller</h2>
      <div className="kv">
        <div className="k">Address</div><div>{inc.address}</div>
        <div className="k">County / zone</div><div>{inc.county} · {inc.zone}</div>
        <div className="k">GPS</div><div className="mono">{inc.lat?.toFixed(5)}, {inc.lng?.toFixed(5)}</div>
        {inc.caller_name && (<><div className="k">Caller</div><div>{inc.caller_name}{inc.caller_phone ? ' · ' + inc.caller_phone : ''}</div></>)}
        {(inc.patient_age || inc.patient_sex) && (<><div className="k">Patient</div><div>{inc.patient_sex ?? '?'}, {inc.patient_age ?? '?'}</div></>)}
      </div>

      <h2>Assignment</h2>
      <div className="kv">
        <div className="k">Ambulance unit</div><div className="mono">{inc.unit_id ?? '—'}</div>
        <div className="k">Receiving hospital</div>
        <div>{hospital ? `${hospital.name} · ${hospital.county} · L${hospital.level}` : (inc.hospital_id ?? '—')}</div>
      </div>

      <h2>Lifecycle timeline</h2>
      <table>
        <tbody>
          {lifecycle.map((t) => (
            <tr key={t.label}>
              <td style={{ width: '45%', color: t.at ? '#111' : '#bbb' }}>{t.label}</td>
              <td className="mono" style={{ color: '#555' }}>{t.at ? fmtDateTime(t.at) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {vitals && vitals.length > 0 && (
        <>
          <h2>Clinical observations</h2>
          <table>
            <thead><tr><th>Time</th><th>HR</th><th>BP</th><th>SpO₂</th><th>RR</th></tr></thead>
            <tbody>
              {vitals.map((v, i) => (
                <tr key={i}>
                  <td className="mono">{fmtDateTime(v.recorded_at)}</td>
                  <td>{v.heart_rate ?? '—'}</td>
                  <td>{v.bp_systolic ?? '—'}/{v.bp_diastolic ?? '—'}</td>
                  <td>{v.spo2 ?? '—'}</td>
                  <td>{v.respiratory_rate ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2>Dispatch event log ({events?.length ?? 0})</h2>
      <table>
        <thead><tr><th>Time</th><th>Event</th><th>Actor</th><th>Note</th></tr></thead>
        <tbody>
          {(events ?? []).map((e, i) => (
            <tr key={i}>
              <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.created_at)}</td>
              <td className="mono">{e.event_type}</td>
              <td>{e.actor_type}</td>
              <td>{e.event_note ?? '—'}</td>
            </tr>
          ))}
          {(events ?? []).length === 0 && (
            <tr><td colSpan={4} style={{ color: '#999' }}>No events recorded.</td></tr>
          )}
        </tbody>
      </table>

      {claim && (
        <>
          <h2>Linked claim</h2>
          <div className="kv">
            <div className="k">Claim #</div><div className="mono">{claim.claim_number}</div>
            <div className="k">Tariff</div><div>SHIF {claim.tariff_type} · {claim.distance_km} km · KES {claim.total_kes?.toLocaleString('en-KE')}</div>
            <div className="k">Status</div><div>{claim.status}</div>
            {claim.mpesa_ref && (<><div className="k">M-Pesa ref</div><div className="mono">{claim.mpesa_ref}</div></>)}
            {claim.invoice_number && (<><div className="k">KRA invoice</div><div className="mono">{claim.invoice_number}</div></>)}
          </div>
        </>
      )}

      <hr style={{ marginTop: 28, border: 0, borderTop: '1px solid #ddd' }} />
      <div style={{ fontSize: 9, color: '#999', textAlign: 'center' }}>
        Generated {fmtDateTime(new Date().toISOString())} · sha-nadc-platform · Kenya SHA / NADC ·
        {' '}incident uuid {inc.id}
      </div>
    </main>
  );
}
