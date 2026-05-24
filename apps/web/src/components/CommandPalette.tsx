'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { APPS } from '@/lib/apps';

// Cmd+K palette. Two layers of suggestions:
//   - Static "apps" — jump to any of the 9 surfaces
//   - Live results from /api/palette — incidents, claims, units, hospitals
// Live search is debounced 180ms so we don't hammer Supabase per keystroke.

type Result = {
  kind: 'incident' | 'claim' | 'unit' | 'hospital' | 'app';
  href: string;
  title: string;
  subtitle: string;
  badge?: string;
};

const APP_RESULTS: Result[] = APPS.map((a) => ({
  kind: 'app',
  href: a.href,
  title: a.label,
  subtitle: a.slug,
}));

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cmd+K / Ctrl+K to toggle, Esc to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQ('');
      setCursor(0);
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Debounced fetch
  useEffect(() => {
    if (!open) return;
    if (q.trim().length === 0) {
      setResults([]);
      return;
    }
    const term = q.trim();
    setLoading(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/palette?q=${encodeURIComponent(term)}`, {
          signal: ctrl.signal,
        });
        const j = await r.json();
        setResults((j.results ?? []) as Result[]);
        setLoading(false);
      } catch {
        // aborted or network — silent
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  const list = useMemo(() => {
    const filteredApps =
      q.trim().length === 0
        ? APP_RESULTS
        : APP_RESULTS.filter((r) => r.title.toLowerCase().includes(q.trim().toLowerCase()));
    return [...filteredApps, ...results];
  }, [q, results]);

  // Keyboard nav
  useEffect(() => {
    if (cursor >= list.length) setCursor(Math.max(0, list.length - 1));
  }, [list.length, cursor]);

  const select = useCallback(
    (idx: number) => {
      const r = list[idx];
      if (!r) return;
      router.push(r.href);
      setOpen(false);
    },
    [list, router],
  );

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(list.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select(cursor);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-20 bg-bg/70 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-bg1 border border-line rounded-lg shadow-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
          <span className="font-mono text-[10px] text-t3 uppercase tracking-wider">⌘K</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onInputKey}
            placeholder="Search incidents, claims, units, hospitals…"
            className="flex-1 bg-transparent text-t1 outline-none text-sm"
          />
          {loading && <span className="text-[10px] font-mono text-t3 animate-pulse">…</span>}
        </div>

        {/* Results */}
        <div className="max-h-[420px] overflow-y-auto">
          {list.length === 0 && (
            <div className="px-4 py-8 text-center text-t3 font-mono text-xs">No matches.</div>
          )}
          {list.map((r, i) => {
            const active = i === cursor;
            return (
              <button
                key={`${r.kind}-${r.href}-${i}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => select(i)}
                className={[
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  active ? 'bg-bg2' : 'hover:bg-bg2',
                ].join(' ')}
              >
                <KindTag kind={r.kind} />
                <div className="flex-1 min-w-0">
                  <div className="text-t1 text-sm truncate">{r.title}</div>
                  <div className="text-t3 font-mono text-[10px] truncate">{r.subtitle}</div>
                </div>
                {r.badge && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-sm bg-p1/20 text-p1">
                    {r.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-line bg-bg1/50">
          <div className="font-mono text-[10px] text-t3">
            ↑↓ to navigate · ↵ to open · esc to close
          </div>
          <div className="font-mono text-[10px] text-t3">{list.length} results</div>
        </div>
      </div>
    </div>
  );
}

function KindTag({ kind }: { kind: Result['kind'] }) {
  const styles = {
    app: 'bg-g/15 text-g',
    incident: 'bg-p1/15 text-p1',
    claim: 'bg-b2/15 text-b2',
    unit: 'bg-p2/15 text-p2',
    hospital: 'bg-p3/15 text-p3',
  }[kind];
  return (
    <span
      className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm shrink-0 ${styles}`}
    >
      {kind}
    </span>
  );
}
