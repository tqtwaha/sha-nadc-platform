import { z } from 'zod';

// Priority levels — P1 critical / life-threatening, P4 non-urgent.
export const PrioritySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type Priority = z.infer<typeof PrioritySchema>;

// MPDS determinant level — Echo (E) most acute, Alpha (A) least.
export const DeterminantLevelSchema = z.enum(['E', 'D', 'C', 'B', 'A']);
export type DeterminantLevel = z.infer<typeof DeterminantLevelSchema>;

// Determinant code, e.g. "09E1" — protocol + level + suffix.
export const DeterminantCodeSchema = z.string().regex(
  /^\d{2}[EDCBA]\d{1,2}$/,
  'Determinant code format: NN[E|D|C|B|A]N (e.g. 09E1)',
);
export type DeterminantCode = z.infer<typeof DeterminantCodeSchema>;
