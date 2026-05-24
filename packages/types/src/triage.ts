import { z } from 'zod';
import { DeterminantCodeSchema, DeterminantLevelSchema } from './priority';

// Vitals reading — captured by EMT on scene. Field names use the standard
// clinical short-form so they line up with FHIR Observation.code.
export const VitalsSchema = z.object({
  hr: z.number().int().min(0).max(300).optional(),                  // heart rate bpm
  sys: z.number().int().min(0).max(300).optional(),                 // systolic mmHg
  dia: z.number().int().min(0).max(200).optional(),                 // diastolic mmHg
  spo2: z.number().int().min(0).max(100).optional(),                // SpO2 %
  rr: z.number().int().min(0).max(80).optional(),                   // respiratory rate /min
  gcs: z.number().int().min(3).max(15).optional(),                  // Glasgow Coma Scale
  tempC: z.number().min(20).max(50).optional(),                     // body temp °C
  bgl: z.number().min(0).max(60).optional(),                        // blood glucose mmol/L
  recordedAt: z.string().datetime(),
  recordedBy: z.string(),                                           // unit id (e.g. 'A-014')
  note: z.string().optional(),
});
export type Vitals = z.infer<typeof VitalsSchema>;

export const TriageQuestionAnswerSchema = z.object({
  questionId: z.string(),
  questionText: z.string(),
  answer: z.union([z.string(), z.number(), z.boolean()]),
});
export type TriageQuestionAnswer = z.infer<typeof TriageQuestionAnswerSchema>;

export const TriageSessionSchema = z.object({
  id: z.string().uuid(),
  protocolId: z.string(),
  protocolName: z.string(),
  determinantCode: DeterminantCodeSchema.nullable(),
  determinantLevel: DeterminantLevelSchema.nullable(),
  answers: z.array(TriageQuestionAnswerSchema).default([]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  callTakerId: z.string().uuid().nullable(),
  callId: z.string().uuid().nullable(),
  incidentId: z.string().uuid().nullable(),
});
export type TriageSession = z.infer<typeof TriageSessionSchema>;
