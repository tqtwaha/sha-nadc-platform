-- ═══════════════════════════════════════════════════════════════════════
-- 0002_core.sql — Core operational tables
-- ═══════════════════════════════════════════════════════════════════════
-- Hospitals, fleet_units, agents, incidents, dispatch_events.
-- These are the tables every screen reads from. RLS + seeds in later files.
-- Column shapes match the Zod schemas in packages/types — keep in sync.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Hospitals ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hospitals (
  id                  TEXT PRIMARY KEY,           -- 'h001' (human-stable)
  name                TEXT NOT NULL,
  full_name           TEXT NOT NULL,
  level               SMALLINT NOT NULL CHECK (level BETWEEN 4 AND 6),
  is_national_referral BOOLEAN NOT NULL DEFAULT FALSE,
  lat                 DOUBLE PRECISION NOT NULL,
  lng                 DOUBLE PRECISION NOT NULL,
  county              TEXT NOT NULL,
  ed_capacity_pct     SMALLINT NOT NULL DEFAULT 50 CHECK (ed_capacity_pct BETWEEN 0 AND 100),
  diversion_status    TEXT NOT NULL DEFAULT 'open' CHECK (diversion_status IN ('open','caution','diverting','bypass')),
  specialties         TEXT[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hospitals_county     ON hospitals (county);
CREATE INDEX IF NOT EXISTS idx_hospitals_level      ON hospitals (level);
CREATE INDEX IF NOT EXISTS idx_hospitals_ed_cap     ON hospitals (ed_capacity_pct);

-- ── Fleet units ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fleet_units (
  id                  TEXT PRIMARY KEY,           -- 'A-014' or 'EP-001'
  unit_type           TEXT NOT NULL CHECK (unit_type IN ('ALS','BLS')),
  status              TEXT NOT NULL DEFAULT 'available'
                      CHECK (status IN (
                        'available','dispatching','dispatched','en_route',
                        'on_scene','transport','standby','maintenance','off_duty'
                      )),
  current_lat         DOUBLE PRECISION NOT NULL,
  current_lng         DOUBLE PRECISION NOT NULL,
  target_lat          DOUBLE PRECISION,
  target_lng          DOUBLE PRECISION,
  zone                TEXT NOT NULL,
  county              TEXT NOT NULL,
  crew_count          SMALLINT NOT NULL DEFAULT 2,
  provider_id         TEXT,
  provider_name       TEXT,
  fuel_pct            SMALLINT NOT NULL DEFAULT 75 CHECK (fuel_pct BETWEEN 0 AND 100),
  anomaly             BOOLEAN NOT NULL DEFAULT FALSE,
  anomaly_desc        TEXT,
  current_incident_id UUID,                       -- FK added once incidents table exists
  route_waypoints     JSONB,                      -- [[lng,lat], ...]
  waypoint_idx        INTEGER NOT NULL DEFAULT 0,
  last_seen           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fleet_status         ON fleet_units (status);
CREATE INDEX IF NOT EXISTS idx_fleet_zone           ON fleet_units (zone);
CREATE INDEX IF NOT EXISTS idx_fleet_provider       ON fleet_units (provider_id);
CREATE INDEX IF NOT EXISTS idx_fleet_current_inc    ON fleet_units (current_incident_id);

-- ── Agents (call-takers, dispatchers, supervisors) ─────────────────
CREATE TABLE IF NOT EXISTS agents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name        TEXT NOT NULL,
  email               TEXT UNIQUE,
  phone               TEXT,
  role                TEXT NOT NULL CHECK (role IN (
                        'call_taker','dispatcher','senior_dispatcher','supervisor','admin'
                      )),
  status              TEXT NOT NULL DEFAULT 'off_shift'
                      CHECK (status IN ('on_call','ready','break','off_shift')),
  extension           TEXT,                       -- PBX extension
  clerk_user_id       TEXT UNIQUE,                -- bridge to Clerk
  shift_started_at    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agents_role          ON agents (role);
CREATE INDEX IF NOT EXISTS idx_agents_status        ON agents (status);

-- ── Incidents ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incidents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id          TEXT NOT NULL UNIQUE,       -- 'INC-2026-000123'

  -- Triage
  priority            SMALLINT NOT NULL CHECK (priority BETWEEN 1 AND 4),
  complaint           TEXT NOT NULL,
  icd11               TEXT,
  requires_als        BOOLEAN NOT NULL DEFAULT FALSE,
  determinant_code    TEXT,                       -- '09E1'
  determinant_level   CHAR(1) CHECK (determinant_level IN ('E','D','C','B','A')),
  triage_session_id   UUID,                       -- FK once triage_sessions table exists

  -- Location
  lat                 DOUBLE PRECISION NOT NULL,
  lng                 DOUBLE PRECISION NOT NULL,
  address             TEXT NOT NULL,
  w3w                 TEXT,
  landmark            TEXT,
  floor               TEXT,
  county              TEXT NOT NULL,
  zone                TEXT NOT NULL,

  -- Parties
  caller_name         TEXT,
  caller_phone        TEXT,
  caller_relation     TEXT,
  patient_age         SMALLINT CHECK (patient_age >= 0),
  patient_sex         CHAR(1) CHECK (patient_sex IN ('M','F','U','O')),

  -- Assignment
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN (
                        'pending','dispatched','en_route','on_scene',
                        'transport','at_hospital','cleared','cancelled'
                      )),
  unit_id             TEXT REFERENCES fleet_units(id) ON DELETE SET NULL,
  hospital_id         TEXT REFERENCES hospitals(id)   ON DELETE SET NULL,
  dispatcher_id       UUID REFERENCES agents(id)      ON DELETE SET NULL,
  notes               TEXT NOT NULL DEFAULT '',
  source              TEXT NOT NULL DEFAULT 'sim' CHECK (source IN ('sim','psap','dispatcher')),

  -- Lifecycle timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_at       TIMESTAMPTZ,
  en_route_at         TIMESTAMPTZ,
  on_scene_at         TIMESTAMPTZ,
  transport_at        TIMESTAMPTZ,
  at_hospital_at      TIMESTAMPTZ,
  cleared_at          TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_incidents_status     ON incidents (status);
CREATE INDEX IF NOT EXISTS idx_incidents_priority   ON incidents (priority);
CREATE INDEX IF NOT EXISTS idx_incidents_county     ON incidents (county);
CREATE INDEX IF NOT EXISTS idx_incidents_unit       ON incidents (unit_id);
CREATE INDEX IF NOT EXISTS idx_incidents_hospital   ON incidents (hospital_id);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents (created_at DESC);

-- Now wire fleet_units.current_incident_id back to incidents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'fleet_units' AND constraint_name = 'fleet_units_current_incident_fk'
  ) THEN
    ALTER TABLE fleet_units
      ADD CONSTRAINT fleet_units_current_incident_fk
      FOREIGN KEY (current_incident_id) REFERENCES incidents(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Dispatch events (append-only audit trail) ─────────────────────
CREATE TABLE IF NOT EXISTS dispatch_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id         UUID REFERENCES incidents(id) ON DELETE CASCADE,
  unit_id             TEXT REFERENCES fleet_units(id) ON DELETE SET NULL,
  agent_id            UUID REFERENCES agents(id) ON DELETE SET NULL,
  event_type          TEXT NOT NULL,              -- 'created','dispatched','en_route','on_scene','transport','at_hospital','cleared','epcr_submitted','vitals_recorded','hospital_changed','unit_changed','note_added','cancelled'
  event_note          TEXT,
  actor_type          TEXT NOT NULL CHECK (actor_type IN ('dispatcher','supervisor','emt','system','psap','provider')),
  payload             JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dispatch_events_inc        ON dispatch_events (incident_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_events_type       ON dispatch_events (event_type);
CREATE INDEX IF NOT EXISTS idx_dispatch_events_created_at ON dispatch_events (created_at DESC);

-- ── Updated-at trigger function (reused across tables) ────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['hospitals','fleet_units','agents','incidents'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
       CREATE TRIGGER trg_%I_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;
