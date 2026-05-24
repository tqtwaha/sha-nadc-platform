'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  assignNearestUnit,
  setStatus,
  setHospital,
  cancelIncident,
} from '../actions';
import { NEXT_STATUSES, type IncidentStatus } from '@/lib/incidents';

interface HospitalOption {
  id: string;
  label: string;
}

interface Props {
  incidentId: string;
  status: IncidentStatus;
  hasUnit: boolean;
  hospitalId: string | null;
  hospitals: HospitalOption[];
}

const STATUS_LABEL: Record<IncidentStatus, string> = {
  pending: 'Pending',
  dispatched: 'Dispatched',
  en_route: 'En route',
  on_scene: 'On scene',
  transport: 'Transport',
  cleared: 'Cleared',
  cancelled: 'Cancelled',
};

export function IncidentActions({ incidentId, status, hasUnit, hospitalId, hospitals }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [hospitalSel, setHospitalSel] = useState(hospitalId ?? '');

  const run = (label: string, fn: () => Promise<{ ok: boolean; message: string }>) => {
    setToast(null);
    startTransition(async () => {
      const r = await fn();
      setToast({ kind: r.ok ? 'ok' : 'err', text: `${label}: ${r.message}` });
      if (r.ok) router.refresh();
    });
  };

  const allowedNext = NEXT_STATUSES[status];

  return (
    <div className="space-y-4">
      {/* Dispatch / status transitions */}
      <div className="flex flex-wrap gap-2">
        {status === 'pending' && (
          <Btn tone="ok" disabled={pending} onClick={() => run('Dispatch', () => assignNearestUnit(incidentId))}>
            Assign nearest unit
          </Btn>
        )}
        {allowedNext
          .filter((s) => s !== 'cancelled')
          .map((s) => (
            <Btn
              key={s}
              tone={s === 'cleared' ? 'ok' : 'info'}
              disabled={pending || (!hasUnit && status !== 'pending')}
              onClick={() => run(`→ ${STATUS_LABEL[s]}`, () => setStatus(incidentId, s))}
            >
              → {STATUS_LABEL[s]}
            </Btn>
          ))}
        {allowedNext.includes('cancelled') && (
          <Btn
            tone="crit"
            disabled={pending}
            onClick={() => {
              const reason = window.prompt('Cancellation reason?') ?? '';
              if (!reason.trim()) return;
              run('Cancel', () => cancelIncident(incidentId, reason.trim()));
            }}
          >
            Cancel
          </Btn>
        )}
      </div>

      {/* Hospital routing */}
      <div className="flex items-center gap-2">
        <label className="font-mono text-[10px] text-t3 uppercase tracking-wider">
          Route to
        </label>
        <select
          value={hospitalSel}
          onChange={(e) => setHospitalSel(e.target.value)}
          disabled={pending}
          className="flex-1 bg-bg2 border border-line rounded-md px-2 py-1.5 text-t1 text-xs"
        >
          <option value="">— select hospital —</option>
          {hospitals.map((h) => (
            <option key={h.id} value={h.id}>
              {h.label}
            </option>
          ))}
        </select>
        <Btn
          tone="info"
          disabled={pending || !hospitalSel || hospitalSel === hospitalId}
          onClick={() => run('Route', () => setHospital(incidentId, hospitalSel))}
        >
          Set
        </Btn>
      </div>

      {pending && <div className="text-xs font-mono text-t3 animate-pulse">Working…</div>}
      {toast && (
        <div
          className={[
            'text-xs font-mono px-3 py-2 rounded-md border',
            toast.kind === 'ok'
              ? 'bg-g/10 text-g border-g/30'
              : 'bg-p1/10 text-p1 border-p1/30',
          ].join(' ')}
        >
          {toast.text}
        </div>
      )}
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
  tone: 'ok' | 'info' | 'warn' | 'crit';
  disabled?: boolean;
}) {
  const cls = {
    ok: 'bg-g/15 hover:bg-g/25 text-g border-g/40',
    info: 'bg-b2/15 hover:bg-b2/25 text-b2 border-b2/40',
    warn: 'bg-p2/15 hover:bg-p2/25 text-p2 border-p2/40',
    crit: 'bg-p1/15 hover:bg-p1/25 text-p1 border-p1/40',
  }[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'px-3 py-1.5 rounded-md border text-xs font-display font-medium',
        'transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        cls,
      ].join(' ')}
    >
      {children}
    </button>
  );
}
