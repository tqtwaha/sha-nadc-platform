-- ═══════════════════════════════════════════════════════════════════════
-- 0006_claims.sql — Claims & payments
-- ═══════════════════════════════════════════════════════════════════════
-- Each ambulance transport with an ePCR generates a claim row.
-- Claims move through draft → submitted → approved/disputed/rejected →
-- pending_payment → paid → invoiced.
--
-- External integrations (SHA AfyaLink, M-Pesa, KRA eTIMS) are stubbed at
-- the application layer for MVP; the columns that store their results
-- (invoice_number, mpesa_ref, submitted_at, approved_at, paid_at) live here
-- so the swap to real implementations is opaque to the schema.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS claims (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number        TEXT NOT NULL UNIQUE,           -- 'CLM-2026-05-1234'
  incident_id         UUID REFERENCES incidents(id) ON DELETE SET NULL,
  provider_id         TEXT,
  unit_id             TEXT REFERENCES fleet_units(id) ON DELETE SET NULL,
  hospital_id         TEXT REFERENCES hospitals(id) ON DELETE SET NULL,

  -- Clinical
  icd11               TEXT,
  chief_complaint     TEXT NOT NULL,

  -- Pricing snapshot at claim time (immutable — historical accuracy)
  tariff_type         TEXT NOT NULL CHECK (tariff_type IN ('ALS','BLS')),
  base_kes            INTEGER NOT NULL CHECK (base_kes >= 0),
  distance_km         NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (distance_km >= 0),
  per_km_kes          INTEGER NOT NULL CHECK (per_km_kes >= 0),
  free_km             INTEGER NOT NULL DEFAULT 25,
  consumables_kes     INTEGER NOT NULL DEFAULT 0 CHECK (consumables_kes >= 0),
  total_kes           INTEGER NOT NULL CHECK (total_kes >= 0),

  -- Workflow
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN (
                        'draft','submitted','approved','disputed','rejected',
                        'pending_payment','paid','invoiced'
                      )),
  notes               TEXT NOT NULL DEFAULT '',

  -- External integration result fields (populated by stubs for MVP)
  submitted_at        TIMESTAMPTZ,
  approved_at         TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  invoice_number      TEXT,                           -- KRA eTIMS reference (stub)
  mpesa_ref           TEXT,                           -- M-Pesa Daraja reference (stub)

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claims_status        ON claims (status);
CREATE INDEX IF NOT EXISTS idx_claims_hospital      ON claims (hospital_id);
CREATE INDEX IF NOT EXISTS idx_claims_provider      ON claims (provider_id);
CREATE INDEX IF NOT EXISTS idx_claims_created_at    ON claims (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_submitted_at  ON claims (submitted_at DESC);

-- Updated-at trigger
DROP TRIGGER IF EXISTS trg_claims_updated_at ON claims;
CREATE TRIGGER trg_claims_updated_at
  BEFORE UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'claims'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE claims;
  END IF;
END $$;

-- Dev-only permissive RLS
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dev_rw_claims ON claims;
CREATE POLICY dev_rw_claims ON claims FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON claims TO anon, authenticated;
