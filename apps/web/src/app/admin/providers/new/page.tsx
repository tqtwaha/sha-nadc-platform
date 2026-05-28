import Link from 'next/link';
import { Topbar, Chip } from '@sha-nadc/ui';
import { APPS } from '@/lib/apps';
import { submitProviderOnboarding } from '../actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const KENYA_COUNTIES = [
  'Nairobi','Mombasa','Kiambu','Nakuru','Machakos','Kajiado','Kisumu','Uasin Gishu','Nyeri','Kakamega',
  'Meru','Murang\'a','Bungoma','Kilifi','Garissa','Kericho','Embu','Kitui','Trans Nzoia','Vihiga',
];

export default async function NewProviderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <main className="min-h-screen flex flex-col">
      <Topbar
        title="NADC · Onboard provider"
        subtitle="Ambulance operator intake"
        apps={APPS}
        activeSlug="admin"
        rightSlot={<Chip tone="info">vetting queue</Chip>}
      />

      <section className="flex-1 max-w-2xl w-full mx-auto px-6 py-8 space-y-6">
        <Link href="/admin/providers" className="text-xs font-mono text-t3 hover:text-t1">
          ← Providers
        </Link>

        <div>
          <h2 className="font-display text-xl text-t1">Onboard a new provider</h2>
          <p className="text-t2 text-sm mt-2">
            Submitting creates a vetting request in the supervisor approval queue
            (/admin/pending). Once approved, the operator&apos;s fleet is registered and
            they can begin receiving dispatches.
          </p>
        </div>

        <form action={submitProviderOnboarding} className="border border-line rounded-lg bg-bg1 p-6 space-y-5">
          {sp.error && (
            <div className="text-xs font-mono px-3 py-2 rounded-md bg-p1/10 text-p1 border border-p1/30">
              {sp.error}
            </div>
          )}

          <Section title="Company">
            <Field label="Operator name" required>
              <input name="company" required placeholder="e.g. Coast Rapid Response EMS"
                className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm" />
            </Field>
            <Field label="Primary county">
              <select name="county" defaultValue="Nairobi"
                className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm">
                {KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </Section>

          <Section title="Contact">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Contact name">
                <input name="contact_name"
                  className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm" />
              </Field>
              <Field label="Phone" required>
                <input name="contact_phone" type="tel" required placeholder="+254…"
                  className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm font-mono" />
              </Field>
              <Field label="Email">
                <input name="contact_email" type="email"
                  className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm" />
              </Field>
            </div>
          </Section>

          <Section title="Fleet">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Total units">
                <input name="fleet_size" type="number" min="0" defaultValue="0"
                  className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm font-mono" />
              </Field>
              <Field label="of which ALS">
                <input name="als_count" type="number" min="0" defaultValue="0"
                  className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm font-mono" />
              </Field>
            </div>
          </Section>

          <Section title="Payout">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Method">
                <select name="payout_method" defaultValue="mpesa"
                  className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm">
                  <option value="mpesa">M-Pesa</option>
                  <option value="pesalink">PesaLink</option>
                  <option value="bank">Bank transfer</option>
                </select>
              </Field>
              <Field label="Paybill / account">
                <input name="payout_ref" placeholder="e.g. 400200"
                  className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm font-mono" />
              </Field>
            </div>
          </Section>

          <Field label="Notes for the vetting team">
            <textarea name="notes" rows={3}
              placeholder="Licensing, KMPDC registration, existing SHIF contract status…"
              className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm" />
          </Field>

          <div className="flex items-center justify-between pt-2 border-t border-line">
            <div className="text-[11px] font-mono text-t3">Creates a provider_contract approval.</div>
            <button type="submit"
              className="px-4 py-2 rounded-md bg-g/15 hover:bg-g/25 text-g border border-g/40 font-display font-medium text-sm">
              Submit for vetting
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-cond uppercase tracking-wider text-[11px] text-t3 mb-2">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <div className="font-mono text-[10px] text-t3 uppercase tracking-wider mb-1">
        {label}{required && <span className="text-p1 ml-1">*</span>}
      </div>
      {children}
    </label>
  );
}
