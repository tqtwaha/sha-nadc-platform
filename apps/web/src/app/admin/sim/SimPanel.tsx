'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { simSpawn, simTick, simReset } from './actions';

interface ResultMsg {
  ok: boolean;
  text: string;
  at: number;
}

export function SimPanel({ cronConfigured }: { cronConfigured: boolean }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [toast, setToast] = useState<ResultMsg | null>(null);

  function run(label: string, fn: () => Promise<{ ok: boolean; message: string }>) {
    setToast(null);
    startTransition(async () => {
      const r = await fn();
      setToast({ ok: r.ok, text: `${label}: ${r.message}`, at: Date.now() });
      if (r.ok) router.refresh();
    });
  }

  if (!cronConfigured) {
    return (
      <div className="rounded-lg border border-p1/40 bg-p1/10 p-4 text-sm">
        <div className="text-p1 font-display font-semibold mb-1">CRON_SECRET not set</div>
        <p className="text-t2 text-xs font-mono">
          Add <span className="text-t1">CRON_SECRET</span> in Vercel → Settings → Environment
          Variables → Production. Any random string works. Sim controls activate after redeploy.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Spawn */}
      <Group title="Spawn pending incidents" caption="Each click drops N random calls into the queue.">
        <Btn onClick={() => run('Spawn 1', () => simSpawn(1))} disabled={busy} tone="info">
          + 1
        </Btn>
        <Btn onClick={() => run('Spawn 3', () => simSpawn(3))} disabled={busy} tone="info">
          + 3
        </Btn>
        <Btn onClick={() => run('Spawn 5', () => simSpawn(5))} disabled={busy} tone="info">
          + 5
        </Btn>
      </Group>

      {/* Tick */}
      <Group title="Advance lifecycle" caption="Pending → dispatched → en route → on scene → transport → cleared (mints a claim).">
        <Btn onClick={() => run('Tick 1', () => simTick(1))} disabled={busy} tone="ok">
          ▶ 1
        </Btn>
        <Btn onClick={() => run('Tick 3', () => simTick(3))} disabled={busy} tone="ok">
          ▶ 3
        </Btn>
        <Btn onClick={() => run('Tick 10', () => simTick(10))} disabled={busy} tone="ok">
          ▶ 10
        </Btn>
      </Group>

      {/* Reset */}
      <Group
        title="Reset demo state"
        caption="Deletes ALL incidents + claims + events. Fleet returns to 'available'. Hospitals + agents untouched."
      >
        <Btn
          onClick={() => {
            if (!window.confirm('Wipe all incidents, claims, and events?')) return;
            run('Reset', simReset);
          }}
          disabled={busy}
          tone="crit"
        >
          ⚠ Wipe everything
        </Btn>
      </Group>

      {busy && <div className="text-xs font-mono text-t3 animate-pulse">Working…</div>}
      {toast && (
        <div
          className={[
            'text-xs font-mono px-3 py-2 rounded-md border',
            toast.ok ? 'bg-g/10 text-g border-g/30' : 'bg-p1/10 text-p1 border-p1/30',
          ].join(' ')}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-line rounded-lg bg-bg1 p-4">
      <div className="font-display font-semibold text-t1 text-sm">{title}</div>
      <div className="font-mono text-[10px] text-t3 mt-0.5 mb-3">{caption}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  tone,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: 'info' | 'ok' | 'crit';
  disabled: boolean;
}) {
  const cls = {
    info: 'bg-b2/15 hover:bg-b2/25 text-b2 border-b2/40',
    ok: 'bg-g/15 hover:bg-g/25 text-g border-g/40',
    crit: 'bg-p1/15 hover:bg-p1/25 text-p1 border-p1/40',
  }[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'px-4 py-2 rounded-md border text-sm font-display font-medium',
        'transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        cls,
      ].join(' ')}
    >
      {children}
    </button>
  );
}
