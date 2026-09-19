/**
 * NEXORA AI — Alert Risk Pipeline (section 14 of spec)
 *
 * Implements the 11-step additive pipeline:
 *
 *   Risk Before Alert
 * + State Administrator Alert Information
 * + Worker Arrival Verification
 * + Negative Findings
 * + Positive Findings
 * + Geo-Tagged Evidence Images
 * + Measurements
 * + Current Sensor Readings
 * + Weather Conditions
 * + Historical Incidents
 * + Maintenance Status
 * = Updated Asset and Location Risk
 *
 * SAFETY OVERRIDE RULE (section 14, also fixes legacy bug):
 * A positive finding NEVER cancels a critical condition.
 * Critical conditions (exposed live wiring, fire evidence, severe structural
 * damage, immediate public hazard) floor the risk at CRITICAL regardless of
 * how many positive findings are present.
 *
 * CORRECTIVE ACTION RULE (section 15):
 * Risk only decreases after admin_approved_completion = TRUE on the corrective
 * action — never from "marked complete" alone.
 *
 * Validation examples from spec:
 *   54 − 6 − 7 − 5 − 8 = 28 (Moderate)
 *   54 + 20 + 12 + 10 + 8 = 104 → clamped to 100 (Critical)
 */

import { query } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// ── Types ─────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export interface AlertRiskPipelineResult {
  // Previous state
  scoreBefore: number;
  levelBefore: RiskLevel;

  // Pipeline step deltas
  adminInfoDelta: number;
  arrivalVerificationDelta: number;
  negativeFindingsDelta: number;
  positiveFindingsDelta: number;
  evidenceImagesDelta: number;
  measurementsDelta: number;
  sensorReadingsDelta: number;
  weatherDelta: number;
  historicalIncidentsDelta: number;
  maintenanceStatusDelta: number;

  // Result
  finalScore: number;
  finalLevel: RiskLevel;
  scoreDelta: number;

  // Safety override
  safetyOverrideApplied: boolean;
  safetyOverrideReason: string | null;

  // Display metadata
  positiveFactors: FactorDetail[];
  negativeFactors: FactorDetail[];
  evidenceUsed: EvidenceRef[];
  missingInformation: string[];
  confidence: number;
  modelVersion: string;
  calculatedAt: string;
}

export interface FactorDetail {
  code: string;
  label: string;
  delta: number;
  severity?: string;
  confidence?: number;
}

export interface EvidenceRef {
  type: string;
  id: string;
  description?: string;
}

// ── Constants ─────────────────────────────────────────────────

const MODEL_VERSION = '2.0.0';

/** Observation codes that are considered CRITICAL SAFETY conditions.
 *  Positive findings can NEVER cancel these — they floor the risk at CRITICAL. */
const CRITICAL_SAFETY_CODES = new Set([
  'exposed_wiring',
  'evidence_of_arcing',
  'fire_evidence',
  'burning_smell',
  'visible_smoke',
  'severe_structural_damage',
  'immediate_public_hazard',
  'flood_exposure',
]);

/** Per-finding risk deltas. These are the authoritative values used by the
 *  alert pipeline. Negative findings add; positive findings subtract.
 *  Source: spec section 14 example deltas. */
const NEGATIVE_FINDING_DELTAS: Record<string, number> = {
  exposed_wiring: 20,
  damaged_insulation: 12,
  overheating: 12,
  burning_smell: 22,
  visible_smoke: 20,
  corrosion: 8,
  water_ingress: 10,
  flooding: 18,
  oil_leakage: 10,
  loose_connection: 8,
  abnormal_sound: 7,
  excessive_vibration: 8,
  overloading: 10,
  repeated_tripping: 8,
  poor_earthing: 14,
  broken_protective_cover: 7,
  structural_damage: 15,
  missing_safety_sign: 4,
  unsafe_public_access: 10,
  pest_animal_damage: 6,
  unauthorized_modification: 10,
  poor_ventilation: 6,
  abnormal_voltage: 10,
  abnormal_current: 10,
  abnormal_temperature: 10,
  abnormal_sensor_reading: 8,
  damaged_support_structure: 12,
  blocked_drainage: 6,
  fire_evidence: 25,
  evidence_of_arcing: 25,
  severe_structural_damage: 20,
  immediate_public_hazard: 15,
  other: 5,
};

const POSITIVE_FINDING_DELTAS: Record<string, number> = {
  no_visible_damage: -5,
  normal_temperature: -6,
  normal_load: -5,
  normal_voltage: -5,
  normal_current: -4,
  proper_earthing_verified: -7,
  intact_insulation: -5,
  enclosure_intact: -4,
  no_water_ingress: -4,
  no_corrosion: -3,
  no_oil_leakage: -3,
  no_abnormal_sound: -3,
  no_abnormal_vibration: -3,
  sensor_readings_in_range: -4,
  recent_maintenance_verified: -8,
  safety_signs_present: -2,
  good_ventilation: -3,
  drainage_clear: -2,
  site_clean_accessible: -2,
  no_repeated_tripping: -4,
  no_immediate_hazard: -3,
};

/** Severity multipliers applied to negative finding deltas */
const SEVERITY_MULTIPLIERS: Record<string, number> = {
  critical: 1.0,
  major: 0.85,
  moderate: 0.6,
  minor: 0.35,
};

function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val));
}

function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
}

// ── Step 1: Admin info delta ──────────────────────────────────

function computeAdminInfoDelta(alert: any): number {
  let delta = 0;
  if (alert.is_safety_concern) delta += 5;
  if (alert.priority === 'critical') delta += 8;
  else if (alert.priority === 'high') delta += 4;
  if (alert.severity === 'critical') delta += 8;
  else if (alert.severity === 'major') delta += 5;
  if (alert.affected_customer_count > 1000) delta += 4;
  return delta;
}

// ── Step 2: Arrival verification delta ───────────────────────

function computeArrivalDelta(arrival: any | null): number {
  if (!arrival) return 0;
  if (arrival.gps_status === 'gps_unavailable_exception') return 2; // slight uncertainty
  if (arrival.gps_status === 'mismatch_confirmed') return 1;
  return 0;
}

// ── Step 3: Negative findings delta ──────────────────────────

function computeNegativeFindingsDelta(
  findings: any[],
  criticalSafetyHit: Set<string>
): { delta: number; factors: FactorDetail[] } {
  const factors: FactorDetail[] = [];
  let delta = 0;

  for (const f of findings) {
    const baseDelta = NEGATIVE_FINDING_DELTAS[f.finding_code] ?? NEGATIVE_FINDING_DELTAS.other;
    const severityMult = SEVERITY_MULTIPLIERS[f.severity] ?? 0.6;
    const confidence = parseFloat(f.worker_confidence ?? '1.0');
    const impact = baseDelta * severityMult * confidence;

    delta += impact;

    if (CRITICAL_SAFETY_CODES.has(f.finding_code)) {
      criticalSafetyHit.add(f.finding_code);
    }

    factors.push({
      code: f.finding_code,
      label: f.finding_code.replace(/_/g, ' '),
      delta: impact,
      severity: f.severity,
      confidence,
    });
  }

  return { delta, factors };
}

// ── Step 4: Positive findings delta ──────────────────────────
// SAFETY OVERRIDE: if any critical safety condition is present,
// positive findings produce ZERO reduction — never cancel critical.

function computePositiveFindingsDelta(
  findings: any[],
  criticalSafetyHit: Set<string>
): { delta: number; factors: FactorDetail[]; overrideApplied: boolean; overrideReason: string | null } {
  const factors: FactorDetail[] = [];
  let delta = 0;
  let overrideApplied = false;
  let overrideReason: string | null = null;

  if (criticalSafetyHit.size > 0) {
    // Safety override: all positive reductions are zeroed
    overrideApplied = true;
    overrideReason = `Critical conditions present (${[...criticalSafetyHit].join(', ')}) — positive findings cannot reduce risk`;

    for (const f of findings) {
      if (f.verification_status !== 'verified_positive') continue;
      factors.push({
        code: f.finding_code,
        label: f.finding_code.replace(/_/g, ' ') + ' (overridden — critical safety floor)',
        delta: 0,
        confidence: parseFloat(f.worker_confidence ?? '1.0'),
      });
    }
    return { delta: 0, factors, overrideApplied, overrideReason };
  }

  for (const f of findings) {
    // Only 'verified_positive' can reduce risk (5-state enum rule from section 9)
    if (f.verification_status !== 'verified_positive') {
      factors.push({
        code: f.finding_code,
        label: f.finding_code.replace(/_/g, ' ') + ' (unverified — no risk reduction)',
        delta: 0,
      });
      continue;
    }

    const baseDelta = POSITIVE_FINDING_DELTAS[f.finding_code] ?? -2;
    const confidence = parseFloat(f.worker_confidence ?? '1.0');
    const impact = baseDelta * confidence; // negative number

    delta += impact;
    factors.push({
      code: f.finding_code,
      label: f.finding_code.replace(/_/g, ' '),
      delta: impact,
      confidence,
    });
  }

  return { delta, factors, overrideApplied, overrideReason };
}

// ── Step 5: Geo-tagged evidence images delta ──────────────────
// Well-documented evidence (arrival + multiple categories) reduces uncertainty

function computeEvidenceDelta(images: any[]): { delta: number; refs: EvidenceRef[] } {
  if (images.length === 0) return { delta: 2, refs: [] }; // missing evidence = slight risk increase

  const categories = new Set(images.map((i) => i.category));
  const hasArrival = categories.has('arrival');
  const hasProblem = categories.has('close_up_problem');
  const hasAfter = categories.has('after_correction');

  let delta = 0;
  if (!hasArrival) delta += 1;    // missing arrival photo = uncertainty
  if (!hasProblem) delta += 1;    // missing problem photo = less certainty
  if (hasAfter) delta -= 2;       // before+after evidence reduces residual risk

  const refs: EvidenceRef[] = images.slice(0, 5).map((i) => ({
    type: i.category,
    id: i.id,
    description: i.description ?? i.category,
  }));

  return { delta, refs };
}

// ── Step 6: Measurements delta ────────────────────────────────

function computeMeasurementsDelta(measurements: any[]): { delta: number; factors: FactorDetail[] } {
  const factors: FactorDetail[] = [];
  let delta = 0;

  for (const m of measurements) {
    if (!m.is_out_of_range) {
      delta -= 1; // in-range measurement = slight reassurance
      factors.push({
        code: m.measurement_type,
        label: `${m.name}: ${m.value} ${m.unit} (in range)`,
        delta: -1,
      });
    } else {
      const severity = m.out_of_range_direction === 'above' ? 4 : 3;
      delta += severity;
      factors.push({
        code: m.measurement_type,
        label: `${m.name}: ${m.value} ${m.unit} OUT OF RANGE`,
        delta: severity,
      });
    }
  }

  return { delta, factors };
}

// ── Step 7: Sensor readings delta ────────────────────────────

async function computeSensorDelta(assetId: string): Promise<{ delta: number }> {
  if (!assetId) return { delta: 0 };
  try {
    const readings = await query<any>(
      `SELECT sr.value, sr.is_outlier, sr.sensor_failed, sr.is_missing,
              ase.sensor_type, ase.min_normal, ase.max_normal
       FROM sensor_readings sr
       JOIN asset_sensors ase ON ase.id = sr.sensor_id
       WHERE sr.asset_id = $1
         AND sr.recorded_at > NOW() - INTERVAL '24 hours'
       ORDER BY sr.recorded_at DESC`,
      [assetId]
    );

    let delta = 0;
    for (const r of readings) {
      if (r.sensor_failed) { delta += 5; continue; }
      if (r.is_missing) { delta += 2; continue; }
      if (r.is_outlier) { delta += 4; continue; }
      if (r.min_normal != null && r.max_normal != null) {
        if (r.value < r.min_normal || r.value > r.max_normal) delta += 3;
        else delta -= 1;
      }
    }
    return { delta };
  } catch {
    return { delta: 0 };
  }
}

// ── Step 8: Weather delta ─────────────────────────────────────

async function computeWeatherDelta(districtId: string): Promise<{ delta: number }> {
  if (!districtId) return { delta: 0 };
  try {
    const rows = await query<any>(
      `SELECT * FROM weather_records WHERE district_id = $1
       ORDER BY recorded_at DESC LIMIT 1`,
      [districtId]
    );
    const w = rows[0];
    if (!w) return { delta: 0 };

    let delta = 0;
    if (w.extreme_weather_alert) delta += 10;
    if (w.flood_alert)           delta += 8;
    if (w.storm_alert)           delta += 6;
    if (w.lightning_risk)        delta += 5;
    if (w.heatwave_alert)        delta += 4;
    if (w.wind_speed_kmh > 80)   delta += 5;
    else if (w.wind_speed_kmh > 50) delta += 2;
    if (w.rainfall_mm > 100)     delta += 5;
    else if (w.rainfall_mm > 50) delta += 2;
    return { delta };
  } catch {
    return { delta: 0 };
  }
}

// ── Step 9: Historical incidents delta ───────────────────────

async function computeHistoricalDelta(assetId: string): Promise<{ delta: number }> {
  if (!assetId) return { delta: 0 };
  try {
    const incidents = await query<any>(
      `SELECT occurred_at, is_recurring FROM historical_incidents
       WHERE asset_id = $1 AND occurred_at > NOW() - INTERVAL '2 years'
       ORDER BY occurred_at DESC`,
      [assetId]
    );
    if (incidents.length === 0) return { delta: 0 };

    let delta = Math.min(incidents.length * 1.5, 12);
    if (incidents.some((i: any) => i.is_recurring)) delta += 5;
    return { delta };
  } catch {
    return { delta: 0 };
  }
}

// ── Step 10: Maintenance status delta ────────────────────────
// CORRECTIVE ACTION RULE: only admin_approved_completion = TRUE triggers reduction

async function computeMaintenanceDelta(alertId: string): Promise<{ delta: number }> {
  if (!alertId) return { delta: 0 };
  try {
    const actions = await query<any>(
      `SELECT admin_approved_completion, worker_confirmation, after_photo_id,
               post_repair_measurement_id
       FROM alert_corrective_actions
       WHERE alert_id = $1`,
      [alertId]
    );

    let delta = 0;
    for (const a of actions) {
      if (a.admin_approved_completion) {
        // Verified completion with evidence
        const evidenceCount =
          (a.after_photo_id ? 1 : 0) + (a.post_repair_measurement_id ? 1 : 0) + (a.worker_confirmation ? 1 : 0);
        delta -= Math.min(evidenceCount * 3, 10); // up to -10 for full evidence set
      }
      // If marked complete but NOT admin approved — NO reduction
    }
    return { delta };
  } catch {
    return { delta: 0 };
  }
}

// ── Main pipeline function ────────────────────────────────────

export async function computeAlertRisk(params: {
  alertId: string;
  reportId?: string | null;
  assetId?: string | null;
}): Promise<AlertRiskPipelineResult> {
  const { alertId, reportId, assetId } = params;

  // Load alert
  const alertRows = await query<any>(`SELECT * FROM alerts WHERE id = $1`, [alertId]);
  if (!alertRows[0]) throw new Error(`Alert ${alertId} not found`);
  const alert = alertRows[0];

  // Current asset risk score = "Risk Before Alert"
  let scoreBefore = alert.current_risk_score ?? 0;
  if (assetId) {
    const assetRows = await query<any>(
      `SELECT current_risk_score FROM assets WHERE id = $1`,
      [assetId]
    );
    if (assetRows[0]) scoreBefore = assetRows[0].current_risk_score ?? scoreBefore;
  }
  const levelBefore = riskLevelFromScore(scoreBefore);

  // Load report data (if available)
  let negativeFindingsRows: any[] = [];
  let positiveFindingsRows: any[] = [];
  let imagesRows: any[] = [];
  let measurementsRows: any[] = [];
  let arrivalRow: any = null;

  if (reportId) {
    [negativeFindingsRows, positiveFindingsRows, imagesRows, measurementsRows, arrivalRow] =
      await Promise.all([
        query<any>(
          `SELECT * FROM negative_findings WHERE report_id = $1`,
          [reportId]
        ),
        query<any>(
          `SELECT * FROM positive_findings WHERE report_id = $1`,
          [reportId]
        ),
        query<any>(
          `SELECT * FROM geo_tagged_images WHERE alert_id = $1`,
          [alertId]
        ),
        query<any>(
          `SELECT * FROM measurement_records WHERE report_id = $1`,
          [reportId]
        ),
        query<any>(
          `SELECT * FROM worker_arrival_records WHERE alert_id = $1
           ORDER BY arrived_at DESC LIMIT 1`,
          [alertId]
        ).then((r) => r[0] ?? null),
      ]);
  }

  // ── Run pipeline steps ────────────────────────────────────────

  const criticalSafetyHit = new Set<string>();

  // Step 1
  const adminInfoDelta = computeAdminInfoDelta(alert);

  // Step 2
  const arrivalVerificationDelta = computeArrivalDelta(arrivalRow);

  // Step 3
  const { delta: negativeFindingsDelta, factors: negFactors } =
    computeNegativeFindingsDelta(negativeFindingsRows, criticalSafetyHit);

  // Step 4 — safety override checked against Step 3's critical hits
  const {
    delta: positiveFindingsDelta,
    factors: posFactors,
    overrideApplied: safetyOverrideApplied,
    overrideReason: safetyOverrideReason,
  } = computePositiveFindingsDelta(positiveFindingsRows, criticalSafetyHit);

  // Step 5
  const { delta: evidenceImagesDelta, refs: evidenceRefs } =
    computeEvidenceDelta(imagesRows);

  // Step 6
  const { delta: measurementsDelta, factors: measFactors } =
    computeMeasurementsDelta(measurementsRows);

  // Steps 7–10 (async)
  const effectiveAssetId = assetId ?? alert.linked_asset_id;
  const [
    { delta: sensorReadingsDelta },
    { delta: weatherDelta },
    { delta: historicalIncidentsDelta },
    { delta: maintenanceStatusDelta },
  ] = await Promise.all([
    computeSensorDelta(effectiveAssetId),
    computeWeatherDelta(alert.district_id),
    computeHistoricalDelta(effectiveAssetId),
    computeMaintenanceDelta(alertId),
  ]);

  // ── Sum pipeline ─────────────────────────────────────────────
  const rawFinal =
    scoreBefore +
    adminInfoDelta +
    arrivalVerificationDelta +
    negativeFindingsDelta +
    positiveFindingsDelta +
    evidenceImagesDelta +
    measurementsDelta +
    sensorReadingsDelta +
    weatherDelta +
    historicalIncidentsDelta +
    maintenanceStatusDelta;

  let finalScore = clamp(Math.round(rawFinal));

  // ── Safety override floor ─────────────────────────────────────
  // If critical safety conditions are present, score cannot fall below 75
  if (criticalSafetyHit.size > 0 && finalScore < 75) {
    finalScore = 75;
  }

  const finalLevel = riskLevelFromScore(finalScore);
  const scoreDelta = finalScore - scoreBefore;

  // ── Missing information flags ─────────────────────────────────
  const missingInformation: string[] = [];
  if (!reportId) missingInformation.push('no_field_report_yet');
  if (imagesRows.length === 0) missingInformation.push('no_evidence_images');
  if (measurementsRows.length === 0) missingInformation.push('no_measurements');
  if (!arrivalRow) missingInformation.push('no_arrival_record');

  // ── Confidence ────────────────────────────────────────────────
  const evidenceCount =
    (negativeFindingsRows.length > 0 ? 1 : 0) +
    (positiveFindingsRows.length > 0 ? 1 : 0) +
    (imagesRows.length > 0 ? 1 : 0) +
    (measurementsRows.length > 0 ? 1 : 0) +
    (arrivalRow ? 1 : 0);
  const confidence = clamp(0.4 + evidenceCount * 0.12, 0.1, 1.0);

  const allFactors = [...negFactors, ...posFactors, ...measFactors];

  const result: AlertRiskPipelineResult = {
    scoreBefore,
    levelBefore,
    adminInfoDelta,
    arrivalVerificationDelta,
    negativeFindingsDelta,
    positiveFindingsDelta,
    evidenceImagesDelta,
    measurementsDelta,
    sensorReadingsDelta,
    weatherDelta,
    historicalIncidentsDelta,
    maintenanceStatusDelta,
    finalScore,
    finalLevel,
    scoreDelta,
    safetyOverrideApplied,
    safetyOverrideReason,
    positiveFactors: allFactors.filter((f) => f.delta < 0),
    negativeFactors: allFactors.filter((f) => f.delta > 0),
    evidenceUsed: evidenceRefs,
    missingInformation,
    confidence,
    modelVersion: MODEL_VERSION,
    calculatedAt: new Date().toISOString(),
  };

  return result;
}

// ── Persist to risk_score_history ────────────────────────────

export async function persistAlertRiskHistory(params: {
  assetId: string;
  alertId: string;
  reportId?: string | null;
  result: AlertRiskPipelineResult;
  reviewedBy?: string | null;
}): Promise<string> {
  const id = uuidv4();
  await query(
    `INSERT INTO risk_score_history (
      id, asset_id, alert_id, report_id,
      score_before_alert,
      admin_info_delta, arrival_verification_delta,
      negative_findings_delta, positive_findings_delta,
      evidence_images_delta, measurements_delta,
      sensor_readings_delta, weather_delta,
      historical_incidents_delta, maintenance_status_delta,
      final_score, final_level, score_delta, previous_level,
      safety_override_applied, safety_override_reason,
      positive_factors, negative_factors, evidence_used,
      missing_information, confidence, model_version,
      calculated_at, review_status, reviewed_by
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
      $16,$17::risk_level,$18,$19::risk_level,$20,$21,
      $22,$23,$24,$25,$26,$27,$28,$29,$30
    )`,
    [
      id,
      params.assetId,
      params.alertId,
      params.reportId ?? null,
      params.result.scoreBefore,
      params.result.adminInfoDelta,
      params.result.arrivalVerificationDelta,
      params.result.negativeFindingsDelta,
      params.result.positiveFindingsDelta,
      params.result.evidenceImagesDelta,
      params.result.measurementsDelta,
      params.result.sensorReadingsDelta,
      params.result.weatherDelta,
      params.result.historicalIncidentsDelta,
      params.result.maintenanceStatusDelta,
      params.result.finalScore,
      params.result.finalLevel,
      params.result.scoreDelta,
      params.result.levelBefore,
      params.result.safetyOverrideApplied,
      params.result.safetyOverrideReason,
      JSON.stringify(params.result.positiveFactors),
      JSON.stringify(params.result.negativeFactors),
      JSON.stringify(params.result.evidenceUsed),
      params.result.missingInformation,
      params.result.confidence,
      params.result.modelVersion,
      params.result.calculatedAt,
      params.reviewedBy ? 'admin_verified' : 'pending',
      params.reviewedBy ?? null,
    ]
  );
  return id;
}

// ── Apply updated score to asset ──────────────────────────────

export async function applyAlertRiskToAsset(
  assetId: string,
  result: AlertRiskPipelineResult
): Promise<void> {
  await query(
    `UPDATE assets
     SET current_risk_score = $1, current_risk_level = $2::risk_level, updated_at = NOW()
     WHERE id = $3`,
    [result.finalScore, result.finalLevel, assetId]
  );
  logger.info(
    `[AlertRisk] Asset ${assetId}: ${result.scoreBefore} → ${result.finalScore} ` +
    `(${result.levelBefore} → ${result.finalLevel}) Δ${result.scoreDelta > 0 ? '+' : ''}${result.scoreDelta}`
  );
}
