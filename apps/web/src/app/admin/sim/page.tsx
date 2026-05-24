import Link from 'next/link';
import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { serviceClient } from '@/lib/supabase';
import { SimPanel } from './SimPanel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminSimPage() {
  const cronConfigured = !!process.env.CRON_SECRET;

  const sb = serviceClient();
  const since1h = new Date(Date.now() - 3600 * 1000).toISOString();
  const [{ count: active }, { count: spawned1h }, { count: claims1h }] = await Promise.all([
    sb
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'dispatched', 'en_route', 'on_scene', 'transport']),
    sb
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since1h),
    sb
      .from('claims')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since1h),
  ]);

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Sim Control"
        subtitle="Demo state controls"
        apps={APPS}
        activeSlug="admin"
        rightSlot={
          <Chip tone={cronConfigured ? 'ok' : 'crit'}>
            {cronConfigured ? 'armed' : 'locked'}
          </Chip>
        }
      />

      <section className="flex-1 max-w-2xl w-full mx-auto px-6 py-8 space-y-6">
        <div>
          <Link href="/admin" className="text-xs font-mono text-t3 hover:text-t1">
            ← Admin
          </Link>
          <h2 className="font-display text-xl text-t1 mt-2">Simulation control</h2>
          <p className="text-t2 text-sm mt-2">
            Push the demo around without curl. Spawn incidents, advance them through the
            lifecycle, or wipe state for a clean re-run. Used during stakeholder demos and
            for ad-hoc data seeding.
          </p>
        </div>

        {/* Snapshot strip */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Active" value={active ?? 0} tone={(active ?? 0) > 0 ? 'text-p2' : 'text-g'} />
          <Stat label="Spawned (1h)" value={spawned1h ?? 0} tone="text-b2" />
          <Stat label="Claims minted (1h)" value={claims1h ?? 0} tone="text-g" />
        </div>

        <SimPanel cronConfigured={cronConfigured} />

        <div className="text-[11px] font-mono text-t3 pt-4 border-t border-line space-y-1">
          <div>Equivalent curl invocations (need <span className="text-t1">CRON_SECRET</span> from env):</div>
          <div className="text-t2">
            curl -X POST -H "Authorization: Bearer $S" .../api/sim/spawn?n=3
          </div>
          <div className="text-t2">
            curl -X POST -H "Authorization: Bearer $S" .../api/sim/tick?n=5
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="border border-line rounded-lg bg-bg1 px-4 py-3">
      <div className="font-mono text-[10px] text-t3 uppercase tracking-wider">{label}</div>
      <div className={`font-display text-3xl font-bold mt-1 tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
