'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

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
//
// IMPORTANT: this component must never crash the client tree. The Supabase
// connection requires NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
// to be inlined at build time. If they're missing (build-cache mismatch on
// Vercel, etc.) we silently fall back to polling only.

export function RealtimeRefresh({ tables, fallbackMs = 60_000, debounceMs = 250 }: Props) {
  const router = useRouter();
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const debounced = () => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => router.refresh(), debounceMs);
    };

    // Always keep polling — it's the safety net if realtime fails.
    const poll = setInterval(debounced, fallbackMs);

    let cleanup = () => {
      clearInterval(poll);
      if (pending.current) clearTimeout(pending.current);
    };

    // Attempt realtime — catch any boot error so the page survives.
    (async () => {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !anon) return; // polling only

        const { browserClient } = await import('@sha-nadc/supabase');
        const sb = browserClient();
        const channel = sb.channel(
          `rt-${tables.join('-')}-${Math.random().toString(36).slice(2, 7)}`,
        );
        for (const table of tables) {
          channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table },
            debounced,
          );
        }
        channel.subscribe();

        cleanup = () => {
          sb.removeChannel(channel);
          clearInterval(poll);
          if (pending.current) clearTimeout(pending.current);
        };
      } catch (err) {
        // Swallow — polling fallback already running. Log for devtools.
        if (typeof console !== 'undefined') {
          console.warn('[RealtimeRefresh] realtime disabled:', err);
        }
      }
    })();

    return () => cleanup();
  }, [router, tables, fallbackMs, debounceMs]);

  return null;
}
