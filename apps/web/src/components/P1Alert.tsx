'use client';

import { useEffect, useRef, useState } from 'react';

// Watches for new priority-1 incidents arriving via Supabase Realtime and
// plays a short Web Audio tone + raises a browser notification. Mounts
// fine without Clerk or any other deps; if NEXT_PUBLIC_SUPABASE_* are
// missing it silently no-ops (consistent with RealtimeRefresh).
//
// First mount also drops a small "Enable alerts" affordance — we can't
// play audio or push notifications until the user has interacted.

interface NewIncident {
  display_id: string;
  complaint: string;
  zone?: string | null;
  priority: number;
}

export function P1Alert() {
  const [armed, setArmed] = useState(false);
  const [needsPerm, setNeedsPerm] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mountedAt = useRef<number>(Date.now());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('Notification' in window && Notification.permission === 'default') {
      setNeedsPerm(true);
    }
  }, []);

  useEffect(() => {
    if (!armed) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return;

    let cancelled = false;
    let cleanup = () => {};

    (async () => {
      try {
        const { browserClient } = await import('@sha-nadc/supabase');
        if (cancelled) return;
        const sb = browserClient();
        const channel = sb.channel(`p1-alert-${Math.random().toString(36).slice(2, 7)}`);
        channel.on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'incidents', filter: 'priority=eq.1' },
          (payload) => {
            // ignore the burst on first load (within first 2s of arming)
            if (Date.now() - mountedAt.current < 2000) return;
            const row = payload.new as Partial<NewIncident> & Record<string, unknown>;
            fire({
              display_id: String(row.display_id ?? ''),
              complaint: String(row.complaint ?? 'New P1 incident'),
              zone: typeof row.zone === 'string' ? row.zone : undefined,
              priority: 1,
            });
          },
        );
        channel.subscribe();
        cleanup = () => sb.removeChannel(channel);
      } catch (err) {
        if (typeof console !== 'undefined') console.warn('[P1Alert] disabled:', err);
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [armed]);

  function fire(inc: NewIncident) {
    playChime();
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(`P1 · ${inc.display_id}`, {
        body: `${inc.complaint}${inc.zone ? ' · ' + inc.zone : ''}`,
        tag: inc.display_id,
        requireInteraction: false,
      });
    }
  }

  function playChime() {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctor();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') void ctx.resume();
      const now = ctx.currentTime;
      // Two-note staccato — 880Hz then 660Hz, ~220ms total
      [880, 660].forEach((freq, idx) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        const start = now + idx * 0.12;
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(0.25, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.1);
        o.connect(g).connect(ctx.destination);
        o.start(start);
        o.stop(start + 0.12);
      });
    } catch {
      // best-effort — no fallback if audio unavailable
    }
  }

  async function enable() {
    // user gesture: unlock AudioContext + request notification perm
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctor && !audioCtxRef.current) audioCtxRef.current = new Ctor();
      if (audioCtxRef.current?.state === 'suspended') await audioCtxRef.current.resume();
    } catch {
      /* ignore */
    }
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        /* ignore */
      }
    }
    setNeedsPerm(false);
    setArmed(true);
    // light cue so the user knows it works
    playChime();
  }

  if (armed && !needsPerm) {
    return null;
  }

  return (
    <button
      onClick={enable}
      className="fixed bottom-3 right-3 z-[55] px-3 py-1.5 rounded-md bg-p1/15 hover:bg-p1/25 text-p1 border border-p1/40 text-xs font-display font-medium shadow-s2"
      title="Click to enable P1 audio + browser notifications"
    >
      {armed ? '🔊 Alerts on' : '🔔 Enable P1 alerts'}
    </button>
  );
}
