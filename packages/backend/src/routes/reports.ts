import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { query } from '../database/db';

export const reportRouter = Router();

// ── State summary report ───────────────────────────────────────
reportRouter.get('/state-summary', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const stateId = req.user!.role === 'state_admin'
    ? req.user!.stateId!
    : req.query.stateId as string;

  if (!stateId) {
    return res.status(400).json({ success: false, message: 'stateId required for super admin' });
  }

  const [state, assetStats, complaintStats, workerStats, incidentStats, riskTrend] =
    await Promise.all([
      query<any>(`SELECT name FROM states WHERE id = $1`, [stateId]).then((r) => r[0]),
      query<any>(`
        SELECT asset_type, current_risk_level, COUNT(*) AS count,
               AVG(current_risk_score) AS avg_score
        FROM assets WHERE state_id = $1 AND is_active = TRUE
        GROUP BY asset_type, current_risk_level
      `, [stateId]),
      query<any>(`
        SELECT status, COUNT(*) AS count FROM complaints
        WHERE state_id = $1 GROUP BY status
      `, [stateId]),
      query<any>(`
        SELECT status, field_of_work, COUNT(*) AS count
        FROM worker_profiles WHERE state_id = $1 GROUP BY status, field_of_work
      `, [stateId]),
      query<any>(`
        SELECT incident_type, COUNT(*) AS count,
               AVG(outage_duration_h) AS avg_duration
        FROM historical_incidents WHERE state_id = $1
        GROUP BY incident_type ORDER BY count DESC
      `, [stateId]),
      query<any>(`
        SELECT DATE_TRUNC('day', rp.created_at) AS day,
               AVG(rp.risk_score) AS avg_risk,
               COUNT(CASE WHEN rp.risk_level = 'critical' THEN 1 END) AS critical_count
        FROM risk_predictions rp
        JOIN assets a ON a.id = rp.asset_id
        WHERE a.state_id = $1 AND rp.created_at > NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day
      `, [stateId]),
    ]);

  res.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      state: state?.name,
      stateId,
      assetStats,
      complaintStats,
      workerStats,
      incidentStats,
      riskTrend,
    },
  });
});

// ── Outage-prone areas ─────────────────────────────────────────
reportRouter.get('/outage-prone', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const stateId = req.user!.role === 'state_admin'
    ? req.user!.stateId
    : req.query.stateId as string | undefined;

  const conditions = ['a.current_risk_level IN (\'critical\',\'high\')'];
  const params: unknown[] = [];
  let p = 1;
  if (stateId) { conditions.push(`a.state_id = $${p++}`); params.push(stateId); }

  const rows = await query<any>(
    `SELECT d.name AS district_name, s.name AS state_name,
            COUNT(a.*) AS high_risk_assets,
            AVG(a.current_risk_score) AS avg_risk_score,
            SUM(a.connected_customers) AS total_customers_at_risk
     FROM assets a
     JOIN states s ON s.id = a.state_id
     JOIN districts d ON d.id = a.district_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY d.name, s.name
     ORDER BY high_risk_assets DESC, avg_risk_score DESC
     LIMIT 20`,
    params
  );

  res.json({ success: true, data: rows });
});
