'use server';

import { revalidatePath } from 'next/cache';
import { serviceClient } from '@/lib/supabase';

export async function setFlag(key: string, enabled: boolean) {
  const sb = serviceClient();
  const { error } = await sb
    .from('feature_flags')
    .update({ enabled })
    .eq('key', key);
  if (error) return { ok: false, message: error.message };

  await sb.from('dispatch_events').insert({
    event_type: enabled ? 'flag_enabled' : 'flag_disabled',
    event_note: `feature flag ${key} → ${enabled ? 'ON' : 'OFF'}`,
    actor_type: 'system',
    payload: { flag: key, enabled },
  });

  revalidatePath('/admin/flags');
  return { ok: true, message: enabled ? 'Enabled' : 'Disabled' };
}

export async function setRollout(key: string, rolloutPct: number) {
  const sb = serviceClient();
  const pct = Math.max(0, Math.min(100, Math.round(rolloutPct)));
  const { error } = await sb
    .from('feature_flags')
    .update({ rollout_pct: pct })
    .eq('key', key);
  if (error) return { ok: false, message: error.message };
  revalidatePath('/admin/flags');
  return { ok: true, message: `Rollout set to ${pct}%` };
}
