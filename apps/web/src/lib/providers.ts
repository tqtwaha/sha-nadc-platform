// Provider aggregations — rolls up live fleet + claims into a single row per
// SHA-contracted ambulance provider. Read-only for the MVP (admin UI to
// onboard new providers is Phase 5+).

import 'server-only';
import { PROVIDERS } from '@sha-nadc/domain';
import { serviceClient } from './supabase';

export interface ProviderRow {
  id: string;
  name: string;
  totalUnits: number;
  alsUnits: number;
  blsUnits: number;
  activeUnits: number;
  totalClaims: number;
  paidClaims: number;
  totalKesPaid: number;
  totalKesPending: number;
}

export async function listProviders(): Promise<ProviderRow[]> {
  const sb = serviceClient();
  const [{ data: units, error: uErr }, { data: claims, error: cErr }] = await Promise.all([
    sb.from('fleet_units').select('provider_id, type, status'),
    sb.from('claims').select('provider_id, status, total_kes'),
  ]);
  if (uErr) throw uErr;
  if (cErr) throw cErr;

  return PROVIDERS.map((p) => {
    const pUnits = (units ?? []).filter((u) => u.provider_id === p.id);
    const pClaims = (claims ?? []).filter((c) => c.provider_id === p.id);
    const paid = pClaims.filter((c) => c.status === 'paid' || c.status === 'invoiced');
    const pending = pClaims.filter(
      (c) => c.status === 'approved' || c.status === 'pending_payment',
    );
    return {
      id: p.id,
      name: p.name,
      totalUnits: pUnits.length,
      alsUnits: pUnits.filter((u) => u.type === 'ALS').length,
      blsUnits: pUnits.filter((u) => u.type === 'BLS').length,
      activeUnits: pUnits.filter((u) => u.status !== 'out_of_service').length,
      totalClaims: pClaims.length,
      paidClaims: paid.length,
      totalKesPaid: paid.reduce((a, c) => a + (c.total_kes ?? 0), 0),
      totalKesPending: pending.reduce((a, c) => a + (c.total_kes ?? 0), 0),
    };
  });
}
