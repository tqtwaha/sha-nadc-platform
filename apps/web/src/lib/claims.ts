// Server-side claim data helpers — used by the Claims pages + Server Actions.
// Wraps the Supabase service client so RLS doesn't get in the way during dev
// (Phase 2 RLS swap will move these to the regular server client with Clerk
// JWT bridging).

import 'server-only';
import { serviceClient } from './supabase';

export type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'disputed'
  | 'rejected'
  | 'pending_payment'
  | 'paid'
  | 'invoiced';

export interface ClaimRow {
  id: string;
  claim_number: string;
  incident_id: string | null;
  provider_id: string | null;
  unit_id: string | null;
  hospital_id: string | null;
  icd11: string | null;
  chief_complaint: string;
  tariff_type: 'ALS' | 'BLS';
  base_kes: number;
  distance_km: number;
  per_km_kes: number;
  free_km: number;
  consumables_kes: number;
  total_kes: number;
  status: ClaimStatus;
  notes: string;
  submitted_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  invoice_number: string | null;
  mpesa_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClaimWithJoins extends ClaimRow {
  hospital_name: string | null;
  hospital_county: string | null;
}

export interface ListClaimsOpts {
  status?: ClaimStatus | 'all';
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listClaims(opts: ListClaimsOpts = {}): Promise<{
  rows: ClaimWithJoins[];
  total: number;
}> {
  const sb = serviceClient();
  let query = sb
    .from('claims')
    .select(
      `
      *,
      hospitals(name, county)
      `,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false });

  if (opts.status && opts.status !== 'all') {
    query = query.eq('status', opts.status);
  }
  if (opts.search) {
    query = query.or(
      `claim_number.ilike.%${opts.search}%,chief_complaint.ilike.%${opts.search}%`,
    );
  }
  query = query.range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 50) - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  const rows: ClaimWithJoins[] = (data ?? []).map((r: any) => ({
    ...r,
    hospital_name: r.hospitals?.name ?? null,
    hospital_county: r.hospitals?.county ?? null,
  }));

  return { rows, total: count ?? rows.length };
}

export async function getClaim(id: string): Promise<ClaimWithJoins | null> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from('claims')
    .select(`*, hospitals(name, county)`)
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null; // no rows
    throw error;
  }
  return {
    ...(data as any),
    hospital_name: (data as any).hospitals?.name ?? null,
    hospital_county: (data as any).hospitals?.county ?? null,
  };
}

export async function statusCounts(): Promise<Record<ClaimStatus | 'all', number>> {
  const sb = serviceClient();
  const { data, error } = await sb.from('claims').select('status');
  if (error) throw error;
  const counts: Record<string, number> = { all: data.length };
  for (const r of data) {
    counts[r.status as string] = (counts[r.status as string] ?? 0) + 1;
  }
  return counts as Record<ClaimStatus | 'all', number>;
}
