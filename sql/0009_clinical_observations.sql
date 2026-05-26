-- ═══════════════════════════════════════════════════════════════════════
-- 0009_clinical_observations.sql — append-only EMT vitals stream
-- ═══════════════════════════════════════════════════════════════════════
-- Vitals are recorded multiple times during an EMS run (initial assessment,
-- en route, on scene, post-treatment, at hospital). Append-only design.
--
-- claims.vitals JSONB (sql/0007) captures the LAST snapshot at handoff for
-- the billing record. This table is the full timeline behind it — used by
-- the EMT app's history view and by SHA reviewers auditing a claim.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS clinical_observations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id      UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by      TEXT NOT NULL,                 -- unit_id like 'A-014' (later: agent uuid)
  heart_rate       SMALLINT,
  bp_systolic      SMALLINT,
  bp_diastolic     SMALLINT,
  respiratory_rate SMALLINT,
  spo2             SMALLINT,
  temperature      NUMERIC(4,1),
  glucose          NUMERIC(5,1),
  gcs              SMALLINT,
  pain_score       SMALLINT CHECK (pain_score BETWEEN 0 AND 10),
  icd11            TEXT,
  clinical_notes   TEXT,
  treatment_notes  TEXT,
  payload          JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_co_incident_recorded
  ON clinical_observations (incident_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_co_unit_recorded
  ON clinical_observations (recorded_by, recorded_at DESC);

-- Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'clinical_observations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE clinical_observations;
  END IF;
END $$;

-- Dev-only permissive RLS
ALTER TABLE clinical_observations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dev_rw_co ON clinical_observations;
CREATE POLICY dev_rw_co ON clinical_observations
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON clinical_observations TO anon, authenticated;
