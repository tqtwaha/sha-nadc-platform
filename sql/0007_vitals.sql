-- ═══════════════════════════════════════════════════════════════════════
-- 0007_vitals.sql — EPCR vitals snapshot on claims
-- ═══════════════════════════════════════════════════════════════════════
-- The EMT crew records vitals at handoff. Store as a single JSONB column
-- on claims so the schema doesn't fan out — we never join on individual
-- vital fields, only display them on the claim detail page.
--
-- Shape: { hr, bp_sys, bp_dia, spo2, rr, gcs, temp_c, bgl }
-- All optional. Numeric where appropriate, never strings.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS vitals JSONB;

COMMENT ON COLUMN claims.vitals IS
  'EPCR vitals snapshot at handoff. JSONB. Keys: hr,bp_sys,bp_dia,spo2,rr,gcs,temp_c,bgl';
