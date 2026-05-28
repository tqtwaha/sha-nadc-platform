-- ═══════════════════════════════════════════════════════════════════════
-- 0013_crew.sql — provider crew roster
-- ═══════════════════════════════════════════════════════════════════════
-- One row per crew member. Assigned to a provider, optionally to a unit
-- and shift. Drives the crew roster on /providers/[id].
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crew_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id   TEXT NOT NULL,
  unit_id       TEXT REFERENCES fleet_units(id) ON DELETE SET NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('paramedic','emt','driver','nurse','doctor')),
  phone         TEXT,
  certification TEXT,                 -- e.g. 'ALS', 'BLS', 'AEMT', 'EMR'
  shift         TEXT NOT NULL DEFAULT 'day' CHECK (shift IN ('day','night','on_call','off')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_leave','inactive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crew_provider ON crew_members (provider_id);
CREATE INDEX IF NOT EXISTS idx_crew_unit     ON crew_members (unit_id);
CREATE INDEX IF NOT EXISTS idx_crew_shift    ON crew_members (shift);

DROP TRIGGER IF EXISTS trg_crew_updated_at ON crew_members;
CREATE TRIGGER trg_crew_updated_at BEFORE UPDATE ON crew_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Realtime + dev RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND tablename='crew_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crew_members;
  END IF;
END $$;
ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dev_rw_crew ON crew_members;
CREATE POLICY dev_rw_crew ON crew_members FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON crew_members TO anon, authenticated;

-- ── Seed: 2 crew per active unit (a driver + a clinician matched to type),
-- assigned to their provider. Deterministic from a name pool so re-runs
-- are stable (guarded by NOT EXISTS).
DO $$
DECLARE
  fnames TEXT[] := ARRAY['Mary','James','Grace','Peter','Faith','John','Mercy','David','Esther','Samuel',
                         'Joyce','Daniel','Lucy','Brian','Ann','Kevin','Caroline','Dennis','Jane','Paul',
                         'Wanjiru','Otieno','Achieng','Mutua','Kamau','Njoroge','Wafula','Chebet','Kiptoo','Auma'];
  lnames TEXT[] := ARRAY['Mwangi','Ochieng','Wanjiku','Kimani','Akinyi','Maina','Njeri','Omondi','Wambui','Kiprono',
                         'Mutiso','Cheruiyot','Atieno','Gitau','Were','Karanja','Owino','Chepkemoi','Barasa','Mwende'];
  u RECORD;
  seeded INT := 0;
BEGIN
  IF (SELECT COUNT(*) FROM crew_members) > 0 THEN
    RAISE NOTICE 'crew_members already seeded — skipping';
    RETURN;
  END IF;
  FOR u IN SELECT id, unit_type, provider_id FROM fleet_units WHERE provider_id IS NOT NULL ORDER BY id LIMIT 270 LOOP
    -- Driver
    INSERT INTO crew_members (provider_id, unit_id, full_name, role, certification, shift, phone)
    VALUES (
      u.provider_id, u.id,
      fnames[1 + (seeded % array_length(fnames,1))] || ' ' || lnames[1 + ((seeded*7) % array_length(lnames,1))],
      'driver', 'EMR', CASE WHEN seeded % 2 = 0 THEN 'day' ELSE 'night' END,
      '+2547' || lpad((10000000 + seeded*131)::text, 8, '0')
    );
    seeded := seeded + 1;
    -- Clinician (paramedic for ALS, emt for BLS)
    INSERT INTO crew_members (provider_id, unit_id, full_name, role, certification, shift, phone)
    VALUES (
      u.provider_id, u.id,
      fnames[1 + (seeded % array_length(fnames,1))] || ' ' || lnames[1 + ((seeded*7) % array_length(lnames,1))],
      CASE WHEN u.unit_type = 'ALS' THEN 'paramedic' ELSE 'emt' END,
      u.unit_type, CASE WHEN seeded % 2 = 0 THEN 'day' ELSE 'night' END,
      '+2547' || lpad((10000000 + seeded*131)::text, 8, '0')
    );
    seeded := seeded + 1;
  END LOOP;
  RAISE NOTICE 'crew_members seeded: %', seeded;
END $$;
