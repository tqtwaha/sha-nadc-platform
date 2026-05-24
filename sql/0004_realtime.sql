-- ═══════════════════════════════════════════════════════════════════════
-- 0004_realtime.sql — Supabase Realtime publication membership
-- ═══════════════════════════════════════════════════════════════════════
-- Tables here broadcast row-level changes (INSERT/UPDATE/DELETE) to any
-- subscribed client. Hot paths only — chatty audit tables stay out so
-- Realtime traffic doesn't drown what dispatchers actually need to see.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t TEXT;
  realtime_tables TEXT[] := ARRAY[
    'incidents',
    'fleet_units',
    'hospitals',
    'agents',
    'dispatch_events'
  ];
BEGIN
  FOREACH t IN ARRAY realtime_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;
