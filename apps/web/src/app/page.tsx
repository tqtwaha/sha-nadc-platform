import Link from 'next/link';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { getLandingSnapshot } from '@/lib/landing';
import { fmtKes } from '@/lib/format';
import { RealtimeRefresh } from '@/components/RealtimeRefresh';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  const snap = await getLandingSnapshot();
  const countBySlug = new Map(snap.appCounts.map((a) => [a.slug, a]));

  const utilization =
    snap.kpis.totalUnits > 0
      ? Math.round((snap.kpis.deployedUnits / snap.kpis.totalUnits) * 100)
      : 0;

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Platform"
        subtitle="National Ambulance Dispatch Centre"
        apps={APPS}
        activeSlug=""
        rightSlot={
          <Chip
            tone={snap.kpis.p1Active > 0 ? 'crit' : 'ok'}
            className="font-mono normal-case"
          >
            {snap.kpis.p1Active} P1 active
          </Chip>
        }
      />

      <RealtimeRefresh tables={['incidents', 'fleet_units', 'claims']} />

      <section className="flex-1 max-w-screen-xl w-full mx-auto px-6 py-10 space-y-10">
        {/* Hero */}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="font-display font-extrabold text-4xl tracking-tight leading-[1.05]">
              SHA NADC Platform
            </h1>
            <p className="text-t2 text-sm mt-3 max-w-prose">
              Live operational platform — PSAP intake, dispatcher CAD, EMT field, hospital
              receiving, SHIF claims. All nine surfaces wired to a single Supabase backend
              with realtime fan-out.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/wall"
              className="px-4 py-2 rounded-md bg-g/15 hover:bg-g/25 text-g border border-g/40 font-display font-medium text-sm"
            >
              Open LED wall →
            </Link>
            <Link
              href="/psap"
              className="px-4 py-2 rounded-md bg-bg2 hover:bg-bg3 text-t1 border border-line font-display font-medium text-sm"
            >
              New PSAP call
            </Link>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Kpi label="Active" value={snap.kpis.activeIncidents} tone="text-b2" />
          <Kpi label="P1" value={snap.kpis.p1Active} tone={snap.kpis.p1Active > 0 ? 'text-p1' : 'text-t1'} />
          <Kpi label="Available" value={snap.kpis.availableUnits} tone="text-g" />
          <Kpi label="Deployed" value={`${utilization}%`} tone="text-p2" />
          <Kpi label="Claims 24h" value={snap.kpis.claimsToday} tone="text-t1" />
          <Kpi label="Paid 24h" value={fmtKes(snap.kpis.paidKesToday)} tone="text-g" mono />
        </div>

        {/* Top P1 strip */}
        {snap.topP1.length > 0 && (
          <div className="border border-p1/40 bg-p1/10 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 bg-p1 rounded-full animate-pulse" />
              <h3 className="font-cond uppercase tracking-wider text-[11px] text-p1">
                Priority 1 — in flight
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {snap.topP1.map((i) => (
                <Link
                  key={i.id}
                  href={`/dispatch/${i.id}`}
                  className="block px-3 py-2 rounded-md bg-bg1 border border-line hover:bg-bg2"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-t3">
                    <span>{i.display_id}</span>
                    <span>{i.status}</span>
                  </div>
                  <div className="text-t1 font-display text-sm mt-0.5 truncate">{i.complaint}</div>
                  <div className="text-t3 font-mono text-[10px] mt-0.5">
                    {i.zone}
                    {i.unit_id && <> · {i.unit_id}</>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* App grid */}
        <div>
          <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-3">
            Surfaces
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {APPS.map(({ slug, label, href, iconName }) => {
              const Icon = (LucideIcons as unknown as Record<string, LucideIcon>)[iconName];
              const meta = countBySlug.get(slug);
              return (
                <Link
                  key={slug}
                  href={href}
                  className="group flex items-center gap-4 p-5 rounded-lg border border-line bg-bg1 hover:bg-bg2 hover:border-line2 transition-colors"
                >
                  {Icon && <Icon className="size-7 text-g shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-semibold text-t1 text-base">{label}</div>
                    <div className="font-mono text-[11px] text-t3 mt-0.5 truncate">
                      {meta?.caption ?? slug}
                    </div>
                  </div>
                  {meta && meta.count > 0 && (
                    <div className="font-mono text-lg font-semibold text-t1 tabular-nums">
                      {meta.count}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        <footer className="text-[11px] font-mono text-t4 pt-6 border-t border-line flex items-center justify-between">
          <span>v2 production preview · {snap.kpis.totalUnits} fleet units · Realtime</span>
          <a
            href="https://github.com/tqtwaha/sha-nadc-platform"
            className="hover:text-t2"
          >
            github.com/tqtwaha/sha-nadc-platform
          </a>
        </footer>
      </section>
    </main>
  );
}

function Kpi({
  label,
  value,
  tone,
  mono = false,
}: {
  label: string;
  value: number | string;
  tone: string;
  mono?: boolean;
}) {
  return (
    <div className="border border-line rounded-lg bg-bg1 px-4 py-3">
      <div className="font-mono text-[10px] text-t3 uppercase tracking-wider">{label}</div>
      <div
        className={[
          'font-display font-bold mt-1 tabular-nums',
          mono ? 'text-xl font-mono' : 'text-3xl',
          tone,
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  );
}
