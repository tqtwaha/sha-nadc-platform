'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setFlag, setRollout } from './actions';

interface Props {
  flag: {
    key: string;
    enabled: boolean;
    description: string;
    rollout_pct: number;
    category: string;
    owner: string | null;
    updated_at: string;
  };
}

const CATEGORY_TONE: Record<string, string> = {
  integration: 'bg-b2/15 text-b2 border-b2/40',
  ops: 'bg-g/15 text-g border-g/40',
  beta: 'bg-p2/15 text-p2 border-p2/40',
  kill_switch: 'bg-p1/15 text-p1 border-p1/40',
  general: 'bg-bg2 text-t2 border-line',
};

export function FlagRow({ flag }: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [rollout, setRolloutLocal] = useState(flag.rollout_pct);

  function toggle() {
    if (flag.category === 'kill_switch' && !flag.enabled) {
      if (!window.confirm('Enable EMERGENCY LOCKDOWN? This will disable writes platform-wide.')) return;
    }
    startTransition(async () => {
      await setFlag(flag.key, !flag.enabled);
      router.refresh();
    });
  }

  function commitRollout() {
    if (rollout === flag.rollout_pct) return;
    startTransition(async () => {
      await setRollout(flag.key, rollout);
      router.refresh();
    });
  }

  return (
    <div className="border-t border-line px-4 py-4 hover:bg-bg2 transition-colors">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[12px] text-t1">{flag.key}</span>
            <span className={`px-2 py-0.5 rounded-sm text-[9px] font-mono uppercase tracking-wider border ${CATEGORY_TONE[flag.category] ?? CATEGORY_TONE.general}`}>
              {flag.category.replace('_', ' ')}
            </span>
            {flag.owner && (
              <span className="text-[10px] font-mono text-t3">owner · {flag.owner}</span>
            )}
          </div>
          <div className="text-t2 text-sm mt-1">{flag.description}</div>
          <div className="mt-3 flex items-center gap-3 text-xs">
            <span className="text-t3 font-mono uppercase tracking-wider text-[10px]">Rollout</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={rollout}
              onChange={(e) => setRolloutLocal(Number(e.target.value))}
              onMouseUp={commitRollout}
              onTouchEnd={commitRollout}
              disabled={busy || !flag.enabled}
              className="flex-1 max-w-xs accent-g"
            />
            <span className="font-mono text-t1 w-10 text-right">{rollout}%</span>
          </div>
        </div>

        <button
          onClick={toggle}
          disabled={busy}
          className={[
            'shrink-0 w-12 h-7 rounded-pill border transition-colors relative',
            flag.enabled
              ? 'bg-g/30 border-g/60'
              : flag.category === 'kill_switch'
                ? 'bg-bg2 border-p1/40'
                : 'bg-bg2 border-line',
            busy && 'opacity-40',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={`${flag.enabled ? 'Disable' : 'Enable'} ${flag.key}`}
        >
          <span
            className={[
              'absolute top-0.5 w-5 h-5 rounded-full transition-all',
              flag.enabled ? 'left-6 bg-g' : 'left-0.5 bg-t3',
            ].join(' ')}
          />
        </button>
      </div>
    </div>
  );
}
