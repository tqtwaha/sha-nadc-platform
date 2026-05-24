import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { serviceClient } from '@/lib/supabase';
import { fmtRelative } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Agents are seeded for the MVP and will later be Clerk-bridged via the
// clerk_user_id column. Until then this page is read-only and shows the
// roster + role distribution that already lives in v2 Supabase.

interface AgentRow {
  id: string;
  email: string | null;
  display_name: string;
  role: 'call_taker' | 'dispatcher' | 'senior_dispatcher' | 'supervisor' | 'admin';
  status: 'on_call' | 'ready' | 'break' | 'off_shift';
  clerk_user_id: string | null;
  shift_started_at: string | null;
  created_at: string;
}

const ROLE_TONE: Record<AgentRow['role'], 'crit' | 'warn' | 'caution' | 'ok' | 'info' | 'muted'> = {
  admin: 'crit',
  supervisor: 'warn',
  senior_dispatcher: 'caution',
  dispatcher: 'info',
  call_taker: 'ok',
};

const STATUS_TONE: Record<AgentRow['status'], 'crit' | 'warn' | 'caution' | 'ok' | 'info' | 'muted'> = {
  on_call: 'ok',
  ready: 'info',
  break: 'caution',
  off_shift: 'muted',
};

const ROLE_LABEL: Record<AgentRow['role'], string> = {
  admin: 'Admin',
  supervisor: 'Supervisor',
  senior_dispatcher: 'Senior dispatcher',
  dispatcher: 'Dispatcher',
  call_taker: 'Call taker',
};

export default async function AdminUsersPage() {
  const sb = serviceClient();
  const { data, error } = await sb
    .from('agents')
    .select('*')
    .order('role', { ascending: true })
    .order('display_name', { ascending: true });
  if (error) throw error;
  const agents = (data ?? []) as AgentRow[];

  const byRole = agents.reduce<Record<string, number>>((acc, a) => {
    acc[a.role] = (acc[a.role] ?? 0) + 1;
    return acc;
  }, {});

  const linkedToClerk = agents.filter((a) => !!a.clerk_user_id).length;

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Users"
        subtitle="Operations roster"
        apps={APPS}
        activeSlug="admin"
        rightSlot={
          <Chip tone="info" className="font-mono normal-case">
            {agents.length} accounts
          </Chip>
        }
      />

      <section className="flex-1 px-6 py-6 max-w-screen-xl w-full mx-auto space-y-6">
        {/* Role distribution */}
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(ROLE_LABEL) as AgentRow['role'][]).map((role) => (
            <div
              key={role}
              className="flex items-center gap-2 px-3 py-1.5 rounded-pill border border-line bg-bg1 text-sm"
            >
              <Chip tone={ROLE_TONE[role]}>{ROLE_LABEL[role]}</Chip>
              <span className="font-mono text-t1 text-[12px]">{byRole[role] ?? 0}</span>
            </div>
          ))}
          <div className="ml-auto text-xs font-mono text-t3">
            Clerk-linked: <span className="text-t1">{linkedToClerk}/{agents.length}</span>
          </div>
        </div>

        {/* Table */}
        <div className="border border-line rounded-lg overflow-hidden bg-bg1">
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-t3 font-cond uppercase tracking-wider text-[11px]">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Name</th>
                <th className="text-left px-4 py-2.5 font-semibold">Email</th>
                <th className="text-left px-4 py-2.5 font-semibold">Role</th>
                <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                <th className="text-left px-4 py-2.5 font-semibold">Clerk</th>
                <th className="text-right px-4 py-2.5 font-semibold">Shift started</th>
              </tr>
            </thead>
            <tbody>
              {agents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-t3 font-mono text-xs">
                    No agents — run `pnpm seed` to populate the roster.
                  </td>
                </tr>
              )}
              {agents.map((a) => (
                <tr key={a.id} className="border-t border-line hover:bg-bg2">
                  <td className="px-4 py-3 text-t1 font-display">{a.display_name}</td>
                  <td className="px-4 py-3 text-t2 font-mono text-[12px]">{a.email}</td>
                  <td className="px-4 py-3">
                    <Chip tone={ROLE_TONE[a.role]}>{ROLE_LABEL[a.role]}</Chip>
                  </td>
                  <td className="px-4 py-3">
                    <Chip tone={STATUS_TONE[a.status]}>{a.status.replace('_', ' ')}</Chip>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">
                    {a.clerk_user_id ? (
                      <span className="text-g">linked</span>
                    ) : (
                      <span className="text-t4">not linked</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-t3 font-mono text-[11px]">
                    {a.shift_started_at ? fmtRelative(a.shift_started_at) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs font-mono text-t3">
          Clerk auth bridge is wired in Phase 5. For now agents are managed via the seed script
          and queried with the Supabase service role.
        </p>
      </section>
    </main>
  );
}
