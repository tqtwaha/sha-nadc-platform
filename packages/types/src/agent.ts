import { z } from 'zod';

// PSAP call-taker / dispatcher / supervisor.
export const AgentRoleSchema = z.enum([
  'call_taker',
  'dispatcher',
  'senior_dispatcher',
  'supervisor',
  'admin',
]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const AgentStatusSchema = z.enum(['on_call', 'ready', 'break', 'off_shift']);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  email: z.string().email(),
  phone: z.string().optional(),
  role: AgentRoleSchema,
  status: AgentStatusSchema,
  extension: z.string().optional(),                 // PBX extension
  clerkUserId: z.string().optional(),               // bridge to Clerk
  shiftStartedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});
export type Agent = z.infer<typeof AgentSchema>;
