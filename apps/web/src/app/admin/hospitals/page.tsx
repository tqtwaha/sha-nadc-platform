import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { serviceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface HospitalRow {
  id: string;
  name: string;
  full_name: string;
  level: 4 | 5 | 6;
  is_national_referral: boolean;
  county: string;
  ed_capacity_pct: number;
  diversion_status: 'open' | 'caution' | 'diverting' | 'bypass';
  specialties: string[];
}

const DIVERSION_TONE: Record<
  HospitalRow['diversion_status'],
  'crit' | 'warn' | 'caution' | 'ok'
> = {
  open: 'ok',
  caution: 'caution',
  diverting: 'warn',
  bypass: 'crit',
};

const DIVERSION_LABEL: Record<HospitalRow['diversion_status'], string> = {
  open: 'Open',
  caution: 'Caution',
  diverting: 'Diverting',
  bypass: 'Bypass',
};

export default async function AdminHospitalsPage({
  searchParams,
}: {
  searchParams: Promise<{ county?: string; level?: string }>;
}) {
  const sp = await searchParams;
  const sb = serviceClient();
  let query = sb.from('hospitals').select('*').order('level', { ascending: false }).order('name');
  if (sp.county) query = query.eq('county', sp.county);
  if (sp.level) query = query.eq('level', Number(sp.level));
  const { data, error } = await query;
  if (error) throw error;
  const hospitals = (data ?? []) as HospitalRow[];

  const counties = Array.from(new Set(hospitals.map((h) => h.county))).sort();
  const byLevel = hospitals.reduce<Record<number, number>>((acc, h) => {
    acc[h.level] = (acc[h.level] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Hospitals"
        subtitle="National receiving directory"
        apps={APPS}
        activeSlug="admin"
        rightSlot={
          <Chip tone="info" className="font-mono normal-case">
            {hospitals.length} hospitals
          </Chip>
        }
      />

      <section className="flex-1 px-6 py-6 max-w-screen-2xl w-full mx-auto space-y-6">
        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Level 6 (national)" value={byLevel[6] ?? 0} />
          <Kpi label="Level 5 (referral)" value={byLevel[5] ?? 0} />
          <Kpi label="Level 4 (district)" value={byLevel[4] ?? 0} />
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <span className="font-mono text-t3 uppercase tracking-wider">Counties:</span>
          {counties.slice(0, 12).map((c) => (
            <a
              key={c}
              href={`/admin/hospitals?county=${encodeURIComponent(c)}`}
              className="px-2 py-1 rounded-pill border border-line bg-bg1 text-t2 hover:bg-bg2 hover:text-t1"
            >
              {c}
            </a>
          ))}
          {counties.length > 12 && (
            <span className="text-t4 font-mono text-[11px]">+{counties.length - 12} more</span>
          )}
          {(sp.county || sp.level) && (
            <a href="/admin/hospitals" className="ml-2 text-g hover:underline">
              clear
            </a>
          )}
        </div>

        {/* Table */}
        <div className="border border-line rounded-lg overflow-hidden bg-bg1">
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-t3 font-cond uppercase tracking-wider text-[11px]">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Hospital</th>
                <th className="text-left px-4 py-2.5 font-semibold">County</th>
                <th className="text-left px-4 py-2.5 font-semibold">Level</th>
                <th className="text-left px-4 py-2.5 font-semibold">ED capacity</th>
                <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                <th className="text-left px-4 py-2.5 font-semibold">Specialties</th>
              </tr>
            </thead>
            <tbody>
              {hospitals.map((h) => {
                const cap = h.ed_capacity_pct;
                const capTone =
                  cap < 50 ? 'bg-g' : cap < 75 ? 'bg-p3' : cap < 90 ? 'bg-p2' : 'bg-p1';
                return (
                  <tr key={h.id} className="border-t border-line hover:bg-bg2">
                    <td className="px-4 py-3">
                      <div className="text-t1 font-display">{h.name}</div>
                      <div className="text-t3 font-mono text-[10px]">{h.id}</div>
                    </td>
                    <td className="px-4 py-3 text-t2">{h.county}</td>
                    <td className="px-4 py-3">
                      <Chip tone={h.level === 6 ? 'crit' : h.level === 5 ? 'warn' : 'info'}>
                        L{h.level}
                        {h.is_national_referral ? ' · NR' : ''}
                      </Chip>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-bg3 rounded-pill overflow-hidden">
                          <div
                            className={`h-full ${capTone}`}
                            style={{ width: `${cap}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] text-t2 w-8 text-right">
                          {cap}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Chip tone={DIVERSION_TONE[h.diversion_status]}>
                        {DIVERSION_LABEL[h.diversion_status]}
                      </Chip>
                    </td>
                    <td className="px-4 py-3 text-t3 text-[12px]">
                      {h.specialties.length > 0 ? h.specialties.slice(0, 4).join(', ') : '—'}
                      {h.specialties.length > 4 && (
                        <span className="text-t4"> +{h.specialties.length - 4}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-line rounded-lg bg-bg1 px-4 py-3">
      <div className="font-mono text-[10px] text-t3 uppercase tracking-wider">{label}</div>
      <div className="font-display text-2xl font-semibold mt-1 text-t1">{value}</div>
    </div>
  );
}
