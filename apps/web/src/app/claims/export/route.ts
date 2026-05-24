import { NextRequest } from 'next/server';
import { listClaims, type ClaimStatus } from '@/lib/claims';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Generates a CSV export of claims, respecting the same status/search filters
// as the list page. Streams as text/csv with a date-stamped filename so a
// finance user can pipe it straight into Excel or a reconciliation script.

const HEADERS = [
  'claim_number',
  'status',
  'chief_complaint',
  'icd11',
  'tariff_type',
  'distance_km',
  'base_kes',
  'per_km_kes',
  'free_km',
  'consumables_kes',
  'total_kes',
  'hospital_name',
  'hospital_county',
  'unit_id',
  'provider_id',
  'mpesa_ref',
  'invoice_number',
  'submitted_at',
  'approved_at',
  'paid_at',
  'created_at',
];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = (sp.get('status') ?? 'all') as ClaimStatus | 'all';
  const search = sp.get('q') ?? '';

  const { rows } = await listClaims({ status, search, limit: 5000 });

  const lines: string[] = [HEADERS.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.claim_number,
        r.status,
        r.chief_complaint,
        r.icd11,
        r.tariff_type,
        r.distance_km,
        r.base_kes,
        r.per_km_kes,
        r.free_km,
        r.consumables_kes,
        r.total_kes,
        r.hospital_name,
        r.hospital_county,
        r.unit_id,
        r.provider_id,
        r.mpesa_ref,
        r.invoice_number,
        r.submitted_at,
        r.approved_at,
        r.paid_at,
        r.created_at,
      ]
        .map(csvEscape)
        .join(','),
    );
  }

  const csv = lines.join('\n');
  const today = new Date().toISOString().slice(0, 10);
  const suffix = status === 'all' ? 'all' : status;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sha-nadc-claims-${suffix}-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
