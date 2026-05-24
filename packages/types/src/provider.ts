import { z } from 'zod';

export const ProviderTypeSchema = z.enum(['public', 'private', 'ngo', 'county']);
export type ProviderType = z.infer<typeof ProviderTypeSchema>;

export const ProviderSchema = z.object({
  id: z.string(),                                   // 'PRV001'
  name: z.string(),
  type: ProviderTypeSchema,
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  county: z.string().optional(),
  contractNumber: z.string().optional(),
  contractValidUntil: z.string().datetime().optional(),
  activeFleetCount: z.number().int().nonnegative().default(0),
  activeCrewCount: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Provider = z.infer<typeof ProviderSchema>;
