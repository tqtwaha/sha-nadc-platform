import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';

// Landing page — quick directory of every app in the platform.
// Acts as the demo entrypoint until /dashboard is built.
export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Platform"
        subtitle="v2 production preview"
        apps={APPS}
        activeSlug=""
        rightSlot={<Chip tone="ok">v2 scaffold</Chip>}
      />
      <section className="flex-1 max-w-5xl w-full mx-auto px-6 py-16">
        <h1 className="font-display font-extrabold text-5xl tracking-tight leading-[1.05] mb-4">
          SHA NADC Platform
        </h1>
        <p className="text-t2 text-lg max-w-prose leading-relaxed">
          Production rebuild of the National Ambulance Dispatch Centre. Same operational
          flows as the v1 demo — PSAP, dispatch, EMT, hospital, claims — re-engineered
          for safety-critical use in the field.
        </p>
        <p className="text-t3 text-sm mt-3 font-mono">
          Tracker:{' '}
          <a
            href="https://github.com/tqtwaha/sha-nadc/blob/main/v2/TRACKER.md"
            className="text-b2 underline"
          >
            sha-nadc/v2/TRACKER.md
          </a>
        </p>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {APPS.map(({ slug, label, href, iconName }) => {
            const Icon = (LucideIcons as unknown as Record<string, LucideIcon>)[iconName];
            return (
              <a
                key={slug}
                href={href}
                className="flex items-start gap-4 p-5 rounded-lg border border-line bg-bg1 hover:bg-bg2 hover:border-line2 transition-colors duration-150"
              >
                {Icon && <Icon className="size-7 text-g shrink-0 mt-0.5" />}
                <div>
                  <div className="font-display font-semibold text-t1 text-base">{label}</div>
                  <div className="font-mono text-[11px] text-t3 tracking-wide uppercase mt-1">
                    {slug}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </section>
    </main>
  );
}
