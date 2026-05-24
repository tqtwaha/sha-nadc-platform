'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { browserClient } from '@sha-nadc/supabase';

interface Props {
  /** Tables in the public schema to subscribe to (e.g. ['incidents','fleet_units']). */
  tables: string[];
  /** Optional fallback polling interval in ms. Default 60s — guards against missed events. */
  fallbackMs?: number;
  /** Debounce noisy bursts. Default 250ms — multiple events in quick succession trigger one refresh. */
  debounceMs?: number;
}

// Subscribes to postgres_changes for the given tables and calls
// router.refresh() (which re-runs the RSC payload) when anything changes.
// Falls back to polling at a low rate in case a Realtime event is missed
// or the websocket drops.

export function RealtimeRefresh({ tables, fallbackMs = 60_000, debounceMs = 250 }: Props) {
  const router = useRouter();
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sb = browserClient();
    const debounced = () => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => router.refresh(), debounceMs);
    };

    const channel = sb.channel(`rt-${tables.join('-')}-${Math.random().toString(36).slice(2, 7)}`);
    for (const table of tables) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        debounced,
      );
    }
    channel.subscribe();

    const poll = setInterval(debounced, fallbackMs);

    return () => {
      sb.removeChannel(channel);
      clearInterval(poll);
      if (pending.current) clearTimeout(pending.current);
    };
  }, [router, tables, fallbackMs, debounceMs]);

  return null;
}
