'use server';

// Server Actions for claim workflow transitions. Each action validates input,
// updates the row, writes a dispatch_events audit entry, and returns a typed
// result. External integrations (M-Pesa, AfyaLink, KRA) are stubbed here
// behind clean adapter functions — swap to real implementations in Phase 5+.

import { revalidatePath } from 'next/cache';
import { serviceClient } from '@/lib/supabase';
import type { ClaimStatus } from '@/lib/claims';

interface ActionResult {
  ok: boolean;
  message: string;
  newStatus?: ClaimStatus;
  externalRef?: string;
}

async function logEvent(
  claimId: string,
  eventType: string,
  note: string,
  payload: Record<string, unknown> = {},
) {
  const sb = serviceClient();
  await sb.from('dispatch_events').insert({
    event_type: eventType,
    event_note: note,
    actor_type: 'system',
    payload: { claim_id: claimId, ...payload },
  });
}

export async function approveClaim(id: string): Promise<ActionResult> {
  const sb = serviceClient();
  const now = new Date().toISOString();
  const { error, data } = await sb
    .from('claims')
    .update({ status: 'approved', approved_at: now })
    .eq('id', id)
    .select('claim_number')
    .single();
  if (error) return { ok: false, message: error.message };
  await logEvent(id, 'claim_approved', `${data.claim_number} approved`);
  revalidatePath('/claims');
  revalidatePath(`/claims/${id}`);
  return { ok: true, message: 'Approved', newStatus: 'approved' };
}

export async function disputeClaim(id: string, reason: string): Promise<ActionResult> {
  const sb = serviceClient();
  const { error, data } = await sb
    .from('claims')
    .update({ status: 'disputed', notes: reason || 'Disputed' })
    .eq('id', id)
    .select('claim_number')
    .single();
  if (error) return { ok: false, message: error.message };
  await logEvent(id, 'claim_disputed', `${data.claim_number} disputed`, { reason });
  revalidatePath('/claims');
  revalidatePath(`/claims/${id}`);
  return { ok: true, message: 'Disputed', newStatus: 'disputed' };
}

export async function rejectClaim(id: string, reason: string): Promise<ActionResult> {
  const sb = serviceClient();
  const { error, data } = await sb
    .from('claims')
    .update({ status: 'rejected', notes: reason || 'Rejected' })
    .eq('id', id)
    .select('claim_number')
    .single();
  if (error) return { ok: false, message: error.message };
  await logEvent(id, 'claim_rejected', `${data.claim_number} rejected`, { reason });
  revalidatePath('/claims');
  revalidatePath(`/claims/${id}`);
  return { ok: true, message: 'Rejected', newStatus: 'rejected' };
}

// ── STUB: M-Pesa Daraja payment initiation ────────────────────────
// Real flow: POST to api.safaricom.co.ke STK Push endpoint, await callback.
// Stub: fakes a callback after 500ms with a mock reference.
export async function initiatePayment(id: string): Promise<ActionResult> {
  const sb = serviceClient();
  const mpesaRef = `QXL${Math.random().toString(36).slice(2, 11).toUpperCase()}`;
  await new Promise((r) => setTimeout(r, 500));
  const { error, data } = await sb
    .from('claims')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      mpesa_ref: mpesaRef,
    })
    .eq('id', id)
    .select('claim_number')
    .single();
  if (error) return { ok: false, message: error.message };
  await logEvent(id, 'payment_completed', `${data.claim_number} paid via M-Pesa`, { mpesaRef });
  revalidatePath('/claims');
  revalidatePath(`/claims/${id}`);
  return { ok: true, message: 'Payment completed', newStatus: 'paid', externalRef: mpesaRef };
}

// ── STUB: SHA AfyaLink FHIR submission ────────────────────────────
// Real flow: POST a FHIR Claim resource to AfyaLink production endpoint.
// Stub: marks the claim as 'submitted' with a fake timestamp.
export async function submitToSha(id: string): Promise<ActionResult> {
  const sb = serviceClient();
  const { error, data } = await sb
    .from('claims')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', id)
    .select('claim_number')
    .single();
  if (error) return { ok: false, message: error.message };
  await logEvent(id, 'claim_submitted', `${data.claim_number} submitted to SHA AfyaLink (stub)`);
  revalidatePath('/claims');
  revalidatePath(`/claims/${id}`);
  return { ok: true, message: 'Submitted to SHA (stub)', newStatus: 'submitted' };
}

// ── STUB: KRA eTIMS tax invoice generation ────────────────────────
// Real flow: POST to KRA eTIMS Online Sales Control Unit API.
// Stub: marks the claim 'invoiced' with a fake invoice number.
export async function generateInvoice(id: string): Promise<ActionResult> {
  const sb = serviceClient();
  const yr = new Date().getFullYear();
  const mo = String(new Date().getMonth() + 1).padStart(2, '0');
  const seq = Math.floor(Math.random() * 9000) + 1000;
  const invoiceNumber = `KRA-INV-${yr}${mo}-${seq}`;
  const { error, data } = await sb
    .from('claims')
    .update({ status: 'invoiced', invoice_number: invoiceNumber })
    .eq('id', id)
    .select('claim_number')
    .single();
  if (error) return { ok: false, message: error.message };
  await logEvent(id, 'invoice_generated', `${data.claim_number} invoiced via KRA eTIMS (stub)`, {
    invoiceNumber,
  });
  revalidatePath('/claims');
  revalidatePath(`/claims/${id}`);
  return {
    ok: true,
    message: 'Invoice generated (stub)',
    newStatus: 'invoiced',
    externalRef: invoiceNumber,
  };
}
