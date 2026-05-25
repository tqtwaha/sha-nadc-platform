'use server';

import { revalidatePath } from 'next/cache';
import { serviceClient } from '@/lib/supabase';
import { currentAgent } from '@/lib/auth';

export async function resolveApproval(
  id: string,
  outcome: 'approved' | 'rejected',
  note: string,
) {
  const sb = serviceClient();
  const agent = await currentAgent();
  const { data, error } = await sb
    .from('pending_approvals')
    .update({
      status: outcome,
      resolved_at: new Date().toISOString(),
      resolved_by: agent?.id ?? null,
      resolved_note: note,
    })
    .eq('id', id)
    .select('kind, reference')
    .single();
  if (error) return { ok: false, message: error.message };

  await sb.from('dispatch_events').insert({
    event_type: outcome === 'approved' ? 'approval_granted' : 'approval_rejected',
    event_note: `${data.kind} (${data.reference}): ${outcome}${note ? ' — ' + note : ''}`,
    actor_type: 'supervisor',
    agent_id: agent?.id ?? null,
    payload: { approval_id: id, outcome, kind: data.kind, reference: data.reference },
  });

  revalidatePath('/admin/pending');
  revalidatePath('/supervisor');
  return { ok: true, message: outcome === 'approved' ? 'Approved' : 'Rejected' };
}
