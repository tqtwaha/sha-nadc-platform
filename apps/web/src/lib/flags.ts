// Feature flag reader — cached in-memory for 30s so we don't query
// feature_flags on every Server Action. Cache resets on process boot
// (Vercel function cold start) and on revalidatePath('/admin/flags').

import 'server-only';
import { serviceClient } from './supabase';

interface FlagMap {
  [key: string]: { enabled: boolean; rollout_pct: number };
}

let cache: { map: FlagMap; at: number } | null = null;
const TTL_MS = 30_000;

async function load(): Promise<FlagMap> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.map;
  const sb = serviceClient();
  const { data } = await sb.from('feature_flags').select('key, enabled, rollout_pct');
  const map: FlagMap = {};
  for (const f of data ?? []) {
    map[f.key] = { enabled: !!f.enabled, rollout_pct: Number(f.rollout_pct ?? 100) };
  }
  cache = { map, at: now };
  return map;
}

export async function isEnabled(key: string): Promise<boolean> {
  const map = await load();
  const f = map[key];
  return f ? f.enabled : false;
}

export async function rolloutPct(key: string): Promise<number> {
  const map = await load();
  return map[key]?.rollout_pct ?? 0;
}

export async function killSwitchEngaged(): Promise<boolean> {
  return isEnabled('emergency_lockdown');
}
