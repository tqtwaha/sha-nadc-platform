-- ═══════════════════════════════════════════════════════════════════════
-- 0011_broaden_source_check.sql — accept all sim-engine source labels
-- ═══════════════════════════════════════════════════════════════════════
-- The original check constraint only allowed ('sim','psap','dispatcher')
-- which was rejecting writes from:
--   - /api/cron/heartbeat (source='heartbeat')
--   - /api/sim/demo (source='demo')
--   - /api/sim/spawn (source='sim'  -- ok)
-- Broaden to cover all known sources + add a 'demo' bucket for the
-- scripted replay endpoint.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_source_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_source_check
  CHECK (source IN (
    'sim',           -- generic simulation seed (spawn endpoint, NACDState)
    'psap',          -- PSAP call-taker intake
    'dispatcher',    -- dispatcher-created (rare, manual)
    'heartbeat',     -- /api/cron/heartbeat
    'demo',          -- /api/sim/demo scripted replay
    'sim_spawn',     -- /api/sim/spawn (legacy label, kept for backwards compat)
    'emt',           -- direct creation from EMT (future)
    'public_api',    -- 3CX / Telegram / external integration (future)
    'test'           -- ad-hoc test data via psql
  ));
