/**
 * NEXORA AI — Comprehensive Seed Data
 *
 * Demonstrates all required scenarios:
 * 1. Positive observations lowering risk
 * 2. Negative observations raising risk
 * 3. Sensor overheating raising risk
 * 4. Severe weather raising geographic risk
 * 5. Historical failures raising risk
 * 6. A critical asset topping the maintenance queue
 * 7. A State Admin blocked from another state's records (enforced in API)
 * 8. A complaint rejected for missing GIS-tagged photo (enforced in API)
 *
 * No real Aadhaar numbers or real personal data.
 */

import { pool, query, transaction } from './db';
import { logger } from '../utils/logger';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const BCRYPT_ROUNDS = 12;

async function hashPw(pw: string) {
  return bcrypt.hash(pw, BCRYPT_ROUNDS);
}

async function seed() {
  logger.info('[Seed] Starting...');

  // ── States ──────────────────────────────────────────────────
  const maharashtraId = uuidv4();
  const keralaId = uuidv4();
  const delhiId = uuidv4();

  await query(
    `INSERT INTO states (id, name, code) VALUES
       ($1, 'Maharashtra', 'MH'),
       ($2, 'Kerala', 'KL'),
       ($3, 'Delhi', 'DL')
     ON CONFLICT (code) DO NOTHING`,
    [maharashtraId, keralaId, delhiId]
  );

  // Re-fetch actual IDs (in case they already existed)
  const states = await query<any>(`SELECT id, code FROM states WHERE code IN ('MH','KL','DL')`);
  const stateMap = Object.fromEntries(states.map((s: any) => [s.code, s.id]));
  const MH = stateMap['MH'];
  const KL = stateMap['KL'];
  const DL = stateMap['DL'];

  // ── Districts ────────────────────────────────────────────────
  const mumbaiId = uuidv4();
  const puneId = uuidv4();
  const thiruvananthapuramId = uuidv4();
  const ernakulamId = uuidv4();
  const newDelhiId = uuidv4();

  await query(
    `INSERT INTO districts (id, state_id, name, code, worker_capacity_limit) VALUES
       ($1, $2, 'Mumbai', 'MUM', 100),
       ($3, $2, 'Pune', 'PUN', 80),
       ($4, $5, 'Thiruvananthapuram', 'TVM', 60),
       ($6, $5, 'Ernakulam', 'EKM', 60),
       ($7, $8, 'New Delhi', 'NDL', 120)
     ON CONFLICT DO NOTHING`,
    [mumbaiId, MH, puneId, thiruvananthapuramId, KL, ernakulamId, newDelhiId, DL]
  );

  const districts = await query<any>(`SELECT id, code FROM districts WHERE code IN ('MUM','PUN','TVM','EKM','NDL')`);
  const distMap = Object.fromEntries(districts.map((d: any) => [d.code, d.id]));
  const MUM = distMap['MUM'];
  const PUN = distMap['PUN'];
  const TVM = distMap['TVM'];
  const EKM = distMap['EKM'];
  const NDL = distMap['NDL'];

  logger.info('[Seed] States and districts OK');

  // ── Users (Super Admin, State Admins) ───────────────────────
  const superAdminId = uuidv4();
  const stateAdminMHId = uuidv4();
  const stateAdminKLId = uuidv4();

  await query(
    `INSERT INTO users
       (id, email, username, password_hash, role, state_id, full_name)
     VALUES
       ($1, 'superadmin@nexora.ai', 'superadmin', $2, 'super_admin', NULL, 'Super Administrator'),
       ($3, 'admin.mh@nexora.ai', 'admin_mh', $4, 'state_admin', $5, 'Maharashtra State Admin'),
       ($6, 'admin.kl@nexora.ai', 'admin_kl', $7, 'state_admin', $8, 'Kerala State Admin')
     ON CONFLICT (email) DO NOTHING`,
    [
      superAdminId, await hashPw('Admin@1234!'),
      stateAdminMHId, await hashPw('MhAdmin@123!'), MH,
      stateAdminKLId, await hashPw('KlAdmin@123!'), KL,
    ]
  );

  logger.info('[Seed] Admin users OK');

  // ── Worker profiles ──────────────────────────────────────────
  const workerSeedId1 = uuidv4(); // Mumbai
  const workerSeedId2 = uuidv4(); // Pune
  const workerSeedId3 = uuidv4(); // Thiruvananthapuram

  await query(
    `INSERT INTO worker_profiles
       (id, email, mobile, password_hash, full_name, state_id, district_id,
        field_of_work, aadhaar_token, consent_given, consent_date,
        application_number, status)
     VALUES
       ($1, 'worker.kumar@nexora.ai', '9876543210', $2,
        'Rajesh Kumar', $3, $4, 'electrical_engineering',
        'MASKED-3456', TRUE, NOW(), 'NXW-WORKER001', 'employed'),
       ($5, 'worker.priya@nexora.ai', '9876543211', $6,
        'Priya Sharma', $3, $7, 'electrical_engineering',
        'MASKED-7890', TRUE, NOW(), 'NXW-WORKER002', 'employed'),
       ($8, 'worker.mohan@nexora.ai', '9876543212', $9,
        'Mohan Das', $10, $11, 'civil_engineering',
        'MASKED-1234', TRUE, NOW(), 'NXW-WORKER003', 'employed')
     ON CONFLICT (email) DO NOTHING`,
    [
      workerSeedId1, await hashPw('Worker@1234!'), MH, MUM,
      workerSeedId2, await hashPw('Worker@1234!'), PUN,
      workerSeedId3, await hashPw('Worker@1234!'), KL, TVM,
    ]
  );

  // Re-fetch actual worker IDs (ON CONFLICT DO NOTHING means ID may differ from generated one)
  const workerRows = await query<any>(
    `SELECT id, email FROM worker_profiles WHERE email IN ('worker.kumar@nexora.ai','worker.priya@nexora.ai','worker.mohan@nexora.ai')`
  );
  const workerMap = Object.fromEntries(workerRows.map((w: any) => [w.email, w.id]));
  const worker1Id = workerMap['worker.kumar@nexora.ai'];
  const worker2Id = workerMap['worker.priya@nexora.ai'];
  const worker3Id = workerMap['worker.mohan@nexora.ai'];

  logger.info('[Seed] Workers OK');

  // ── Citizens ─────────────────────────────────────────────────
  const citizen1IdGen = uuidv4();
  const citizen2IdGen = uuidv4();
  await query(
    `INSERT INTO citizens (id, full_name, mobile, email, state_id, district_id, city)
     VALUES
       ($1, 'Arun Nair', '9988776655', 'arun.nair@example.com', $2, $3, 'Thiruvananthapuram'),
       ($4, 'Sunita Patel', '9977665544', 'sunita.patel@example.com', $5, $6, 'Mumbai')
     ON CONFLICT DO NOTHING`,
    [citizen1IdGen, KL, TVM, citizen2IdGen, MH, MUM]
  );

  // Re-fetch actual citizen IDs
  const citizenRows = await query<any>(
    `SELECT id, email FROM citizens WHERE email IN ('arun.nair@example.com','sunita.patel@example.com')`
  );
  const citizenMap = Object.fromEntries(citizenRows.map((c: any) => [c.email, c.id]));
  const citizen1Id = citizenMap['arun.nair@example.com'];
  const citizen2Id = citizenMap['sunita.patel@example.com'];

  // ── Assets ───────────────────────────────────────────────────
  // Asset 1: Critical transformer in Mumbai (will be raised to critical by seeds)
  const asset1Id = uuidv4();
  // Asset 2: High-risk substation in Pune
  const asset2Id = uuidv4();
  // Asset 3: Low-risk transformer in Kerala (positive observations)
  const asset3Id = uuidv4();
  // Asset 4: Moderate risk in Delhi
  const asset4Id = uuidv4();
  // Asset 5: Transformer for weather risk scenario
  const asset5Id = uuidv4();

  await query(
    `INSERT INTO assets
       (id, asset_code, asset_type, manufacturer, model, state_id, district_id,
        address_text, location_lat, location_lng, install_date, rated_capacity_kva, current_load_kw,
        connected_customers, sensor_available, status)
     VALUES
       ($1, 'MUM-TRF-001', 'transformer', 'BHEL', 'DTR-100KVA',
        $2, $3, 'Dharavi, Mumbai', 19.0454, 72.8528,
        '2002-06-15', 100, 92, 5000, TRUE, 'operational'),
       ($4, 'PUN-SUB-001', 'substation_equipment', 'ABB', 'SS-11KV',
        $2, $5, 'Hadapsar, Pune', 18.5013, 73.9283,
        '2008-03-10', 500, 380, 12000, FALSE, 'operational'),
       ($6, 'TVM-TRF-001', 'transformer', 'CGL', 'DTR-63KVA',
        $7, $8, 'Pattom, Thiruvananthapuram', 8.5241, 76.9494,
        '2019-01-20', 63, 30, 800, TRUE, 'operational'),
       ($9, 'NDL-FDR-001', 'feeder', 'Siemens', 'F-11KV-01',
        $10, $11, 'Connaught Place, New Delhi', 28.6315, 77.2090,
        '2015-07-01', 200, 140, 3000, TRUE, 'operational'),
       ($12, 'MUM-TRF-002', 'transformer', 'Kirloskar', 'DTR-200KVA',
        $2, $3, 'Kurla, Mumbai', 19.0728, 72.8777,
        '2005-11-30', 200, 170, 8000, TRUE, 'operational')
     ON CONFLICT (asset_code) DO NOTHING`,
    [
      asset1Id, MH, MUM,
      asset2Id, PUN,
      asset3Id, KL, TVM,
      asset4Id, DL, NDL,
      asset5Id,
    ]
  );

  logger.info('[Seed] Assets OK');

  // Re-fetch asset IDs
  const assets = await query<any>(
    `SELECT id, asset_code FROM assets WHERE asset_code IN ('MUM-TRF-001','PUN-SUB-001','TVM-TRF-001','NDL-FDR-001','MUM-TRF-002')`
  );
  const assetMap = Object.fromEntries(assets.map((a: any) => [a.asset_code, a.id]));
  const A1 = assetMap['MUM-TRF-001'];
  const A2 = assetMap['PUN-SUB-001'];
  const A3 = assetMap['TVM-TRF-001'];
  const A4 = assetMap['NDL-FDR-001'];
  const A5 = assetMap['MUM-TRF-002'];

  // ── Asset sensors ─────────────────────────────────────────────
  const sensor1Id = uuidv4(); // A1 temperature
  const sensor2Id = uuidv4(); // A3 temperature (normal)
  const sensor4Id = uuidv4(); // A4 voltage
  const sensor5Id = uuidv4(); // A5 temperature

  await query(
    `INSERT INTO asset_sensors (id, asset_id, sensor_type, unit, min_normal, max_normal) VALUES
       ($1, $2, 'oil_temperature', 'Celsius', 20, 80),
       ($3, $4, 'oil_temperature', 'Celsius', 20, 80),
       ($5, $6, 'voltage', 'kV', 10.5, 11.5),
       ($7, $8, 'oil_temperature', 'Celsius', 20, 80)
     ON CONFLICT DO NOTHING`,
    [sensor1Id, A1, sensor2Id, A3, sensor4Id, A4, sensor5Id, A5]
  );

  // ── SCENARIO 3: Sensor overheating for Asset 1 ───────────────
  await query(
    `INSERT INTO sensor_readings
       (id, sensor_id, asset_id, state_id, district_id, value, unit,
        is_outlier, sensor_failed, recorded_at)
     VALUES
       ($1, $2, $3, $4, $5, 97.5, 'Celsius', TRUE, FALSE, NOW() - INTERVAL '2 hours'),
       ($6, $2, $3, $4, $5, 94.1, 'Celsius', TRUE, FALSE, NOW() - INTERVAL '4 hours')
     ON CONFLICT DO NOTHING`,
    [uuidv4(), sensor1Id, A1, MH, MUM, uuidv4()]
  );

  // Normal sensor readings for Asset 3 (positive scenario)
  await query(
    `INSERT INTO sensor_readings
       (id, sensor_id, asset_id, state_id, district_id, value, unit, recorded_at)
     VALUES ($1, $2, $3, $4, $5, 45.0, 'Celsius', NOW())
     ON CONFLICT DO NOTHING`,
    [uuidv4(), sensor2Id, A3, KL, TVM]
  );

  logger.info('[Seed] Sensors and readings OK');

  // ── SCENARIO 4: Severe weather for Mumbai ────────────────────
  await query(
    `INSERT INTO weather_records
       (id, district_id, location_lat, location_lng, temperature_c, rainfall_mm, wind_speed_kmh,
        humidity_pct, lightning_risk, flood_alert, storm_alert, extreme_weather_alert,
        alert_description, recorded_at, source)
     VALUES
       ($1, $2, 19.07, 72.88,
        28, 145, 75, 96, TRUE, TRUE, TRUE, TRUE,
        '[SEED] Cyclonic storm alert — heavy rainfall, flooding, lightning risk',
        NOW(), 'mock_seed')
     ON CONFLICT DO NOTHING`,
    [uuidv4(), MUM]
  );

  // Normal weather for Kerala
  await query(
    `INSERT INTO weather_records
       (id, district_id, location_lat, location_lng, temperature_c, rainfall_mm, wind_speed_kmh,
        humidity_pct, recorded_at, source)
     VALUES
       ($1, $2, 8.52, 76.95,
        29, 8, 12, 70, NOW(), 'mock_seed')
     ON CONFLICT DO NOTHING`,
    [uuidv4(), TVM]
  );

  logger.info('[Seed] Weather OK');

  // ── SCENARIO 5: Historical incidents for Asset 1 ─────────────
  await query(
    `INSERT INTO historical_incidents
       (id, asset_id, state_id, district_id, incident_type, description,
        occurred_at, outage_duration_h, affected_connections, failure_cause,
        is_recurring)
     VALUES
       ($1, $2, $3, $4, 'transformer_failure',
        'Transformer overloaded and failed during peak summer demand',
        NOW() - INTERVAL '120 days', 6.5, 5000, 'Overloading + poor ventilation', TRUE),
       ($5, $2, $3, $4, 'outage',
        'Partial outage due to tripping caused by moisture ingress',
        NOW() - INTERVAL '45 days', 3.0, 3200, 'Water ingress after heavy rain', TRUE)
     ON CONFLICT DO NOTHING`,
    [uuidv4(), A1, MH, MUM, uuidv4()]
  );

  logger.info('[Seed] Historical incidents OK');

  // ── Create inspection reports with observations ───────────────
  // Create tasks first
  const task1IdGen = uuidv4();
  const task2IdGen = uuidv4();
  const task3IdGen = uuidv4();

  await query(
    `INSERT INTO inspection_tasks
       (id, task_code, asset_id, assigned_worker_id, state_id, district_id,
        priority, field_of_work, status)
     VALUES
       ($1, 'TK-SEED-001', $2, $3, $4, $5, 1, 'electrical_engineering', 'approved'),
       ($6, 'TK-SEED-002', $7, $8, $4, $9, 2, 'electrical_engineering', 'approved'),
       ($10, 'TK-SEED-003', $11, $12, $13, $14, 5, 'electrical_engineering', 'approved')
     ON CONFLICT DO NOTHING`,
    [task1IdGen, A1, worker1Id, MH, MUM,
     task2IdGen, A2, worker2Id, PUN,
     task3IdGen, A3, worker3Id, KL, TVM]
  );

  // Re-fetch actual task IDs (ON CONFLICT DO NOTHING means IDs may differ)
  const taskRows = await query<any>(
    `SELECT id, task_code FROM inspection_tasks WHERE task_code IN ('TK-SEED-001','TK-SEED-002','TK-SEED-003')`
  );
  const taskMap = Object.fromEntries(taskRows.map((t: any) => [t.task_code, t.id]));
  const task1Id = taskMap['TK-SEED-001'];
  const task2Id = taskMap['TK-SEED-002'];
  const task3Id = taskMap['TK-SEED-003'];

  // ── SCENARIO 2: Negative observations for Asset 1 (risk UP) ──
  const report1Id = uuidv4();
  await query(
    `INSERT INTO inspection_reports
       (id, task_id, worker_id, asset_id, state_id, district_id,
        operational_status, immediate_safety_concern, recommended_action,
        urgency, gps_lat, gps_lng, status, submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6,
             'degraded', TRUE,
             'Immediate isolation and maintenance required — critical risk',
             'immediate', 19.0454, 72.8528, 'approved', NOW() - INTERVAL '1 day')
     ON CONFLICT DO NOTHING`,
    [report1Id, task1Id, worker1Id, A1, MH, MUM]
  );

  // Insert negative observations for Asset 1
  const negObs = [
    { code: 'overheating',    type: 'negative', severity: 'critical', conf: 0.95 },
    { code: 'water_ingress',  type: 'negative', severity: 'high',     conf: 0.90 },
    { code: 'poor_earthing',  type: 'negative', severity: 'critical', conf: 0.85 },
    { code: 'burning_smell',  type: 'negative', severity: 'critical', conf: 0.80 },
    { code: 'oil_leakage',    type: 'negative', severity: 'high',     conf: 0.90 },
  ];
  for (const obs of negObs) {
    await query(
      `INSERT INTO worker_observations
         (id, report_id, asset_id, worker_id, state_id, district_id,
          observation_code, obs_type, severity, confidence, description, observed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT DO NOTHING`,
      [
        uuidv4(), report1Id, A1, worker1Id, MH, MUM,
        obs.code, obs.type, obs.severity, obs.conf,
        `[Seed] Worker observed: ${obs.code.replace(/_/g, ' ')}`,
      ]
    );
  }

  // ── SCENARIO 1: Positive observations for Asset 3 (risk DOWN) ─
  const report3Id = uuidv4();
  await query(
    `INSERT INTO inspection_reports
       (id, task_id, worker_id, asset_id, state_id, district_id,
        operational_status, immediate_safety_concern, recommended_action,
        urgency, gps_lat, gps_lng, status, submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6,
             'normal', FALSE,
             'Continue routine monitoring — asset in good condition',
             'routine', 8.5241, 76.9494, 'approved', NOW() - INTERVAL '1 day')
     ON CONFLICT DO NOTHING`,
    [report3Id, task3Id, worker3Id, A3, KL, TVM]
  );

  const posObs = [
    { code: 'no_visible_damage',           type: 'positive', conf: 1.0 },
    { code: 'enclosure_intact',            type: 'positive', conf: 1.0 },
    { code: 'proper_earthing_confirmed',   type: 'positive', conf: 1.0 },
    { code: 'normal_temperature',          type: 'positive', conf: 1.0 },
    { code: 'no_water_ingress',            type: 'positive', conf: 1.0 },
    { code: 'load_within_range',           type: 'positive', conf: 1.0 },
    { code: 'recent_maintenance_completed',type: 'positive', conf: 1.0 },
    { code: 'sensor_readings_normal',      type: 'positive', conf: 1.0 },
  ];
  for (const obs of posObs) {
    await query(
      `INSERT INTO worker_observations
         (id, report_id, asset_id, worker_id, state_id, district_id,
          observation_code, obs_type, confidence, description, observed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT DO NOTHING`,
      [
        uuidv4(), report3Id, A3, worker3Id, KL, TVM,
        obs.code, obs.type, obs.conf,
        `[Seed] Worker confirmed: ${obs.code.replace(/_/g, ' ')}`,
      ]
    );
  }

  logger.info('[Seed] Observations OK');

  // ── Seed complaints ───────────────────────────────────────────
  const complaint1Id = uuidv4();
  await query(
    `INSERT INTO complaints
       (id, complaint_number, citizen_id, state_id, district_id,
        category, description, date_noticed, is_safety_concern,
        location_lat, location_lng, location_method, status)
     VALUES
       ($1, 'NXC-SEED001', $2, $3, $4,
        'Transformer fault', 'Loud humming and burning smell from transformer near main road',
        CURRENT_DATE - 2, TRUE,
        8.5241, 76.9494,
        'gps', 'under_review')
     ON CONFLICT DO NOTHING`,
    [complaint1Id, citizen1Id, KL, TVM]
  );

  // ── Seed observation risk mappings ────────────────────────────
  await seedObservationMappings();

  // ── Seed notification templates ───────────────────────────────
  await seedNotificationTemplates();

  // ── 10 additional assets across new states ─────────────────────
  // Fetch new state/district IDs from geography seed (inserted if present)
  const extraStates = await query<any>(
    `SELECT id, code FROM states WHERE code IN ('KA','TN','GJ','UP') AND is_active = TRUE`
  );
  const esMap: Record<string, string> = Object.fromEntries(extraStates.map((s: any) => [s.code, s.id]));

  const extraDistricts = await query<any>(
    `SELECT id, name FROM districts WHERE name IN
     ('Bengaluru Urban','Chennai','Ahmedabad','Lucknow','Nashik','Thrissur','South Delhi','Mysuru','Coimbatore','Surat')
     AND is_active = TRUE`
  );
  const edMap: Record<string, string> = Object.fromEntries(extraDistricts.map((d: any) => [d.name, d.id]));

  // Only insert extra assets if their states/districts exist (geography seed already ran)
  const extraAssets: Array<{code: string; type: string; stateCode: string; distName: string;
    addr: string; lat: number; lng: number; install: string; cap: number; load: number; cust: number}> = [
    { code:'KA-TRF-001', type:'transformer',          stateCode:'KA', distName:'Bengaluru Urban', addr:'Whitefield, Bengaluru',       lat:12.9698, lng:77.7499, install:'2010-04-10', cap:250,  load:213,  cust:8500  },
    { code:'TN-SUB-001', type:'substation_equipment', stateCode:'TN', distName:'Chennai',          addr:'Anna Nagar, Chennai',         lat:13.0850, lng:80.2101, install:'2005-09-01', cap:500,  load:450,  cust:15000 },
    { code:'GJ-FDR-001', type:'feeder',               stateCode:'GJ', distName:'Ahmedabad',        addr:'Naroda, Ahmedabad',           lat:23.0753, lng:72.6369, install:'2012-02-20', cap:300,  load:210,  cust:6000  },
    { code:'UP-TRF-001', type:'transformer',          stateCode:'UP', distName:'Lucknow',          addr:'Gomti Nagar, Lucknow',        lat:26.8467, lng:80.9462, install:'2001-07-15', cap:100,  load:95,   cust:4000  },
    { code:'MH-TRF-003', type:'transformer',          stateCode:'MH', distName:'Nashik',           addr:'College Road, Nashik',        lat:20.0059, lng:73.7797, install:'2015-03-30', cap:160,  load:96,   cust:3200  },
    { code:'KL-FDR-001', type:'feeder',               stateCode:'KL', distName:'Thrissur',         addr:'Round South, Thrissur',       lat:10.5276, lng:76.2144, install:'2018-11-05', cap:200,  load:90,   cust:2500  },
    { code:'DL-TRF-001', type:'transformer',          stateCode:'DL', distName:'South Delhi',      addr:'Lajpat Nagar, South Delhi',   lat:28.5707, lng:77.2371, install:'2003-06-22', cap:315,  load:277,  cust:10000 },
    { code:'KA-FDR-001', type:'feeder',               stateCode:'KA', distName:'Mysuru',           addr:'Vijayanagar, Mysuru',         lat:12.3052, lng:76.6554, install:'2014-08-18', cap:200,  load:110,  cust:3800  },
    { code:'TN-TRF-001', type:'transformer',          stateCode:'TN', distName:'Coimbatore',       addr:'Peelamedu, Coimbatore',       lat:11.0168, lng:77.0038, install:'2008-12-01', cap:200,  load:156,  cust:5200  },
    { code:'GJ-TRF-001', type:'transformer',          stateCode:'GJ', distName:'Surat',            addr:'Adajan, Surat',               lat:21.1859, lng:72.7898, install:'2016-05-14', cap:200,  load:100,  cust:4600  },
  ];

  const insertedExtraIds: string[] = [];
  for (const ea of extraAssets) {
    const sId = esMap[ea.stateCode] ?? (await query<any>(`SELECT id FROM states WHERE code=$1`,[ea.stateCode]).then(r=>r[0]?.id));
    const dId = edMap[ea.distName]  ?? (await query<any>(`SELECT id FROM districts WHERE name=$1 AND is_active=TRUE LIMIT 1`,[ea.distName]).then(r=>r[0]?.id));
    if (!sId || !dId) {
      logger.warn(`[Seed] Skipping extra asset ${ea.code} — state or district not found (run geography seed first)`);
      continue;
    }
    const aId = uuidv4();
    await query(
      `INSERT INTO assets
         (id, asset_code, asset_type, state_id, district_id, address_text,
          location_lat, location_lng, install_date, rated_capacity_kva,
          current_load_kw, connected_customers, sensor_available, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,'operational')
       ON CONFLICT (asset_code) DO NOTHING`,
      [aId, ea.code, ea.type, sId, dId, ea.addr,
       ea.lat, ea.lng, ea.install, ea.cap, ea.load, ea.cust]
    );
    // Refetch actual ID
    const row = await query<any>(`SELECT id FROM assets WHERE asset_code = $1`, [ea.code]);
    const realId = row[0]?.id;
    if (!realId) continue;
    insertedExtraIds.push(realId);

    // Sensor readings — high-stress assets get outlier readings
    const sensId = uuidv4();
    await query(
      `INSERT INTO asset_sensors (id, asset_id, sensor_type, unit, min_normal, max_normal)
       VALUES ($1,$2,'oil_temperature','Celsius',20,80) ON CONFLICT DO NOTHING`,
      [sensId, realId]
    );
    const loadRatio = ea.load / ea.cap;
    const tempVal = loadRatio > 0.85 ? 88 + Math.random() * 15 : 40 + Math.random() * 20;
    const isOutlier = loadRatio > 0.85;
    await query(
      `INSERT INTO sensor_readings (id, sensor_id, asset_id, state_id, district_id, value, unit, is_outlier, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,'Celsius',$7,NOW())
       ON CONFLICT DO NOTHING`,
      [uuidv4(), sensId, realId, sId, dId, Math.round(tempVal * 10) / 10, isOutlier]
    );

    // Weather — some districts get active alerts
    const hasAlert = ['Chennai','Surat','Ahmedabad','South Delhi','Lucknow'].includes(ea.distName);
    await query(
      `INSERT INTO weather_records
         (id, district_id, location_lat, location_lng, temperature_c, rainfall_mm,
          wind_speed_kmh, humidity_pct, storm_alert, heatwave_alert, flood_alert,
          extreme_weather_alert, alert_description, recorded_at, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),'mock_seed')
       ON CONFLICT DO NOTHING`,
      [
        uuidv4(), dId, ea.lat, ea.lng,
        hasAlert ? 38 : 28,
        hasAlert ? 80 : 5,
        hasAlert ? 65 : 15,
        hasAlert ? 92 : 65,
        hasAlert && ['Chennai','South Delhi'].includes(ea.distName),
        hasAlert && ['Ahmedabad','Lucknow'].includes(ea.distName),
        hasAlert && ea.distName === 'Surat',
        hasAlert && ea.distName === 'Chennai',
        hasAlert ? `[Seed] Weather alert for ${ea.distName}` : null,
      ]
    );

    // Historical incidents for older/higher-load assets
    const ageYears = new Date().getFullYear() - parseInt(ea.install.slice(0,4));
    if (ageYears > 10 || loadRatio > 0.87) {
      await query(
        `INSERT INTO historical_incidents
           (id, asset_id, state_id, district_id, incident_type, description,
            occurred_at, outage_duration_h, affected_connections, failure_cause, is_recurring)
         VALUES ($1,$2,$3,$4,'outage',$5,NOW()-INTERVAL '${Math.floor(Math.random()*180+30)} days',$6,$7,$8,$9)
         ON CONFLICT DO NOTHING`,
        [
          uuidv4(), realId, sId, dId,
          `[Seed] Past outage at ${ea.code} — aging equipment under high load`,
          (2 + Math.random() * 8).toFixed(1),
          Math.floor(ea.cust * 0.6),
          'Overloading / thermal stress',
          ageYears > 15,
        ]
      );
    }
  }
  logger.info(`[Seed] Extra assets OK — ${insertedExtraIds.length} inserted/found`);

  // ── Run risk computations ─────────────────────────────────────
  logger.info('[Seed] Computing risk scores...');
  try {
    const { computeRiskForAsset } = await import('../services/riskEngine');
    const allAssetIds = [A1, A2, A3, A4, A5, ...insertedExtraIds].filter(Boolean);
    for (const assetId of allAssetIds) {
      await computeRiskForAsset(assetId).catch((e) =>
        logger.warn(`Risk compute failed for ${assetId}:`, e)
      );
    }
  } catch (e) {
    logger.warn('[Seed] Risk engine not available — skipping risk computation:', e);
  }

  // ── SEED AUDIT LOGS — demonstrate non-login actions ─────────
  // These ensure the Audit Logs page shows meaningful demo data
  const userRows = await query<any>(`SELECT id, email FROM users WHERE email IN ('superadmin@nexora.ai','admin.mh@nexora.ai','admin.kl@nexora.ai')`);
  const userIdMap = Object.fromEntries(userRows.map((u: any) => [u.email, u.id]));
  const saId = userIdMap['superadmin@nexora.ai'];
  const mhAdminId = userIdMap['admin.mh@nexora.ai'];
  const klAdminId = userIdMap['admin.kl@nexora.ai'];

  const assetSeedRows = await query<any>(`SELECT id, asset_code, state_id FROM assets WHERE asset_code IN ('MUM-TRF-001','PUN-SUB-001','TVM-TRF-001') LIMIT 3`);

  const auditEntries = [
    { actorId: saId, email: 'superadmin@nexora.ai', action: 'settings_updated', entityType: 'website_settings', stateId: null, newVals: { siteName: 'NEXORA AI' } },
    { actorId: mhAdminId, email: 'admin.mh@nexora.ai', action: 'worker_status_changed_to_approved', entityType: 'worker_profile', stateId: assetSeedRows[0]?.state_id, newVals: { status: 'approved' } },
    { actorId: mhAdminId, email: 'admin.mh@nexora.ai', action: 'asset_created', entityType: 'asset', stateId: assetSeedRows[0]?.state_id, newVals: { assetCode: 'MUM-TRF-001', assetType: 'transformer' } },
    { actorId: mhAdminId, email: 'admin.mh@nexora.ai', action: 'asset_updated', entityType: 'asset', stateId: assetSeedRows[1]?.state_id ?? assetSeedRows[0]?.state_id, newVals: { currentLoadKw: 380 } },
    { actorId: klAdminId, email: 'admin.kl@nexora.ai', action: 'complaint_status_changed_to_under_review', entityType: 'complaint', stateId: null, newVals: { status: 'under_review' } },
    { actorId: klAdminId, email: 'admin.kl@nexora.ai', action: 'maintenance_plan_action_approved', entityType: 'maintenance_plan', stateId: null, newVals: { action: 'approve' } },
    { actorId: saId, email: 'superadmin@nexora.ai', action: 'prediction_approve', entityType: 'risk_prediction', stateId: null, newVals: { action: 'approve', overrideReason: 'Verified by senior engineer field inspection' } },
    { actorId: saId, email: 'superadmin@nexora.ai', action: 'worker_application_approved', entityType: 'worker_profile', stateId: null, newVals: { status: 'approved' } },
    { actorId: mhAdminId, email: 'admin.mh@nexora.ai', action: 'report_submitted', entityType: 'inspection_report', stateId: assetSeedRows[0]?.state_id, newVals: { assetCode: 'MUM-TRF-001' } },
    { actorId: saId, email: 'superadmin@nexora.ai', action: 'worker_status_changed_to_employed', entityType: 'worker_profile', stateId: null, newVals: { status: 'employed' } },
  ];

  for (const entry of auditEntries) {
    await query(
      `INSERT INTO audit_logs (id, actor_type, actor_id, actor_email, action, entity_type, state_id, new_values, created_at)
       VALUES ($1, 'user', $2, $3, $4, $5, $6, $7, NOW() - (random() * interval '72 hours'))
       ON CONFLICT DO NOTHING`,
      [uuidv4(), entry.actorId, entry.email, entry.action, entry.entityType, entry.stateId ?? null, JSON.stringify(entry.newVals)]
    );
  }

  logger.info('[Seed] Audit log entries OK');

  logger.info('[Seed] ✅ All seed data loaded successfully!');
  logger.info('[Seed] Test accounts:');
  logger.info('  Super Admin:       superadmin@nexora.ai / Admin@1234!');
  logger.info('  State Admin (MH):  admin.mh@nexora.ai / MhAdmin@123!');
  logger.info('  State Admin (KL):  admin.kl@nexora.ai / KlAdmin@123!');
  logger.info('  Worker (Mumbai):   worker.kumar@nexora.ai / Worker@1234!');
  logger.info('  Worker (Pune):     worker.priya@nexora.ai / Worker@1234!');
  logger.info('  Worker (TVM):      worker.mohan@nexora.ai / Worker@1234!');
  logger.info('  Complaint tracking: NXC-SEED001');

  await pool.end();
}

async function seedObservationMappings() {
  const mappings = [
    // Negative
    { code: 'corrosion',               type: 'negative', severity: 'medium',   delta: 12, action: 'Treat corrosion; recommend replacement if advanced' },
    { code: 'exposed_wiring',          type: 'negative', severity: 'critical',  delta: 20, action: 'Isolate safely, repair insulation, replace cable' },
    { code: 'overheating',             type: 'negative', severity: 'high',      delta: 18, action: 'Reduce load, improve ventilation, thermal inspection' },
    { code: 'burning_smell',           type: 'negative', severity: 'critical',  delta: 22, action: 'Isolate immediately, escalate to supervisor' },
    { code: 'cracked_insulation',      type: 'negative', severity: 'high',      delta: 15, action: 'Replace insulation, rewire affected section' },
    { code: 'water_ingress',           type: 'negative', severity: 'high',      delta: 16, action: 'Seal entry points, dry interior, replace damaged insulation' },
    { code: 'oil_leakage',             type: 'negative', severity: 'high',      delta: 14, action: 'Investigate and repair leak, top up oil level' },
    { code: 'loose_connections',       type: 'negative', severity: 'high',      delta: 13, action: 'Tighten connections, test torque, thermal scan' },
    { code: 'damaged_enclosure',       type: 'negative', severity: 'medium',    delta: 10, action: 'Seal damage, replace if structurally compromised' },
    { code: 'excessive_vibration',     type: 'negative', severity: 'medium',    delta: 12, action: 'Check mounting, inspect internal components' },
    { code: 'unusual_noise',           type: 'negative', severity: 'medium',    delta: 10, action: 'Internal inspection, check for loose parts or arcing' },
    { code: 'overloading',             type: 'negative', severity: 'high',      delta: 16, action: 'Reduce load, recommend capacity upgrade' },
    { code: 'repeated_tripping',       type: 'negative', severity: 'high',      delta: 18, action: 'Identify root cause, test protection relay' },
    { code: 'poor_earthing',           type: 'negative', severity: 'critical',  delta: 20, action: 'Test and remediate earthing, record measurements' },
    { code: 'broken_protective_covers',type: 'negative', severity: 'medium',    delta: 10, action: 'Replace covers, restore IP rating' },
    { code: 'pest_animal_damage',      type: 'negative', severity: 'medium',    delta:  8, action: 'Install deterrents, repair damage' },
    { code: 'flood_exposure',          type: 'negative', severity: 'critical',  delta: 20, action: 'Isolate, inspect for water damage, do not restore without sign-off' },
    { code: 'structural_instability',  type: 'negative', severity: 'critical',  delta: 22, action: 'Cordon area, emergency structural assessment' },
    { code: 'unauthorized_modification',type: 'negative',severity: 'high',      delta: 15, action: 'Document, revert unauthorized change, escalate' },
    { code: 'high_temperature',        type: 'negative', severity: 'high',      delta: 14, action: 'Thermal scan, check load and ventilation' },
    { code: 'abnormal_readings',       type: 'negative', severity: 'medium',    delta: 12, action: 'Investigate cause, calibrate sensors' },
    { code: 'evidence_of_arcing',      type: 'negative', severity: 'critical',  delta: 25, action: 'Isolate immediately, qualified engineer required before restart' },
    { code: 'missing_signage',         type: 'negative', severity: 'low',       delta:  5, action: 'Replace signage per standards' },
    { code: 'restricted_access',       type: 'negative', severity: 'low',       delta:  5, action: 'Clear access route, document obstruction' },
    { code: 'poor_ventilation',        type: 'negative', severity: 'medium',    delta:  8, action: 'Clear vents, install ventilation improvement' },
    // Positive
    { code: 'no_visible_damage',            type: 'positive', severity: null, delta: -5,  action: 'Maintain inspection schedule' },
    { code: 'enclosure_intact',             type: 'positive', severity: null, delta: -4,  action: 'Continue routine checks' },
    { code: 'proper_earthing_confirmed',    type: 'positive', severity: null, delta: -6,  action: 'Record verified measurement' },
    { code: 'normal_temperature',           type: 'positive', severity: null, delta: -5,  action: 'Maintain load management' },
    { code: 'normal_sound',                 type: 'positive', severity: null, delta: -3,  action: 'Continue monitoring' },
    { code: 'normal_vibration',             type: 'positive', severity: null, delta: -3,  action: 'Continue monitoring' },
    { code: 'no_corrosion',                 type: 'positive', severity: null, delta: -4,  action: 'Maintain protective coatings' },
    { code: 'no_water_ingress',             type: 'positive', severity: null, delta: -4,  action: 'Check seals at next inspection' },
    { code: 'wiring_properly_insulated',    type: 'positive', severity: null, delta: -5,  action: 'Continue routine checks' },
    { code: 'protective_covers_intact',     type: 'positive', severity: null, delta: -3,  action: 'Continue routine checks' },
    { code: 'load_within_range',            type: 'positive', severity: null, delta: -5,  action: 'Monitor load levels' },
    { code: 'signage_present',              type: 'positive', severity: null, delta: -2,  action: 'Continue compliance monitoring' },
    { code: 'recent_maintenance_completed', type: 'positive', severity: null, delta: -8,  action: 'Maintain service schedule' },
    { code: 'adequate_ventilation',         type: 'positive', severity: null, delta: -3,  action: 'Continue monitoring' },
    { code: 'no_repeated_faults',           type: 'positive', severity: null, delta: -4,  action: 'Continue monitoring' },
    { code: 'area_clean_accessible',        type: 'positive', severity: null, delta: -2,  action: 'Maintain site cleanliness' },
    { code: 'sensor_readings_normal',       type: 'positive', severity: null, delta: -4,  action: 'Continue sensor monitoring' },
  ];

  for (const m of mappings) {
    await query(
      `INSERT INTO observation_risk_mappings
         (id, observation_code, obs_type, severity, risk_delta, can_cancel_critical, recommended_action)
       VALUES ($1, $2, $3, $4, $5, FALSE, $6)
       ON CONFLICT (observation_code) DO UPDATE
         SET risk_delta = $5, recommended_action = $6, updated_at = NOW()`,
      [
        uuidv4(), m.code, m.type,
        m.severity, m.delta, m.action,
      ]
    );
  }
  logger.info('[Seed] Observation risk mappings OK');
}

async function seedNotificationTemplates() {
  const templates = [
    {
      event: 'worker_application_submitted',
      subject: 'NEXORA AI — Application Received',
      body: 'Dear {{fullName}}, your application ({{applicationNumber}}) has been received and is under review.',
    },
    {
      event: 'worker_application_approved',
      subject: 'NEXORA AI — Application Approved',
      body: 'Dear {{fullName}}, your application has been approved. You can now log in to the worker portal.',
    },
    {
      event: 'worker_application_rejected',
      subject: 'NEXORA AI — Application Update',
      body: 'Dear {{fullName}}, your application was not approved. Reason: {{reason}}',
    },
    {
      event: 'inspection_task_created',
      subject: 'NEXORA AI — New Inspection Task Assigned',
      body: 'Dear {{fullName}}, you have been assigned task {{taskCode}} for asset {{assetCode}}. Please log in to view details.',
    },
    {
      event: 'report_submitted',
      subject: 'NEXORA AI — Inspection Report Submitted',
      body: 'Your report for task {{taskCode}} has been submitted. Risk score: {{scoreBefore}} → {{scoreAfter}} (Δ{{delta}}).',
    },
    {
      event: 'complaint_submitted',
      subject: 'NEXORA AI — Complaint Registered',
      body: 'Dear {{fullName}}, your complaint {{complaintNumber}} has been registered. {{trackingInstructions}}',
    },
    {
      event: 'report_correction_requested',
      subject: 'NEXORA AI — Report Correction Required',
      body: 'Your inspection report requires correction. Reason: {{correctionReason}}. Please log in and update your report.',
    },
    {
      event: 'critical_asset_alert',
      subject: 'NEXORA AI — Critical Asset Alert',
      body: 'Asset {{assetCode}} has been classified as CRITICAL risk (score: {{riskScore}}). Immediate attention required.',
    },
  ];

  for (const t of templates) {
    await query(
      `INSERT INTO notification_templates (id, event_key, subject, body_text)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (event_key) DO UPDATE SET subject = $3, body_text = $4`,
      [uuidv4(), t.event, t.subject, t.body]
    );
  }
  logger.info('[Seed] Notification templates OK');
}

seed().catch((err) => {
  logger.error('Seed failed:', err);
  process.exit(1);
});
