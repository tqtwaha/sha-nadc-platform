// Server-only incident helpers — display_id allocator. Importing this from
// a client component is a build error (server-only enforces).

import 'server-only';
import { serviceClient } from './supabase';

export async function nextDisplayId(): Promise<string> {
  const sb = serviceClient();
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `INC-${today}-`;

  const { data, error } = await sb
    .from('incidents')
    .select('display_id')
    .like('display_id', `${prefix}%`)
    .order('display_id', { ascending: false })
    .limit(1);
  if (error) throw error;

  let next = 1;
  if (data && data.length > 0) {
    const last = data[0]!.display_id as string;
    const tail = parseInt(last.slice(prefix.length), 10);
    if (!Number.isNaN(tail)) next = tail + 1;
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
}
