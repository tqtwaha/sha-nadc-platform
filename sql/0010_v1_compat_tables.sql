-- ═══════════════════════════════════════════════════════════════════════
-- 0010_v1_compat_tables.sql — patient profiles, triage, supervisor
-- ═══════════════════════════════════════════════════════════════════════
-- Adds the tables the v1 NACDState engine writes to so its Supabase calls
-- succeed silently. Without these, supervisor/PSAP screens fail their
-- mutations and cross-screen consistency for those workflows breaks.
--
-- Tables here:
--   patient_profiles   — caller + patient PII per incident (1:1)
--   triage_sessions    — PSAP MPDS protocol selection history
--   supervisor_actions — whisper/barge/transfer/flag_qa/note/takeover
--   supervisor_notes   — free-text notes per incident
--   qa_flags           — supervisor QA escalation flags
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Patient + caller PII (1:1 with incidents; encrypted at app layer)
CREATE TABLE IF NOT EXISTS patient_profiles (
  incident_id      UUID PRIMARY KEY REFERENCES incidents(id) ON DELETE CASCADE,
  full_name        TEXT,
  approximate_age  SMALLINT,
  gender           CHAR(1) CHECK (gender IN ('M','F','U')),
  phone            TEXT,
  caller_name      TEXT,
  caller_phone     TEXT,
  pickup_address   TEXT,
  pickup_w3w       TEXT,
  landmark         TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PSAP triage sessions
CREATE TABLE IF NOT EXISTS triage_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id         TEXT UNIQUE,
  call_taker_id      TEXT,
  protocol_id        TEXT,
  protocol_name      TEXT,
  determinant_code   TEXT,
  determinant_level  CHAR(1),
  caller_name        TEXT,
  caller_phone       TEXT,
  caller_relation    TEXT,
  patient_age        SMALLINT,
  patient_sex        CHAR(1),
  location_address   TEXT,
  location_w3w       TEXT,
  location_lat       DOUBLE PRECISION,
  location_lng       DOUBLE PRECISION,
  location_county    TEXT,
  location_landmark  TEXT,
  location_floor     TEXT,
  location_notes     TEXT,
  disposition        TEXT,            -- 'incident_created','no_dispatch','hang_up'
  incident_id        UUID REFERENCES incidents(id) ON DELETE SET NULL,
  chosen_unit_id     TEXT,
  chosen_hospital_id TEXT,
  call_started_at    TIMESTAMPTZ,
  call_ended_at      TIMESTAMPTZ,
  notes              TEXT,
  payload            JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_triage_protocol   ON triage_sessions (protocol_id);
CREATE INDEX IF NOT EXISTS idx_triage_call_taker ON triage_sessions (call_taker_id);
CREATE INDEX IF NOT EXISTS idx_triage_created    ON triage_sessions (created_at DESC);

-- 3. Supervisor actions — whisper/barge/transfer/flag_qa/note/takeover
CREATE TABLE IF NOT EXISTS supervisor_actions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id         UUID REFERENCES incidents(id) ON DELETE CASCADE,
  action_type         TEXT NOT NULL CHECK (action_type IN
                        ('whisper','barge','transfer','flag_qa','note','takeover')),
  target_agent_id     UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_by_agent    UUID REFERENCES agents(id) ON DELETE SET NULL,
  payload             JSONB NOT NULL DEFAULT '{}',
  visible_to_dispatch BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sv_actions_inc      ON supervisor_actions (incident_id);
CREATE INDEX IF NOT EXISTS idx_sv_actions_type     ON supervisor_actions (action_type);
CREATE INDEX IF NOT EXISTS idx_sv_actions_created  ON supervisor_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sv_actions_target   ON supervisor_actions (target_agent_id);

-- 4. Supervisor notes (separate from supervisor_actions for free text)
CREATE TABLE IF NOT EXISTS supervisor_notes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id         UUID REFERENCES incidents(id) ON DELETE CASCADE,
  note_type           TEXT NOT NULL DEFAULT 'private'
                      CHECK (note_type IN ('private','coaching','dispatch_visible')),
  body                TEXT NOT NULL,
  created_by_agent    UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sv_notes_inc     ON supervisor_notes (incident_id);
CREATE INDEX IF NOT EXISTS idx_sv_notes_created ON supervisor_notes (created_at DESC);

-- 5. QA flags
CREATE TABLE IF NOT EXISTS qa_flags (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id         UUID REFERENCES incidents(id) ON DELETE CASCADE,
  flag_type           TEXT NOT NULL,    -- e.g. 'slow_dispatch','wrong_hospital','rude_caller'
  severity            TEXT NOT NULL DEFAULT 'normal'
                      CHECK (severity IN ('low','normal','high','critical')),
  status              TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','reviewing','resolved','dismissed')),
  notes               TEXT,
  created_by_agent    UUID REFERENCES agents(id) ON DELETE SET NULL,
  resolved_by_agent   UUID REFERENCES agents(id) ON DELETE SET NULL,
  resolved_at         TIMESTAMPTZ,
  resolved_note       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_inc      ON qa_flags (incident_id);
CREATE INDEX IF NOT EXISTS idx_qa_status   ON qa_flags (status);
CREATE INDEX IF NOT EXISTS idx_qa_severity ON qa_flags (severity);

-- ── Triggers
DROP TRIGGER IF EXISTS trg_pp_updated_at ON patient_profiles;
CREATE TRIGGER trg_pp_updated_at
  BEFORE UPDATE ON patient_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_ts_updated_at ON triage_sessions;
CREATE TRIGGER trg_ts_updated_at
  BEFORE UPDATE ON triage_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_qa_updated_at ON qa_flags;
CREATE TRIGGER trg_qa_updated_at
  BEFORE UPDATE ON qa_flags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Realtime
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['patient_profiles','triage_sessions','supervisor_actions','supervisor_notes','qa_flags']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;

-- ── Dev-only permissive RLS
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['patient_profiles','triage_sessions','supervisor_actions','supervisor_notes','qa_flags']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS dev_rw_%I ON %I', t, t);
    EXECUTE format('CREATE POLICY dev_rw_%I ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon, authenticated', t);
  END LOOP;
END $$;
