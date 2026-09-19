-- ============================================================
-- NEXORA AI — Migration 004: Alert Module
-- Covers: enums, alert records, assignment, status history,
--         arrival verification, notifications, geo-tagged images,
--         measurements, field reports, negative/positive findings,
--         risk score history, corrective actions, follow-ups,
--         admin feedback, escalations, cross-state auth,
--         worker coverage areas, notification templates.
-- ============================================================

-- ── New enums ─────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE alert_source_type AS ENUM (
    'citizen_complaint',
    'critical_asset',
    'risk_score_jump',
    'sensor_warning',
    'weather_warning',
    'repeated_outage',
    'multiple_complaints',
    'prior_worker_report',
    'maintenance_failure',
    'unmonitored_area',
    'safety_issue',
    'operator_report',
    'ai_prediction',
    'department_request',
    'system_threshold'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_status AS ENUM (
    'new',
    'reviewed_by_state_admin',
    'worker_assignment_pending',
    'assigned_to_worker',
    'accepted_by_worker',
    'travel_started',
    'worker_arrived',
    'inspection_in_progress',
    'report_draft',
    'report_submitted',
    'state_admin_review',
    'more_information_requested',
    'report_approved',
    'corrective_action_pending',
    'corrective_action_approved',
    'maintenance_in_progress',
    'maintenance_completed',
    'followup_inspection_pending',
    'followup_inspection_completed',
    'risk_recalculated',
    'state_admin_verified',
    'resolved',
    'closed',
    'assignment_declined',
    'worker_unavailable',
    'location_inaccessible',
    'unsafe_to_enter',
    'duplicate_alert',
    'false_unconfirmed_problem',
    'escalated',
    'emergency_response_required'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_priority AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_severity AS ENUM ('minor', 'moderate', 'major', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_category AS ENUM (
    'electrical_fault',
    'structural_damage',
    'safety_hazard',
    'maintenance_overdue',
    'sensor_anomaly',
    'weather_related',
    'citizen_complaint',
    'operational_failure',
    'environmental',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE worker_acceptance_status AS ENUM (
    'pending',
    'accepted',
    'declined',
    'reassignment_requested'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gps_verification_status AS ENUM (
    'verified',
    'mismatch_confirmed',
    'mismatch_admin_corrected',
    'gps_unavailable_exception',
    'pending'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE area_type AS ENUM ('rural', 'urban', 'semi_urban');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE positive_finding_verification AS ENUM (
    'verified_positive',
    'worker_reported_unverified',
    'not_checked',
    'not_applicable',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE image_category AS ENUM (
    'arrival',
    'wide_area_site',
    'asset_front',
    'asset_side',
    'close_up_problem',
    'measurement',
    'safety_hazard',
    'nameplate_serial',
    'surrounding_area',
    'after_correction',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE measurement_type AS ENUM (
    'voltage',
    'current',
    'temperature',
    'load',
    'vibration',
    'humidity',
    'earthing_value',
    'oil_temperature',
    'oil_level',
    'power_quality',
    'fault_code',
    'water_level',
    'structural',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE corrective_action_option AS ENUM (
    'immediate_safety_escalation',
    'temporary_shutdown',
    'repair_wiring',
    'replace_cable',
    'improve_ventilation',
    'improve_drainage',
    'remove_obstruction',
    'seal_enclosure',
    'repair_earthing',
    'tighten_connection',
    'replace_connection',
    'remove_corrosion',
    'replace_equipment',
    'schedule_routine_maintenance',
    'continue_monitoring',
    'no_action_required',
    'assign_specialist',
    'escalate_to_another_team'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Worker coverage areas ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_coverage_areas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id   UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  state_id    UUID NOT NULL REFERENCES states(id),
  district_id UUID REFERENCES districts(id),
  taluka_id   UUID REFERENCES talukas(id),
  village_id  UUID REFERENCES villages(id),
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_worker_coverage_worker  ON worker_coverage_areas(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_coverage_taluka  ON worker_coverage_areas(taluka_id);
CREATE INDEX IF NOT EXISTS idx_worker_coverage_village ON worker_coverage_areas(village_id);

-- ── Alert records ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id                            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_number                  VARCHAR(60) NOT NULL UNIQUE,

  -- Identification
  title                         VARCHAR(400) NOT NULL,
  category                      alert_category NOT NULL,
  priority                      alert_priority NOT NULL DEFAULT 'medium',
  severity                      alert_severity NOT NULL DEFAULT 'moderate',
  source_type                   alert_source_type NOT NULL,

  -- Linked IDs (all optional)
  linked_complaint_id           UUID REFERENCES complaints(id),
  linked_asset_id               UUID REFERENCES assets(id),
  linked_risk_prediction_id     UUID REFERENCES risk_predictions(id),

  -- Geographic
  state_id                      UUID NOT NULL REFERENCES states(id),
  district_id                   UUID NOT NULL REFERENCES districts(id),
  taluka_id                     UUID REFERENCES talukas(id),
  village_id                    UUID REFERENCES villages(id),
  area_type                     area_type,
  pin_code                      VARCHAR(10),
  full_address                  TEXT,
  location_lat                  DOUBLE PRECISION,
  location_lng                  DOUBLE PRECISION,
  location_confirmed_by         UUID REFERENCES users(id),
  geo_mismatch_warned           BOOLEAN NOT NULL DEFAULT FALSE,
  access_instructions           TEXT,
  nearby_landmark               TEXT,
  service_area_boundary         JSONB,

  -- Problem info
  description                   TEXT NOT NULL,
  potential_impact               TEXT,
  detected_at                   TIMESTAMPTZ,
  asset_condition               VARCHAR(100),
  current_risk_score            DOUBLE PRECISION,
  previous_risk_score           DOUBLE PRECISION,
  main_risk_factors             JSONB,
  is_safety_concern             BOOLEAN NOT NULL DEFAULT FALSE,
  public_impact                 TEXT,
  affected_customer_count       INT,
  critical_facilities           TEXT,
  required_technical_field      field_of_work,
  required_qualification        TEXT,
  recommended_response_deadline TIMESTAMPTZ,

  -- Evidence links  [{type, url, id, label}]
  evidence_links                JSONB,

  -- Status & lifecycle
  status                        alert_status NOT NULL DEFAULT 'new',
  created_by                    UUID NOT NULL REFERENCES users(id),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                    UUID REFERENCES users(id),
  resolved_at                   TIMESTAMPTZ,
  closed_at                     TIMESTAMPTZ,
  closed_by                     UUID REFERENCES users(id),
  close_verification_notes      TEXT
);

CREATE INDEX IF NOT EXISTS idx_alerts_state      ON alerts(state_id);
CREATE INDEX IF NOT EXISTS idx_alerts_district   ON alerts(district_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status     ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_priority   ON alerts(priority, severity);
CREATE INDEX IF NOT EXISTS idx_alerts_asset      ON alerts(linked_asset_id);
CREATE INDEX IF NOT EXISTS idx_alerts_complaint  ON alerts(linked_complaint_id);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);

-- ── Alert status history ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_status_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id        UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  from_status     alert_status,
  to_status       alert_status NOT NULL,
  changed_by_type VARCHAR(20)  NOT NULL,  -- 'user' | 'worker' | 'system'
  changed_by      UUID,
  reason          TEXT,
  metadata        JSONB,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ash_alert ON alert_status_history(alert_id, changed_at DESC);

-- ── Alert assignments ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_assignments (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id               UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  worker_id              UUID NOT NULL REFERENCES worker_profiles(id),
  assigned_by            UUID NOT NULL REFERENCES users(id),
  assigned_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assignment_reason      TEXT,
  recommendation_rank    INT,
  recommendation_reasons JSONB,
  expected_arrival_at    TIMESTAMPTZ,
  expected_report_by     TIMESTAMPTZ,
  acceptance_status      worker_acceptance_status NOT NULL DEFAULT 'pending',
  declined_reason        TEXT,
  accepted_at            TIMESTAMPTZ,
  declined_at            TIMESTAMPTZ,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  superseded_by          UUID REFERENCES alert_assignments(id),
  reassignment_reason    TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aa_alert  ON alert_assignments(alert_id);
CREATE INDEX IF NOT EXISTS idx_aa_worker ON alert_assignments(worker_id);

-- ── Worker arrival records ────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_arrival_records (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id                    UUID NOT NULL REFERENCES alerts(id),
  assignment_id               UUID NOT NULL REFERENCES alert_assignments(id),
  worker_id                   UUID NOT NULL REFERENCES worker_profiles(id),
  asset_id                    UUID REFERENCES assets(id),
  complaint_id                UUID REFERENCES complaints(id),
  arrived_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  gps_lat                     DOUBLE PRECISION,
  gps_lng                     DOUBLE PRECISION,
  gps_accuracy_m              DOUBLE PRECISION,
  device_info                 JSONB,
  assigned_lat                DOUBLE PRECISION,
  assigned_lng                DOUBLE PRECISION,
  distance_from_assigned_m    DOUBLE PRECISION,
  gps_tolerance_m             DOUBLE PRECISION NOT NULL DEFAULT 200,
  gps_status                  gps_verification_status NOT NULL DEFAULT 'pending',
  mismatch_confirmed_by_worker BOOLEAN DEFAULT FALSE,
  worker_mismatch_explanation TEXT,
  admin_correction_approved_by UUID REFERENCES users(id),
  admin_correction_at         TIMESTAMPTZ,
  corrected_lat               DOUBLE PRECISION,
  corrected_lng               DOUBLE PRECISION,
  gps_unavailable_reason      TEXT,
  gps_exception_evidence      TEXT,
  gps_exception_approved_by   UUID REFERENCES users(id),
  gps_exception_approved_at   TIMESTAMPTZ,
  arrival_photo_url           TEXT,
  arrival_photo_hash          TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_war_alert  ON worker_arrival_records(alert_id);
CREATE INDEX IF NOT EXISTS idx_war_worker ON worker_arrival_records(worker_id);

-- ── Alert notifications ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_notifications (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id         UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  event_key        VARCHAR(120) NOT NULL,
  recipient_type   VARCHAR(30) NOT NULL,
  recipient_id     UUID,
  recipient_email  VARCHAR(255),
  recipient_mobile VARCHAR(20),
  channel          notification_channel NOT NULL,
  subject          TEXT,
  body             TEXT NOT NULL,
  delivery_status  VARCHAR(30) NOT NULL DEFAULT 'pending',
  sent_at          TIMESTAMPTZ,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_an_alert ON alert_notifications(alert_id);

-- ── Geo-tagged evidence images ────────────────────────────────
CREATE TABLE IF NOT EXISTS geo_tagged_images (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id            UUID REFERENCES alerts(id),
  task_id             UUID REFERENCES inspection_tasks(id),
  asset_id            UUID REFERENCES assets(id),
  complaint_id        UUID REFERENCES complaints(id),
  worker_id           UUID NOT NULL REFERENCES worker_profiles(id),
  category            image_category NOT NULL,
  original_file_url   TEXT NOT NULL,
  thumbnail_url       TEXT,
  capture_timestamp   TIMESTAMPTZ,
  exif_gps_lat        DOUBLE PRECISION,
  exif_gps_lng        DOUBLE PRECISION,
  app_gps_lat         DOUBLE PRECISION,
  app_gps_lng         DOUBLE PRECISION,
  gps_accuracy_m      DOUBLE PRECISION,
  gps_source          VARCHAR(20) DEFAULT 'exif',
  device_info         JSONB,
  upload_timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tamper_hash         TEXT NOT NULL,
  description         TEXT,
  related_observation VARCHAR(200),
  is_before_maintenance BOOLEAN DEFAULT TRUE,
  verification_status VARCHAR(30) DEFAULT 'pending',
  rejected_reason     TEXT,
  reviewed_by         UUID REFERENCES users(id),
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gti_alert  ON geo_tagged_images(alert_id);
CREATE INDEX IF NOT EXISTS idx_gti_worker ON geo_tagged_images(worker_id);
CREATE INDEX IF NOT EXISTS idx_gti_asset  ON geo_tagged_images(asset_id);

-- ── Measurement records ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS measurement_records (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id               UUID REFERENCES alerts(id),
  task_id                UUID REFERENCES inspection_tasks(id),
  report_id              UUID,   -- alert_field_reports FK added after that table
  worker_id              UUID NOT NULL REFERENCES worker_profiles(id),
  asset_id               UUID REFERENCES assets(id),
  measurement_type       measurement_type NOT NULL,
  name                   VARCHAR(200) NOT NULL,
  value                  DOUBLE PRECISION NOT NULL,
  unit                   VARCHAR(50) NOT NULL,
  normal_range_min       DOUBLE PRECISION,
  normal_range_max       DOUBLE PRECISION,
  is_out_of_range        BOOLEAN NOT NULL DEFAULT FALSE,
  out_of_range_direction VARCHAR(10),
  instrument_used        VARCHAR(200),
  calibration_status     VARCHAR(50),
  measured_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  gps_lat                DOUBLE PRECISION,
  gps_lng                DOUBLE PRECISION,
  evidence_image_id      UUID REFERENCES geo_tagged_images(id),
  confidence             DOUBLE PRECISION DEFAULT 1.0,
  validation_status      VARCHAR(30) DEFAULT 'unvalidated',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mr_alert  ON measurement_records(alert_id);
CREATE INDEX IF NOT EXISTS idx_mr_worker ON measurement_records(worker_id);

-- ── Alert field reports ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_field_reports (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id                  UUID NOT NULL REFERENCES alerts(id),
  assignment_id             UUID NOT NULL REFERENCES alert_assignments(id),
  worker_id                 UUID NOT NULL REFERENCES worker_profiles(id),
  asset_id                  UUID REFERENCES assets(id),
  complaint_id              UUID REFERENCES complaints(id),
  state_id                  UUID NOT NULL REFERENCES states(id),
  district_id               UUID NOT NULL REFERENCES districts(id),
  taluka_id                 UUID REFERENCES talukas(id),
  village_id                UUID REFERENCES villages(id),
  -- Section A
  arrival_timestamp         TIMESTAMPTZ,
  start_timestamp           TIMESTAMPTZ,
  completion_timestamp      TIMESTAMPTZ,
  gps_lat                   DOUBLE PRECISION,
  gps_lng                   DOUBLE PRECISION,
  weather_condition         VARCHAR(100),
  access_condition          VARCHAR(100),
  site_safety_condition     VARCHAR(100),
  public_presence           BOOLEAN DEFAULT FALSE,
  public_hazard             BOOLEAN DEFAULT FALSE,
  asset_operating_status    VARCHAR(100),
  -- Section B
  what_was_observed         TEXT,
  citizen_reported          TEXT,
  changes_since_last        TEXT,
  evidence_found            TEXT,
  problem_status            VARCHAR(30),
  immediate_safety_risk     BOOLEAN DEFAULT FALSE,
  asset_operates_normally   BOOLEAN,
  another_asset_contributing BOOLEAN DEFAULT FALSE,
  urgent_escalation_needed  BOOLEAN DEFAULT FALSE,
  -- Worker feedback
  problem_confirmed         BOOLEAN,
  problem_active_now        BOOLEAN,
  problem_intermittent      BOOLEAN,
  is_safety_risk_now        BOOLEAN DEFAULT FALSE,
  repair_recommendation     corrective_action_option,
  complaint_validity        VARCHAR(30),
  recommended_action_text   TEXT,
  recommended_urgency       VARCHAR(30),
  followup_needed           BOOLEAN DEFAULT FALSE,
  worker_explanation        TEXT,
  -- Status
  status                    inspection_status NOT NULL DEFAULT 'draft',
  submitted_at              TIMESTAMPTZ,
  reviewed_by               UUID REFERENCES users(id),
  reviewed_at               TIMESTAMPTZ,
  review_notes              TEXT,
  correction_requested      BOOLEAN DEFAULT FALSE,
  correction_reason         TEXT,
  -- Risk scores
  risk_score_before         DOUBLE PRECISION,
  risk_score_after          DOUBLE PRECISION,
  score_delta               DOUBLE PRECISION,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_afr_alert  ON alert_field_reports(alert_id);
CREATE INDEX IF NOT EXISTS idx_afr_worker ON alert_field_reports(worker_id);

-- Add FK from measurement_records.report_id -> alert_field_reports after table exists
ALTER TABLE measurement_records
  ADD CONSTRAINT fk_mr_report
  FOREIGN KEY (report_id) REFERENCES alert_field_reports(id)
  NOT VALID;

-- ── Negative findings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS negative_findings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id             UUID NOT NULL REFERENCES alert_field_reports(id) ON DELETE CASCADE,
  alert_id              UUID NOT NULL REFERENCES alerts(id),
  worker_id             UUID NOT NULL REFERENCES worker_profiles(id),
  asset_id              UUID REFERENCES assets(id),
  finding_code          VARCHAR(100) NOT NULL,
  category              VARCHAR(100),
  severity              alert_severity NOT NULL,
  worker_confidence     DOUBLE PRECISION DEFAULT 1.0,
  measured_value        DOUBLE PRECISION,
  measured_unit         VARCHAR(50),
  description           TEXT,
  immediate_safety_flag BOOLEAN NOT NULL DEFAULT FALSE,
  recommended_action    TEXT,
  photo_ids             UUID[],
  gps_lat               DOUBLE PRECISION,
  gps_lng               DOUBLE PRECISION,
  observed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  risk_score_delta      DOUBLE PRECISION,
  escalation_triggered  BOOLEAN NOT NULL DEFAULT FALSE,
  escalated_at          TIMESTAMPTZ,
  related_asset_id      UUID REFERENCES assets(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nf_report ON negative_findings(report_id);
CREATE INDEX IF NOT EXISTS idx_nf_alert  ON negative_findings(alert_id);

-- ── Positive findings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS positive_findings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id             UUID NOT NULL REFERENCES alert_field_reports(id) ON DELETE CASCADE,
  alert_id              UUID NOT NULL REFERENCES alerts(id),
  worker_id             UUID NOT NULL REFERENCES worker_profiles(id),
  asset_id              UUID REFERENCES assets(id),
  finding_code          VARCHAR(100) NOT NULL,
  category              VARCHAR(100),
  evidence_type         VARCHAR(100),
  measured_value        DOUBLE PRECISION,
  measured_unit         VARCHAR(50),
  photo_ids             UUID[],
  comment               TEXT,
  worker_confidence     DOUBLE PRECISION DEFAULT 1.0,
  gps_lat               DOUBLE PRECISION,
  gps_lng               DOUBLE PRECISION,
  observed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verification_status   positive_finding_verification NOT NULL DEFAULT 'unknown',
  risk_score_delta      DOUBLE PRECISION,
  related_risk_factor   VARCHAR(100),
  can_cancel_critical   BOOLEAN NOT NULL DEFAULT FALSE,
  related_asset_id      UUID REFERENCES assets(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pf_report ON positive_findings(report_id);
CREATE INDEX IF NOT EXISTS idx_pf_alert  ON positive_findings(alert_id);

-- ── Risk score history ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS risk_score_history (
  id                           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id                     UUID NOT NULL REFERENCES assets(id),
  alert_id                     UUID REFERENCES alerts(id),
  report_id                    UUID REFERENCES alert_field_reports(id),
  score_before_alert           DOUBLE PRECISION,
  admin_info_delta             DOUBLE PRECISION DEFAULT 0,
  arrival_verification_delta   DOUBLE PRECISION DEFAULT 0,
  negative_findings_delta      DOUBLE PRECISION DEFAULT 0,
  positive_findings_delta      DOUBLE PRECISION DEFAULT 0,
  evidence_images_delta        DOUBLE PRECISION DEFAULT 0,
  measurements_delta           DOUBLE PRECISION DEFAULT 0,
  sensor_readings_delta        DOUBLE PRECISION DEFAULT 0,
  weather_delta                DOUBLE PRECISION DEFAULT 0,
  historical_incidents_delta   DOUBLE PRECISION DEFAULT 0,
  maintenance_status_delta     DOUBLE PRECISION DEFAULT 0,
  final_score                  DOUBLE PRECISION NOT NULL,
  final_level                  risk_level NOT NULL,
  score_delta                  DOUBLE PRECISION NOT NULL,
  previous_level               risk_level,
  safety_override_applied      BOOLEAN NOT NULL DEFAULT FALSE,
  safety_override_reason       TEXT,
  positive_factors             JSONB,
  negative_factors             JSONB,
  evidence_used                JSONB,
  missing_information          TEXT[],
  confidence                   DOUBLE PRECISION,
  model_version                VARCHAR(50) DEFAULT '2.0.0',
  calculated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_status                VARCHAR(30) DEFAULT 'pending',
  reviewed_by                  UUID REFERENCES users(id),
  override_reason              TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rsh_asset ON risk_score_history(asset_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rsh_alert ON risk_score_history(alert_id);

-- ── Alert corrective actions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_corrective_actions (
  id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id                   UUID NOT NULL REFERENCES alerts(id),
  report_id                  UUID REFERENCES alert_field_reports(id),
  action_type                corrective_action_option NOT NULL,
  description                TEXT,
  approved_by                UUID REFERENCES users(id),
  approved_at                TIMESTAMPTZ,
  assigned_worker_id         UUID REFERENCES worker_profiles(id),
  completed_by               UUID REFERENCES worker_profiles(id),
  completion_timestamp       TIMESTAMPTZ,
  completion_notes           TEXT,
  after_photo_id             UUID REFERENCES geo_tagged_images(id),
  post_repair_measurement_id UUID REFERENCES measurement_records(id),
  maintenance_record_url     TEXT,
  worker_confirmation        BOOLEAN DEFAULT FALSE,
  asset_operating_status     VARCHAR(100),
  evidence_gps_lat           DOUBLE PRECISION,
  evidence_gps_lng           DOUBLE PRECISION,
  evidence_timestamp         TIMESTAMPTZ,
  admin_approved_completion  BOOLEAN DEFAULT FALSE,
  admin_completion_by        UUID REFERENCES users(id),
  admin_completion_at        TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aca_alert ON alert_corrective_actions(alert_id);

-- ── Follow-up inspections ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_followup_inspections (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id           UUID NOT NULL REFERENCES alerts(id),
  requested_by       UUID NOT NULL REFERENCES users(id),
  requested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_worker_id UUID REFERENCES worker_profiles(id),
  due_by             TIMESTAMPTZ,
  report_id          UUID REFERENCES alert_field_reports(id),
  status             VARCHAR(30) NOT NULL DEFAULT 'pending',
  completed_at       TIMESTAMPTZ,
  admin_reviewed_by  UUID REFERENCES users(id),
  admin_reviewed_at  TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_afi_alert ON alert_followup_inspections(alert_id);

-- ── Admin feedback / correction requests ─────────────────────
CREATE TABLE IF NOT EXISTS alert_admin_feedback (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id        UUID NOT NULL REFERENCES alerts(id),
  report_id       UUID REFERENCES alert_field_reports(id),
  admin_id        UUID NOT NULL REFERENCES users(id),
  feedback_type   VARCHAR(50) NOT NULL,
  message         TEXT NOT NULL,
  override_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aaf_alert ON alert_admin_feedback(alert_id);

-- ── Escalation records ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_escalations (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id           UUID NOT NULL REFERENCES alerts(id),
  escalated_by       UUID NOT NULL REFERENCES users(id),
  escalated_to_type  VARCHAR(50) NOT NULL,
  escalated_to_id    UUID,
  reason             TEXT NOT NULL,
  resolved           BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ae_alert ON alert_escalations(alert_id);

-- ── Cross-state worker authorization ─────────────────────────
CREATE TABLE IF NOT EXISTS cross_state_authorizations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id       UUID NOT NULL REFERENCES alerts(id),
  requested_by   UUID NOT NULL REFERENCES users(id),
  authorized_by  UUID REFERENCES users(id),
  worker_id      UUID NOT NULL REFERENCES worker_profiles(id),
  reason         TEXT NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending',
  decided_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Notification templates for alert events ──────────────────
INSERT INTO notification_templates (event_key, channel, subject, body_text, is_active)
VALUES
  ('alert_created',             'email',
   'New Alert Created — {{alertNumber}}',
   'Alert {{alertNumber}} created. Title: {{title}}. Priority: {{priority}}. Please review.',
   TRUE),
  ('alert_assigned_to_worker',  'email',
   'Alert Assigned: {{alertNumber}}',
   'Dear {{workerName}}, you have been assigned Alert {{alertNumber}}. Location: {{location}}. Deadline: {{deadline}}.',
   TRUE),
  ('alert_assigned_to_worker',  'sms',
   NULL,
   'NEXORA: Alert {{alertNumber}} assigned. Location: {{location}}. Deadline: {{deadline}}.',
   TRUE),
  ('alert_accepted_by_worker',  'email',
   'Alert {{alertNumber}} Accepted',
   'Worker {{workerName}} has accepted Alert {{alertNumber}}.',
   TRUE),
  ('alert_declined_by_worker',  'email',
   'Alert {{alertNumber}} Declined',
   'Worker {{workerName}} declined Alert {{alertNumber}}. Reason: {{reason}}',
   TRUE),
  ('alert_worker_travel_started','email',
   'Worker En Route — Alert {{alertNumber}}',
   'Worker {{workerName}} has started travel to Alert {{alertNumber}} location.',
   TRUE),
  ('alert_worker_arrived',      'email',
   'Worker Arrived — Alert {{alertNumber}}',
   'Worker {{workerName}} has arrived at the Alert {{alertNumber}} site.',
   TRUE),
  ('alert_report_submitted',    'email',
   'Field Report Submitted — Alert {{alertNumber}}',
   'A field report for Alert {{alertNumber}} has been submitted by {{workerName}}. Please review.',
   TRUE),
  ('alert_report_approved',     'email',
   'Your Report Approved — Alert {{alertNumber}}',
   'Dear {{workerName}}, your field report for Alert {{alertNumber}} has been approved.',
   TRUE),
  ('alert_correction_requested','email',
   'Correction Requested — Alert {{alertNumber}}',
   'Dear {{workerName}}, admin has requested corrections for Alert {{alertNumber}}. Reason: {{reason}}',
   TRUE),
  ('alert_escalated',           'email',
   'URGENT — Alert {{alertNumber}} Escalated',
   'Alert {{alertNumber}} escalated. Reason: {{reason}}',
   TRUE),
  ('alert_critical_risk',       'email',
   'CRITICAL RISK — Alert {{alertNumber}}',
   'Critical risk detected in Alert {{alertNumber}}. Immediate action required.',
   TRUE),
  ('alert_overdue_report',      'email',
   'Overdue Report — Alert {{alertNumber}}',
   'Worker {{workerName}} has an overdue report for Alert {{alertNumber}}.',
   TRUE),
  ('alert_worker_unavailable',  'email',
   'Worker Unavailable — Alert {{alertNumber}}',
   'Alert {{alertNumber}} has not been accepted. Please reassign.',
   TRUE),
  ('alert_corrective_approved', 'email',
   'Corrective Action Approved — Alert {{alertNumber}}',
   'Dear {{workerName}}, corrective action for Alert {{alertNumber}} has been approved.',
   TRUE),
  ('alert_followup_required',   'email',
   'Follow-up Inspection Required — Alert {{alertNumber}}',
   'Dear {{workerName}}, a follow-up inspection is required for Alert {{alertNumber}}.',
   TRUE),
  ('alert_closed',              'email',
   'Alert {{alertNumber}} Closed',
   'Alert {{alertNumber}} has been verified and closed by {{adminName}}.',
   TRUE),
  ('alert_safety_concern',      'email',
   'SAFETY CONCERN — Alert {{alertNumber}}',
   'Worker {{workerName}} has reported an immediate safety concern at Alert {{alertNumber}}.',
   TRUE),
  ('alert_location_inaccessible','email',
   'Location Inaccessible — Alert {{alertNumber}}',
   'Worker {{workerName}} reported the location for Alert {{alertNumber}} is inaccessible.',
   TRUE)
ON CONFLICT (event_key) DO NOTHING;

-- ── IBM Bob / watsonx.ai triage cache ─────────────────────────

CREATE TABLE IF NOT EXISTS bob_triage_cache (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id            UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  content_hash        VARCHAR(16) NOT NULL,
  summary             TEXT NOT NULL,
  recommended_action  TEXT NOT NULL,
  urgency_level       VARCHAR(20) NOT NULL CHECK (urgency_level IN ('low','moderate','high','critical')),
  powered_by          VARCHAR(60) NOT NULL DEFAULT 'rule-based-fallback',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bob_triage_alert ON bob_triage_cache(alert_id, created_at DESC);
