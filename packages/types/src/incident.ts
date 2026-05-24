import { z } from 'zod';
import { PrioritySchema, DeterminantLevelSchema, DeterminantCodeSchema } from './priority';

// Incident status flow:
//   pending → dispatched → en_route → on_scene → transport → at_hospital → cleared
// Plus terminal: cancelled
export const IncidentStatusSchema = z.enum([
  'pending',
  'dispatched',
  'en_route',
  'on_scene',
  'transport',
  'at_hospital',
  'cleared',
  'cancelled',
]);
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

// Source of incident creation — sim, PSAP call-taker, or dispatcher manual.
// `psap` and `dispatcher` MUST suppress auto-dispatch — dispatcher decides.
export const IncidentSourceSchema = z.enum(['sim', 'psap', 'dispatcher']);
export type IncidentSource = z.infer<typeof IncidentSourceSchema>;

// Patient sex — ICD/HL7 compatible (M / F / U for unknown / O for other).
export const PatientSexSchema = z.enum(['M', 'F', 'U', 'O']);
export type PatientSex = z.infer<typeof PatientSexSchema>;

export const IncidentSchema = z.object({
  // Identity
  id: z.string().uuid(),
  displayId: z.string(),                    // human-facing INC-2026-NNNN

  // Triage
  priority: PrioritySchema,
  complaint: z.string(),
  icd11: z.string().optional(),
  requiresAls: z.boolean().default(false),
  determinantCode: DeterminantCodeSchema.optional(),
  determinantLevel: DeterminantLevelSchema.optional(),
  triageSessionId: z.string().uuid().optional(),

  // Location
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string(),
  w3w: z.string().optional(),
  landmark: z.string().optional(),
  floor: z.string().optional(),
  county: z.string(),
  zone: z.string(),

  // Parties
  callerName: z.string().optional(),
  callerPhone: z.string().optional(),
  callerRelation: z.string().optional(),
  patientAge: z.number().int().nonnegative().optional(),
  patientSex: PatientSexSchema.optional(),

  // Assignment
  status: IncidentStatusSchema,
  unitId: z.string().optional(),
  hospitalId: z.string().optional(),
  dispatcherId: z.string().optional(),
  notes: z.string().default(''),
  source: IncidentSourceSchema.default('sim'),

  // Lifecycle timestamps
  createdAt: z.string().datetime(),
  dispatchedAt: z.string().datetime().nullable(),
  enRouteAt: z.string().datetime().nullable(),
  onSceneAt: z.string().datetime().nullable(),
  transportAt: z.string().datetime().nullable(),
  atHospitalAt: z.string().datetime().nullable(),
  clearedAt: z.string().datetime().nullable(),

  // Audit
  updatedAt: z.string().datetime(),
});
export type Incident = z.infer<typeof IncidentSchema>;

// Partial used for creation — server fills id, displayId, status (=pending),
// createdAt, updatedAt; everything else can be supplied or derived.
export const IncidentCreateSchema = IncidentSchema.omit({
  id: true,
  displayId: true,
  status: true,
  dispatchedAt: true,
  enRouteAt: true,
  onSceneAt: true,
  transportAt: true,
  atHospitalAt: true,
  clearedAt: true,
  createdAt: true,
  updatedAt: true,
}).partial({ requiresAls: true, notes: true, source: true });
export type IncidentCreate = z.infer<typeof IncidentCreateSchema>;
