/**
 * NEXORA AI — Alert Assignment / Worker Recommendation Service
 *
 * Ranks candidate Workers for a given alert following the exact
 * priority order specified in the product spec (section 4):
 *
 *  1. Qualified Worker in same village / local area
 *  2. Same taluka
 *  3. Nearby taluka, same district
 *  4. Nearby district, same state
 *  5. Another district in-state (only when local capacity is full)
 *  6. Another state — only with explicit Super Admin authorization
 *
 * Each candidate receives a scored explanation that is stored in
 * alert_assignments.recommendation_reasons so the State Admin can
 * see exactly why a worker was recommended.
 */

import { query } from '../database/db';
import { logger } from '../utils/logger';

// ── Types ─────────────────────────────────────────────────────

export interface AlertGeo {
  stateId: string;
  districtId?: string | null;
  talukaId?: string | null;
  villageId?: string | null;
  lat?: number | null;
  lng?: number | null;
  requiredField?: string | null;          // field_of_work
  requiredQualification?: string | null;
  recommendedResponseDeadline?: string | null;
}

export interface WorkerCandidate {
  workerId: string;
  workerName: string;
  email: string;
  mobile: string;
  fieldOfWork: string;
  qualifications: string[];
  safetyCerts: string[];
  status: string;
  stateId: string;
  districtId: string;
  talukaId?: string | null;
  villageId?: string | null;
  workerLat?: number | null;
  workerLng?: number | null;
  activeAssignmentCount: number;
  districtCapacityLimit: number;
  districtCurrentLoad: number;
}

export interface RecommendationReason {
  code: string;
  label: string;
  score: number;
}

export interface WorkerRecommendation {
  rank: number;
  worker: WorkerCandidate;
  totalScore: number;
  reasons: RecommendationReason[];
  geoPriorityTier: 1 | 2 | 3 | 4 | 5 | 6;
  requiresCrossStateAuth: boolean;
  estimatedTravelMinutes?: number;
  canMeetDeadline: boolean;
}

// ── Scoring constants ──────────────────────────────────────────

const GEO_SCORES = {
  SAME_VILLAGE: 100,
  SAME_TALUKA: 80,
  NEARBY_TALUKA_SAME_DISTRICT: 60,
  NEARBY_DISTRICT_SAME_STATE: 40,
  ANOTHER_DISTRICT_IN_STATE: 20,
  ANOTHER_STATE: 0, // requires Super Admin auth — listed last
} as const;

const FIELD_MATCH_SCORE = 30;
const AVAILABILITY_SCORE = 20;
const LOW_WORKLOAD_SCORE = 15;
const SAFETY_CERT_SCORE = 10;
const DEADLINE_FEASIBLE_SCORE = 10;

// Travel speed estimate (km/h) used for rough time estimate
const ASSUMED_TRAVEL_SPEED_KMH = 40;

// ── Haversine distance ────────────────────────────────────────

function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Fetch candidates ──────────────────────────────────────────

async function fetchCandidates(
  alertGeo: AlertGeo,
  includeCrossState = false
): Promise<WorkerCandidate[]> {
  const stateFilter = includeCrossState ? '' : `AND wp.assigned_state_id = $1`;

  const rows = await query<any>(
    `SELECT
        wp.id              AS worker_id,
        wp.full_name       AS worker_name,
        wp.email,
        wp.mobile,
        wp.field_of_work,
        wp.assigned_state_id  AS state_id,
        wp.assigned_district_id AS district_id,
        wp.taluka_id,
        wp.village_id,
        wp.location_lat    AS worker_lat,
        wp.location_lng    AS worker_lng,
        -- qualifications aggregated
        COALESCE(
          array_agg(DISTINCT wq.level) FILTER (WHERE wq.level IS NOT NULL),
          '{}'
        )                  AS qualifications,
        -- safety certs aggregated
        COALESCE(
          array_agg(DISTINCT we.safety_certs) FILTER (WHERE we.safety_certs IS NOT NULL),
          '{}'
        )                  AS safety_certs,
        wp.status,
        -- active assignment count
        (
          SELECT COUNT(*) FROM alert_assignments aa2
          WHERE aa2.worker_id = wp.id
            AND aa2.is_active = TRUE
            AND aa2.acceptance_status IN ('pending','accepted')
        )                  AS active_assignment_count,
        d.worker_capacity_limit AS district_capacity_limit,
        (
          SELECT COUNT(*) FROM alert_assignments aa3
          JOIN alerts al3 ON al3.id = aa3.alert_id
          WHERE al3.district_id = wp.assigned_district_id
            AND aa3.is_active = TRUE
            AND aa3.acceptance_status IN ('pending','accepted')
        )                  AS district_current_load
     FROM worker_profiles wp
     LEFT JOIN worker_qualifications wq ON wq.worker_id = wp.id
     LEFT JOIN worker_experience we     ON we.worker_id  = wp.id
     LEFT JOIN districts d              ON d.id = wp.assigned_district_id
     WHERE wp.status = 'employed'
       AND wp.is_active = TRUE
       ${stateFilter}
     GROUP BY wp.id, d.worker_capacity_limit`,
    includeCrossState ? [] : [alertGeo.stateId]
  );

  return rows.map((r: any) => ({
    workerId: r.worker_id,
    workerName: r.worker_name,
    email: r.email,
    mobile: r.mobile,
    fieldOfWork: r.field_of_work,
    qualifications: r.qualifications ?? [],
    safetyCerts: r.safety_certs ?? [],
    status: r.status,
    stateId: r.state_id,
    districtId: r.district_id,
    talukaId: r.taluka_id ?? null,
    villageId: r.village_id ?? null,
    workerLat: r.worker_lat ?? null,
    workerLng: r.worker_lng ?? null,
    activeAssignmentCount: parseInt(r.active_assignment_count ?? '0', 10),
    districtCapacityLimit: parseInt(r.district_capacity_limit ?? '50', 10),
    districtCurrentLoad: parseInt(r.district_current_load ?? '0', 10),
  }));
}

// ── Determine if local district capacity is full ──────────────

function isLocalCapacityFull(
  candidates: WorkerCandidate[],
  alertGeo: AlertGeo
): boolean {
  const localWorkers = candidates.filter(
    (c) => c.districtId === alertGeo.districtId
  );
  if (localWorkers.length === 0) return true;
  const cap = localWorkers[0].districtCapacityLimit;
  const load = localWorkers[0].districtCurrentLoad;
  return load >= cap;
}

// ── Score a single candidate ──────────────────────────────────

function scoreCandidate(
  worker: WorkerCandidate,
  alertGeo: AlertGeo,
  localCapacityFull: boolean
): { score: number; reasons: RecommendationReason[]; tier: 1 | 2 | 3 | 4 | 5 | 6 } {
  const reasons: RecommendationReason[] = [];
  let score = 0;
  let tier: 1 | 2 | 3 | 4 | 5 | 6 = 6;

  // ── Geographic tier ──────────────────────────────────────────
  if (worker.stateId !== alertGeo.stateId) {
    // Tier 6 — another state, only with Super Admin auth
    tier = 6;
    score += GEO_SCORES.ANOTHER_STATE;
    reasons.push({ code: 'geo_another_state', label: 'Worker from another state (requires Super Admin auth)', score: GEO_SCORES.ANOTHER_STATE });
  } else if (alertGeo.villageId && worker.villageId === alertGeo.villageId) {
    tier = 1;
    score += GEO_SCORES.SAME_VILLAGE;
    reasons.push({ code: 'geo_same_village', label: 'Worker based in the same village/local area', score: GEO_SCORES.SAME_VILLAGE });
  } else if (alertGeo.talukaId && worker.talukaId === alertGeo.talukaId) {
    tier = 2;
    score += GEO_SCORES.SAME_TALUKA;
    reasons.push({ code: 'geo_same_taluka', label: 'Worker based in the same taluka', score: GEO_SCORES.SAME_TALUKA });
  } else if (alertGeo.districtId && worker.districtId === alertGeo.districtId) {
    // Tier 3: nearby taluka, same district
    tier = 3;
    score += GEO_SCORES.NEARBY_TALUKA_SAME_DISTRICT;
    reasons.push({ code: 'geo_same_district', label: 'Worker in the same district (nearby taluka)', score: GEO_SCORES.NEARBY_TALUKA_SAME_DISTRICT });
  } else if (worker.stateId === alertGeo.stateId && !localCapacityFull) {
    // Tier 4: nearby district, same state, capacity available
    tier = 4;
    score += GEO_SCORES.NEARBY_DISTRICT_SAME_STATE;
    reasons.push({ code: 'geo_nearby_district', label: 'Worker in nearby district, same state', score: GEO_SCORES.NEARBY_DISTRICT_SAME_STATE });
  } else if (worker.stateId === alertGeo.stateId && localCapacityFull) {
    // Tier 5: another district in-state, local capacity full
    tier = 5;
    score += GEO_SCORES.ANOTHER_DISTRICT_IN_STATE;
    reasons.push({ code: 'geo_instate_capacity_full', label: 'Worker from another district (local capacity full)', score: GEO_SCORES.ANOTHER_DISTRICT_IN_STATE });
  }

  // ── Field of work match ──────────────────────────────────────
  if (alertGeo.requiredField && worker.fieldOfWork === alertGeo.requiredField) {
    score += FIELD_MATCH_SCORE;
    reasons.push({ code: 'field_match', label: `Field matches required: ${alertGeo.requiredField}`, score: FIELD_MATCH_SCORE });
  }

  // ── Availability / workload ──────────────────────────────────
  if (worker.activeAssignmentCount === 0) {
    score += AVAILABILITY_SCORE;
    reasons.push({ code: 'fully_available', label: 'No active assignments — fully available', score: AVAILABILITY_SCORE });
  } else if (worker.activeAssignmentCount <= 2) {
    const partial = Math.round(AVAILABILITY_SCORE * 0.5);
    score += partial;
    reasons.push({ code: 'low_workload', label: `Low current workload (${worker.activeAssignmentCount} active)`, score: partial });
  }

  // ── Workload bonus ───────────────────────────────────────────
  if (worker.activeAssignmentCount <= 1) {
    score += LOW_WORKLOAD_SCORE;
    reasons.push({ code: 'low_workload_bonus', label: 'Low workload — available for priority assignment', score: LOW_WORKLOAD_SCORE });
  }

  // ── Safety certification ─────────────────────────────────────
  if (worker.safetyCerts.some((c) => c && c.trim() !== '')) {
    score += SAFETY_CERT_SCORE;
    reasons.push({ code: 'safety_cert', label: 'Has valid safety certification', score: SAFETY_CERT_SCORE });
  }

  // ── Travel time / deadline feasibility ──────────────────────
  let estimatedTravelMinutes: number | undefined;
  let canMeetDeadline = true;

  if (
    alertGeo.lat != null && alertGeo.lng != null &&
    worker.workerLat != null && worker.workerLng != null
  ) {
    const distKm = haversineKm(
      worker.workerLat, worker.workerLng,
      alertGeo.lat, alertGeo.lng
    );
    estimatedTravelMinutes = Math.round((distKm / ASSUMED_TRAVEL_SPEED_KMH) * 60);

    if (alertGeo.recommendedResponseDeadline) {
      const deadlineMs = new Date(alertGeo.recommendedResponseDeadline).getTime();
      const nowMs = Date.now();
      const availableMinutes = (deadlineMs - nowMs) / 60000;
      canMeetDeadline = availableMinutes >= estimatedTravelMinutes;
      if (canMeetDeadline) {
        score += DEADLINE_FEASIBLE_SCORE;
        reasons.push({
          code: 'deadline_feasible',
          label: `Estimated travel ~${estimatedTravelMinutes} min — can meet deadline`,
          score: DEADLINE_FEASIBLE_SCORE,
        });
      } else {
        reasons.push({
          code: 'deadline_at_risk',
          label: `Estimated travel ~${estimatedTravelMinutes} min — deadline may be missed`,
          score: 0,
        });
      }
    }
  }

  return { score, reasons, tier };
}

// ── Main recommendation function ──────────────────────────────

export async function recommendWorkersForAlert(
  alertGeo: AlertGeo,
  maxResults = 10
): Promise<WorkerRecommendation[]> {
  try {
    // Fetch in-state candidates first
    const inStateCandidates = await fetchCandidates(alertGeo, false);
    const localCapacityFull = isLocalCapacityFull(inStateCandidates, alertGeo);

    // If local capacity full, also fetch cross-state candidates
    // (but those will be tier 6 and require Super Admin auth)
    let allCandidates = inStateCandidates;
    if (localCapacityFull) {
      const crossState = await fetchCandidates(alertGeo, true);
      // Add cross-state workers not already included
      const inStateIds = new Set(inStateCandidates.map((c) => c.workerId));
      allCandidates = [
        ...inStateCandidates,
        ...crossState.filter((c) => !inStateIds.has(c.workerId)),
      ];
    }

    const scored: WorkerRecommendation[] = allCandidates
      .map((worker) => {
        const { score, reasons, tier } = scoreCandidate(worker, alertGeo, localCapacityFull);
        return {
          rank: 0,
          worker,
          totalScore: score,
          reasons,
          geoPriorityTier: tier,
          requiresCrossStateAuth: tier === 6,
          canMeetDeadline: true,
        } satisfies WorkerRecommendation;
      })
      // Sort: tier ascending (1=best), then score descending
      .sort((a, b) =>
        a.geoPriorityTier !== b.geoPriorityTier
          ? a.geoPriorityTier - b.geoPriorityTier
          : b.totalScore - a.totalScore
      )
      .slice(0, maxResults)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    return scored;
  } catch (err) {
    logger.error('[AlertAssignment] recommendWorkersForAlert error:', err);
    return [];
  }
}

// ── Record assignment ─────────────────────────────────────────

export async function recordAssignment(params: {
  alertId: string;
  workerId: string;
  assignedBy: string;
  assignmentReason: string;
  recommendationRank: number;
  recommendationReasons: RecommendationReason[];
  expectedArrivalAt?: string | null;
  expectedReportBy?: string | null;
  supersededAssignmentId?: string | null;
  reassignmentReason?: string | null;
}): Promise<string> {
  const { v4: uuidv4 } = await import('uuid');
  const id = uuidv4();

  // Deactivate any existing active assignment for this alert
  await query(
    `UPDATE alert_assignments
     SET is_active = FALSE,
         superseded_by = $1
     WHERE alert_id = $2 AND is_active = TRUE`,
    [id, params.alertId]
  );

  await query(
    `INSERT INTO alert_assignments
       (id, alert_id, worker_id, assigned_by, assigned_at,
        assignment_reason, recommendation_rank, recommendation_reasons,
        expected_arrival_at, expected_report_by,
        acceptance_status, is_active, reassignment_reason)
     VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8,$9,'pending',TRUE,$10)`,
    [
      id,
      params.alertId,
      params.workerId,
      params.assignedBy,
      params.assignmentReason,
      params.recommendationRank,
      JSON.stringify(params.recommendationReasons),
      params.expectedArrivalAt ?? null,
      params.expectedReportBy ?? null,
      params.reassignmentReason ?? null,
    ]
  );

  return id;
}

// ── Haversine export (used in arrival route) ──────────────────
export { haversineKm };
