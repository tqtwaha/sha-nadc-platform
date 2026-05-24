import { z } from 'zod';

// Inbound call disposition.
export const CallDispositionSchema = z.enum([
  'incident_created',
  'no_emergency',
  'prank',
  'transferred',
  'abandoned',
]);
export type CallDisposition = z.infer<typeof CallDispositionSchema>;

export const CallSchema = z.object({
  id: z.string().uuid(),
  callerPhone: z.string(),
  callerName: z.string().optional(),
  receivedAt: z.string().datetime(),
  answeredAt: z.string().datetime().nullable(),
  endedAt: z.string().datetime().nullable(),
  callTakerId: z.string().uuid().nullable(),
  triageSessionId: z.string().uuid().nullable(),
  incidentId: z.string().uuid().nullable(),
  disposition: CallDispositionSchema.nullable(),
  recordingUrl: z.string().url().optional(),       // for audit
  source: z.enum(['3cx', 'mock', 'manual']).default('mock'),
});
export type Call = z.infer<typeof CallSchema>;
