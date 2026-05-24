import Link from 'next/link';
import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { listHospitalsWithIncoming } from '@/lib/hospitals';
import { fmtKes } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DIVERSION_TONE: Record<string, 'crit' | 'warn' | 'caution' | 'ok'> = {
  open: 'ok',
  caution: 'caution',
  diverting: 'warn',
  bypass: 'crit',
};

export default async function HospitalListPage({
  searchParams,
}: {
  searchParams: Promise<{ county?: string; filter?: string }>;
}) {
  const sp = await searchParams;
  const all = await listHospitalsWithIncoming();
  let rows = all;
  if (sp.county) rows = rows.filter((h) => h.county === sp.county);
  if (sp.filter === 'incoming') rows = rows.filter((h) => h.enRouteCount > 0);
  if (sp.filter === 'diverting') rows = rows.filter((h) => h.diversion_status !== 'open');

  const totalIncoming = rows.reduce((a, h) => a + h.enRouteCount, 0);

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Hospitals"
        subtitle="Receiving view"
        apps={APPS}
        activeSlug="hospital"
        rightSlot={
          <Chip tone={totalIncoming > 0 ? 'warn' : 'info'} className="font-mono normal-case">
            {totalIncoming} incoming
          </Chip>
        }
      />

      <section className="flex-1 px-6 py-6 max-w-screen-2xl w-full mx-auto space-y-6">
        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <FilterLink current={sp.filter} value="" label="All hospitals" />
          <FilterLink current={sp.filter} value="incoming" label="With incoming" />
          <FilterLink current={sp.filter} value="diverting" label="Diverting / bypass" />
          {sp.county && (
            <Chip tone="info" className="font-mono normal-case">
              {sp.county}
            </Chip>
          )}
          {(sp.county || sp.filter) && (
            <Link href="/hospital" className="text-g hover:underline text-xs">
              clear
            </Link>
          )}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.length === 0 && (
            <div className="col-span-full text-center text-t3 font-mono text-xs py-12">
              No hospitals match this filter.
            </div>
          )}
          {rows.map((h) => {
            const cap = h.ed_capacity_pct;
            const capTone =
              cap < 50 ? 'bg-g' : cap < 75 ? 'bg-p3' : cap < 90 ? 'bg-p2' : 'bg-p1';
            return (
              <Link
                key={h.id}
                href={`/hospital/${h.id}`}
                className="border border-line rounded-lg bg-bg1 p-4 hover:bg-bg2 transition-colors block"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-t1 font-display font-medium truncate">{h.name}</div>
                    <div className="text-t3 font-mono text-[10px]">
                      {h.id} · {h.county}
                    </div>
                  </div>
                  <Chip tone={DIVERSION_TONE[h.diversion_status] ?? 'info'}>
                    {h.diversion_status === 'open' ? `L${h.level}` : h.diversion_status}
                  </Chip>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-bg3 rounded-pill overflow-hidden">
                    <div className={`h-full ${capTone}`} style={{ width: `${cap}%` }} />
                  </div>
                  <span className="font-mono text-[11px] text-t2">{cap}%</span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <Stat
                    label="Incoming"
                    value={h.enRouteCount}
                    tone={h.enRouteCount > 0 ? 'warn' : 'muted'}
                  />
                  <Stat label="Arr. 24h" value={h.arrivedTodayCount} tone="info" />
                  <Stat label="Claims 7d" value={h.claimsLast7d} tone="muted" />
                </div>

                {h.totalKesLast7d > 0 && (
                  <div className="mt-3 pt-3 border-t border-line text-[11px] font-mono text-t3">
                    KES last 7d: <span className="text-t1">{fmtKes(h.totalKesLast7d)}</span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function FilterLink({ current, value, label }: { current?: string; value: string; label: string }) {
  const active = (current ?? '') === value;
  return (
    <Link
      href={value ? `/hospital?filter=${value}` : '/hospital'}
      className={[
        'px-3 py-1.5 rounded-pill border text-xs font-display',
        active
          ? 'bg-g/15 text-g border-g/40'
          : 'bg-bg1 text-t2 border-line hover:bg-bg2 hover:text-t1',
      ].join(' ')}
    >
      {label}
    </Link>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'warn' | 'info' | 'muted';
}) {
  const toneClass = { warn: 'text-p2', info: 'text-b2', muted: 'text-t1' }[tone];
  return (
    <div className="text-center">
      <div className={`font-display text-lg font-semibold ${toneClass}`}>{value}</div>
      <div className="font-mono text-[9px] text-t3 uppercase tracking-wider">{label}</div>
    </div>
  );
}
