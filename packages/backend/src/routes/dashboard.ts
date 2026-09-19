import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { query } from '../database/db';

export const dashboardRouter = Router();

// ── Super Admin Dashboard ──────────────────────────────────────
dashboardRouter.get('/super-admin', authenticate, requireRole('super_admin'), async (_req, res) => {
  const [
    assetCounts, criticalAssets, openComplaints,
    pendingInspections, workerCounts, weatherAlerts,
    maintenanceQueue, recentPredictions,
  ] = await Promise.all([
    query<any>(`
      SELECT current_risk_level, COUNT(*) AS count
      FROM assets WHERE is_active = TRUE
      GROUP BY current_risk_level
    `),
    query<any>(`
      SELECT a.id, a.asset_code, a.asset_type, a.current_risk_score,
             s.name AS state_name, d.name AS district_name
      FROM assets a
      JOIN states s ON s.id = a.state_id
      JOIN districts d ON d.id = a.district_id
      WHERE a.current_risk_level = 'critical' AND a.is_active = TRUE
      ORDER BY a.current_risk_score DESC LIMIT 10
    `),
    query<any>(`
      SELECT status, COUNT(*) AS count FROM complaints GROUP BY status
    `),
    query<any>(`
      SELECT COUNT(*) AS count FROM inspection_tasks
      WHERE status IN ('draft','submitted','under_review')
    `),
    query<any>(`
      SELECT status, COUNT(*) AS count FROM worker_profiles GROUP BY status
    `),
    query<any>(`
      SELECT d.name AS district, w.extreme_weather_alert, w.flood_alert,
             w.storm_alert, w.heatwave_alert, w.temperature_c
      FROM weather_records w
      JOIN districts d ON d.id = w.district_id
      WHERE w.recorded_at > NOW() - INTERVAL '12 hours'
        AND (w.extreme_weather_alert OR w.flood_alert OR w.storm_alert OR w.heatwave_alert)
      ORDER BY w.recorded_at DESC LIMIT 20
    `),
    query<any>(`
      SELECT a.asset_code, a.current_risk_score, a.current_risk_level,
             mp.recommended_action, mp.status AS plan_status,
             s.name AS state_name
      FROM maintenance_plans mp
      JOIN assets a ON a.id = mp.asset_id
      JOIN states s ON s.id = mp.state_id
      WHERE mp.status NOT IN ('completed','rejected')
      ORDER BY a.current_risk_score DESC LIMIT 15
    `),
    query<any>(`
      SELECT rp.risk_score, rp.score_delta, rp.explanation, rp.created_at,
             a.asset_code, a.current_risk_level, s.name AS state_name
      FROM risk_predictions rp
      JOIN assets a ON a.id = rp.asset_id
      JOIN states s ON s.id = rp.state_id
      WHERE rp.human_review_status = 'pending'
      ORDER BY rp.risk_score DESC LIMIT 10
    `),
  ]);

  // Risk distribution by state — LEFT JOIN so states with 0 assets still appear
  const stateRisk = await query<any>(`
    SELECT s.name AS state_name,
           COUNT(a.*) AS total,
           SUM(CASE WHEN a.current_risk_level = 'critical' THEN 1 ELSE 0 END) AS critical,
           SUM(CASE WHEN a.current_risk_level = 'high'     THEN 1 ELSE 0 END) AS high,
           SUM(CASE WHEN a.current_risk_level = 'moderate' THEN 1 ELSE 0 END) AS moderate,
           SUM(CASE WHEN a.current_risk_level = 'low'      THEN 1 ELSE 0 END) AS low
    FROM states s
    LEFT JOIN assets a ON a.state_id = s.id AND a.is_active = TRUE
    WHERE s.is_active = TRUE
    GROUP BY s.name
    ORDER BY critical DESC NULLS LAST, s.name
  `);

  res.json({
    success: true,
    data: {
      assetCounts,
      criticalAssets,
      openComplaints,
      pendingInspections: parseInt(pendingInspections[0]?.count ?? '0', 10),
      workerCounts,
      weatherAlerts,
      maintenanceQueue,
      recentPredictions,
      stateRisk,
    },
  });
});

// ── State Admin Dashboard ──────────────────────────────────────
dashboardRouter.get('/state-admin', authenticate, requireRole('state_admin'), async (req, res) => {
  const stateId = req.user!.stateId!;

  const [
    assetCounts, districtRisk, openComplaints,
    workerStats, recentObservations, recentPredictions,
    weatherThreats, pendingReports,
  ] = await Promise.all([
    query<any>(`
      SELECT current_risk_level, COUNT(*) AS count
      FROM assets WHERE is_active = TRUE AND state_id = $1
      GROUP BY current_risk_level
    `, [stateId]),
    query<any>(`
      SELECT d.id AS district_id, d.name AS district_name,
             COUNT(a.*) FILTER (WHERE a.is_active = TRUE) AS total,
             SUM(CASE WHEN a.current_risk_level = 'critical' AND a.is_active = TRUE THEN 1 ELSE 0 END) AS critical,
             SUM(CASE WHEN a.current_risk_level = 'high'     AND a.is_active = TRUE THEN 1 ELSE 0 END) AS high
      FROM districts d
      LEFT JOIN assets a ON a.district_id = d.id
      WHERE d.state_id = $1 AND d.is_active = TRUE
      GROUP BY d.id, d.name ORDER BY critical DESC NULLS LAST, d.name
    `, [stateId]),
    query<any>(`
      SELECT status, COUNT(*) AS count FROM complaints
      WHERE state_id = $1 GROUP BY status
    `, [stateId]),
    query<any>(`
      SELECT status, COUNT(*) AS count FROM worker_profiles
      WHERE state_id = $1 GROUP BY status
    `, [stateId]),
    query<any>(`
      SELECT wo.observation_code, wo.obs_type, wo.severity, wo.observed_at,
             a.asset_code, a.current_risk_level,
             wp.full_name AS worker_name
      FROM worker_observations wo
      JOIN assets a ON a.id = wo.asset_id
      JOIN worker_profiles wp ON wp.id = wo.worker_id
      WHERE wo.state_id = $1 AND wo.observed_at > NOW() - INTERVAL '7 days'
      ORDER BY wo.observed_at DESC LIMIT 20
    `, [stateId]),
    query<any>(`
      SELECT rp.risk_score, rp.previous_score, rp.score_delta,
             rp.explanation, rp.confidence_score, rp.human_review_status,
             rp.created_at, a.asset_code, a.current_risk_level,
             rp.top_factors, rp.missing_data_flags, rp.maintenance_urgency
      FROM risk_predictions rp
      JOIN assets a ON a.id = rp.asset_id
      WHERE rp.state_id = $1
      ORDER BY rp.risk_score DESC LIMIT 15
    `, [stateId]),
    query<any>(`
      SELECT w.district_id, d.name AS district_name,
             w.extreme_weather_alert, w.flood_alert, w.storm_alert,
             w.heatwave_alert, w.alert_description
      FROM weather_records w
      JOIN districts d ON d.id = w.district_id
      WHERE d.state_id = $1 AND w.recorded_at > NOW() - INTERVAL '12 hours'
        AND (w.extreme_weather_alert OR w.flood_alert OR w.storm_alert)
    `, [stateId]),
    query<any>(`
      SELECT COUNT(*) AS count FROM inspection_reports
      WHERE state_id = $1 AND status IN ('submitted','under_review')
    `, [stateId]),
  ]);

  res.json({
    success: true,
    data: {
      assetCounts,
      districtRisk,
      openComplaints,
      workerStats,
      recentObservations,
      recentPredictions,
      weatherThreats,
      pendingReports: parseInt(pendingReports[0]?.count ?? '0', 10),
    },
  });
});

// ── Worker Dashboard ───────────────────────────────────────────
dashboardRouter.get('/worker', authenticate, requireRole('worker'), async (req, res) => {
  const workerId = req.user!.id;

  const [tasks, recentReports, profile] = await Promise.all([
    query<any>(`
      SELECT it.*, a.asset_code, a.asset_type, a.current_risk_level,
             a.location_lng AS asset_lng, a.location_lat AS asset_lat
      FROM inspection_tasks it
      JOIN assets a ON a.id = it.asset_id
      WHERE it.assigned_worker_id = $1 AND it.status NOT IN ('approved','rejected')
      ORDER BY it.priority ASC
    `, [workerId]),
    query<any>(`
      SELECT ir.id, ir.status, ir.submitted_at, ir.risk_score_before,
             ir.risk_score_after, ir.score_delta, ir.correction_reason,
             a.asset_code
      FROM inspection_reports ir
      JOIN assets a ON a.id = ir.asset_id
      WHERE ir.worker_id = $1
      ORDER BY ir.created_at DESC LIMIT 10
    `, [workerId]),
    query<any>(`
      SELECT full_name, status, field_of_work, state_id, district_id
      FROM worker_profiles WHERE id = $1
    `, [workerId]),
  ]);

  res.json({
    success: true,
    data: { tasks, recentReports, profile: profile[0] },
  });
});
