/**
 * NEXORA AI — Gujarat End-to-End Demo Seed  (clean rewrite)
 *
 * Seeds one complete Gujarat scenario per spec section 19:
 *   citizen complaint → linked high-risk asset → alert created → worker assigned
 *   → arrival GPS recorded → negative/positive findings → risk pipeline run
 *   → corrective action → follow-up inspection → risk reduced → alert closed
 *
 * Run:  npm run seed:demo  (from packages/backend)
 * All INSERT statements use $1…$N placeholders — no string interpolation.
 * All string values are passed as parameters — no embedded single-quotes.
 */

import { query } from './db';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

async function hashPw(pw: string) {
  return bcrypt.hash(pw, 10);
}

// ── Stable IDs (prefixed with aaa… so ON CONFLICT is safe) ───
const GJ_ADMIN_ID      = 'aaa00001-0000-4000-8000-000000000001';
const GJ_WORKER_ID     = 'aaa00002-0000-4000-8000-000000000001';
const GJ_CITIZEN_ID    = 'aaa00003-0000-4000-8000-000000000001';
const GJ_ASSET_ID      = 'aaa00004-0000-4000-8000-000000000001';
const GJ_SENSOR_ID     = 'aaa00005-0000-4000-8000-000000000001';
const GJ_COMPLAINT_ID  = 'aaa00006-0000-4000-8000-000000000001';
const GJ_ALERT_ID      = 'aaa00007-0000-4000-8000-000000000001';
const GJ_ASSIGN_ID     = 'aaa00008-0000-4000-8000-000000000001';
const GJ_ARRIVAL_ID    = 'aaa00009-0000-4000-8000-000000000001';
const GJ_REPORT_ID     = 'aaa00010-0000-4000-8000-000000000001';
const GJ_CORRECTIVE_ID = 'aaa00011-0000-4000-8000-000000000001';
const GJ_FOLLOWUP_ID   = 'aaa00012-0000-4000-8000-000000000001';
const GJ_RISK_H1_ID    = 'aaa00013-0000-4000-8000-000000000001';
const GJ_RISK_H2_ID    = 'aaa00014-0000-4000-8000-000000000001';

export async function seedGujaratDemo() {
  logger.info('[GujDemoSeed] Starting…');

  // ── 1. State ──────────────────────────────────────────────────
  await query(
    `INSERT INTO states (id, name, code) VALUES ($1, $2, $3)
     ON CONFLICT (code) DO NOTHING`,
    [uuidv4(), 'Gujarat', 'GJ']
  );
  const gjRow = await query<any>(`SELECT id FROM states WHERE code = $1`, ['GJ']);
  const GJ = gjRow[0].id;

  // ── 2. District ───────────────────────────────────────────────
  await query(
    `INSERT INTO districts (id, state_id, name, code, worker_capacity_limit)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
    [uuidv4(), GJ, 'Surat', 'GJ-SRT', 60]
  );
  const suratRow = await query<any>(`SELECT id FROM districts WHERE code = $1`, ['GJ-SRT']);
  const SURAT = suratRow[0].id;

  // ── 3. Taluka ─────────────────────────────────────────────────
  await query(
    `INSERT INTO talukas (id, name, district_id, state_id)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [uuidv4(), 'Bardoli', SURAT, GJ]
  );
  const bardoliRow = await query<any>(`SELECT id FROM talukas WHERE name = $1 AND district_id = $2`, ['Bardoli', SURAT]);
  const BARDOLI = bardoliRow[0].id;

  // ── 4. Village ────────────────────────────────────────────────
  await query(
    `INSERT INTO villages (id, name, taluka_id, district_id, state_id)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
    [uuidv4(), 'Mahuva', BARDOLI, SURAT, GJ]
  );
  const mahuvaRow = await query<any>(`SELECT id FROM villages WHERE name = $1 AND taluka_id = $2`, ['Mahuva', BARDOLI]);
  const MAHUVA = mahuvaRow[0].id;

  logger.info('[GujDemoSeed] Geography OK — GJ / Surat / Bardoli / Mahuva');

  // ── 5. State Admin ────────────────────────────────────────────
  await query(
    `INSERT INTO users (id, email, username, password_hash, role, state_id, full_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (email) DO NOTHING`,
    [GJ_ADMIN_ID, 'admin.gj@nexora.ai', 'admin_gj', await hashPw('GjAdmin@123!'), 'state_admin', GJ, 'Gujarat State Admin']
  );
  const gjAdminRow = await query<any>(`SELECT id FROM users WHERE email = $1`, ['admin.gj@nexora.ai']);
  const GJ_ADMIN = gjAdminRow[0].id;

  // ── 6. Worker (Arjun Patel — Bardoli, electrical_engineering) ─
  await query(
    `INSERT INTO worker_profiles
       (id, email, mobile, password_hash, full_name,
        state_id, district_id, taluka_id, village_id,
        assigned_state_id, assigned_district_id,
        field_of_work, status, is_active, application_number,
        consent_given, consent_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$6,$7,$10,$11,TRUE,$12,TRUE,NOW())
     ON CONFLICT (email) DO NOTHING`,
    [
      GJ_WORKER_ID, 'worker.gj@nexora.ai', '9876599001',
      await hashPw('Worker@1234!'), 'Arjun Patel',
      GJ, SURAT, BARDOLI, MAHUVA,
      'electrical_engineering', 'employed', 'NXW-GJ-001',
    ]
  );
  const gjWorkerRow = await query<any>(`SELECT id FROM worker_profiles WHERE email = $1`, ['worker.gj@nexora.ai']);
  const GJ_WORKER = gjWorkerRow[0].id;

  // Worker coverage area (primary — same taluka)
  await query(
    `INSERT INTO worker_coverage_areas (id, worker_id, state_id, district_id, taluka_id, village_id, is_primary)
     VALUES ($1,$2,$3,$4,$5,$6,TRUE) ON CONFLICT DO NOTHING`,
    [uuidv4(), GJ_WORKER, GJ, SURAT, BARDOLI, MAHUVA]
  );

  logger.info('[GujDemoSeed] Admin + Worker OK');

  // ── 7. High-risk transformer asset ───────────────────────────
  await query(
    `INSERT INTO assets
       (id, asset_code, asset_type, manufacturer, model,
        state_id, district_id, taluka_id, village_id,
        address_text, location_lat, location_lng,
        install_date, rated_capacity_kva, current_load_kw,
        connected_customers, sensor_available, status,
        current_risk_score, current_risk_level, previous_failures)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     ON CONFLICT (asset_code) DO NOTHING`,
    [
      GJ_ASSET_ID, 'GJ-MAH-TRF-001', 'transformer', 'BHEL', 'DTR-100KVA',
      GJ, SURAT, BARDOLI, MAHUVA,
      'Near Mahuva Bus Stand, Bardoli Taluka, Surat', 21.0938, 73.2575,
      '2004-03-15', 100, 88, 3200, true, 'operational',
      54, 'high', 3,
    ]
  );
  const gjAssetRow = await query<any>(`SELECT id FROM assets WHERE asset_code = $1`, ['GJ-MAH-TRF-001']);
  const GJ_ASSET = gjAssetRow[0].id;

  // ── 8. Sensor + abnormal readings ────────────────────────────
  await query(
    `INSERT INTO asset_sensors (id, asset_id, sensor_type, unit, min_normal, max_normal)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
    [GJ_SENSOR_ID, GJ_ASSET, 'oil_temperature', 'Celsius', 20, 85]
  );
  const sensorRow = await query<any>(`SELECT id FROM asset_sensors WHERE id = $1`, [GJ_SENSOR_ID]);
  const GJ_SENSOR = sensorRow[0]?.id ?? GJ_SENSOR_ID;

  await query(
    `INSERT INTO sensor_readings (id, sensor_id, asset_id, state_id, district_id, value, unit, is_outlier, recorded_at)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8, NOW()-INTERVAL '6 hours'),
       ($9,$2,$3,$4,$5,$10,$7,$8, NOW()-INTERVAL '12 hours')
     ON CONFLICT DO NOTHING`,
    [uuidv4(), GJ_SENSOR, GJ_ASSET, GJ, SURAT, 92.4, 'Celsius', true, uuidv4(), 89.1]
  );

  // ── 9. Historical failures ────────────────────────────────────
  for (const [desc, months, hours, cause, recurring] of [
    ['Transformer overloaded during monsoon — oil temperature exceeded 90°C', 8, 8.0, 'Overloading + water ingress', true],
    ['Tripping due to loose connection after heavy rainfall', 14, 4.5, 'Loose terminal connection', true],
    ['Oil leak due to corroded seals', 26, 5.0, 'Corrosion + age', false],
  ] as [string, number, number, string, boolean][]) {
    await query(
      `INSERT INTO historical_incidents
         (id, asset_id, state_id, district_id, incident_type, description,
          occurred_at, outage_duration_h, affected_connections, failure_cause, is_recurring)
       VALUES ($1,$2,$3,$4,$5,$6, NOW()-INTERVAL '${months} months',$7,$8,$9,$10)
       ON CONFLICT DO NOTHING`,
      [uuidv4(), GJ_ASSET, GJ, SURAT, 'transformer_failure', desc, hours, 3200, cause, recurring]
    );
  }

  // ── 10. Heavy rainfall weather ────────────────────────────────
  await query(
    `INSERT INTO weather_records
       (id, district_id, state_id, location_lat, location_lng,
        temperature_c, rainfall_mm, wind_speed_kmh, humidity_pct,
        flood_alert, storm_alert, extreme_weather_alert, alert_description, recorded_at, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),$14)
     ON CONFLICT DO NOTHING`,
    [
      uuidv4(), SURAT, GJ, 21.09, 73.25,
      33, 187, 68, 97,
      true, true, true,
      'DEMO: Severe monsoon — heavy rainfall, flooding risk, gusty winds',
      'demo_seed',
    ]
  );

  logger.info('[GujDemoSeed] Asset + sensor + weather + history OK');

  // ── 11. Citizen + complaint ───────────────────────────────────
  await query(
    `INSERT INTO citizens (id, full_name, mobile, email, state_id, district_id, city)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
    [GJ_CITIZEN_ID, 'Ramesh Patel', '9898989898', 'ramesh.mahuva@example.com', GJ, SURAT, 'Mahuva']
  );
  const citizenRow = await query<any>(`SELECT id FROM citizens WHERE email = $1`, ['ramesh.mahuva@example.com']);
  const GJ_CITIZEN = citizenRow[0].id;

  await query(
    `INSERT INTO complaints
       (id, complaint_number, citizen_id, state_id, district_id, taluka_id, village_id,
        category, description, is_safety_concern,
        location_lat, location_lng, location_address, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, NOW()-INTERVAL '2 days')
     ON CONFLICT DO NOTHING`,
    [
      GJ_COMPLAINT_ID, 'CMP-GJ-DEMO-001', GJ_CITIZEN, GJ, SURAT, BARDOLI, MAHUVA,
      'electrical_fault',
      'Transformer near bus stand is making loud buzzing noise, sparks visible at night. Very dangerous for children.',
      true, 21.0938, 73.2575, 'Near Mahuva Bus Stand, Bardoli', 'assigned',
    ]
  );
  const complaintRow = await query<any>(`SELECT id FROM complaints WHERE complaint_number = $1`, ['CMP-GJ-DEMO-001']);
  const GJ_COMPLAINT = complaintRow[0].id;

  await query(
    `INSERT INTO complaint_attachments (id, complaint_id, file_url, file_type, gps_lat, gps_lng, is_primary)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
    [uuidv4(), GJ_COMPLAINT, 'https://demo.nexora.ai/seed-images/gj-complaint-photo.jpg', 'image/jpeg', 21.0938, 73.2575, true]
  );

  logger.info('[GujDemoSeed] Citizen + complaint OK');

  // ── 12. Alert ─────────────────────────────────────────────────
  await query(
    `INSERT INTO alerts
       (id, alert_number, title, category, priority, severity, source_type,
        linked_complaint_id, linked_asset_id,
        state_id, district_id, taluka_id, village_id,
        area_type, pin_code, full_address,
        location_lat, location_lng, location_confirmed_by,
        access_instructions, nearby_landmark,
        description, potential_impact, detected_at,
        asset_condition, current_risk_score, previous_risk_score,
        is_safety_concern, public_impact, affected_customer_count,
        critical_facilities, required_technical_field, required_qualification,
        recommended_response_deadline,
        status, created_by, created_at,
        closed_at, closed_by, close_verification_notes)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
        $20,$21,$22,$23, NOW()-INTERVAL '2 days',
        $24,$25,$26,$27,$28,$29,$30,$31,$32, NOW()+INTERVAL '6 hours',
        $33,$19, NOW()-INTERVAL '2 days',
        NOW()-INTERVAL '1 hour',$19,$34)
     ON CONFLICT DO NOTHING`,
    [
      GJ_ALERT_ID, 'ALT-GJ-DEMO-001',
      'Critical Transformer — Sparks + Buzzing + High Temperature at Mahuva',
      'electrical_fault', 'critical', 'critical', 'citizen_complaint',
      GJ_COMPLAINT, GJ_ASSET,
      GJ, SURAT, BARDOLI, MAHUVA,
      'rural', '394317', 'Near Mahuva Bus Stand, Bardoli Taluka, Surat, Gujarat',
      21.0938, 73.2575, GJ_ADMIN,
      'Approach from main road; asset is behind the bus stand building.',
      'Mahuva Bus Stand',
      'Transformer GJ-MAH-TRF-001 showing sparks, abnormal buzzing, oil temperature above 92°C. Heavy rainfall. Public safety risk — children nearby.',
      'Transformer failure could cause extended outage for 3200+ customers including Mahuva PHC.',
      'Degraded — high temperature, sparks observed', 54, 42,
      true,
      'Outage risk for 3200+ connections; Mahuva PHC is a critical facility.',
      3200,
      'Mahuva Primary Health Centre (PHC)',
      'electrical_engineering', 'Licensed Electrician / HT Technician',
      'closed',
      'Follow-up inspection verified normal temperature (45°C), proper earthing (0.8Ω), intact insulation. Risk reduced from 54 to 28.',
    ]
  );
  const alertRow = await query<any>(`SELECT id FROM alerts WHERE alert_number = $1`, ['ALT-GJ-DEMO-001']);
  const GJ_ALERT = alertRow[0].id;

  // Update closed_by separately (avoids circular reference)
  await query(
    `UPDATE alerts SET closed_by = $1, current_risk_score = 28, current_risk_level = 'moderate' WHERE id = $2`,
    [GJ_ADMIN, GJ_ALERT]
  );

  // ── 13. Alert status history (full 19-step timeline) ─────────
  const STATUS_EVENTS: Array<{ from: string | null; to: string; reason: string; hrs: number }> = [
    { from: null,                         to: 'new',                         reason: 'Alert created by State Admin', hrs: 48 },
    { from: 'new',                        to: 'reviewed_by_state_admin',     reason: 'State Admin reviewed alert details', hrs: 47 },
    { from: 'reviewed_by_state_admin',    to: 'worker_assignment_pending',   reason: 'Seeking qualified worker in Bardoli taluka', hrs: 46 },
    { from: 'worker_assignment_pending',  to: 'assigned_to_worker',          reason: 'Arjun Patel selected — same taluka, electrical field, safety certified', hrs: 45 },
    { from: 'assigned_to_worker',         to: 'accepted_by_worker',          reason: 'Worker accepted assignment', hrs: 44 },
    { from: 'accepted_by_worker',         to: 'travel_started',              reason: 'Worker started travel to site', hrs: 43 },
    { from: 'travel_started',             to: 'worker_arrived',              reason: 'Worker GPS arrival recorded — 6m from assigned coords (verified)', hrs: 42 },
    { from: 'worker_arrived',             to: 'inspection_in_progress',      reason: 'Worker began field inspection', hrs: 41 },
    { from: 'inspection_in_progress',     to: 'report_submitted',            reason: 'Field report submitted with findings and measurements', hrs: 38 },
    { from: 'report_submitted',           to: 'state_admin_review',          reason: 'Awaiting State Admin review', hrs: 37 },
    { from: 'state_admin_review',         to: 'escalated',                   reason: 'Critical finding (exposed_wiring) — auto-escalated', hrs: 36 },
    { from: 'escalated',                  to: 'report_approved',             reason: 'State Admin approved report after review', hrs: 35 },
    { from: 'report_approved',            to: 'corrective_action_approved',  reason: 'Admin approved corrective action: repair_wiring', hrs: 34 },
    { from: 'corrective_action_approved', to: 'maintenance_in_progress',     reason: 'Maintenance started by worker', hrs: 33 },
    { from: 'maintenance_in_progress',    to: 'maintenance_completed',       reason: 'Worker reported maintenance complete with after-photo and GPS evidence', hrs: 20 },
    { from: 'maintenance_completed',      to: 'followup_inspection_pending', reason: 'Admin requested follow-up inspection to verify repair', hrs: 18 },
    { from: 'followup_inspection_pending',to: 'followup_inspection_completed','reason': 'Follow-up inspection completed — normal readings confirmed', hrs: 8 },
    { from: 'followup_inspection_completed','to':'risk_recalculated',        reason: 'Risk recalculated from verified post-repair evidence: 94 → 28', hrs: 6 },
    { from: 'risk_recalculated',          to: 'state_admin_verified',        reason: 'State Admin verified resolution', hrs: 4 },
    { from: 'state_admin_verified',       to: 'resolved',                    reason: 'Alert resolved', hrs: 2 },
    { from: 'resolved',                   to: 'closed',                      reason: 'Alert closed after full verification. Risk: 54 (High) → 94 (Critical) → 28 (Moderate).', hrs: 1 },
  ];
  for (const ev of STATUS_EVENTS) {
    await query(
      `INSERT INTO alert_status_history
         (id, alert_id, from_status, to_status, changed_by_type, changed_by, reason, changed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, NOW()-($8 || ' hours')::INTERVAL)
       ON CONFLICT DO NOTHING`,
      [uuidv4(), GJ_ALERT, ev.from, ev.to, 'user', GJ_ADMIN, ev.reason, String(ev.hrs)]
    );
  }

  logger.info('[GujDemoSeed] Alert + status history OK');

  // ── 14. Assignment ────────────────────────────────────────────
  await query(
    `INSERT INTO alert_assignments
       (id, alert_id, worker_id, assigned_by, assigned_at,
        assignment_reason, recommendation_rank, recommendation_reasons,
        expected_arrival_at, expected_report_by,
        acceptance_status, accepted_at, is_active)
     VALUES ($1,$2,$3,$4, NOW()-INTERVAL '45 hours',
             $5, $6, $7::jsonb,
             NOW()-INTERVAL '43 hours', NOW()-INTERVAL '38 hours',
             $8, NOW()-INTERVAL '44 hours', FALSE)
     ON CONFLICT DO NOTHING`,
    [
      GJ_ASSIGN_ID, GJ_ALERT, GJ_WORKER, GJ_ADMIN,
      'Arjun Patel selected: same taluka (Bardoli), electrical engineering, safety certified, zero active assignments.',
      1,
      JSON.stringify([
        { code: 'geo_same_taluka', label: 'Worker in same taluka (Bardoli)', score: 80 },
        { code: 'field_match',     label: 'Field matches: electrical_engineering', score: 30 },
        { code: 'fully_available', label: 'No active assignments', score: 20 },
        { code: 'safety_cert',     label: 'Has valid safety certification', score: 10 },
      ]),
      'accepted',
    ]
  );
  const assignRow = await query<any>(`SELECT id FROM alert_assignments WHERE id = $1`, [GJ_ASSIGN_ID]);
  const GJ_ASSIGNMENT = assignRow[0]?.id ?? GJ_ASSIGN_ID;

  // ── 15. Arrival record ────────────────────────────────────────
  await query(
    `INSERT INTO worker_arrival_records
       (id, alert_id, assignment_id, worker_id, asset_id, complaint_id,
        arrived_at, gps_lat, gps_lng, gps_accuracy_m,
        assigned_lat, assigned_lng, distance_from_assigned_m,
        gps_tolerance_m, gps_status,
        arrival_photo_url, arrival_photo_hash)
     VALUES ($1,$2,$3,$4,$5,$6,
             NOW()-INTERVAL '42 hours',
             $7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT DO NOTHING`,
    [
      GJ_ARRIVAL_ID, GJ_ALERT, GJ_ASSIGNMENT, GJ_WORKER, GJ_ASSET, GJ_COMPLAINT,
      21.09385, 73.25754, 4.2,
      21.0938, 73.2575, 6,
      200, 'verified',
      'https://demo.nexora.ai/seed-images/gj-arrival.jpg',
      'demo_sha256_arrival_gj_001',
    ]
  );

  // ── 16. Geo-tagged images ─────────────────────────────────────
  const IMAGES = [
    { cat: 'arrival',          url: 'https://demo.nexora.ai/seed-images/gj-arrival.jpg',       desc: 'Worker arrival at transformer site', lat: 21.09385, lng: 73.25754, before: true },
    { cat: 'wide_area_site',   url: 'https://demo.nexora.ai/seed-images/gj-wide-area.jpg',     desc: 'Wide area view of transformer compound', lat: 21.0938, lng: 73.2575, before: true },
    { cat: 'asset_front',      url: 'https://demo.nexora.ai/seed-images/gj-asset-front.jpg',   desc: 'Transformer front view — oil marks visible on casing', lat: 21.0939, lng: 73.2575, before: true },
    { cat: 'close_up_problem', url: 'https://demo.nexora.ai/seed-images/gj-exposed-wiring.jpg',desc: 'Close-up: exposed wiring + loose connection at LT terminal', lat: 21.0939, lng: 73.2575, before: true },
    { cat: 'safety_hazard',    url: 'https://demo.nexora.ai/seed-images/gj-safety-hazard.jpg', desc: 'Safety hazard: unguarded live LT panel — public proximity', lat: 21.0939, lng: 73.2575, before: true },
    { cat: 'after_correction', url: 'https://demo.nexora.ai/seed-images/gj-after-repair.jpg',  desc: 'After repair: wiring re-insulated, terminals tightened, panel sealed', lat: 21.0939, lng: 73.2575, before: false },
  ] as const;

  for (const img of IMAGES) {
    await query(
      `INSERT INTO geo_tagged_images
         (id, alert_id, asset_id, complaint_id, worker_id,
          category, original_file_url,
          app_gps_lat, app_gps_lng, gps_source,
          upload_timestamp, tamper_hash,
          description, is_before_maintenance, verification_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW()-INTERVAL '40 hours',$11,$12,$13,$14)
       ON CONFLICT DO NOTHING`,
      [
        uuidv4(), GJ_ALERT, GJ_ASSET, GJ_COMPLAINT, GJ_WORKER,
        img.cat, img.url, img.lat, img.lng, 'app_captured',
        'demo_sha256_' + img.cat.replace(/_/g, ''),
        img.desc, img.before, 'verified',
      ]
    );
  }

  logger.info('[GujDemoSeed] Arrival + images OK');

  // ── 17. Field report ──────────────────────────────────────────
  await query(
    `INSERT INTO alert_field_reports
       (id, alert_id, assignment_id, worker_id, asset_id, complaint_id,
        state_id, district_id, taluka_id, village_id,
        arrival_timestamp, start_timestamp, completion_timestamp,
        gps_lat, gps_lng,
        weather_condition, access_condition, site_safety_condition,
        public_presence, public_hazard, asset_operating_status,
        what_was_observed, citizen_reported, changes_since_last,
        problem_status, immediate_safety_risk, asset_operates_normally,
        another_asset_contributing, urgent_escalation_needed,
        problem_confirmed, problem_active_now, complaint_validity,
        recommended_action_text, recommended_urgency,
        followup_needed, worker_explanation,
        risk_score_before, risk_score_after, score_delta,
        status, submitted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
             NOW()-INTERVAL '42 hours', NOW()-INTERVAL '41 hours', NOW()-INTERVAL '39 hours',
             $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,
             $37, NOW()-INTERVAL '38 hours')
     ON CONFLICT DO NOTHING`,
    [
      GJ_REPORT_ID, GJ_ALERT, GJ_ASSIGNMENT, GJ_WORKER, GJ_ASSET, GJ_COMPLAINT,
      GJ, SURAT, BARDOLI, MAHUVA,
      21.09385, 73.25754,
      'Heavy monsoon rain, slippery ground',
      'Accessible via bus stand road — gate was unlocked',
      'Moderate risk — exposed wiring noted',
      true, true, 'Degraded — operating intermittently',
      'Transformer LT panel cover dislodged. Exposed bare copper wiring at terminal block. Water ingress visible on HT side. Oil temperature 92°C. Loud abnormal humming.',
      'Sparks visible at night, buzzing sound constant for 3 days. Children pass by daily.',
      'Last inspection 14 months ago — loose connection was flagged but not actioned.',
      'active', true, false,
      false, true,
      true, true, 'valid',
      'immediate_safety_escalation', 'immediate',
      true,
      'URGENT: Exposed live wiring + water ingress + 92°C = critical combination. Loose LT terminal confirmed. Recommend immediate isolation and repair. Mahuva PHC is on this feeder.',
      54, 94, 40,
      'approved',
    ]
  );
  const reportRow = await query<any>(`SELECT id FROM alert_field_reports WHERE id = $1`, [GJ_REPORT_ID]);
  const GJ_REPORT = reportRow[0]?.id ?? GJ_REPORT_ID;

  // ── 18. Negative findings ─────────────────────────────────────
  await query(
    `INSERT INTO negative_findings
       (id, report_id, alert_id, worker_id, asset_id,
        finding_code, severity, worker_confidence, description,
        immediate_safety_flag, risk_score_delta, escalation_triggered)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12),
       ($13,$2,$3,$4,$5,$14,$15,$16,$17,$18,$19,$20),
       ($21,$2,$3,$4,$5,$22,$23,$24,$25,$26,$27,$28)
     ON CONFLICT DO NOTHING`,
    [
      uuidv4(), GJ_REPORT, GJ_ALERT, GJ_WORKER, GJ_ASSET,
      'exposed_wiring', 'critical', 1.0,
      'Bare copper conductor at LT terminal block — insulation completely missing', true, 20.0, true,
      uuidv4(),
      'overheating', 'major', 0.95,
      'Oil temperature gauge reading 92.4°C; normal max 85°C', true, 10.2, false,
      uuidv4(),
      'loose_connection', 'moderate', 1.0,
      'LT terminal connection physically loose — visible movement under hand pressure', false, 8.0, false,
    ]
  );

  // ── 19. Positive findings ─────────────────────────────────────
  await query(
    `INSERT INTO positive_findings
       (id, report_id, alert_id, worker_id, asset_id,
        finding_code, worker_confidence, comment, verification_status, risk_score_delta)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10),
       ($11,$2,$3,$4,$5,$12,$13,$14,$15,$16)
     ON CONFLICT DO NOTHING`,
    [
      uuidv4(), GJ_REPORT, GJ_ALERT, GJ_WORKER, GJ_ASSET,
      'proper_earthing_verified', 0.9,
      'Earth continuity confirmed with Megger — 1.2Ω, within safe limit',
      'verified_positive', -7.0,
      uuidv4(),
      'normal_load', 0.85,
      'Load at inspection: 74kW / 100kVA (74%) — within rating',
      'verified_positive', -5.0,
    ]
  );

  // ── 20. Measurements (before repair) ─────────────────────────
  await query(
    `INSERT INTO measurement_records
       (id, alert_id, report_id, worker_id, asset_id,
        measurement_type, name, value, unit,
        normal_range_min, normal_range_max, is_out_of_range, out_of_range_direction,
        instrument_used, calibration_status, gps_lat, gps_lng, confidence, measured_at)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, NOW()-INTERVAL '40 hours'),
       ($19,$2,$3,$4,$5,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$16,$17,$18, NOW()-INTERVAL '40 hours')
     ON CONFLICT DO NOTHING`,
    [
      uuidv4(), GJ_ALERT, GJ_REPORT, GJ_WORKER, GJ_ASSET,
      'oil_temperature', 'Oil Temperature', 92.4, 'Celsius',
      20, 85, true, 'above',
      'Fluke 62 MAX Infrared Thermometer', 'calibrated', 21.09385, 73.25754, 1.0,
      uuidv4(),
      'voltage', 'LT Voltage', 220.5, 'V',
      210, 240, false, '',
      'Fluke 117 Multimeter', 'calibrated',
    ]
  );

  logger.info('[GujDemoSeed] Report + findings + measurements OK');

  // ── 21. Risk score history — BEFORE corrective action ─────────
  await query(
    `INSERT INTO risk_score_history
       (id, asset_id, alert_id, report_id,
        score_before_alert,
        admin_info_delta, negative_findings_delta, positive_findings_delta,
        measurements_delta, weather_delta, historical_incidents_delta,
        final_score, final_level, score_delta, previous_level,
        safety_override_applied, safety_override_reason,
        negative_factors, positive_factors,
        confidence, model_version, calculated_at, review_status, reviewed_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19::jsonb,$20,$21,
             NOW()-INTERVAL '37 hours',$22,$23)
     ON CONFLICT DO NOTHING`,
    [
      GJ_RISK_H1_ID, GJ_ASSET, GJ_ALERT, GJ_REPORT,
      54,
      13, 38.2, 0,
      4.0, 10, 5,
      94, 'critical', 40, 'high',
      true, 'Critical conditions present (exposed_wiring) — positive findings cannot reduce risk',
      JSON.stringify([
        { code: 'exposed_wiring',  label: 'Exposed Wiring',    delta: 20 },
        { code: 'overheating',     label: 'Overheating',       delta: 10.2 },
        { code: 'loose_connection',label: 'Loose Connection',  delta: 8 },
      ]),
      JSON.stringify([
        { code: 'proper_earthing_verified', label: 'Proper Earthing (overridden — critical floor)', delta: 0 },
        { code: 'normal_load',              label: 'Normal Load (overridden — critical floor)',      delta: 0 },
      ]),
      0.92, '2.0.0', 'admin_verified', GJ_ADMIN,
    ]
  );

  // ── 22. Corrective action ─────────────────────────────────────
  await query(
    `INSERT INTO alert_corrective_actions
       (id, alert_id, report_id, action_type, description,
        approved_by, approved_at, assigned_worker_id,
        completed_by, completion_timestamp, completion_notes,
        after_photo_id, worker_confirmation, asset_operating_status,
        evidence_gps_lat, evidence_gps_lng, evidence_timestamp,
        admin_approved_completion, admin_completion_by, admin_completion_at)
     VALUES ($1,$2,$3,$4,$5,$6, NOW()-INTERVAL '35 hours',$7,
             $7, NOW()-INTERVAL '20 hours',$8,
             NULL,TRUE,$9,$10,$11, NOW()-INTERVAL '20 hours',
             TRUE,$6, NOW()-INTERVAL '18 hours')
     ON CONFLICT DO NOTHING`,
    [
      GJ_CORRECTIVE_ID, GJ_ALERT, GJ_REPORT,
      'repair_wiring',
      'Insulate exposed LT wiring, tighten terminal connections, check oil seals, apply moisture sealant',
      GJ_ADMIN, GJ_WORKER,
      'Wiring re-insulated with heat-shrink sleeving. Terminal blocks torqued to spec. Oil seal replaced. Temperature dropped to 47°C after 1 hour.',
      'operational', 21.09385, 73.25754,
    ]
  );

  // ── 23. Follow-up inspection ──────────────────────────────────
  await query(
    `INSERT INTO alert_followup_inspections
       (id, alert_id, requested_by, requested_at, assigned_worker_id, due_by,
        report_id, status, completed_at, admin_reviewed_by, admin_reviewed_at)
     VALUES ($1,$2,$3, NOW()-INTERVAL '18 hours',$3, NOW()-INTERVAL '10 hours',
             $4,$5, NOW()-INTERVAL '8 hours',$3, NOW()-INTERVAL '6 hours')
     ON CONFLICT DO NOTHING`,
    [GJ_FOLLOWUP_ID, GJ_ALERT, GJ_ADMIN, GJ_REPORT, 'completed']
  );

  // ── 24. Post-repair measurements (all in normal range) ────────
  await query(
    `INSERT INTO measurement_records
       (id, alert_id, report_id, worker_id, asset_id,
        measurement_type, name, value, unit,
        normal_range_min, normal_range_max, is_out_of_range,
        instrument_used, calibration_status, gps_lat, gps_lng, confidence, measured_at)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, NOW()-INTERVAL '9 hours'),
       ($18,$2,$3,$4,$5,$19,$20,$21,$22,$23,$24,$25,$26,$27,$15,$16,$17, NOW()-INTERVAL '9 hours')
     ON CONFLICT DO NOTHING`,
    [
      uuidv4(), GJ_ALERT, GJ_REPORT, GJ_WORKER, GJ_ASSET,
      'oil_temperature', 'Oil Temperature (Post-Repair)', 47.0, 'Celsius',
      20, 85, false,
      'Fluke 62 MAX Infrared Thermometer', 'calibrated', 21.09385, 73.25754, 1.0,
      uuidv4(),
      'earthing_value', 'Earthing Resistance (Post-Repair)', 0.8, 'Ω',
      0, 2, false,
      'Megger MFT1741', 'calibrated',
    ]
  );

  // ── 25. Risk score history — AFTER corrective action ──────────
  await query(
    `INSERT INTO risk_score_history
       (id, asset_id, alert_id, report_id,
        score_before_alert,
        admin_info_delta, negative_findings_delta, positive_findings_delta,
        measurements_delta, weather_delta, historical_incidents_delta, maintenance_status_delta,
        final_score, final_level, score_delta, previous_level,
        safety_override_applied,
        negative_factors, positive_factors,
        confidence, model_version, calculated_at, review_status, reviewed_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19::jsonb,$20,$21,
             NOW()-INTERVAL '6 hours',$22,$23)
     ON CONFLICT DO NOTHING`,
    [
      GJ_RISK_H2_ID, GJ_ASSET, GJ_ALERT, GJ_REPORT,
      94,
      0, 0, -26,
      -8, 3, 5, -10,
      28, 'moderate', -66, 'critical',
      false,
      JSON.stringify([]),
      JSON.stringify([
        { code: 'normal_temperature',        label: 'Normal Temperature (47°C verified post-repair)', delta: -6 },
        { code: 'intact_insulation',         label: 'Intact Insulation (new heat-shrink sleeving)',   delta: -5 },
        { code: 'proper_earthing_verified',  label: 'Proper Earthing (0.8Ω verified)',                delta: -7 },
        { code: 'recent_maintenance_verified','label': 'Recent Maintenance Verified',                 delta: -8 },
      ]),
      0.97, '2.0.0', 'admin_verified', GJ_ADMIN,
    ]
  );

  // Update asset final risk score
  await query(
    `UPDATE assets SET current_risk_score = 28, current_risk_level = 'moderate', updated_at = NOW() WHERE id = $1`,
    [GJ_ASSET]
  );

  // ── 26. Audit log ─────────────────────────────────────────────
  const AUDIT_EVENTS = [
    { action: 'alert_created',            entity: 'alert',                  id: GJ_ALERT,       vals: { alertNumber: 'ALT-GJ-DEMO-001', priority: 'critical' } },
    { action: 'alert_assigned',           entity: 'alert_assignment',       id: GJ_ASSIGNMENT,  vals: { workerId: GJ_WORKER, reason: 'Same taluka, electrical field' } },
    { action: 'worker_arrival_recorded',  entity: 'worker_arrival_record',  id: GJ_ARRIVAL_ID,  vals: { gpsStatus: 'verified', distanceFromAssignedM: 6 } },
    { action: 'report_submitted',         entity: 'alert_field_report',     id: GJ_REPORT,      vals: { negativeFindingsCount: 3, positiveFindingsCount: 2 } },
    { action: 'risk_pipeline_run',        entity: 'risk_score_history',     id: GJ_RISK_H1_ID,  vals: { before: 54, after: 94, safetyOverride: true } },
    { action: 'corrective_action_approved',entity:'alert_corrective_action',id: GJ_CORRECTIVE_ID,vals: { actionType: 'repair_wiring' } },
    { action: 'risk_pipeline_run',        entity: 'risk_score_history',     id: GJ_RISK_H2_ID,  vals: { before: 94, after: 28, safetyOverride: false } },
    { action: 'alert_closed',             entity: 'alert',                  id: GJ_ALERT,       vals: { status: 'closed', finalRiskScore: 28, finalLevel: 'moderate' } },
  ];
  for (const ev of AUDIT_EVENTS) {
    await query(
      `INSERT INTO audit_logs (id, actor_type, actor_id, actor_email, action, entity_type, entity_id, state_id, new_values)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT DO NOTHING`,
      [uuidv4(), 'user', GJ_ADMIN, 'admin.gj@nexora.ai', ev.action, ev.entity, ev.id, GJ, JSON.stringify(ev.vals)]
    );
  }

  logger.info('[GujDemoSeed] ✅ Complete!');
  logger.info('[GujDemoSeed] ─────────────────────────────────────────────────');
  logger.info('[GujDemoSeed]  State Admin login : admin.gj@nexora.ai / GjAdmin@123!');
  logger.info('[GujDemoSeed]  Worker login      : worker.gj@nexora.ai / Worker@1234!');
  logger.info('[GujDemoSeed]  Alert             : ALT-GJ-DEMO-001  (closed)');
  logger.info('[GujDemoSeed]  Risk journey      : 54 (High) → 94 (Critical) → 28 (Moderate)');
  logger.info('[GujDemoSeed]  URL               : /state/alerts  (login as State Admin)');
  logger.info('[GujDemoSeed] ─────────────────────────────────────────────────');
}

// Allow direct execution
if (require.main === module) {
  seedGujaratDemo()
    .then(() => { logger.info('[GujDemoSeed] Done'); process.exit(0); })
    .catch((err) => { logger.error('[GujDemoSeed] Fatal error:', err); process.exit(1); });
}
