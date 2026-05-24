-- ═══════════════════════════════════════════════════════════════════════
-- 0005_rls_dev.sql — Development-only RLS (replaced before pilot)
-- ═══════════════════════════════════════════════════════════════════════
-- ⚠️  NOT PRODUCTION SECURITY ⚠️
-- Anon + authenticated can read/write everything for the demo build.
-- Real Clerk JWT-based role policies land in Phase 2 (sql/0010_rls.sql)
-- and replace these wholesale. Until then this is fine because:
--   - The Supabase project is dev-scoped, no real patient data
--   - Service-role key never reaches the browser
--   - Demo traffic only
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'hospitals',
    'fleet_units',
    'agents',
    'incidents',
    'dispatch_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'dev_rw_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      'dev_rw_' || t, t
    );
  END LOOP;
END $$;

-- Grant the anon role the raw Postgres privileges needed for the demo.
-- (Without these, RLS policies on their own don't grant access.)
GRANT SELECT, INSERT, UPDATE, DELETE
  ON hospitals, fleet_units, agents, incidents, dispatch_events
  TO anon, authenticated;
