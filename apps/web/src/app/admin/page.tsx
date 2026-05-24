import Link from 'next/link';
import { Topbar, Chip } from '@sha-nadc/ui';
import { Users, Hospital, ScrollText, Beaker, Activity } from 'lucide-react';
import { APPS } from '@/lib/apps';
import { serviceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminIndexPage() {
  const sb = serviceClient();
  const [{ count: agents }, { count: hospitals }, { count: events }] = await Promise.all([
    sb.from('agents').select('id', { count: 'exact', head: true }),
    sb.from('hospitals').select('id', { count: 'exact', head: true }),
    sb.from('dispatch_events').select('id', { count: 'exact', head: true }),
  ]);

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Admin"
        subtitle="Operations directory"
        apps={APPS}
        activeSlug="admin"
        rightSlot={<Chip tone="info">read-only</Chip>}
      />

      <section className="flex-1 max-w-4xl w-full mx-auto px-6 py-10 space-y-6">
        <h2 className="font-display text-xl text-t1">Admin surfaces</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <AdminCard
            href="/admin/users"
            Icon={Users}
            title="Users / Agents"
            caption={`${agents ?? 0} operations staff`}
          />
          <AdminCard
            href="/admin/hospitals"
            Icon={Hospital}
            title="Hospital directory"
            caption={`${hospitals ?? 0} receiving facilities across 47 counties`}
          />
          <AdminCard
            href="/admin/audit"
            Icon={ScrollText}
            title="Audit log"
            caption={`${events ?? 0} dispatch events (filterable, compliance review)`}
          />
          <AdminCard
            href="/admin/sim"
            Icon={Beaker}
            title="Sim controls"
            caption="Spawn, advance, reset — push the demo without curl"
          />
          <AdminCard
            href="/status"
            Icon={Activity}
            title="Status page"
            caption="Public uptime + ops dashboard, env config check"
          />
        </div>

        <p className="text-xs font-mono text-t3 pt-6 border-t border-line">
          Clerk auth bridge + write-side admin (invite, role change, hospital onboard) is
          scheduled for Phase 9. For now, agents are seeded; hospitals come from the
          static 0003_seed_hospitals migration.
        </p>
      </section>
    </main>
  );
}

function AdminCard({
  href,
  Icon,
  title,
  caption,
}: {
  href: string;
  Icon: typeof Users;
  title: string;
  caption: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-4 p-5 rounded-lg border border-line bg-bg1 hover:bg-bg2 transition-colors"
    >
      <Icon className="size-7 text-g shrink-0 mt-0.5" />
      <div>
        <div className="font-display font-semibold text-t1 text-base">{title}</div>
        <div className="font-mono text-[11px] text-t3 mt-1">{caption}</div>
      </div>
    </Link>
  );
}
