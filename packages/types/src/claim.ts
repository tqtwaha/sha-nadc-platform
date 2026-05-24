import { z } from 'zod';

export const ClaimStatusSchema = z.enum([
  'draft',
  'submitted',          // sent to SHA AfyaLink (stub for now)
  'approved',
  'disputed',
  'rejected',
  'pending_payment',    // awaiting M-Pesa callback (stub for now)
  'paid',
  'invoiced',           // KRA eTIMS issued (stub for now)
]);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

export const ClaimTariffTypeSchema = z.enum(['ALS', 'BLS']);
export type ClaimTariffType = z.infer<typeof ClaimTariffTypeSchema>;

export const ClaimSchema = z.object({
  id: z.string().uuid(),
  claimNumber: z.string(),                       // CLM-2026-NN-XXXX
  incidentId: z.string().uuid().nullable(),
  providerId: z.string().nullable(),
  unitId: z.string().nullable(),
  hospitalId: z.string().nullable(),

  // Clinical
  icd11: z.string().optional(),
  chiefComplaint: z.string(),

  // Pricing
  tariffType: ClaimTariffTypeSchema,
  baseKes: z.number().int().nonnegative(),
  distanceKm: z.number().nonnegative(),
  perKmKes: z.number().int().nonnegative(),
  freeKm: z.number().int().nonnegative().default(25),
  consumablesKes: z.number().int().nonnegative().default(0),
  totalKes: z.number().int().nonnegative(),

  // Workflow
  status: ClaimStatusSchema,
  notes: z.string().default(''),
  submittedAt: z.string().datetime().nullable(),
  approvedAt: z.string().datetime().nullable(),
  paidAt: z.string().datetime().nullable(),
  invoiceNumber: z.string().nullable(),          // set when eTIMS stub fires
  mpesaRef: z.string().nullable(),               // set when M-Pesa stub fires

  // Audit
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Claim = z.infer<typeof ClaimSchema>;
