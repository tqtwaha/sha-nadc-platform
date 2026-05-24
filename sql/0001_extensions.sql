-- ═══════════════════════════════════════════════════════════════════════
-- 0001_extensions.sql — Postgres extensions v2 needs
-- ═══════════════════════════════════════════════════════════════════════
-- Idempotent. Run first; everything else depends on these.
-- ═══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";       -- for gen_random_uuid alternative
CREATE EXTENSION IF NOT EXISTS pgcrypto;          -- for gen_random_uuid()
-- PostGIS is enabled via Supabase Studio (Database → Extensions) since some
-- regions need a manual toggle. Coordinate lookups in v2 mostly use simple
-- numeric lat/lng comparisons; geo queries (radius, polygon) are Phase 3+.
