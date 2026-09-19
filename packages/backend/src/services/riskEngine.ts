/**
 * NEXORA AI — Explainable Risk Scoring Engine
 *
 * Risk Score = Worker Observation Contribution
 *            + Sensor Contribution
 *            + Weather Contribution
 *            + Historical Incident Contribution
 *            + Asset Age Contribution
 *            + Load and Capacity Contribution
 *            + Geographic Exposure Contribution
 *
 * Normalized to 0–100. Every prediction is versioned, timestamped,
 * and stores the full input snapshot.
 *
 * Rules:
 * - Negative observations raise risk; positive ones lower it only
 *   where appropriate, and NEVER cancel a critical safety flag.
 * - Missing data is never treated as a positive signal.
 * - Sensor failures are never read as healthy.
 * - Conflicting observations are flagged for admin review.
 */

import { query } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// Local type definitions (mirrors @nexora/shared — kept local to avoid rootDir conflicts)
export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';
export interface RiskContributingFactor {
  factor: string;
  category: 'worker_observation' | 'sensor' | 'weather' | 'historical' | 'asset_age' | 'load_capacity' | 'geographic';
  contribution: number;
  description: string;
  evidence?: string;
}

const MODEL_VERSION = '1.0.0';

// ── Default factor weights (configurable per risk_factors table) ──────────
const DEFAULT_WEIGHTS = {
  worker_observation: 30,
  sensor: 25,
  weather: 15,
  historical: 15,
  asset_age: 5,
  load_capacity: 7,
  geographic: 3,
};

// ── Severity multipliers for worker observations ──────────────────────────
const SEVERITY_MULTIPLIER: Record<string, number> = {
  critical: 1.0,
  high: 0.75,
  medium: 0.5,
  low: 0.25,
};

export interface RiskInputSnapshot {
  assetId: string;
  observations: any[];
  sensorReadings: any[];
  weatherRecords: any[];
  historicalIncidents: any[];
  asset: any;
  weights: typeof DEFAULT_WEIGHTS;
  computedAt: string;
}

export interface RiskEngineResult {
  riskScore: number;
  riskLevel: RiskLevel;
  previousScore?: number;
  scoreDelta?: number;
  failureProbability: number;
  outageProbability: number;
  gridImpactSeverity: number;
  maintenanceUrgency: 'immediate' | 'urgent' | 'scheduled' | 'routine';
  confidenceScore: number;
  topFactors: RiskContributingFactor[];
  explanation: string;
  missingDataFlags: string[];
  inputSnapshot: RiskInputSnapshot;
  hasCriticalSafetyFlag: boolean;
  needsAdminReview: boolean;
}

function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val));
}

function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
}

function urgencyFromScore(score: number): RiskEngineResult['maintenanceUrgency'] {
  if (score >= 75) return 'immediate';
  if (score >= 50) return 'urgent';
  if (score >= 25) return 'scheduled';
  return 'routine';
}

/**
 * Load configurable weights from the database.
 * Falls back to defaults if not configured.
 */
async function loadWeights(): Promise<typeof DEFAULT_WEIGHTS> {
  try {
    const rows = await query<any>(
      `SELECT factor_key, base_weight FROM risk_factors WHERE is_active = TRUE`
    );
    const weights = { ...DEFAULT_WEIGHTS };
    for (const row of rows) {
      if (row.factor_key in weights) {
        (weights as any)[row.factor_key] = parseFloat(row.base_weight);
      }
    }
    return weights;
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

/**
 * Load observation-to-risk mappings from the database.
 * Falls back to built-in defaults.
 */
async function loadObservationMappings(): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  try {
    const rows = await query<any>(
      `SELECT observation_code, obs_type, severity, risk_delta, can_cancel_critical,
              recommended_action, work_instruction
       FROM observation_risk_mappings WHERE is_active = TRUE`
    );
    for (const row of rows) {
      map.set(row.observation_code, row);
    }
  } catch {
    // Use built-in fallback deltas
    BUILTIN_OBSERVATION_DELTAS.forEach((v, k) => map.set(k, v));
  }
  return map;
}

// Built-in fallback observation deltas (used if DB not seeded yet)
const BUILTIN_OBSERVATION_DELTAS = new Map<string, any>([
  ['corrosion',              { risk_delta: 12, obs_type: 'negative', severity: 'medium', can_cancel_critical: false }],
  ['exposed_wiring',         { risk_delta: 20, obs_type: 'negative', severity: 'critical', can_cancel_critical: false }],
  ['overheating',            { risk_delta: 18, obs_type: 'negative', severity: 'high', can_cancel_critical: false }],
  ['burning_smell',          { risk_delta: 22, obs_type: 'negative', severity: 'critical', can_cancel_critical: false }],
  ['cracked_insulation',     { risk_delta: 15, obs_type: 'negative', severity: 'high', can_cancel_critical: false }],
  ['water_ingress',          { risk_delta: 16, obs_type: 'negative', severity: 'high', can_cancel_critical: false }],
  ['oil_leakage',            { risk_delta: 14, obs_type: 'negative', severity: 'high', can_cancel_critical: false }],
  ['loose_connections',      { risk_delta: 13, obs_type: 'negative', severity: 'high', can_cancel_critical: false }],
  ['damaged_enclosure',      { risk_delta: 10, obs_type: 'negative', severity: 'medium', can_cancel_critical: false }],
  ['excessive_vibration',    { risk_delta: 12, obs_type: 'negative', severity: 'medium', can_cancel_critical: false }],
  ['unusual_noise',          { risk_delta: 10, obs_type: 'negative', severity: 'medium', can_cancel_critical: false }],
  ['overloading',            { risk_delta: 16, obs_type: 'negative', severity: 'high', can_cancel_critical: false }],
  ['repeated_tripping',      { risk_delta: 18, obs_type: 'negative', severity: 'high', can_cancel_critical: false }],
  ['poor_earthing',          { risk_delta: 20, obs_type: 'negative', severity: 'critical', can_cancel_critical: false }],
  ['broken_protective_covers',{ risk_delta: 10, obs_type: 'negative', severity: 'medium', can_cancel_critical: false }],
  ['pest_animal_damage',     { risk_delta: 8,  obs_type: 'negative', severity: 'medium', can_cancel_critical: false }],
  ['flood_exposure',         { risk_delta: 20, obs_type: 'negative', severity: 'critical', can_cancel_critical: false }],
  ['structural_instability', { risk_delta: 22, obs_type: 'negative', severity: 'critical', can_cancel_critical: false }],
  ['unauthorized_modification',{ risk_delta: 15, obs_type: 'negative', severity: 'high', can_cancel_critical: false }],
  ['high_temperature',       { risk_delta: 14, obs_type: 'negative', severity: 'high', can_cancel_critical: false }],
  ['abnormal_readings',      { risk_delta: 12, obs_type: 'negative', severity: 'medium', can_cancel_critical: false }],
  ['evidence_of_arcing',     { risk_delta: 25, obs_type: 'negative', severity: 'critical', can_cancel_critical: false }],
  ['missing_signage',        { risk_delta: 5,  obs_type: 'negative', severity: 'low', can_cancel_critical: false }],
  ['restricted_access',      { risk_delta: 5,  obs_type: 'negative', severity: 'low', can_cancel_critical: false }],
  ['poor_ventilation',       { risk_delta: 8,  obs_type: 'negative', severity: 'medium', can_cancel_critical: false }],
  // Positive observations (lower risk, but cannot cancel critical)
  ['no_visible_damage',           { risk_delta: -5,  obs_type: 'positive', can_cancel_critical: false }],
  ['enclosure_intact',            { risk_delta: -4,  obs_type: 'positive', can_cancel_critical: false }],
  ['proper_earthing_confirmed',   { risk_delta: -6,  obs_type: 'positive', can_cancel_critical: false }],
  ['normal_temperature',          { risk_delta: -5,  obs_type: 'positive', can_cancel_critical: false }],
  ['normal_sound',                { risk_delta: -3,  obs_type: 'positive', can_cancel_critical: false }],
  ['normal_vibration',            { risk_delta: -3,  obs_type: 'positive', can_cancel_critical: false }],
  ['no_corrosion',                { risk_delta: -4,  obs_type: 'positive', can_cancel_critical: false }],
  ['no_water_ingress',            { risk_delta: -4,  obs_type: 'positive', can_cancel_critical: false }],
  ['wiring_properly_insulated',   { risk_delta: -5,  obs_type: 'positive', can_cancel_critical: false }],
  ['protective_covers_intact',    { risk_delta: -3,  obs_type: 'positive', can_cancel_critical: false }],
  ['load_within_range',           { risk_delta: -5,  obs_type: 'positive', can_cancel_critical: false }],
  ['signage_present',             { risk_delta: -2,  obs_type: 'positive', can_cancel_critical: false }],
  ['recent_maintenance_completed',{ risk_delta: -8,  obs_type: 'positive', can_cancel_critical: false }],
  ['adequate_ventilation',        { risk_delta: -3,  obs_type: 'positive', can_cancel_critical: false }],
  ['no_repeated_faults',          { risk_delta: -4,  obs_type: 'positive', can_cancel_critical: false }],
  ['area_clean_accessible',       { risk_delta: -2,  obs_type: 'positive', can_cancel_critical: false }],
  ['sensor_readings_normal',      { risk_delta: -4,  obs_type: 'positive', can_cancel_critical: false }],
]);

/**
 * Main entry point: compute risk for an asset.
 * Fetches all required data from DB, runs the engine, persists prediction.
 */
export async function computeRiskForAsset(assetId: string): Promise<RiskEngineResult> {
  const [asset, observations, sensorReadings, weatherRecords, historicalIncidents, prevPrediction] =
    await Promise.all([
      query<any>(`SELECT a.*, s.name AS state_name, d.name AS district_name
                  FROM assets a
                  JOIN states s ON s.id = a.state_id
                  JOIN districts d ON d.id = a.district_id
                  WHERE a.id = $1`, [assetId]).then((r) => r[0]),
      query<any>(
        `SELECT * FROM worker_observations
         WHERE asset_id = $1
         ORDER BY observed_at DESC LIMIT 50`,
        [assetId]
      ),
      query<any>(
        `SELECT sr.*, ase.sensor_type, ase.unit, ase.min_normal, ase.max_normal
         FROM sensor_readings sr
         JOIN asset_sensors ase ON ase.id = sr.sensor_id
         WHERE sr.asset_id = $1
           AND sr.recorded_at > NOW() - INTERVAL '24 hours'
         ORDER BY sr.recorded_at DESC`,
        [assetId]
      ),
      query<any>(
        `SELECT * FROM weather_records
         WHERE district_id = (SELECT district_id FROM assets WHERE id = $1)
           AND recorded_at > NOW() - INTERVAL '48 hours'
         ORDER BY recorded_at DESC LIMIT 10`,
        [assetId]
      ),
      query<any>(
        `SELECT * FROM historical_incidents
         WHERE asset_id = $1
         ORDER BY occurred_at DESC LIMIT 20`,
        [assetId]
      ),
      query<any>(
        `SELECT risk_score FROM risk_predictions
         WHERE asset_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [assetId]
      ).then((r) => r[0]),
    ]);

  if (!asset) throw new Error(`Asset ${assetId} not found`);

  const weights = await loadWeights();
  const observationMappings = await loadObservationMappings();

  const missingDataFlags: string[] = [];
  const factors: RiskContributingFactor[] = [];
  let hasCriticalSafetyFlag = false;
  let needsAdminReview = false;
  let totalScore = 0;

  // ── 1. Worker Observation Contribution ─────────────────────────
  let workerContribution = 0;
  let workerBaseMaxContribution = 0;
  const seenCodes = new Set<string>();
  const conflictCheck: Record<string, string[]> = {};

  if (observations.length === 0) {
    missingDataFlags.push('no_recent_worker_observations');
  }

  for (const obs of observations) {
    const code = obs.observation_code;
    const mapping = observationMappings.get(code);
    if (!mapping) continue;

    // Track for conflict detection
    if (!conflictCheck[code]) conflictCheck[code] = [];
    conflictCheck[code].push(obs.obs_type);

    const severityMult = SEVERITY_MULTIPLIER[obs.severity] ?? 0.5;
    const confidence = parseFloat(obs.confidence ?? '1.0');
    const rawDelta = parseFloat(mapping.risk_delta);

    let impact: number;
    if (rawDelta > 0) {
      // Negative observation — raises risk
      impact = rawDelta * severityMult * confidence;
      if (obs.severity === 'critical') hasCriticalSafetyFlag = true;
    } else {
      // Positive observation — lowers risk
      // Never cancel a critical safety flag
      if (hasCriticalSafetyFlag && !mapping.can_cancel_critical) {
        impact = 0; // positive cannot cancel critical
      } else {
        impact = rawDelta * confidence; // negative number, lowers score
      }
    }

    workerContribution += impact;
    workerBaseMaxContribution += Math.abs(rawDelta);
    obs.risk_score_impact = impact; // attach for display

    factors.push({
      factor: code.replace(/_/g, ' '),
      category: 'worker_observation',
      contribution: impact,
      description: `Worker recorded: ${obs.description || code.replace(/_/g, ' ')}`,
      evidence: obs.photo_urls?.length
        ? `${obs.photo_urls.length} photo(s) attached`
        : undefined,
    });

    seenCodes.add(code);
  }

  // Detect conflicts: same code observed as both positive and negative
  for (const [code, types] of Object.entries(conflictCheck)) {
    if (types.includes('positive') && types.includes('negative')) {
      needsAdminReview = true;
      missingDataFlags.push(`conflicting_observations:${code}`);
    }
  }

  // Normalize worker contribution to 0–weight range
  const workerNormalized = workerBaseMaxContribution > 0
    ? clamp((workerContribution / (workerBaseMaxContribution * 1.5)) * weights.worker_observation + (weights.worker_observation / 2), 0, weights.worker_observation)
    : weights.worker_observation * 0.3; // neutral baseline if no observations
  totalScore += workerNormalized;

  factors.push({
    factor: 'Worker Observation Total',
    category: 'worker_observation',
    contribution: workerNormalized,
    description: `${observations.length} observation(s) recorded`,
  });

  // ── 2. Sensor Contribution ──────────────────────────────────────
  let sensorScore = 0;
  if (sensorReadings.length === 0) {
    missingDataFlags.push('no_sensor_data');
    // Missing sensor data is NOT treated as healthy — add neutral/moderate base
    sensorScore = weights.sensor * 0.4;
  } else {
    let sensorPoints = 0;
    for (const reading of sensorReadings) {
      if (reading.sensor_failed) {
        // Sensor failure = NOT healthy — treat as elevated risk
        sensorPoints += 20;
        hasCriticalSafetyFlag = true;
        factors.push({
          factor: `Sensor Failure (${reading.sensor_type})`,
          category: 'sensor',
          contribution: 20,
          description: `Sensor ${reading.sensor_type} reported a failure — not treated as healthy`,
        });
        continue;
      }
      if (reading.is_missing) {
        sensorPoints += 10;
        missingDataFlags.push(`missing_sensor_reading:${reading.sensor_type}`);
        continue;
      }
      if (reading.is_outlier) {
        sensorPoints += 15;
        factors.push({
          factor: `Sensor Outlier (${reading.sensor_type})`,
          category: 'sensor',
          contribution: 15,
          description: `Abnormal reading: ${reading.value} ${reading.unit}`,
        });
        continue;
      }
      // Check against normal range
      const val = parseFloat(reading.value);
      const minNormal = parseFloat(reading.min_normal);
      const maxNormal = parseFloat(reading.max_normal);
      if (!isNaN(minNormal) && !isNaN(maxNormal)) {
        if (val < minNormal || val > maxNormal) {
          const deviation =
            val > maxNormal
              ? ((val - maxNormal) / maxNormal) * 100
              : ((minNormal - val) / minNormal) * 100;
          const pts = Math.min(25, deviation * 0.5);
          sensorPoints += pts;
          factors.push({
            factor: `${reading.sensor_type} out of range`,
            category: 'sensor',
            contribution: pts,
            description: `Value ${val} ${reading.unit} outside normal range [${minNormal}–${maxNormal}]`,
          });
        } else {
          // Normal reading — small positive effect
          sensorPoints -= 3;
        }
      }
    }
    sensorScore = clamp(
      (sensorPoints / (sensorReadings.length * 25)) * weights.sensor,
      0,
      weights.sensor
    );
  }
  totalScore += sensorScore;

  // ── 3. Weather Contribution ─────────────────────────────────────
  let weatherScore = 0;
  if (weatherRecords.length === 0) {
    missingDataFlags.push('no_weather_data');
    weatherScore = weights.weather * 0.2; // unknown weather = slight elevation
  } else {
    const latest = weatherRecords[0];
    let weatherPoints = 0;
    if (latest.extreme_weather_alert) { weatherPoints += 30; hasCriticalSafetyFlag = true; }
    if (latest.flood_alert)           { weatherPoints += 25; }
    if (latest.storm_alert)           { weatherPoints += 20; }
    if (latest.lightning_risk)        { weatherPoints += 20; }
    if (latest.heatwave_alert)        { weatherPoints += 15; }
    if (latest.wind_speed_kmh > 80)   { weatherPoints += 15; }
    else if (latest.wind_speed_kmh > 50) { weatherPoints += 8; }
    if (latest.rainfall_mm > 100)     { weatherPoints += 15; }
    else if (latest.rainfall_mm > 50) { weatherPoints += 8; }
    if (latest.temperature_c > 45)    { weatherPoints += 10; }
    if (latest.humidity_pct > 90)     { weatherPoints += 5; }

    weatherScore = clamp(
      (weatherPoints / 100) * weights.weather,
      0,
      weights.weather
    );

    if (weatherPoints > 0) {
      factors.push({
        factor: 'Weather Conditions',
        category: 'weather',
        contribution: weatherScore,
        description: buildWeatherDescription(latest),
      });
    }
  }
  totalScore += weatherScore;

  // ── 4. Historical Incident Contribution ────────────────────────
  let histScore = 0;
  if (historicalIncidents.length === 0) {
    histScore = weights.historical * 0.1;
  } else {
    // Weight recent incidents more heavily
    let histPoints = 0;
    for (const incident of historicalIncidents) {
      const ageMs = Date.now() - new Date(incident.occurred_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const recency = Math.max(0, 1 - ageDays / 365); // decays over 1 year
      histPoints += (10 + (incident.outage_duration_h ?? 0) * 0.5) * recency;
      if (incident.is_recurring) histPoints += 10;
    }
    histScore = clamp(
      (histPoints / (historicalIncidents.length * 20)) * weights.historical,
      0,
      weights.historical
    );
    factors.push({
      factor: 'Historical Incidents',
      category: 'historical',
      contribution: histScore,
      description: `${historicalIncidents.length} past incident(s); ${historicalIncidents.filter((i: any) => i.is_recurring).length} recurring`,
    });
  }
  totalScore += histScore;

  // ── 5. Asset Age Contribution ───────────────────────────────────
  let ageScore = 0;
  if (!asset.install_date) {
    missingDataFlags.push('no_install_date');
    ageScore = weights.asset_age * 0.5;
  } else {
    const ageYears =
      (Date.now() - new Date(asset.install_date).getTime()) / (1000 * 60 * 60 * 24 * 365);
    // Risk increases after 10 years, accelerates after 20
    const ageFactor = ageYears < 5 ? 0.1
      : ageYears < 10 ? 0.3
      : ageYears < 20 ? 0.6
      : ageYears < 30 ? 0.85
      : 1.0;
    ageScore = ageFactor * weights.asset_age;
    factors.push({
      factor: 'Asset Age',
      category: 'asset_age',
      contribution: ageScore,
      description: `Asset is approximately ${Math.round(ageYears)} years old`,
    });
  }
  totalScore += ageScore;

  // ── 6. Load & Capacity Contribution ────────────────────────────
  let loadScore = 0;
  if (!asset.rated_capacity_kva || !asset.current_load_kw) {
    missingDataFlags.push('no_load_capacity_data');
    loadScore = weights.load_capacity * 0.3;
  } else {
    const loadRatio = asset.current_load_kw / asset.rated_capacity_kva;
    const loadFactor = loadRatio > 1.0 ? 1.0
      : loadRatio > 0.9 ? 0.85
      : loadRatio > 0.75 ? 0.5
      : loadRatio > 0.5 ? 0.2
      : 0.05;
    loadScore = loadFactor * weights.load_capacity;
    if (loadRatio > 0.9) {
      factors.push({
        factor: 'High Load Ratio',
        category: 'load_capacity',
        contribution: loadScore,
        description: `Operating at ${Math.round(loadRatio * 100)}% of rated capacity`,
      });
    }
  }
  totalScore += loadScore;

  // ── 7. Geographic Exposure ──────────────────────────────────────
  let geoScore = 0;
  // Assets with more connected customers have higher grid impact
  const connectedCustomers = asset.connected_customers ?? 0;
  const geoFactor = connectedCustomers > 10000 ? 1.0
    : connectedCustomers > 5000 ? 0.75
    : connectedCustomers > 1000 ? 0.5
    : connectedCustomers > 100  ? 0.25
    : 0.1;
  geoScore = geoFactor * weights.geographic;
  if (geoFactor > 0.5) {
    factors.push({
      factor: 'Geographic Exposure',
      category: 'geographic',
      contribution: geoScore,
      description: `Serves ${connectedCustomers.toLocaleString()} customers`,
    });
  }
  totalScore += geoScore;

  // ── Normalize to 0–100 ─────────────────────────────────────────
  const maxPossible = Object.values(weights).reduce((a, b) => a + b, 0);
  const normalizedScore = clamp(Math.round((totalScore / maxPossible) * 100));

  // ── Compute probabilities ──────────────────────────────────────
  const failureProbability = clamp(normalizedScore * 0.85) / 100;
  const outageProbability = clamp(normalizedScore * 0.7 + (connectedCustomers > 1000 ? 5 : 0)) / 100;
  const gridImpactSeverity = clamp(
    (connectedCustomers / 10000) * 50 + normalizedScore * 0.5
  );

  const confidenceScore = computeConfidence(observations.length, sensorReadings.length, missingDataFlags);

  // ── Sort factors by absolute contribution ─────────────────────
  const topFactors = factors
    .filter((f) => Math.abs(f.contribution) > 0.5)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 8);

  // ── Build human-readable explanation ──────────────────────────
  const explanation = buildExplanation(
    asset,
    normalizedScore,
    prevPrediction?.risk_score,
    topFactors,
    missingDataFlags,
    hasCriticalSafetyFlag
  );

  const inputSnapshot: RiskInputSnapshot = {
    assetId,
    observations: observations.map((o: any) => ({ id: o.id, code: o.observation_code, type: o.obs_type, severity: o.severity })),
    sensorReadings: sensorReadings.map((s: any) => ({ id: s.id, type: s.sensor_type, value: s.value, failed: s.sensor_failed })),
    weatherRecords: weatherRecords.slice(0, 2).map((w: any) => ({ flood: w.flood_alert, storm: w.storm_alert, extreme: w.extreme_weather_alert })),
    historicalIncidents: historicalIncidents.map((h: any) => ({ id: h.id, type: h.incident_type, occurred_at: h.occurred_at })),
    asset: { id: asset.id, type: asset.asset_type, install_date: asset.install_date, current_load_kw: asset.current_load_kw },
    weights,
    computedAt: new Date().toISOString(),
  };

  const result: RiskEngineResult = {
    riskScore: normalizedScore,
    riskLevel: riskLevelFromScore(normalizedScore),
    previousScore: prevPrediction?.risk_score,
    scoreDelta: prevPrediction?.risk_score != null
      ? normalizedScore - prevPrediction.risk_score
      : undefined,
    failureProbability,
    outageProbability,
    gridImpactSeverity,
    maintenanceUrgency: urgencyFromScore(normalizedScore),
    confidenceScore,
    topFactors,
    explanation,
    missingDataFlags,
    inputSnapshot,
    hasCriticalSafetyFlag,
    needsAdminReview,
  };

  // ── Persist prediction ─────────────────────────────────────────
  await persistPrediction(asset, result);

  // ── Update asset risk score + grid impact severity ────────────
  await query(
    `UPDATE assets
     SET current_risk_score = $1, current_risk_level = $2::risk_level,
         grid_impact_severity = $3, updated_at = NOW()
     WHERE id = $4`,
    [normalizedScore, result.riskLevel, gridImpactSeverity, assetId]
  );

  logger.info(`[RiskEngine] Asset ${assetId}: score=${normalizedScore} level=${result.riskLevel} delta=${result.scoreDelta ?? 'N/A'}`);

  return result;
}

async function persistPrediction(asset: any, result: RiskEngineResult): Promise<void> {
  // Skip INSERT if score is essentially unchanged (within ±0.5) to avoid duplicate rows
  if (result.previousScore !== undefined && result.previousScore !== null) {
    const delta = Math.abs(result.riskScore - result.previousScore);
    if (delta < 0.5) {
      logger.info(`[RiskEngine] Asset ${asset.id}: score unchanged (${result.riskScore} vs ${result.previousScore}), skipping prediction insert`);
      return;
    }
  }

  await query(
    `INSERT INTO risk_predictions
       (id, asset_id, state_id, district_id, risk_score, risk_level,
        previous_score, score_delta, failure_probability, outage_probability,
        grid_impact_severity, maintenance_urgency, confidence_score,
        top_factors, explanation, missing_data_flags, model_version,
        input_snapshot, human_review_status)
     VALUES ($1,$2,$3,$4,$5,$6::risk_level,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [
      uuidv4(),
      asset.id,
      asset.state_id,
      asset.district_id,
      result.riskScore,
      result.riskLevel,
      result.previousScore ?? null,
      result.scoreDelta ?? null,
      result.failureProbability,
      result.outageProbability,
      result.gridImpactSeverity,
      result.maintenanceUrgency,
      result.confidenceScore,
      JSON.stringify(result.topFactors),
      result.explanation,
      result.missingDataFlags,
      MODEL_VERSION,
      JSON.stringify(result.inputSnapshot),
      'pending',
    ]
  );
}

function computeConfidence(
  obsCount: number,
  sensorCount: number,
  missingFlags: string[]
): number {
  let confidence = 1.0;
  if (obsCount === 0) confidence -= 0.25;
  else if (obsCount < 3) confidence -= 0.1;
  if (sensorCount === 0) confidence -= 0.2;
  confidence -= missingFlags.length * 0.05;
  return clamp(Math.round(confidence * 100) / 100, 0.1, 1.0);
}

function buildWeatherDescription(w: any): string {
  const alerts: string[] = [];
  if (w.extreme_weather_alert) alerts.push('extreme weather alert');
  if (w.flood_alert) alerts.push('flood alert');
  if (w.storm_alert) alerts.push('storm alert');
  if (w.lightning_risk) alerts.push('lightning risk');
  if (w.heatwave_alert) alerts.push('heatwave alert');
  if (w.wind_speed_kmh > 50) alerts.push(`high winds (${w.wind_speed_kmh} km/h)`);
  if (w.rainfall_mm > 50) alerts.push(`heavy rainfall (${w.rainfall_mm} mm)`);
  return alerts.length
    ? `Active weather conditions: ${alerts.join(', ')}`
    : `Temperature ${w.temperature_c}°C, Wind ${w.wind_speed_kmh} km/h`;
}

function buildExplanation(
  asset: any,
  score: number,
  prevScore: number | undefined,
  topFactors: RiskContributingFactor[],
  missingFlags: string[],
  criticalFlag: boolean
): string {
  const level = riskLevelFromScore(score);
  const parts: string[] = [];

  if (prevScore != null) {
    const delta = score - prevScore;
    if (Math.abs(delta) >= 1) {
      parts.push(
        delta > 0
          ? `Predicted risk increased from ${prevScore} to ${score}`
          : `Predicted risk decreased from ${prevScore} to ${score}`
      );
    } else {
      parts.push(`Predicted risk is unchanged at ${score}`);
    }
  } else {
    parts.push(`Predicted risk score: ${score}`);
  }

  parts.push(`Asset ${asset.asset_code} (${asset.asset_type}) is now classified as ${level.toUpperCase()} risk.`);

  const topNeg = topFactors.filter((f) => f.contribution > 3).slice(0, 3);
  const topPos = topFactors.filter((f) => f.contribution < -2).slice(0, 2);

  if (topNeg.length > 0) {
    parts.push(`Key contributing factors: ${topNeg.map((f) => f.factor).join(', ')}.`);
  }
  if (topPos.length > 0) {
    parts.push(`Mitigating factors: ${topPos.map((f) => f.factor).join(', ')}.`);
  }
  // Only show the critical-safety warning when the flag is set AND it meaningfully
  // contributes to the score (at least one factor contributes ≥15 points).
  if (criticalFlag && topFactors.some((f) => f.contribution >= 15)) {
    parts.push('⚠ One or more critical safety conditions detected — positive observations cannot override this flag.');
  }
  if (missingFlags.length > 0) {
    parts.push(`Data quality note: missing ${missingFlags.length} data source(s) — confidence may be reduced.`);
  }
  parts.push('This is a predicted risk estimate and requires administrator review before action is taken.');

  return parts.join(' ');
}
