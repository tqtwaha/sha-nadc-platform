// Shared incident types + transition tables. Pure constants — safe to import
// from both server components and client components. Server-only helpers
// (e.g. nextDisplayId) live in ./incidents-server so the 'server-only'
// boundary doesn't leak into the client bundle.

export const ACTIVE_STATUSES = [
  'pending',
  'dispatched',
  'en_route',
  'on_scene',
  'transport',
] as const;

export type IncidentStatus =
  | 'pending'
  | 'dispatched'
  | 'en_route'
  | 'on_scene'
  | 'transport'
  | 'cleared'
  | 'cancelled';

export const NEXT_STATUSES: Record<IncidentStatus, IncidentStatus[]> = {
  pending: ['dispatched', 'cancelled'],
  dispatched: ['en_route', 'cancelled'],
  en_route: ['on_scene', 'cancelled'],
  on_scene: ['transport', 'cleared'],
  transport: ['cleared'],
  cleared: [],
  cancelled: [],
};

export const STATUS_TIMESTAMP: Record<IncidentStatus, string | null> = {
  pending: null,
  dispatched: 'dispatched_at',
  en_route: 'en_route_at',
  on_scene: 'on_scene_at',
  transport: 'transport_at',
  cleared: 'cleared_at',
  cancelled: 'cleared_at',
};
