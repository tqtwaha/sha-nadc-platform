'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { bulkSubmitDrafts, bulkApproveSubmitted, bulkPayApproved } from './bulk-actions';

interface Props {
  draftCount: number;
  submittedCount: number;
  approvedCount: number;
  exportHref: string;
}

export function BulkActionsBar({
  draftCount,
  submittedCount,
  approvedCount,
  exportHref,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function run(label: string, fn: () => Promise<{ ok: boolean; message: string }>) {
    if (!window.confirm(`${label}?`)) return;
    setToast(null);
    startTransition(async () => {
      const r = await fn();
      setToast({ kind: r.ok ? 'ok' : 'err', text: r.message });
      if (r.ok) router.refresh();
    });
  }

  const Btn = ({
    children,
    count,
    onClick,
    tone,
  }: {
    children: React.ReactNode;
    count: number;
    onClick: () => void;
    tone: 'info' | 'ok' | 'g';
  }) => {
    const cls = {
      info: 'bg-b2/15 hover:bg-b2/25 text-b2 border-b2/40',
      ok: 'bg-g/15 hover:bg-g/25 text-g border-g/40',
      g: 'bg-g/15 hover:bg-g/25 text-g border-g/40',
    }[tone];
    const disabled = count === 0 || pending;
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={[
          'flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-display font-medium',
          'transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
          cls,
        ].join(' ')}
      >
        {children}
        <span className="font-mono text-[10px] px-1.5 rounded-sm bg-white/[0.1]">{count}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Btn
        tone="info"
        count={draftCount}
        onClick={() => run(`Submit ${draftCount} drafts to SHA`, bulkSubmitDrafts)}
      >
        Submit drafts
      </Btn>
      <Btn
        tone="ok"
        count={submittedCount}
        onClick={() => run(`Approve ${submittedCount} submitted claims`, bulkApproveSubmitted)}
      >
        Approve submitted
      </Btn>
      <Btn
        tone="g"
        count={approvedCount}
        onClick={() => run(`Pay ${approvedCount} approved claims via M-Pesa`, bulkPayApproved)}
      >
        Pay approved
      </Btn>
      <a
        href={exportHref}
        className="px-3 py-1.5 rounded-md border border-line bg-bg2 hover:bg-bg3 text-t2 hover:text-t1 text-xs font-display font-medium"
      >
        Export CSV
      </a>
      {pending && (
        <span className="text-xs font-mono text-t3 animate-pulse">Working…</span>
      )}
      {toast && (
        <span
          className={[
            'text-xs font-mono px-2 py-1 rounded-md',
            toast.kind === 'ok' ? 'text-g' : 'text-p1',
          ].join(' ')}
        >
          {toast.text}
        </span>
      )}
    </div>
  );
}
