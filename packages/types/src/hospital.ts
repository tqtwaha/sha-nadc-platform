import { z } from 'zod';

export const DiversionStatusSchema = z.enum(['open', 'caution', 'diverting', 'bypass']);
export type DiversionStatus = z.infer<typeof DiversionStatusSchema>;

export const HospitalSchema = z.object({
  id: z.string(),                                // 'h001'
  name: z.string(),
  fullName: z.string(),
  level: z.union([z.literal(4), z.literal(5), z.literal(6)]),
  isNationalReferral: z.boolean(),
  lat: z.number(),
  lng: z.number(),
  county: z.string(),
  edCapacityPct: z.number().min(0).max(100),
  diversionStatus: DiversionStatusSchema,
  specialties: z.array(z.string()).default([]),
  updatedAt: z.string().datetime(),
});
export type Hospital = z.infer<typeof HospitalSchema>;
