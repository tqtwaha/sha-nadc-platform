import Link from 'next/link';
import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { serviceClient } from '@/lib/supabase';
import { FlagRow } from './FlagRow';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Flag {
  key: string;
  enabled: boolean;
  description: string;
  rollout_pct: number;
  category: string;
  owner: string | null;
  updated_at: string;
}

const CATEGORY_ORDER = ['kill_switch', 'integration', 'ops', 'beta', 'general'];

export default async function FlagsPage() {
  const sb = serviceClient();
  const { data, error } = await sb
    .from('feature_flags')
    .select('*')
    .order('category')
    .order('key');
  if (error) throw error;

  const flags = (data ?? []) as Flag[];
  const enabledCount = flags.filter((f) => f.enabled).length;

  const grouped: Record<string, Flag[]> = {};
  for (const f of flags) {
    (grouped[f.category] ??= []).push(f);
  }

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Feature flags"
        subtitle="Stub ↔ real cutover controls"
        apps={APPS}
        activeSlug="admin"
        rightSlot={
          <Chip tone="info" className="font-mono normal-case">
            {enabledCount}/{flags.length} on
          </Chip>
        }
      />

      <section className="flex-1 max-w-3xl w-full mx-auto px-6 py-8 space-y-6">
        <div>
          <Link href="/admin" className="text-xs font-mono text-t3 hover:text-t1">
            ← Admin
          </Link>
          <h2 className="font-display text-xl text-t1 mt-2">Feature flags</h2>
          <p className="text-t2 text-sm mt-2">
            Each flag is a kill-switch / rollout control. <strong>Integration</strong> flags
            flip M-Pesa / AfyaLink / KRA / 3CX from stub to real adapter. <strong>Ops</strong>{' '}
            flags toggle floor features. <strong>Kill switch</strong> flags disable writes
            platform-wide — use during active incidents.
          </p>
        </div>

        {CATEGORY_ORDER.map((cat) => {
          const rows = grouped[cat];
          if (!rows || rows.length === 0) return null;
          return (
            <div key={cat} className="border border-line rounded-lg bg-bg1 overflow-hidden">
              <div className="px-4 py-3 bg-bg2 border-b border-line">
                <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3">
                  {cat.replace('_', ' ')} ({rows.length})
                </h3>
              </div>
              {rows.map((f) => (
                <FlagRow key={f.key} flag={f} />
              ))}
            </div>
          );
        })}

        <p className="text-[11px] font-mono text-t3 pt-4 border-t border-line">
          Flags evaluated server-side in Server Actions. Cached for 30s in production
          (revalidatePath fires after every change). Stub→real cutover is one click —
          rollback is one click back.
        </p>
      </section>
    </main>
  );
}
