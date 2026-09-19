/**
 * NEXORA AI — Maintenance Prioritization & Crew Planning Service
 */

import { query } from '../database/db';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface MaintenancePriorityItem {
  rank: number;
  assetId: string;
  assetCode: string;
  stateId: string;
  districtId: string;
  riskScore: number;
  riskLevel: string;
  mainContributingFactors: string[];
  failureProbability: number;
  gridImpactSeverity: number;
  recommendedAction: string;
  requiredSkill: string;
  recommendedWorkerIds: string[];
  requiredTools: string;
  suggestedCompletionDate: string;
  suggestedCrewArea: string;
  approvalStatus: string;
}

export const maintenanceService = {
  /**
   * Generate a prioritized maintenance queue for a state or all states.
   * Ranking uses: risk score × 0.4 + grid_impact × 0.3 + failure_probability × 0.2 + urgency × 0.1
   */
  async generatePriorityQueue(
    stateId?: string,
    districtId?: string
  ): Promise<MaintenancePriorityItem[]> {
    const conditions: string[] = ['a.is_active = TRUE'];
    const params: unknown[] = [];
    let p = 1;

    if (stateId) {
      conditions.push(`a.state_id = $${p++}`);
      params.push(stateId);
    }
    if (districtId) {
      conditions.push(`a.district_id = $${p++}`);
      params.push(districtId);
    }
    const where = conditions.join(' AND ');

    const assets = await query<any>(
      `SELECT a.id, a.asset_code, a.state_id, a.district_id,
              a.current_risk_score, a.current_risk_level,
              a.connected_customers, a.current_load_kw, a.rated_capacity_kva,
              a.asset_type,
              rp.failure_probability, rp.grid_impact_severity,
              rp.top_factors, rp.maintenance_urgency, rp.explanation
       FROM assets a
       LEFT JOIN LATERAL (
         SELECT * FROM risk_predictions
         WHERE asset_id = a.id
         ORDER BY created_at DESC LIMIT 1
       ) rp ON TRUE
       WHERE ${where}
       ORDER BY a.current_risk_score DESC
       LIMIT 200`,
      params
    );

    const urgencyMap: Record<string, number> = {
      immediate: 100, urgent: 75, scheduled: 50, routine: 25,
    };

    const scored = assets.map((a: any) => {
      const riskScore = parseFloat(a.current_risk_score ?? 0);
      const gridImpact = parseFloat(a.grid_impact_severity ?? 0);
      const failureProb = parseFloat(a.failure_probability ?? 0) * 100;
      const urgencyScore = urgencyMap[a.maintenance_urgency ?? 'routine'] ?? 25;

      const priorityScore =
        riskScore * 0.4 +
        gridImpact * 0.3 +
        failureProb * 0.2 +
        urgencyScore * 0.1;

      return { ...a, priorityScore };
    });

    scored.sort((a: any, b: any) => b.priorityScore - a.priorityScore);

    return scored.slice(0, 50).map((a: any, idx: number) => {
      const topFactors = a.top_factors
        ? (typeof a.top_factors === 'string' ? JSON.parse(a.top_factors) : a.top_factors)
            .slice(0, 3)
            .map((f: any) => f.factor ?? f.description ?? 'Unknown factor')
        : [];

      return {
        rank: idx + 1,
        assetId: a.id,
        assetCode: a.asset_code,
        stateId: a.state_id,
        districtId: a.district_id,
        riskScore: parseFloat(a.current_risk_score ?? 0),
        riskLevel: a.current_risk_level ?? 'low',
        mainContributingFactors: topFactors,
        failureProbability: parseFloat(a.failure_probability ?? 0),
        gridImpactSeverity: parseFloat(a.grid_impact_severity ?? 0),
        recommendedAction: resolveRecommendedAction(a),
        requiredSkill: resolveRequiredSkill(a.asset_type),
        recommendedWorkerIds: [],  // filled in crew assignment step
        requiredTools: resolveRequiredTools(a.asset_type),
        suggestedCompletionDate: computeSuggestedDate(a.maintenance_urgency),
        suggestedCrewArea: `${a.district_id}`,
        approvalStatus: 'ai_recommended',
      } as MaintenancePriorityItem;
    });
  },

  /**
   * Find qualified workers for a maintenance task.
   * Respects: qualifications, residence state/district priority,
   * district capacity, availability.
   * NEVER auto-assigns a worker to a high-risk task without admin approval.
   */
  async findQualifiedWorkers(
    assetId: string,
    requiredSkill: string,
    stateId: string,
    districtId: string
  ): Promise<any[]> {
    // Priority order: own district → nearby district same state → other district in-state
    const workers = await query<any>(
      `SELECT wp.id, wp.full_name, wp.field_of_work,
              wp.state_id, wp.district_id,
              wp.assigned_state_id, wp.assigned_district_id,
              wp.travel_willing, wp.work_radius_km,
              CASE
                WHEN wp.district_id = $1 THEN 1
                WHEN wp.state_id = $2    THEN 2
                ELSE                          3
              END AS priority_order
       FROM worker_profiles wp
       WHERE wp.status = 'employed'
         AND wp.is_active = TRUE
         AND (wp.field_of_work = $3 OR wp.field_of_work IS NULL)
         AND (wp.state_id = $2 OR wp.assigned_state_id = $2)
       ORDER BY priority_order, wp.full_name
       LIMIT 10`,
      [districtId, stateId, requiredSkill]
    );

    // Check district capacity
    const capacityChecked = await Promise.all(
      workers.map(async (w: any) => {
        const assignments = await query<any>(
          `SELECT COUNT(*) AS cnt FROM crew_assignments ca
           JOIN maintenance_plans mp ON mp.id = ca.plan_id
           WHERE ca.worker_id = $1
             AND mp.status NOT IN ('completed','rejected')`,
          [w.id]
        );
        const capacity = parseInt(assignments[0]?.cnt ?? '0', 10);
        return { ...w, currentAssignments: capacity, atCapacity: capacity >= 5 };
      })
    );

    return capacityChecked.filter((w: any) => !w.atCapacity);
  },

  /**
   * Create a maintenance plan from a risk prediction.
   */
  async createPlanFromPrediction(
    prediction: any,
    asset: any
  ): Promise<string> {
    const planId = uuidv4();
    const planCode = `MP-${Date.now().toString(36).toUpperCase()}`;

    await query(
      `INSERT INTO maintenance_plans
         (id, plan_code, asset_id, state_id, district_id,
          risk_score, risk_level, main_contributing_factors,
          failure_probability, grid_impact_severity, recommended_action,
          required_skill, required_tools, suggested_completion_date,
          status)
       VALUES ($1,$2,$3,$4,$5,$6,$7::risk_level,$8,$9,$10,$11,$12,$13,$14,'ai_recommended')`,
      [
        planId,
        planCode,
        asset.id,
        asset.state_id,
        asset.district_id,
        prediction.riskScore,
        prediction.riskLevel,
        JSON.stringify(prediction.topFactors.slice(0, 5)),
        prediction.failureProbability,
        prediction.gridImpactSeverity,
        resolveRecommendedAction(asset),
        resolveRequiredSkill(asset.asset_type),
        resolveRequiredTools(asset.asset_type),
        computeSuggestedDate(prediction.maintenanceUrgency),
      ]
    );

    logger.info(`[Maintenance] Created plan ${planCode} for asset ${asset.asset_code}`);
    return planId;
  },
};

function resolveRecommendedAction(asset: any): string {
  const level = asset.current_risk_level ?? 'low';
  if (level === 'critical') return 'Immediate inspection and isolation required — do not restore without engineer sign-off';
  if (level === 'high')     return 'Priority inspection required — schedule within 48 hours';
  if (level === 'moderate') return 'Scheduled maintenance — inspect within 2 weeks';
  return 'Routine maintenance — inspect at next scheduled cycle';
}

function resolveRequiredSkill(assetType: string): string {
  const skillMap: Record<string, string> = {
    transformer: 'electrical_engineering',
    substation_equipment: 'electrical_engineering',
    switchgear: 'electrical_engineering',
    feeder: 'electrical_engineering',
    cable_line: 'electrical_engineering',
    distribution_panel: 'electrical_engineering',
    generator: 'mechanical_engineering',
    pole_mounted: 'civil_engineering',
    appliance: 'electrical_engineering',
    other: 'electrical_engineering',
  };
  return skillMap[assetType] ?? 'electrical_engineering';
}

function resolveRequiredTools(assetType: string): string {
  const toolMap: Record<string, string> = {
    transformer: 'Thermal camera, insulation tester, oil sample kit, multimeter',
    substation_equipment: 'Circuit breaker tester, thermal camera, PPE Class 3',
    pole_mounted: 'Climbing equipment, torque wrench, insulation tester',
    cable_line: 'Cable fault locator, insulation tester, multimeter',
    default: 'Multimeter, insulation tester, PPE, camera',
  };
  return toolMap[assetType] ?? toolMap.default;
}

function computeSuggestedDate(urgency?: string): string {
  const daysMap: Record<string, number> = {
    immediate: 0,
    urgent: 2,
    scheduled: 14,
    routine: 90,
  };
  const days = daysMap[urgency ?? 'routine'] ?? 90;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
