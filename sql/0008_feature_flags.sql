-- ═══════════════════════════════════════════════════════════════════════
-- 0008_feature_flags.sql — feature flags + supervisor approval queue
-- ═══════════════════════════════════════════════════════════════════════
-- Feature flags drive stub→real cutovers. The MVP keeps M-Pesa, AfyaLink,
-- and KRA integrations stubbed at the application layer; flipping a flag
-- in this table tells the Server Actions which adapter to call.
--
-- Pending approvals records supervisor escalations: priority overrides,
-- hospital diversion bypass, fleet emergency calls, claim disputes that
-- need senior sign-off.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS feature_flags (
  key           TEXT PRIMARY KEY,
  enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  description   TEXT NOT NULL,
  rollout_pct   SMALLINT NOT NULL DEFAULT 100 CHECK (rollout_pct BETWEEN 0 AND 100),
  category      TEXT NOT NULL DEFAULT 'general'
                CHECK (category IN ('integration','ops','beta','kill_switch','general')),
  owner         TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO feature_flags (key, enabled, description, category, owner) VALUES
  ('mpesa_real',          FALSE, 'Hit real Safaricom Daraja STK Push instead of the stub', 'integration', 'finance'),
  ('afyalink_real',       FALSE, 'POST real FHIR Claim to SHA AfyaLink instead of the stub', 'integration', 'finance'),
  ('kra_etims_real',      FALSE, 'Submit real KRA eTIMS invoice instead of the stub', 'integration', 'finance'),
  ('3cx_real_pbx',        FALSE, 'Bridge to live 3CX PBX for PSAP intake (stub fires sim calls otherwise)', 'integration', 'ops'),
  ('hospital_diversion',  TRUE,  'Allow hospitals to flip diversion_status from open→bypass', 'ops', 'supervisor'),
  ('emt_offline_queue',   FALSE, 'Mobile app queues writes when offline (BETA — requires retry plumbing)', 'beta', 'mobile'),
  ('p1_audio_alarm',      TRUE,  'Wall + dispatch play audio cue on new P1 (browser permission required)', 'ops', 'ops'),
  ('sim_auto_tick',       TRUE,  'Daily Vercel cron spawns + advances sim incidents', 'ops', 'ops'),
  ('command_palette',     TRUE,  'Cmd+K global jump-to palette', 'general', 'ops'),
  ('claims_bulk_actions', TRUE,  'Bulk approve / submit / pay on /claims list page', 'ops', 'finance'),
  ('emergency_lockdown',  FALSE, 'KILL SWITCH — disables all writes platform-wide. Use for active incident response only.', 'kill_switch', 'admin')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS pending_approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          TEXT NOT NULL CHECK (kind IN (
                  'priority_override','hospital_bypass','claim_dispute_escalation',
                  'fleet_emergency','crew_reassign','provider_contract','generic'
                )),
  reference     TEXT NOT NULL,
  requested_by  UUID REFERENCES agents(id) ON DELETE SET NULL,
  payload       JSONB NOT NULL DEFAULT '{}',
  notes         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','withdrawn')),
  resolved_by   UUID REFERENCES agents(id) ON DELETE SET NULL,
  resolved_at   TIMESTAMPTZ,
  resolved_note TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pa_status      ON pending_approvals (status);
CREATE INDEX IF NOT EXISTS idx_pa_kind        ON pending_approvals (kind);
CREATE INDEX IF NOT EXISTS idx_pa_created_at  ON pending_approvals (created_at DESC);

-- Seed a few example approvals so the page isn't empty in the demo
INSERT INTO pending_approvals (kind, reference, payload, notes, status) VALUES
  ('priority_override',          'INC-2026-DEMO01', '{"from":2,"to":1,"reason":"caller reports patient unresponsive"}', 'Dispatcher requesting P2 → P1 upgrade', 'pending'),
  ('hospital_bypass',            'h-knh',           '{"reason":"ED capacity 96%","duration_min":60}', 'KNH requesting bypass — 60 min', 'pending'),
  ('claim_dispute_escalation',   'CLM-2026-DEMO',   '{"amount_kes":12480,"provider":"PRV007"}',     'Provider disputes per-km calculation', 'pending')
ON CONFLICT DO NOTHING;

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_ff_updated_at ON feature_flags;
CREATE TRIGGER trg_ff_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_pa_updated_at ON pending_approvals;
CREATE TRIGGER trg_pa_updated_at
  BEFORE UPDATE ON pending_approvals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Realtime publication membership
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'feature_flags') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE feature_flags;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pending_approvals') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pending_approvals;
  END IF;
END $$;

-- Dev RLS
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dev_rw_ff ON feature_flags;
CREATE POLICY dev_rw_ff ON feature_flags FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON feature_flags TO anon, authenticated;

ALTER TABLE pending_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dev_rw_pa ON pending_approvals;
CREATE POLICY dev_rw_pa ON pending_approvals FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON pending_approvals TO anon, authenticated;
