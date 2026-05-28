-- ═══════════════════════════════════════════════════════════════════════
-- 0012_align_v1_compat_columns.sql
-- ═══════════════════════════════════════════════════════════════════════
-- sql/0010 created the v1-compat tables with my best-guess columns, but
-- the v1 NACDState engine writes a different (and richer) column set.
-- These tables are empty (just created), so drop + recreate to match
-- NACDState's exact INSERT/UPSERT shapes. No CHECK constraints on the
-- free-text enums (severity, note_type, etc.) — NACDState sends values
-- like 'med' that don't fit a tidy enum, and these are display-only.
-- ═══════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS supervisor_actions CASCADE;
DROP TABLE IF EXISTS supervisor_notes   CASCADE;
DROP TABLE IF EXISTS qa_flags           CASCADE;
DROP TABLE IF EXISTS triage_sessions    CASCADE;
-- patient_profiles columns already match NACDState — keep it.

-- ── supervisor_actions (whisper/barge/transfer/flag_qa/note/takeover)
CREATE TABLE supervisor_actions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id       UUID REFERENCES incidents(id) ON DELETE CASCADE,
  unit_id           TEXT REFERENCES fleet_units(id) ON DELETE SET NULL,
  action_type       TEXT NOT NULL,
  action_status     TEXT NOT NULL DEFAULT 'active',
  action_note       TEXT,
  created_by_agent  UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sv_actions_inc     ON supervisor_actions (incident_id);
CREATE INDEX idx_sv_actions_type    ON supervisor_actions (action_type);
CREATE INDEX idx_sv_actions_created ON supervisor_actions (created_at DESC);

-- ── supervisor_notes
CREATE TABLE supervisor_notes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id       UUID REFERENCES incidents(id) ON DELETE CASCADE,
  unit_id           TEXT REFERENCES fleet_units(id) ON DELETE SET NULL,
  note_type         TEXT NOT NULL DEFAULT 'private',
  note_text         TEXT NOT NULL,
  created_by_agent  UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sv_notes_inc     ON supervisor_notes (incident_id);
CREATE INDEX idx_sv_notes_created ON supervisor_notes (created_at DESC);

-- ── qa_flags
CREATE TABLE qa_flags (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id       UUID REFERENCES incidents(id) ON DELETE CASCADE,
  flag_type         TEXT NOT NULL DEFAULT 'operational',
  severity          TEXT NOT NULL DEFAULT 'med',
  status            TEXT NOT NULL DEFAULT 'open',
  reason            TEXT,
  created_by_agent  UUID REFERENCES agents(id) ON DELETE SET NULL,
  resolved_by_agent UUID REFERENCES agents(id) ON DELETE SET NULL,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_qa_inc      ON qa_flags (incident_id);
CREATE INDEX idx_qa_status   ON qa_flags (status);

-- ── triage_sessions (PSAP MPDS session log — matches _persistSession)
CREATE TABLE triage_sessions (
  id                       UUID PRIMARY KEY,
  source                   TEXT,
  call_taker_id            TEXT,
  caller_phone             TEXT,
  caller_name              TEXT,
  caller_relationship      TEXT,
  patient_phone            TEXT,
  patient_age              SMALLINT,
  patient_sex              CHAR(1),
  location_address         TEXT,
  location_w3w             TEXT,
  location_landmark        TEXT,
  location_floor_room      TEXT,
  location_notes           TEXT,
  protocol_id              TEXT,
  key_question_answers     JSONB,
  determinant_code         TEXT,
  determinant_level        CHAR(1),
  echo_bypass_triggered    BOOLEAN DEFAULT FALSE,
  echo_question_id         TEXT,
  recommended_unit_ids     JSONB,
  chosen_unit_id           TEXT,
  recommended_hospital_ids JSONB,
  chosen_hospital_id       TEXT,
  hospital_pre_alert_sent  BOOLEAN DEFAULT FALSE,
  disposition              TEXT,
  incident_id              TEXT,    -- v1 sends its local incident id; not an FK
  call_started_at          TIMESTAMPTZ,
  determinant_finalized_at TIMESTAMPTZ,
  unit_dispatched_at       TIMESTAMPTZ,
  closed_at                TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_triage_protocol ON triage_sessions (protocol_id);
CREATE INDEX idx_triage_created  ON triage_sessions (created_at DESC);

-- ── updated_at triggers
DROP TRIGGER IF EXISTS trg_qa_updated_at ON qa_flags;
CREATE TRIGGER trg_qa_updated_at BEFORE UPDATE ON qa_flags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_ts_updated_at ON triage_sessions;
CREATE TRIGGER trg_ts_updated_at BEFORE UPDATE ON triage_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Realtime + dev RLS for the recreated tables
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['supervisor_actions','supervisor_notes','qa_flags','triage_sessions']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname='supabase_realtime' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS dev_rw_%I ON %I', t, t);
    EXECUTE format('CREATE POLICY dev_rw_%I ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon, authenticated', t);
  END LOOP;
END $$;
