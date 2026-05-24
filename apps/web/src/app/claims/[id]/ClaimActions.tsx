'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  approveClaim,
  disputeClaim,
  rejectClaim,
  initiatePayment,
  submitToSha,
  generateInvoice,
} from '../actions';
import type { ClaimStatus } from '@/lib/claims';

interface Props {
  id: string;
  status: ClaimStatus;
}

// Mapping of which actions are valid for each status. Drives button enablement
// so a dispatcher can't, e.g., approve a paid claim.
const ALLOWED: Record<ClaimStatus, string[]> = {
  draft: ['submit'],
  submitted: ['approve', 'dispute', 'reject'],
  approved: ['pay', 'invoice'],
  disputed: ['approve', 'reject'],
  rejected: [],
  pending_payment: ['pay'],
  paid: ['invoice'],
  invoiced: [],
};

export function ClaimActions({ id, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const allowed = ALLOWED[status] ?? [];

  function run(label: string, fn: () => Promise<{ ok: boolean; message: string }>) {
    setToast(null);
    startTransition(async () => {
      const r = await fn();
      setToast({ kind: r.ok ? 'ok' : 'err', text: `${label}: ${r.message}` });
      if (r.ok) router.refresh();
    });
  }

  function withReason(label: string, fn: (reason: string) => Promise<{ ok: boolean; message: string }>) {
    const reason = window.prompt(`${label} reason?`, '') ?? '';
    if (!reason.trim()) return;
    run(label, () => fn(reason.trim()));
  }

  const Btn = ({
    children,
    onClick,
    tone = 'default',
    disabled = false,
  }: {
    children: React.ReactNode;
    onClick: () => void;
    tone?: 'default' | 'ok' | 'warn' | 'crit' | 'info';
    disabled?: boolean;
  }) => {
    const toneClass = {
      default: 'bg-bg2 hover:bg-bg3 text-t1 border-line',
      ok: 'bg-g/15 hover:bg-g/25 text-g border-g/40',
      warn: 'bg-p2/15 hover:bg-p2/25 text-p2 border-p2/40',
      crit: 'bg-p1/15 hover:bg-p1/25 text-p1 border-p1/40',
      info: 'bg-b2/15 hover:bg-b2/25 text-b2 border-b2/40',
    }[tone];
    return (
      <button
        onClick={onClick}
        disabled={disabled || pending}
        className={[
          'px-3 py-2 rounded-md border text-sm font-display font-medium',
          'transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
          toneClass,
        ].join(' ')}
      >
        {children}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Btn
          tone="info"
          disabled={!allowed.includes('submit')}
          onClick={() => run('Submit to SHA', () => submitToSha(id))}
        >
          Submit to SHA
        </Btn>
        <Btn
          tone="ok"
          disabled={!allowed.includes('approve')}
          onClick={() => run('Approve', () => approveClaim(id))}
        >
          Approve
        </Btn>
        <Btn
          tone="warn"
          disabled={!allowed.includes('dispute')}
          onClick={() => withReason('Dispute', (reason) => disputeClaim(id, reason))}
        >
          Dispute
        </Btn>
        <Btn
          tone="crit"
          disabled={!allowed.includes('reject')}
          onClick={() => withReason('Reject', (reason) => rejectClaim(id, reason))}
        >
          Reject
        </Btn>
        <Btn
          tone="ok"
          disabled={!allowed.includes('pay')}
          onClick={() => run('M-Pesa payment', () => initiatePayment(id))}
        >
          Pay via M-Pesa
        </Btn>
        <Btn
          tone="info"
          disabled={!allowed.includes('invoice')}
          onClick={() => run('Generate invoice', () => generateInvoice(id))}
        >
          Generate KRA invoice
        </Btn>
      </div>

      {pending && (
        <div className="text-xs font-mono text-t3 animate-pulse">Working…</div>
      )}

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
