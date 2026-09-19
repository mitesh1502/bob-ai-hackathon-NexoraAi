-- NEXORA AI Migration 002 — Talukas, Villages, and geographic FK extensions

CREATE TABLE IF NOT EXISTS talukas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(200) NOT NULL,
  district_id UUID NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  state_id    UUID NOT NULL REFERENCES states(id),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_talukas_district ON talukas(district_id);
CREATE INDEX IF NOT EXISTS idx_talukas_state    ON talukas(state_id);

CREATE TABLE IF NOT EXISTS villages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(200) NOT NULL,
  taluka_id   UUID NOT NULL REFERENCES talukas(id) ON DELETE CASCADE,
  district_id UUID NOT NULL REFERENCES districts(id),
  state_id    UUID NOT NULL REFERENCES states(id),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_villages_taluka   ON villages(taluka_id);
CREATE INDEX IF NOT EXISTS idx_villages_district ON villages(district_id);

-- Add taluka/village columns to key tables (nullable for backward compat)
ALTER TABLE assets           ADD COLUMN IF NOT EXISTS taluka_id  UUID REFERENCES talukas(id);
ALTER TABLE assets           ADD COLUMN IF NOT EXISTS village_id UUID REFERENCES villages(id);
ALTER TABLE worker_profiles  ADD COLUMN IF NOT EXISTS taluka_id  UUID REFERENCES talukas(id);
ALTER TABLE worker_profiles  ADD COLUMN IF NOT EXISTS village_id UUID REFERENCES villages(id);
ALTER TABLE inspection_tasks ADD COLUMN IF NOT EXISTS taluka_id  UUID REFERENCES talukas(id);
ALTER TABLE complaints       ADD COLUMN IF NOT EXISTS taluka_id  UUID REFERENCES talukas(id);
ALTER TABLE complaints       ADD COLUMN IF NOT EXISTS village_id UUID REFERENCES villages(id);

-- Add grid_impact_severity as explicit column on assets (distinct from risk_score)
ALTER TABLE assets ADD COLUMN IF NOT EXISTS grid_impact_severity DOUBLE PRECISION DEFAULT 0;
