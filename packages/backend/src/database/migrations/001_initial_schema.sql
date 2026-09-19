-- ============================================================
-- NEXORA AI — PostgreSQL Schema (PostGIS-free version)
-- Uses standard DOUBLE PRECISION lat/lng instead of GEOMETRY
-- Migration 001: Core tables
-- ============================================================

-- Enable extensions (these don't need PostGIS)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Enums ─────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'state_admin', 'worker');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE worker_status AS ENUM (
    'draft','pending_review','documents_required',
    'approved','rejected','employed','suspended','inactive'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE complaint_status AS ENUM (
    'submitted','under_review','assigned','worker_visit_scheduled',
    'inspection_in_progress','inspection_completed',
    'awaiting_additional_information','maintenance_recommended',
    'resolved','rejected','closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE asset_type AS ENUM (
    'transformer','distribution_panel','appliance','feeder',
    'substation_equipment','pole_mounted','switchgear',
    'cable_line','generator','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE risk_level AS ENUM ('low','moderate','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inspection_status AS ENUM (
    'draft','submitted','under_review','correction_requested','approved','rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE maintenance_plan_status AS ENUM (
    'ai_recommended','pending_approval','approved','modified',
    'rejected','in_progress','completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE observation_type AS ENUM ('positive','negative');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE observation_severity AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_channel AS ENUM ('email','sms','in_app');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE field_of_work AS ENUM (
    'civil_engineering','mechanical_engineering','electrical_engineering','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── States ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS states (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL UNIQUE,
  code          VARCHAR(10)  NOT NULL UNIQUE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Districts ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS districts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  state_id              UUID NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  name                  VARCHAR(100) NOT NULL,
  code                  VARCHAR(20),
  worker_capacity_limit INT NOT NULL DEFAULT 50,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(state_id, name)
);

-- ── Users (admins only) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) NOT NULL UNIQUE,
  username        VARCHAR(100) UNIQUE,
  mobile          VARCHAR(20),
  password_hash   TEXT NOT NULL,
  role            user_role NOT NULL,
  state_id        UUID REFERENCES states(id),
  full_name       VARCHAR(200) NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  is_2fa_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  totp_secret     TEXT,
  last_login_at   TIMESTAMPTZ,
  failed_login_count INT NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES users(id),
  CONSTRAINT state_admin_must_have_state
    CHECK (role != 'state_admin' OR state_id IS NOT NULL)
);

-- ── Worker profiles ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_profiles (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                 VARCHAR(255) NOT NULL UNIQUE,
  username              VARCHAR(100) UNIQUE,
  mobile                VARCHAR(20)  NOT NULL,
  password_hash         TEXT,
  full_name             VARCHAR(200) NOT NULL,
  date_of_birth         DATE,
  gender                VARCHAR(20),
  photo_url             TEXT,
  communication_pref    VARCHAR(20) DEFAULT 'email',
  state_id              UUID REFERENCES states(id),
  district_id           UUID REFERENCES districts(id),
  city_village          VARCHAR(200),
  pin_code              VARCHAR(10),
  address_text          TEXT,
  aadhaar_token         TEXT,
  aadhaar_verified      BOOLEAN DEFAULT FALSE,
  id_doc_url            TEXT,
  consent_given         BOOLEAN DEFAULT FALSE,
  consent_date          TIMESTAMPTZ,
  residence_proof_url   TEXT,
  residence_verified    BOOLEAN DEFAULT FALSE,
  field_of_work         field_of_work,
  preferred_state_id    UUID REFERENCES states(id),
  preferred_district_id UUID REFERENCES districts(id),
  work_radius_km        INT,
  travel_willing        BOOLEAN DEFAULT FALSE,
  employment_type       VARCHAR(50),
  availability_date     DATE,
  application_number    VARCHAR(50) UNIQUE,
  status                worker_status NOT NULL DEFAULT 'draft',
  rejection_reason      TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  is_2fa_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  totp_secret           TEXT,
  last_login_at         TIMESTAMPTZ,
  failed_login_count    INT NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  assigned_state_id     UUID REFERENCES states(id),
  assigned_district_id  UUID REFERENCES districts(id),
  out_of_district_reason TEXT,
  out_of_district_approved_by UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID REFERENCES users(id),
  updated_by            UUID REFERENCES users(id)
);

-- ── Worker qualifications ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_qualifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id       UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  level           VARCHAR(100),
  institution     VARCHAR(200),
  board           VARCHAR(200),
  completion_year INT,
  certificate_number VARCHAR(100),
  doc_url         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Worker experience ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_experience (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id         UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  years             INT,
  months            INT DEFAULT 0,
  employer_name     VARCHAR(200),
  responsibilities  TEXT,
  licenses          TEXT,
  safety_certs      TEXT,
  cert_doc_url      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Citizens ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS citizens (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name           VARCHAR(200) NOT NULL,
  mobile              VARCHAR(20),
  email               VARCHAR(255),
  state_id            UUID REFERENCES states(id),
  district_id         UUID REFERENCES districts(id),
  city                VARCHAR(200),
  pin_code            VARCHAR(10),
  address_text        TEXT,
  preferred_contact   VARCHAR(20) DEFAULT 'mobile',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Complaints ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS complaints (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  complaint_number      VARCHAR(50) NOT NULL UNIQUE,
  citizen_id            UUID REFERENCES citizens(id),
  state_id              UUID NOT NULL REFERENCES states(id),
  district_id           UUID NOT NULL REFERENCES districts(id),
  category              VARCHAR(100) NOT NULL,
  asset_type            VARCHAR(100),
  brand_model           VARCHAR(200),
  serial_number         VARCHAR(100),
  description           TEXT NOT NULL,
  date_noticed          DATE,
  is_safety_concern     BOOLEAN DEFAULT FALSE,
  location_lat          DOUBLE PRECISION,
  location_lng          DOUBLE PRECISION,
  location_address      TEXT,
  location_method       VARCHAR(50),
  status                complaint_status NOT NULL DEFAULT 'submitted',
  assigned_worker_id    UUID REFERENCES worker_profiles(id),
  rejection_reason      TEXT,
  resolved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by            UUID REFERENCES users(id)
);

-- ── Complaint attachments ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS complaint_attachments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  complaint_id      UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  file_url          TEXT NOT NULL,
  file_type         VARCHAR(50),
  file_size_bytes   INT,
  gps_lat           DOUBLE PRECISION,
  gps_lng           DOUBLE PRECISION,
  gps_accuracy      DOUBLE PRECISION,
  gps_timestamp     TIMESTAMPTZ,
  exif_data         JSONB,
  tamper_hash       TEXT,
  is_primary        BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Assets ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assets (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_code            VARCHAR(100) NOT NULL UNIQUE,
  asset_type            asset_type NOT NULL,
  category              VARCHAR(100),
  manufacturer          VARCHAR(200),
  model                 VARCHAR(200),
  serial_number         VARCHAR(200),
  state_id              UUID NOT NULL REFERENCES states(id),
  district_id           UUID NOT NULL REFERENCES districts(id),
  address_text          TEXT,
  location_lat          DOUBLE PRECISION,
  location_lng          DOUBLE PRECISION,
  install_date          DATE,
  rated_capacity_kva    DOUBLE PRECISION,
  current_load_kw       DOUBLE PRECISION,
  connected_customers   INT DEFAULT 0,
  critical_facilities   TEXT,
  maintenance_history   TEXT,
  previous_failures     INT DEFAULT 0,
  current_condition     VARCHAR(50) DEFAULT 'unknown',
  sensor_available      BOOLEAN DEFAULT FALSE,
  last_inspection_date  DATE,
  current_risk_score    DOUBLE PRECISION DEFAULT 0,
  current_risk_level    risk_level DEFAULT 'low',
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  status                VARCHAR(50) DEFAULT 'operational',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID REFERENCES users(id),
  updated_by            UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_assets_state ON assets(state_id);
CREATE INDEX IF NOT EXISTS idx_assets_district ON assets(district_id);
CREATE INDEX IF NOT EXISTS idx_assets_risk ON assets(current_risk_level, current_risk_score DESC);

-- ── Asset sensors ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_sensors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id        UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  sensor_type     VARCHAR(100) NOT NULL,
  unit            VARCHAR(50),
  min_normal      DOUBLE PRECISION,
  max_normal      DOUBLE PRECISION,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Sensor readings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sensor_readings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sensor_id       UUID NOT NULL REFERENCES asset_sensors(id),
  asset_id        UUID NOT NULL REFERENCES assets(id),
  state_id        UUID NOT NULL REFERENCES states(id),
  district_id     UUID NOT NULL REFERENCES districts(id),
  value           DOUBLE PRECISION,
  unit            VARCHAR(50),
  is_outlier      BOOLEAN DEFAULT FALSE,
  is_missing      BOOLEAN DEFAULT FALSE,
  sensor_failed   BOOLEAN DEFAULT FALSE,
  fault_code      VARCHAR(100),
  recorded_at     TIMESTAMPTZ NOT NULL,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_asset_time ON sensor_readings(asset_id, recorded_at DESC);

-- ── Weather records ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weather_records (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  state_id              UUID REFERENCES states(id),
  district_id           UUID REFERENCES districts(id),
  location_lat          DOUBLE PRECISION,
  location_lng          DOUBLE PRECISION,
  temperature_c         DOUBLE PRECISION,
  rainfall_mm           DOUBLE PRECISION,
  wind_speed_kmh        DOUBLE PRECISION,
  humidity_pct          DOUBLE PRECISION,
  lightning_risk        BOOLEAN DEFAULT FALSE,
  flood_alert           BOOLEAN DEFAULT FALSE,
  storm_alert           BOOLEAN DEFAULT FALSE,
  heatwave_alert        BOOLEAN DEFAULT FALSE,
  extreme_weather_alert BOOLEAN DEFAULT FALSE,
  alert_description     TEXT,
  recorded_at           TIMESTAMPTZ NOT NULL,
  forecast_for          TIMESTAMPTZ,
  source                VARCHAR(100) DEFAULT 'mock',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_weather_district_time ON weather_records(district_id, recorded_at DESC);

-- ── Historical incidents ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS historical_incidents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id          UUID REFERENCES assets(id),
  state_id          UUID NOT NULL REFERENCES states(id),
  district_id       UUID NOT NULL REFERENCES districts(id),
  incident_type     VARCHAR(100) NOT NULL,
  description       TEXT,
  occurred_at       TIMESTAMPTZ NOT NULL,
  outage_duration_h DOUBLE PRECISION,
  affected_connections INT,
  failure_cause     TEXT,
  repair_action     TEXT,
  is_recurring      BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES users(id)
);

-- ── Inspection tasks ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspection_tasks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_code         VARCHAR(50) UNIQUE,
  asset_id          UUID NOT NULL REFERENCES assets(id),
  complaint_id      UUID REFERENCES complaints(id),
  assigned_worker_id UUID REFERENCES worker_profiles(id),
  state_id          UUID NOT NULL REFERENCES states(id),
  district_id       UUID NOT NULL REFERENCES districts(id),
  priority          INT DEFAULT 5,
  due_date          DATE,
  scheduled_at      TIMESTAMPTZ,
  field_of_work     field_of_work,
  dynamic_checklist JSONB,
  status            inspection_status NOT NULL DEFAULT 'draft',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES users(id)
);

-- ── Inspection reports ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspection_reports (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id               UUID NOT NULL REFERENCES inspection_tasks(id),
  worker_id             UUID NOT NULL REFERENCES worker_profiles(id),
  asset_id              UUID NOT NULL REFERENCES assets(id),
  complaint_id          UUID REFERENCES complaints(id),
  state_id              UUID NOT NULL REFERENCES states(id),
  district_id           UUID NOT NULL REFERENCES districts(id),
  weather_condition     VARCHAR(100),
  site_access           VARCHAR(100),
  safety_status         VARCHAR(100),
  visible_condition     VARCHAR(100),
  operational_status    VARCHAR(100),
  immediate_safety_concern BOOLEAN DEFAULT FALSE,
  recommended_action    TEXT,
  urgency               VARCHAR(50),
  notes                 TEXT,
  gps_lat               DOUBLE PRECISION,
  gps_lng               DOUBLE PRECISION,
  risk_score_before     DOUBLE PRECISION,
  risk_score_after      DOUBLE PRECISION,
  score_delta           DOUBLE PRECISION,
  worker_signature      TEXT,
  status                inspection_status NOT NULL DEFAULT 'draft',
  submitted_at          TIMESTAMPTZ,
  reviewed_by           UUID REFERENCES users(id),
  reviewed_at           TIMESTAMPTZ,
  review_notes          TEXT,
  correction_requested  BOOLEAN DEFAULT FALSE,
  correction_reason     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Worker observations ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_observations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id         UUID NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  asset_id          UUID NOT NULL REFERENCES assets(id),
  worker_id         UUID NOT NULL REFERENCES worker_profiles(id),
  state_id          UUID NOT NULL REFERENCES states(id),
  district_id       UUID NOT NULL REFERENCES districts(id),
  observation_code  VARCHAR(100) NOT NULL,
  obs_type          observation_type NOT NULL,
  severity          observation_severity,
  confidence        DOUBLE PRECISION DEFAULT 1.0,
  description       TEXT,
  measured_value    DOUBLE PRECISION,
  measured_unit     VARCHAR(50),
  comment           TEXT,
  photo_urls        TEXT[],
  gps_lat           DOUBLE PRECISION,
  gps_lng           DOUBLE PRECISION,
  risk_score_impact DOUBLE PRECISION,
  observed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_observations_asset ON worker_observations(asset_id);
CREATE INDEX IF NOT EXISTS idx_observations_report ON worker_observations(report_id);

-- ── Risk factors ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS risk_factors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  factor_key      VARCHAR(100) NOT NULL UNIQUE,
  category        VARCHAR(100) NOT NULL,
  label           VARCHAR(200) NOT NULL,
  description     TEXT,
  base_weight     DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID REFERENCES users(id)
);

-- ── Observation risk mappings ─────────────────────────────────
CREATE TABLE IF NOT EXISTS observation_risk_mappings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  observation_code      VARCHAR(100) NOT NULL UNIQUE,
  obs_type              observation_type NOT NULL,
  severity              observation_severity,
  risk_delta            DOUBLE PRECISION NOT NULL,
  can_cancel_critical   BOOLEAN DEFAULT FALSE,
  recommended_action    TEXT,
  work_instruction      TEXT,
  is_active             BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by            UUID REFERENCES users(id)
);

-- ── Risk predictions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS risk_predictions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id              UUID NOT NULL REFERENCES assets(id),
  state_id              UUID NOT NULL REFERENCES states(id),
  district_id           UUID NOT NULL REFERENCES districts(id),
  risk_score            DOUBLE PRECISION NOT NULL,
  risk_level            risk_level NOT NULL,
  previous_score        DOUBLE PRECISION,
  score_delta           DOUBLE PRECISION,
  failure_probability   DOUBLE PRECISION,
  outage_probability    DOUBLE PRECISION,
  grid_impact_severity  DOUBLE PRECISION,
  maintenance_urgency   VARCHAR(50),
  confidence_score      DOUBLE PRECISION,
  top_factors           JSONB,
  explanation           TEXT,
  missing_data_flags    TEXT[],
  model_version         VARCHAR(50) DEFAULT '1.0.0',
  input_snapshot        JSONB,
  human_review_status   VARCHAR(50) DEFAULT 'pending',
  override_reason       TEXT,
  reviewed_by           UUID REFERENCES users(id),
  reviewed_at           TIMESTAMPTZ,
  is_flagged            BOOLEAN DEFAULT FALSE,
  flag_reason           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_predictions_asset ON risk_predictions(asset_id, created_at DESC);

-- ── Corrective recommendations ────────────────────────────────
CREATE TABLE IF NOT EXISTS corrective_recommendations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prediction_id     UUID REFERENCES risk_predictions(id),
  asset_id          UUID NOT NULL REFERENCES assets(id),
  state_id          UUID NOT NULL REFERENCES states(id),
  district_id       UUID NOT NULL REFERENCES districts(id),
  observation_code  VARCHAR(100),
  risk_impact       VARCHAR(50),
  recommendation    TEXT NOT NULL,
  work_instruction  TEXT,
  status            VARCHAR(50) DEFAULT 'observation',
  admin_approved_by UUID REFERENCES users(id),
  admin_approved_at TIMESTAMPTZ,
  completed_by      UUID REFERENCES worker_profiles(id),
  completed_at      TIMESTAMPTZ,
  completion_notes  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Maintenance plans ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_plans (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_code               VARCHAR(50) UNIQUE,
  asset_id                UUID NOT NULL REFERENCES assets(id),
  state_id                UUID NOT NULL REFERENCES states(id),
  district_id             UUID NOT NULL REFERENCES districts(id),
  priority_rank           INT,
  risk_score              DOUBLE PRECISION,
  risk_level              risk_level,
  main_contributing_factors JSONB,
  failure_probability     DOUBLE PRECISION,
  grid_impact_severity    DOUBLE PRECISION,
  recommended_action      TEXT,
  required_skill          field_of_work,
  required_tools          TEXT,
  required_parts          TEXT,
  estimated_duration_h    DOUBLE PRECISION,
  suggested_completion_date DATE,
  suggested_crew_area     TEXT,
  status                  maintenance_plan_status DEFAULT 'ai_recommended',
  approved_by             UUID REFERENCES users(id),
  approved_at             TIMESTAMPTZ,
  modified_reason         TEXT,
  rejection_reason        TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Crew assignments ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crew_assignments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id           UUID NOT NULL REFERENCES maintenance_plans(id) ON DELETE CASCADE,
  worker_id         UUID NOT NULL REFERENCES worker_profiles(id),
  state_id          UUID NOT NULL REFERENCES states(id),
  district_id       UUID NOT NULL REFERENCES districts(id),
  role              VARCHAR(100),
  is_lead           BOOLEAN DEFAULT FALSE,
  approved_by       UUID REFERENCES users(id),
  out_of_district   BOOLEAN DEFAULT FALSE,
  assignment_reason TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Notification templates ────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_key   VARCHAR(100) NOT NULL UNIQUE,
  channel     notification_channel NOT NULL DEFAULT 'email',
  subject     TEXT,
  body_text   TEXT NOT NULL,
  body_html   TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Notifications ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_key       VARCHAR(100) NOT NULL,
  recipient_type  VARCHAR(50) NOT NULL,
  recipient_id    UUID,
  recipient_email VARCHAR(255),
  recipient_mobile VARCHAR(20),
  channel         notification_channel NOT NULL,
  subject         TEXT,
  body            TEXT NOT NULL,
  status          VARCHAR(50) DEFAULT 'pending',
  sent_at         TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Audit logs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_type      VARCHAR(50) NOT NULL,
  actor_id        UUID,
  actor_email     VARCHAR(255),
  action          VARCHAR(200) NOT NULL,
  entity_type     VARCHAR(100),
  entity_id       UUID,
  state_id        UUID REFERENCES states(id),
  old_values      JSONB,
  new_values      JSONB,
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id, created_at DESC);

-- ── Website settings ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS website_settings (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_name           VARCHAR(200) DEFAULT 'NEXORA AI',
  logo_url            TEXT,
  favicon_url         TEXT,
  background_image_url TEXT,
  login_bg_url        TEXT,
  primary_color       VARCHAR(20) DEFAULT '#1a56db',
  secondary_color     VARCHAR(20) DEFAULT '#7e3af2',
  accent_color        VARCHAR(20) DEFAULT '#f05252',
  dashboard_title     VARCHAR(200) DEFAULT 'NEXORA AI Dashboard',
  footer_text         TEXT DEFAULT '© 2024 NEXORA AI. All rights reserved.',
  updated_by          UUID REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO website_settings DEFAULT VALUES
ON CONFLICT DO NOTHING;
