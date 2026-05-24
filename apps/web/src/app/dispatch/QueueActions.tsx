'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { assignNearestUnit, setStatus } from './actions';
import type { IncidentStatus } from '@/lib/incidents';

const NEXT_LABEL: Partial<Record<IncidentStatus, { label: string; tone: string }>> = {
  dispatched: { label: 'Mark en-route', tone: 'info' },
  en_route: { label: 'Mark on-scene', tone: 'ok' },
  on_scene: { label: 'Transporting', tone: 'info' },
  transport: { label: 'Clear', tone: 'ok' },
};

const NEXT_VALUE: Partial<Record<IncidentStatus, IncidentStatus>> = {
  dispatched: 'en_route',
  en_route: 'on_scene',
  on_scene: 'transport',
  transport: 'cleared',
};

export function QueueActions({
  incidentId,
  status,
  hasUnit,
}: {
  incidentId: string;
  status: IncidentStatus;
  hasUnit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        // surface error inline
        window.alert(r.message);
      }
      router.refresh();
    });
  };

  if (status === 'pending') {
    return (
      <button
        onClick={() => run(() => assignNearestUnit(incidentId))}
        disabled={pending}
        className="px-2.5 py-1 rounded-md bg-g/15 hover:bg-g/25 text-g border border-g/40 text-[11px] font-display font-medium disabled:opacity-40"
      >
        {pending ? '…' : 'Dispatch'}
      </button>
    );
  }

  const next = NEXT_VALUE[status];
  const label = NEXT_LABEL[status];
  if (!next || !label) return null;

  const tone = {
    info: 'bg-b2/15 hover:bg-b2/25 text-b2 border-b2/40',
    ok: 'bg-g/15 hover:bg-g/25 text-g border-g/40',
  }[label.tone as 'info' | 'ok'];

  return (
    <button
      onClick={() => run(() => setStatus(incidentId, next))}
      disabled={pending || !hasUnit}
      className={`px-2.5 py-1 rounded-md border text-[11px] font-display font-medium disabled:opacity-40 ${tone}`}
    >
      {pending ? '…' : label.label}
    </button>
  );
}
