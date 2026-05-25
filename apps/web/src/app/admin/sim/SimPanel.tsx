'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { simSpawn, simTick, simReset, simDemoReplay, type DemoStep } from './actions';

interface ResultMsg {
  ok: boolean;
  text: string;
  at: number;
}

export function SimPanel({ cronConfigured }: { cronConfigured: boolean }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [toast, setToast] = useState<ResultMsg | null>(null);
  const [demoSteps, setDemoSteps] = useState<DemoStep[] | null>(null);
  const [demoLinks, setDemoLinks] = useState<{ incident?: string; claim?: string } | null>(null);

  function runDemo() {
    setToast(null);
    setDemoSteps([]);
    setDemoLinks(null);
    startTransition(async () => {
      const r = await simDemoReplay();
      if (!r.ok) {
        setToast({ ok: false, text: `Demo failed: ${r.message}`, at: Date.now() });
        return;
      }
      setDemoSteps(r.steps ?? []);
      setDemoLinks({
        incident: r.incident?.id ? `/dispatch/${r.incident.id}` : undefined,
        claim: r.claim?.id ? `/claims/${r.claim.id}` : undefined,
      });
      setToast({
        ok: true,
        text: `Demo replay complete in ${Math.round((r.durationMs ?? 0) / 100) / 10}s · ${r.claim?.claim_number ?? ''} KES ${r.claim?.total_kes?.toLocaleString('en-KE') ?? '?'}`,
        at: Date.now(),
      });
      router.refresh();
    });
  }

  function run(label: string, fn: () => Promise<{ ok: boolean; message: string }>) {
    setToast(null);
    setDemoSteps(null);
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
      {/* DEMO REPLAY — headline button */}
      <div className="border border-g/40 bg-g/5 rounded-lg p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <div className="font-display font-semibold text-t1 text-sm flex items-center gap-2">
              <span className="w-2 h-2 bg-g rounded-full animate-pulse" />
              Demo replay
            </div>
            <div className="font-mono text-[10px] text-t3 mt-0.5">
              PSAP → dispatch → en route → on scene → transport → cleared →
              SHA submit → M-Pesa pay → KRA invoice. ~10 seconds.
            </div>
          </div>
          <button
            onClick={runDemo}
            disabled={busy}
            className="px-5 py-2.5 rounded-md bg-g/15 hover:bg-g/25 text-g border border-g/40 font-display font-semibold text-sm disabled:opacity-40"
          >
            {busy ? '▶ Running…' : '▶ Run demo'}
          </button>
        </div>

        {demoSteps && demoSteps.length > 0 && (
          <div className="mt-4 border-t border-g/20 pt-3 space-y-1">
            {demoSteps.map((s, i) => (
              <div key={i} className="flex items-baseline gap-3 text-[12px]">
                <span className="font-mono text-t3 w-12 text-right tabular-nums">
                  {Math.round(s.at / 100) / 10}s
                </span>
                <span className="text-t1 font-display font-medium min-w-[110px]">
                  {s.label}
                </span>
                <span className="text-t2 flex-1">{s.detail}</span>
                {s.link && (
                  <Link href={s.link} className="text-g hover:underline font-mono text-[10px]">
                    open →
                  </Link>
                )}
              </div>
            ))}
            {demoLinks && (demoLinks.incident || demoLinks.claim) && (
              <div className="pt-3 border-t border-g/20 flex gap-2 text-xs">
                {demoLinks.incident && (
                  <Link
                    href={demoLinks.incident}
                    className="px-3 py-1 rounded-md bg-b2/15 hover:bg-b2/25 text-b2 border border-b2/40 font-display font-medium"
                  >
                    Open incident
                  </Link>
                )}
                {demoLinks.claim && (
                  <Link
                    href={demoLinks.claim}
                    className="px-3 py-1 rounded-md bg-g/15 hover:bg-g/25 text-g border border-g/40 font-display font-medium"
                  >
                    Open claim
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </div>

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
