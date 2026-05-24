// Complaint catalogue — drawn from v1 lib/nadc-state.js COMPLAINTS.
// Each complaint carries its baseline priority, ICD-11 code, and whether
// it needs ALS-trained crew. The weighted picker reflects real Kenyan
// EMS call-mix data (cardiac, RTA, obstetric dominant).

export interface Complaint {
  text:        string;
  icd11:       string;
  priority:    1 | 2 | 3 | 4;
  requiresAls: boolean;
  weight:      number;       // higher = more common
}

export const COMPLAINTS: readonly Complaint[] = [
  { text: 'Cardiac arrest',              icd11: 'I46.9', priority: 1, requiresAls: true,  weight: 4 },
  { text: 'Road traffic accident',       icd11: 'V89',   priority: 1, requiresAls: true,  weight: 8 },
  { text: 'Stroke / CVA suspected',      icd11: 'I64',   priority: 1, requiresAls: true,  weight: 5 },
  { text: 'Severe burns',                icd11: 'T31',   priority: 1, requiresAls: true,  weight: 3 },
  { text: 'Obstetric emergency',         icd11: 'O67',   priority: 1, requiresAls: true,  weight: 6 },
  { text: 'Respiratory distress',        icd11: 'R06.0', priority: 2, requiresAls: true,  weight: 5 },
  { text: 'Severe trauma',               icd11: 'T07',   priority: 2, requiresAls: true,  weight: 4 },
  { text: 'Seizure / convulsion',        icd11: 'R56.9', priority: 2, requiresAls: false, weight: 4 },
  { text: 'Chest pain',                  icd11: 'R07.4', priority: 2, requiresAls: true,  weight: 6 },
  { text: 'Severe haemorrhage',          icd11: 'R58',   priority: 2, requiresAls: true,  weight: 3 },
  { text: 'Diabetic emergency',          icd11: 'E16.2', priority: 3, requiresAls: false, weight: 3 },
  { text: 'Fall, elderly',               icd11: 'W19',   priority: 3, requiresAls: false, weight: 5 },
  { text: 'Asthma exacerbation',         icd11: 'J45.9', priority: 3, requiresAls: false, weight: 3 },
  { text: 'Lacerations, requires transport', icd11: 'T14.1', priority: 3, requiresAls: false, weight: 4 },
  { text: 'Mental health crisis',        icd11: 'F99',   priority: 3, requiresAls: false, weight: 2 },
  { text: 'Non-urgent transfer',         icd11: 'Z75.1', priority: 4, requiresAls: false, weight: 2 },
] as const;

const TOTAL_WEIGHT = COMPLAINTS.reduce((acc, c) => acc + c.weight, 0);

export function weightedComplaint(rnd: () => number = Math.random): Complaint {
  let r = rnd() * TOTAL_WEIGHT;
  for (const c of COMPLAINTS) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return COMPLAINTS[COMPLAINTS.length - 1]!;
}
