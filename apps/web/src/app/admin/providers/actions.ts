'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serviceClient } from '@/lib/supabase';
import { currentAgent } from '@/lib/auth';

// Provider onboarding — creates a 'provider_contract' pending_approval so
// a supervisor/admin vets the new operator at /admin/pending before they
// go live. Realistic intake flow; reuses the approvals queue rather than
// writing straight to a live providers table.

export async function submitProviderOnboarding(formData: FormData): Promise<void> {
  const company = String(formData.get('company') ?? '').trim();
  const contactName = String(formData.get('contact_name') ?? '').trim();
  const contactPhone = String(formData.get('contact_phone') ?? '').trim();
  const contactEmail = String(formData.get('contact_email') ?? '').trim();
  const county = String(formData.get('county') ?? '').trim();
  const fleetSize = Number(formData.get('fleet_size') ?? 0);
  const alsCount = Number(formData.get('als_count') ?? 0);
  const payoutMethod = String(formData.get('payout_method') ?? 'mpesa').trim();
  const payoutRef = String(formData.get('payout_ref') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();

  if (!company) redirect('/admin/providers/new?error=' + encodeURIComponent('Company name required'));
  if (!contactPhone) redirect('/admin/providers/new?error=' + encodeURIComponent('Contact phone required'));

  const sb = serviceClient();
  const agent = await currentAgent();

  const { error } = await sb.from('pending_approvals').insert({
    kind: 'provider_contract',
    reference: company,
    requested_by: agent?.id ?? null,
    notes: `Onboard ${company} — ${fleetSize} units (${alsCount} ALS), ${county || 'county TBD'}`,
    payload: {
      company,
      contact: { name: contactName, phone: contactPhone, email: contactEmail },
      county,
      fleet: { total: fleetSize, als: alsCount, bls: Math.max(0, fleetSize - alsCount) },
      payout: { method: payoutMethod, reference: payoutRef },
      notes,
    },
  });
  if (error) redirect('/admin/providers/new?error=' + encodeURIComponent(error.message));

  await sb.from('dispatch_events').insert({
    event_type: 'provider_onboarding_submitted',
    event_note: `Provider onboarding submitted: ${company} (${fleetSize} units)`,
    actor_type: 'admin',
    agent_id: agent?.id ?? null,
    payload: { company, fleet_size: fleetSize },
  });

  revalidatePath('/admin/pending');
  revalidatePath('/admin/providers');
  redirect('/admin/providers?submitted=' + encodeURIComponent(company));
}
