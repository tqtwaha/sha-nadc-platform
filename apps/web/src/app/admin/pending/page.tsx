import Link from 'next/link';
import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { serviceClient } from '@/lib/supabase';
import { ApprovalCard } from './ApprovalCard';
import { fmtRelative } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Approval {
  id: string;
  kind: string;
  reference: string;
  payload: Record<string, unknown>;
  notes: string;
  status: string;
  requested_by: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_note: string | null;
}

export default async function PendingPage() {
  const sb = serviceClient();
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ data: pending }, { data: recent }] = await Promise.all([
    sb
      .from('pending_approvals')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    sb
      .from('pending_approvals')
      .select('*')
      .neq('status', 'pending')
      .gte('updated_at', since24h)
      .order('updated_at', { ascending: false })
      .limit(10),
  ]);

  const requestedAgentIds = Array.from(
    new Set([...(pending ?? []), ...(recent ?? [])].map((a) => a.requested_by).filter(Boolean)),
  ) as string[];
  let agentNames = new Map<string, string>();
  if (requestedAgentIds.length > 0) {
    const { data: agents } = await sb
      .from('agents')
      .select('id, display_name')
      .in('id', requestedAgentIds);
    agentNames = new Map((agents ?? []).map((a) => [a.id, a.display_name]));
  }

  const pendingCount = pending?.length ?? 0;

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Approvals"
        subtitle="Supervisor queue"
        apps={APPS}
        activeSlug="admin"
        rightSlot={
          <Chip tone={pendingCount > 0 ? 'warn' : 'ok'} className="font-mono normal-case">
            {pendingCount} pending
          </Chip>
        }
      />

      <section className="flex-1 max-w-3xl w-full mx-auto px-6 py-8 space-y-8">
        <div>
          <Link href="/admin" className="text-xs font-mono text-t3 hover:text-t1">
            ← Admin
          </Link>
          <h2 className="font-display text-xl text-t1 mt-2">Pending approvals</h2>
          <p className="text-t2 text-sm mt-2">
            Decisions that need senior sign-off: priority overrides, hospital diversion
            bypass requests, claim disputes that exceeded auto-tolerance, fleet emergency
            calls. Approve or reject — both write to the audit log.
          </p>
        </div>

        {/* Active queue */}
        <div>
          <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-3">
            Awaiting decision ({pendingCount})
          </h3>
          {pendingCount === 0 ? (
            <div className="border border-line rounded-lg bg-bg1 p-8 text-center">
              <div className="text-g font-display text-base">Queue is clear.</div>
              <div className="text-t3 font-mono text-xs mt-1">
                Escalations will appear here in real time.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {(pending ?? []).map((a) => (
                <ApprovalCard
                  key={a.id}
                  approval={{
                    id: a.id,
                    kind: a.kind,
                    reference: a.reference,
                    payload: a.payload ?? {},
                    notes: a.notes,
                    created_at: a.created_at,
                    requested_by_name: a.requested_by ? agentNames.get(a.requested_by) : undefined,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Recent decisions */}
        {recent && recent.length > 0 && (
          <div>
            <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-3">
              Recent decisions (24h)
            </h3>
            <div className="border border-line rounded-lg bg-bg1 overflow-hidden">
              {recent.map((a) => (
                <div
                  key={a.id}
                  className="px-4 py-3 border-b border-line last:border-b-0 flex items-center gap-3 text-sm"
                >
                  <span
                    className={[
                      'shrink-0 px-2 py-0.5 rounded-sm text-[10px] font-mono uppercase tracking-wider',
                      a.status === 'approved' ? 'bg-g/15 text-g' : 'bg-p1/15 text-p1',
                    ].join(' ')}
                  >
                    {a.status}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-t1 truncate">{a.notes || a.kind.replace('_', ' ')}</div>
                    {a.resolved_note && (
                      <div className="text-t3 font-mono text-[11px] truncate">{a.resolved_note}</div>
                    )}
                  </div>
                  <div className="text-t3 font-mono text-[10px]">{fmtRelative(a.resolved_at ?? a.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
