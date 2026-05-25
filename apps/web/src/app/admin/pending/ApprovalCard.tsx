'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resolveApproval } from './actions';

interface Props {
  approval: {
    id: string;
    kind: string;
    reference: string;
    payload: Record<string, unknown>;
    notes: string;
    created_at: string;
    requested_by_name?: string;
  };
}

const KIND_LABEL: Record<string, string> = {
  priority_override: 'Priority override',
  hospital_bypass: 'Hospital bypass',
  claim_dispute_escalation: 'Claim dispute escalation',
  fleet_emergency: 'Fleet emergency',
  crew_reassign: 'Crew reassign',
  provider_contract: 'Provider contract',
  generic: 'Other',
};

const KIND_TONE: Record<string, string> = {
  priority_override: 'bg-p1/15 text-p1 border-p1/40',
  hospital_bypass: 'bg-p2/15 text-p2 border-p2/40',
  claim_dispute_escalation: 'bg-p3/15 text-p3 border-p3/40',
  fleet_emergency: 'bg-p1/15 text-p1 border-p1/40',
  crew_reassign: 'bg-b2/15 text-b2 border-b2/40',
  provider_contract: 'bg-bg2 text-t2 border-line',
  generic: 'bg-bg2 text-t2 border-line',
};

export function ApprovalCard({ approval }: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();

  function decide(outcome: 'approved' | 'rejected') {
    const note =
      window.prompt(`${outcome === 'approved' ? 'Approve' : 'Reject'} — add a note (optional):`, '') ??
      '';
    startTransition(async () => {
      const r = await resolveApproval(approval.id, outcome, note.trim());
      if (!r.ok) window.alert(r.message);
      router.refresh();
    });
  }

  const tone = KIND_TONE[approval.kind] ?? KIND_TONE.generic;
  const label = KIND_LABEL[approval.kind] ?? approval.kind;
  const created = new Date(approval.created_at);
  const ageMin = Math.round((Date.now() - created.getTime()) / 60_000);

  return (
    <div className="border border-line rounded-lg bg-bg1 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className={`px-2 py-0.5 rounded-sm text-[10px] font-mono uppercase tracking-wider border ${tone}`}>
            {label}
          </span>
          <div className="text-t1 font-display text-base mt-2">
            {approval.notes || 'No description provided'}
          </div>
          <div className="font-mono text-[11px] text-t3 mt-1">
            ref · {approval.reference} · {ageMin < 60 ? `${ageMin}m` : `${Math.round(ageMin / 60)}h`} ago
            {approval.requested_by_name && <> · by {approval.requested_by_name}</>}
          </div>
        </div>
      </div>

      {Object.keys(approval.payload).length > 0 && (
        <div className="bg-bg2 border border-line rounded-md px-3 py-2 font-mono text-[11px] text-t2 overflow-x-auto">
          <pre>{JSON.stringify(approval.payload, null, 2)}</pre>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => decide('approved')}
          disabled={busy}
          className="flex-1 px-3 py-2 rounded-md bg-g/15 hover:bg-g/25 text-g border border-g/40 font-display font-medium text-sm disabled:opacity-40"
        >
          {busy ? '…' : 'Approve'}
        </button>
        <button
          onClick={() => decide('rejected')}
          disabled={busy}
          className="flex-1 px-3 py-2 rounded-md bg-p1/15 hover:bg-p1/25 text-p1 border border-p1/40 font-display font-medium text-sm disabled:opacity-40"
        >
          {busy ? '…' : 'Reject'}
        </button>
      </div>
    </div>
  );
}
