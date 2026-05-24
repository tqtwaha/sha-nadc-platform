'use server';

// Bulk Server Actions for the Claims queue. These exist alongside per-row
// actions in ./actions.ts and let a dispatcher clear a whole status bucket
// in one click — e.g. "submit all 8 drafts to SHA" or "approve all submitted".

import { revalidatePath } from 'next/cache';
import { serviceClient } from '@/lib/supabase';

interface BulkResult {
  ok: boolean;
  message: string;
  count: number;
}

async function logBulk(eventType: string, note: string, count: number) {
  const sb = serviceClient();
  await sb.from('dispatch_events').insert({
    event_type: eventType,
    event_note: note,
    actor_type: 'system',
    payload: { count },
  });
}

export async function bulkSubmitDrafts(): Promise<BulkResult> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from('claims')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('status', 'draft')
    .select('id');
  if (error) return { ok: false, message: error.message, count: 0 };
  const count = data?.length ?? 0;
  await logBulk('bulk_claim_submitted', `${count} drafts submitted to SHA (stub)`, count);
  revalidatePath('/claims');
  return { ok: true, message: `Submitted ${count} drafts`, count };
}

export async function bulkApproveSubmitted(): Promise<BulkResult> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from('claims')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('status', 'submitted')
    .select('id');
  if (error) return { ok: false, message: error.message, count: 0 };
  const count = data?.length ?? 0;
  await logBulk('bulk_claim_approved', `${count} submitted claims approved`, count);
  revalidatePath('/claims');
  return { ok: true, message: `Approved ${count} submitted`, count };
}

export async function bulkPayApproved(): Promise<BulkResult> {
  const sb = serviceClient();
  const { data: rows, error: selErr } = await sb
    .from('claims')
    .select('id')
    .eq('status', 'approved');
  if (selErr) return { ok: false, message: selErr.message, count: 0 };

  let paid = 0;
  for (const r of rows ?? []) {
    const mpesaRef = `QXL${Math.random().toString(36).slice(2, 11).toUpperCase()}`;
    const { error: uErr } = await sb
      .from('claims')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        mpesa_ref: mpesaRef,
      })
      .eq('id', r.id);
    if (!uErr) paid += 1;
  }
  await logBulk('bulk_payment_completed', `${paid} claims paid via M-Pesa (stub)`, paid);
  revalidatePath('/claims');
  return { ok: true, message: `Paid ${paid} approved claims`, count: paid };
}
