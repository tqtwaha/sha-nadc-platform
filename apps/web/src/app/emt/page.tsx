import Link from 'next/link';
import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { serviceClient } from '@/lib/supabase';
import { ACTIVE_STATUSES } from '@/lib/incidents';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// EMT entry — let the crew pick which ambulance they're driving. Each
// card shows whether that unit has an active incident assigned.

export default async function EmtPickerPage() {
  const sb = serviceClient();
  const [{ data: units, error: uErr }, { data: incidents, error: iErr }] = await Promise.all([
    sb.from('fleet_units').select('id, type, status, zone, provider_id').order('id').limit(300),
    sb
      .from('incidents')
      .select('id, unit_id, priority, complaint, status')
      .in('status', ACTIVE_STATUSES as unknown as string[])
      .not('unit_id', 'is', null),
  ]);
  if (uErr) throw uErr;
  if (iErr) throw iErr;

  const incByUnit = new Map<string, (typeof incidents)[number]>();
  for (const i of incidents ?? []) if (i.unit_id) incByUnit.set(i.unit_id, i);

  const withWork = (units ?? []).filter((u) => incByUnit.has(u.id));
  const available = (units ?? [])
    .filter((u) => !incByUnit.has(u.id) && u.status === 'available')
    .slice(0, 24);

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · EMT"
        subtitle="Crew companion"
        apps={APPS}
        activeSlug="emt"
        rightSlot={
          <Chip tone={withWork.length > 0 ? 'warn' : 'info'} className="font-mono normal-case">
            {withWork.length} active
          </Chip>
        }
      />

      <section className="flex-1 px-6 py-6 max-w-screen-xl w-full mx-auto space-y-6">
        <h2 className="font-display text-lg text-t1">Select your ambulance</h2>

        {withWork.length > 0 && (
          <>
            <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3">
              Units with active incidents
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {withWork.map((u) => {
                const inc = incByUnit.get(u.id);
                return (
                  <Link
                    key={u.id}
                    href={`/emt/${u.id}`}
                    className="border border-p2/40 bg-p2/10 hover:bg-p2/20 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-xl text-t1 font-semibold">{u.id}</div>
                      <Chip tone={u.type === 'ALS' ? 'crit' : 'info'}>{u.type}</Chip>
                    </div>
                    {inc && (
                      <div className="mt-2">
                        <div className="text-[10px] font-mono text-t3 uppercase tracking-wider">
                          {inc.status}
                        </div>
                        <div className="text-sm text-t1 truncate">{inc.complaint}</div>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </>
        )}

        <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mt-6">
          Available units {available.length > 0 && `(showing first ${available.length})`}
        </h3>
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {available.map((u) => (
            <Link
              key={u.id}
              href={`/emt/${u.id}`}
              className="border border-line bg-bg1 hover:bg-bg2 rounded-md p-3 text-center"
            >
              <div className="font-mono text-base text-t1 font-semibold">{u.id}</div>
              <div className="text-[10px] font-mono text-t3 mt-0.5">
                {u.type} · {u.zone}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
