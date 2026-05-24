import { z } from 'zod';

// Unit operational status. Incident-driven states (dispatching → transport)
// are set by the dispatch engine. Non-incident states (available, standby,
// maintenance, off_duty) can be set by providers via NACDState.fleet.setStatus.
export const UnitStatusSchema = z.enum([
  'available',
  'dispatching',
  'dispatched',
  'en_route',
  'on_scene',
  'transport',
  'standby',
  'maintenance',
  'off_duty',
]);
export type UnitStatus = z.infer<typeof UnitStatusSchema>;

export const UnitTypeSchema = z.enum(['ALS', 'BLS']);
export type UnitType = z.infer<typeof UnitTypeSchema>;

export const UnitSchema = z.object({
  id: z.string(),                            // human-facing 'A-014' / 'EP-001'
  type: UnitTypeSchema,
  status: UnitStatusSchema,
  lat: z.number(),
  lng: z.number(),
  targetLat: z.number().nullable(),
  targetLng: z.number().nullable(),
  zone: z.string(),
  county: z.string(),
  crewCount: z.number().int().min(0).default(2),
  providerName: z.string().nullable(),
  providerId: z.string().nullable(),
  fuelPct: z.number().min(0).max(100),
  anomaly: z.boolean().default(false),
  anomalyDesc: z.string().nullable(),
  incidentId: z.string().nullable(),
  routeWaypoints: z.array(z.tuple([z.number(), z.number()])).nullable(),
  waypointIdx: z.number().int().nonnegative().default(0),
  updatedAt: z.string().datetime(),
});
export type Unit = z.infer<typeof UnitSchema>;
