import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { COMPLAINTS, NAIROBI_ZONES } from '@sha-nadc/domain';
import { serviceClient } from '@/lib/supabase';
import { fmtRelative } from '@/lib/format';
import { createIncident } from './actions';
import { RealtimeRefresh } from '@/components/RealtimeRefresh';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const KENYA_COUNTIES = [
  'Nairobi','Mombasa','Kiambu','Nakuru','Machakos','Kajiado','Kisumu','Uasin Gishu','Nyeri','Kakamega',
  'Meru','Murang\'a','Bungoma','Kilifi','Trans Nzoia','Garissa','Kericho','Embu','Kitui','Vihiga',
];

export default async function PsapPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const sb = serviceClient();
  const since6h = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data: recent } = await sb
    .from('incidents')
    .select('id, display_id, priority, complaint, county, zone, status, source, created_at')
    .gte('created_at', since6h)
    .order('created_at', { ascending: false })
    .limit(15);

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · PSAP"
        subtitle="Call intake"
        apps={APPS}
        activeSlug="psap"
        rightSlot={
          <Chip tone="info" className="font-mono normal-case">
            {recent?.length ?? 0} last 6h
          </Chip>
        }
      />

      <RealtimeRefresh tables={['incidents']} />

      <section className="flex-1 px-6 py-6 max-w-screen-2xl w-full mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Intake form */}
          <form
            action={createIncident}
            className="lg:col-span-2 border border-line rounded-lg bg-bg1 p-6 space-y-5"
          >
            <h2 className="font-display text-lg text-t1">New incident intake</h2>

            {sp.error && (
              <div className="text-xs font-mono px-3 py-2 rounded-md bg-p1/10 text-p1 border border-p1/30">
                {sp.error}
              </div>
            )}

            {/* Clinical row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Chief complaint" required>
                <select
                  name="complaint"
                  required
                  defaultValue=""
                  className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm"
                >
                  <option value="" disabled>
                    Select complaint…
                  </option>
                  {COMPLAINTS.map((c) => (
                    <option key={c.text} value={c.text}>
                      P{c.priority} — {c.text} ({c.icd11})
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="MPDS level" required>
                  <select
                    name="determinant_level"
                    required
                    defaultValue=""
                    className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm font-mono"
                  >
                    <option value="" disabled>—</option>
                    <option value="E">E · Echo</option>
                    <option value="D">D · Delta</option>
                    <option value="C">C · Charlie</option>
                    <option value="B">B · Bravo</option>
                    <option value="A">A · Alpha</option>
                  </select>
                </Field>
                <Field label="Determinant">
                  <input
                    type="text"
                    name="determinant_code"
                    placeholder="e.g. 09E01"
                    className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm font-mono"
                  />
                </Field>
              </div>
            </div>

            {/* Location row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="County" required>
                <select
                  name="county"
                  defaultValue="Nairobi"
                  className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm"
                >
                  {KENYA_COUNTIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Zone (Nairobi)">
                <select
                  name="zone"
                  defaultValue="CBD"
                  className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm font-mono"
                >
                  {NAIROBI_ZONES.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.id} · {z.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Landmark">
                <input
                  type="text"
                  name="landmark"
                  placeholder="e.g. opp KICC"
                  className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm"
                />
              </Field>
            </div>

            <Field label="Address / what3words" required>
              <input
                type="text"
                name="address"
                required
                placeholder="Street, area or ///filed.gross.suspends"
                className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm"
              />
            </Field>

            {/* Caller / patient */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Caller name">
                <input
                  type="text"
                  name="caller_name"
                  className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm"
                />
              </Field>
              <Field label="Caller phone">
                <input
                  type="tel"
                  name="caller_phone"
                  placeholder="+254…"
                  className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm font-mono"
                />
              </Field>
              <Field label="Relation">
                <select
                  name="caller_relation"
                  defaultValue=""
                  className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm"
                >
                  <option value="">—</option>
                  <option>Self</option>
                  <option>Family</option>
                  <option>Bystander</option>
                  <option>Healthcare worker</option>
                  <option>Police / fire</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Patient age">
                <input
                  type="number"
                  name="patient_age"
                  min="0"
                  max="120"
                  className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm font-mono"
                />
              </Field>
              <Field label="Sex">
                <select
                  name="patient_sex"
                  defaultValue=""
                  className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm"
                >
                  <option value="">—</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </Field>
            </div>

            <Field label="Notes">
              <textarea
                name="notes"
                rows={3}
                placeholder="Anything else the responders need to know…"
                className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm"
              />
            </Field>

            <div className="flex items-center justify-between pt-2 border-t border-line">
              <div className="text-[11px] font-mono text-t3">
                Submitting creates a pending incident and jumps to dispatch.
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-md bg-g/15 hover:bg-g/25 text-g border border-g/40 font-display font-medium text-sm"
              >
                Create incident
              </button>
            </div>
          </form>

          {/* Recent calls */}
          <div className="border border-line rounded-lg bg-bg1 p-5">
            <h3 className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-3">
              Recent calls (6h)
            </h3>
            {(!recent || recent.length === 0) ? (
              <div className="text-t3 font-mono text-xs">No calls in the last 6 hours.</div>
            ) : (
              <ol className="space-y-2">
                {recent.map((r) => (
                  <li
                    key={r.id}
                    className="px-3 py-2 rounded-md bg-bg2 border border-line text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Chip tone={r.priority === 1 ? 'crit' : r.priority === 2 ? 'warn' : 'caution'}>
                        P{r.priority}
                      </Chip>
                      <span className="font-mono text-[10px] text-t3">{r.display_id}</span>
                      {r.source === 'psap' && (
                        <Chip tone="info" className="text-[9px]">live</Chip>
                      )}
                    </div>
                    <div className="text-t1 mt-1 truncate">{r.complaint}</div>
                    <div className="text-t3 font-mono text-[10px] mt-0.5">
                      {r.zone} · {r.county} · {r.status} · {fmtRelative(r.created_at)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <div className="font-mono text-[10px] text-t3 uppercase tracking-wider mb-1">
        {label}
        {required && <span className="text-p1 ml-1">*</span>}
      </div>
      {children}
    </label>
  );
}
