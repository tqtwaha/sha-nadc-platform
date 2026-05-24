'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { emtSetStatus, emtCancel, clearAndBill } from '../actions';
import { NEXT_STATUSES, type IncidentStatus } from '@/lib/incidents';

interface Props {
  incidentId: string;
  status: IncidentStatus;
  unit: string;
  unitType: 'ALS' | 'BLS';
  hospitalId: string | null;
  hospitals: Array<{ id: string; label: string }>;
}

const STATUS_LABEL: Record<IncidentStatus, string> = {
  pending: 'Pending',
  dispatched: 'Acknowledge',
  en_route: 'En route',
  on_scene: 'On scene',
  transport: 'Transport',
  cleared: 'Cleared',
  cancelled: 'Cancelled',
};

const STATUS_BTN_LABEL: Partial<Record<IncidentStatus, string>> = {
  dispatched: 'Acknowledge dispatch',
  en_route: 'Mark en route',
  on_scene: 'Arrived on scene',
  transport: 'Begin transport',
};

export function CrewActions({ incidentId, status, unit, unitType, hospitalId, hospitals }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [distanceKm, setDistanceKm] = useState(8);
  const [consumablesKes, setConsumablesKes] = useState(0);
  const [hospitalSel, setHospitalSel] = useState(hospitalId ?? '');
  const [notes, setNotes] = useState('');
  const [hr, setHr] = useState('');
  const [bpSys, setBpSys] = useState('');
  const [bpDia, setBpDia] = useState('');
  const [spo2, setSpo2] = useState('');
  const [rr, setRr] = useState('');
  const [gcs, setGcs] = useState('');

  const next = NEXT_STATUSES[status].filter((s) => s !== 'cancelled');

  const goNext = (target: IncidentStatus) => {
    startTransition(async () => {
      await emtSetStatus(incidentId, target, unit);
      router.refresh();
    });
  };

  const finalize = () => {
    if (!window.confirm(`Clear incident and create draft claim for KES ${expectedTotal()}?`)) return;
    const numOrUndef = (v: string) => (v === '' ? undefined : Number(v));
    const vitals = {
      hr: numOrUndef(hr),
      bp_sys: numOrUndef(bpSys),
      bp_dia: numOrUndef(bpDia),
      spo2: numOrUndef(spo2),
      rr: numOrUndef(rr),
      gcs: numOrUndef(gcs),
    };
    const filtered: Record<string, number> = {};
    for (const [k, v] of Object.entries(vitals)) if (v !== undefined && !Number.isNaN(v)) filtered[k] = v;

    startTransition(async () => {
      await clearAndBill({
        incidentId,
        unit,
        distanceKm,
        consumablesKes,
        hospitalId: hospitalSel || null,
        notes,
        vitals: filtered,
      });
    });
  };

  // Mirror computeTariff so the EMT sees the total before tapping clear.
  const expectedTotal = () => {
    const rate = unitType === 'ALS' ? { base: 3500, perKm: 120, freeKm: 25 } : { base: 2000, perKm: 80, freeKm: 25 };
    const chargeable = Math.max(0, distanceKm - rate.freeKm);
    return rate.base + Math.round(chargeable * rate.perKm) + consumablesKes;
  };

  const cancel = () => {
    const reason = window.prompt('Why cancel this run?');
    if (!reason || !reason.trim()) return;
    startTransition(async () => {
      await emtCancel(incidentId, reason.trim(), unit);
      router.refresh();
    });
  };

  const canFinalize = status === 'transport' || status === 'on_scene';

  return (
    <div className="space-y-4">
      {next.length > 0 && (
        <div className="space-y-2">
          {next.map((s) => (
            <button
              key={s}
              onClick={() => goNext(s)}
              disabled={pending}
              className="w-full py-3 rounded-lg bg-b2/15 hover:bg-b2/25 text-b2 border border-b2/40 font-display font-medium text-base disabled:opacity-40"
            >
              {STATUS_BTN_LABEL[s] ?? `→ ${STATUS_LABEL[s]}`}
            </button>
          ))}
        </div>
      )}

      {canFinalize && (
        <div className="space-y-3 border-t border-line pt-4">
          <div className="font-cond uppercase tracking-wider text-[11px] text-t3">
            Clear & create claim
          </div>

          <NumField
            label="Distance (km)"
            value={distanceKm}
            onChange={setDistanceKm}
            step={0.5}
            hint={`First 25 km free · ${unitType} per-km rate ${unitType === 'ALS' ? 120 : 80}`}
          />
          <NumField
            label="Consumables (KES)"
            value={consumablesKes}
            onChange={setConsumablesKes}
            step={50}
            hint="O2, drugs, dressings"
          />

          {/* Vitals snapshot */}
          <div className="border border-line rounded-md p-3 bg-bg2/40">
            <div className="font-cond uppercase tracking-wider text-[10px] text-t3 mb-2">
              Vitals at handoff (optional)
            </div>
            <div className="grid grid-cols-3 gap-2">
              <VitalField label="HR" value={hr} onChange={setHr} unit="bpm" />
              <VitalField label="BP sys" value={bpSys} onChange={setBpSys} unit="mmHg" />
              <VitalField label="BP dia" value={bpDia} onChange={setBpDia} unit="mmHg" />
              <VitalField label="SpO₂" value={spo2} onChange={setSpo2} unit="%" />
              <VitalField label="RR" value={rr} onChange={setRr} unit="/min" />
              <VitalField label="GCS" value={gcs} onChange={setGcs} unit="/15" />
            </div>
          </div>

          <div>
            <div className="font-mono text-[10px] text-t3 uppercase tracking-wider mb-1">
              Receiving hospital
            </div>
            <select
              value={hospitalSel}
              onChange={(e) => setHospitalSel(e.target.value)}
              className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm"
            >
              <option value="">— select —</option>
              {hospitals.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="font-mono text-[10px] text-t3 uppercase tracking-wider mb-1">
              EPCR notes
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Clinical summary…"
              className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-sm"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-line">
            <div>
              <div className="font-mono text-[10px] text-t3 uppercase tracking-wider">
                Estimated total
              </div>
              <div className="font-display text-2xl text-t1 font-semibold">
                KES {expectedTotal().toLocaleString('en-KE')}
              </div>
            </div>
            <button
              onClick={finalize}
              disabled={pending}
              className="px-5 py-3 rounded-lg bg-g/15 hover:bg-g/25 text-g border border-g/40 font-display font-semibold text-base disabled:opacity-40"
            >
              {pending ? 'Working…' : 'Clear + Bill'}
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-line pt-3">
        <button
          onClick={cancel}
          disabled={pending}
          className="w-full py-2 rounded-md border border-p1/40 bg-p1/10 hover:bg-p1/20 text-p1 text-sm font-display font-medium disabled:opacity-40"
        >
          Cancel run
        </button>
      </div>
    </div>
  );
}

function VitalField({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  unit: string;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[9px] text-t3 uppercase tracking-wider">{label}</span>
        <span className="font-mono text-[9px] text-t4">{unit}</span>
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        className="w-full bg-bg2 border border-line rounded-md px-2 py-1 text-t1 text-sm font-mono mt-0.5"
      />
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  hint?: string;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] text-t3 uppercase tracking-wider mb-1">{label}</div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        step={step}
        min={0}
        className="w-full bg-bg2 border border-line rounded-md px-3 py-2 text-t1 text-base font-mono"
      />
      {hint && <div className="text-[10px] font-mono text-t4 mt-0.5">{hint}</div>}
    </div>
  );
}
