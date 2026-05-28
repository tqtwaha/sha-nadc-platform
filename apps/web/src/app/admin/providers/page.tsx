import Link from 'next/link';
import { Topbar, Chip } from '@sha-nadc/ui';
import { Building2, UserPlus } from 'lucide-react';
import { APPS } from '@/lib/apps';
import { PROVIDERS } from '@sha-nadc/domain';
import { serviceClient } from '@/lib/supabase';
import { fmtRelative } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const sp = await searchParams;
  const sb = serviceClient();

  const [{ data: onboarding }, { data: unitsByProvider }] = await Promise.all([
    sb
      .from('pending_approvals')
      .select('id, reference, notes, status, payload, created_at, resolved_at')
      .eq('kind', 'provider_contract')
      .order('created_at', { ascending: false })
      .limit(20),
    sb.from('fleet_units').select('provider_id'),
  ]);

  const unitCount = new Map<string, number>();
  for (const u of unitsByProvider ?? []) {
    if (u.provider_id) unitCount.set(u.provider_id, (unitCount.get(u.provider_id) ?? 0) + 1);
  }

  const pending = (onboarding ?? []).filter((o) => o.status === 'pending');
  const resolved = (onboarding ?? []).filter((o) => o.status !== 'pending');

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Providers"
        subtitle="Operators + onboarding"
        apps={APPS}
        activeSlug="admin"
        rightSlot={
          <Link
            href="/admin/providers/new"
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-g/15 hover:bg-g/25 text-g border border-g/40 text-sm font-display font-medium"
          >
            <UserPlus className="size-4" /> Onboard provider
          </Link>
        }
      />

      <section className="flex-1 max-w-screen-lg w-full mx-auto px-6 py-8 space-y-8">
        <Link href="/admin" className="text-xs font-mono text-t3 hover:text-t1">← Admin</Link>

        {sp.submitted && (
          <div className="text-sm font-mono px-4 py-3 rounded-lg bg-g/10 text-g border border-g/30">
            ✓ {sp.submitted} submitted for vetting — track it in
            {' '}<Link href="/admin/pending" className="underline">pending approvals</Link>.
          </div>
        )}

        {/* Onboarding pipeline */}
        {(pending.length > 0 || resolved.length > 0) && (
          <div>
            <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-3">
              Onboarding pipeline ({pending.length} pending)
            </h3>
            <div className="border border-line rounded-lg bg-bg1 overflow-hidden">
              {[...pending, ...resolved].map((o) => (
                <div key={o.id} className="px-4 py-3 border-b border-line last:border-b-0 flex items-center gap-3">
                  <Chip
                    tone={o.status === 'pending' ? 'warn' : o.status === 'approved' ? 'ok' : 'crit'}
                  >
                    {o.status}
                  </Chip>
                  <div className="flex-1 min-w-0">
                    <div className="text-t1 font-display">{o.reference}</div>
                    <div className="text-t3 font-mono text-[11px] truncate">{o.notes}</div>
                  </div>
                  <div className="text-t3 font-mono text-[10px]">
                    {fmtRelative(o.resolved_at ?? o.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active contracted operators */}
        <div>
          <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-3">
            Contracted operators ({PROVIDERS.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PROVIDERS.map((p) => (
              <Link
                key={p.id}
                href={`/providers/${p.id}`}
                className="flex items-center gap-4 p-4 rounded-lg border border-line bg-bg1 hover:bg-bg2 transition-colors"
              >
                <Building2 className="size-6 text-g shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-display font-semibold text-t1 text-sm truncate">{p.name}</div>
                  <div className="font-mono text-[11px] text-t3">
                    {p.id} · {unitCount.get(p.id) ?? 0} units
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
