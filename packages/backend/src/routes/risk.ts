import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, enforceStateAccess } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { query } from '../database/db';
import { computeRiskForAsset } from '../services/riskEngine';
import { auditService } from '../services/auditService';

// ── Compute risk for all assets (bulk) ────────────────────────

export const riskRouter = Router();

// ── GET /api/risk/predictions — list all predictions (state-scoped) ──
// MUST be registered before /:assetId routes to avoid Express param collision
riskRouter.get('/predictions', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { page = '1', pageSize = '20', riskLevel, assetId: filterAssetId } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10));
  const sizeNum = Math.min(100, Math.max(1, parseInt(pageSize, 10)));

  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  if (req.user!.role === 'state_admin') {
    conditions.push(`rp.state_id = $${p++}`);
    params.push(req.user!.stateId);
  }
  if (riskLevel) {
    conditions.push(`rp.risk_level = $${p++}::risk_level`);
    params.push(riskLevel);
  }
  if (filterAssetId) {
    conditions.push(`rp.asset_id = $${p++}`);
    params.push(filterAssetId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows, countRows] = await Promise.all([
    query<any>(
      `SELECT rp.id, rp.asset_id, rp.risk_score, rp.risk_level, rp.previous_score,
              rp.score_delta, rp.failure_probability, rp.maintenance_urgency,
              rp.confidence_score, rp.explanation, rp.human_review_status,
              rp.created_at, rp.model_version,
              a.asset_code, a.asset_type,
              s.name AS state_name, d.name AS district_name
       FROM risk_predictions rp
       LEFT JOIN assets a ON a.id = rp.asset_id
       LEFT JOIN states s ON s.id = rp.state_id
       LEFT JOIN districts d ON d.id = rp.district_id
       ${where}
       ORDER BY rp.created_at DESC
       LIMIT $${p} OFFSET $${p + 1}`,
      [...params, sizeNum, (pageNum - 1) * sizeNum]
    ),
    query<any>(
      `SELECT COUNT(*) AS total FROM risk_predictions rp ${where}`,
      params
    ),
  ]);

  res.json({
    success: true,
    data: rows,
    pagination: {
      page: pageNum,
      pageSize: sizeNum,
      total: parseInt(countRows[0]?.total ?? '0', 10),
    },
  });
});

// ── POST /api/risk/compute-all ────────────────────────────────
riskRouter.post('/compute-all', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const stateId = req.user!.role === 'state_admin' ? req.user!.stateId : req.query.stateId as string | undefined;
  const conditions: string[] = ['is_active = TRUE'];
  const params: unknown[] = [];
  if (stateId) {
    conditions.push(`state_id = $${params.length + 1}`);
    params.push(stateId);
  }
  const assets = await query<any>(`SELECT id FROM assets WHERE ${conditions.join(' AND ')}`, params);
  const results: Array<{ assetId: string; riskScore?: number; riskLevel?: string; error?: string }> = [];
  for (const asset of assets) {
    try {
      const r = await computeRiskForAsset(asset.id);
      results.push({ assetId: asset.id, riskScore: r.riskScore, riskLevel: r.riskLevel });
    } catch (e) {
      results.push({ assetId: asset.id, error: String(e) });
    }
  }
  res.json({ success: true, data: results });
});

// ── Trigger risk recompute for an asset ───────────────────────
riskRouter.post('/:assetId/compute', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { assetId } = req.params;
  const asset = await query<any>(`SELECT * FROM assets WHERE id = $1`, [assetId]);
  if (!asset[0]) throw new AppError(404, 'Asset not found');
  if (req.user!.role === 'state_admin') enforceStateAccess(asset[0].state_id, req);

  const result = await computeRiskForAsset(assetId);

  res.json({
    success: true,
    data: {
      riskScore: result.riskScore,
      riskLevel: result.riskLevel,
      previousScore: result.previousScore,
      scoreDelta: result.scoreDelta,
      explanation: result.explanation,
      topFactors: result.topFactors,
      failureProbability: result.failureProbability,
      outageProbability: result.outageProbability,
      gridImpactSeverity: result.gridImpactSeverity,
      maintenanceUrgency: result.maintenanceUrgency,
      confidenceScore: result.confidenceScore,
      missingDataFlags: result.missingDataFlags,
      hasCriticalSafetyFlag: result.hasCriticalSafetyFlag,
      needsAdminReview: result.needsAdminReview,
    },
  });
});

// ── Get latest prediction for an asset ────────────────────────
riskRouter.get('/:assetId/latest', authenticate, async (req, res) => {
  const { assetId } = req.params;
  const asset = await query<any>(`SELECT state_id FROM assets WHERE id = $1`, [assetId]);
  if (!asset[0]) throw new AppError(404, 'Asset not found');
  if (req.user!.role === 'state_admin') enforceStateAccess(asset[0].state_id, req);

  const rows = await query<any>(
    `SELECT * FROM risk_predictions WHERE asset_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [assetId]
  );
  if (!rows[0]) throw new AppError(404, 'No prediction found for this asset');
  res.json({ success: true, data: rows[0] });
});

// ── List predictions for an asset (history) ───────────────────
riskRouter.get('/:assetId/history', authenticate, async (req, res) => {
  const { assetId } = req.params;
  const asset = await query<any>(`SELECT state_id FROM assets WHERE id = $1`, [assetId]);
  if (!asset[0]) throw new AppError(404, 'Asset not found');
  if (req.user!.role === 'state_admin') enforceStateAccess(asset[0].state_id, req);

  const { page = '1', pageSize = '20' } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const sizeNum = parseInt(pageSize, 10);
  const rows = await query<any>(
    `SELECT id, risk_score, risk_level, previous_score, score_delta,
            failure_probability, maintenance_urgency, confidence_score,
            explanation, human_review_status, created_at
     FROM risk_predictions WHERE asset_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [assetId, sizeNum, (pageNum - 1) * sizeNum]
  );
  res.json({ success: true, data: rows });
});

// ── Admin: review / override a prediction ─────────────────────
riskRouter.patch('/:predictionId/review', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { predictionId } = req.params;
  const { action, overrideReason, overrideScore } = z.object({
    action: z.enum(['approve','reject','override']),
    overrideReason: z.string().min(5),  // mandatory reason
    overrideScore: z.number().min(0).max(100).optional(),
  }).parse(req.body);

  const pred = await query<any>(`SELECT * FROM risk_predictions WHERE id = $1`, [predictionId]);
  if (!pred[0]) throw new AppError(404, 'Prediction not found');

  const update: string[] = [
    `human_review_status = $1`,
    `reviewed_by = $2`,
    `reviewed_at = NOW()`,
    `override_reason = $3`,
  ];
  const params: unknown[] = [
    action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'overridden',
    req.user!.id,
    overrideReason,
  ];

  if (action === 'override' && overrideScore !== undefined) {
    update.push(`risk_score = $${params.length + 1}`);
    params.push(overrideScore);
    // Also update the asset score
    await query(
      `UPDATE assets SET current_risk_score = $1, updated_at = NOW() WHERE id = $2`,
      [overrideScore, pred[0].asset_id]
    );
  }

  params.push(predictionId);
  await query(
    `UPDATE risk_predictions SET ${update.join(', ')} WHERE id = $${params.length}`,
    params
  );

  await auditService.log({
    actorType: 'user',
    actorId: req.user!.id,
    action: `prediction_${action}`,
    entityType: 'risk_prediction',
    entityId: predictionId,
    newValues: { action, overrideReason, overrideScore },
  });

  res.json({ success: true, message: `Prediction ${action}d with recorded reason` });
});

// ── Configure risk factor weights (super admin only) ─────────
riskRouter.put('/factors/weights', authenticate, requireRole('super_admin'), async (req, res) => {
  const { weights } = z.object({
    weights: z.array(z.object({
      factorKey: z.string(),
      baseWeight: z.number().min(0).max(100),
    })),
  }).parse(req.body);

  for (const w of weights) {
    await query(
      `INSERT INTO risk_factors (id, factor_key, category, label, base_weight, updated_by)
       VALUES (gen_random_uuid(), $1, 'configurable', $1, $2, $3)
       ON CONFLICT (factor_key) DO UPDATE SET base_weight = $2, updated_by = $3, updated_at = NOW()`,
      [w.factorKey, w.baseWeight, req.user!.id]
    );
  }

  res.json({ success: true, message: 'Risk factor weights updated' });
});

// ── Flag a prediction for model improvement ───────────────────
riskRouter.post('/:predictionId/flag', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { predictionId } = req.params;
  const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);

  await query(
    `UPDATE risk_predictions SET is_flagged = TRUE, flag_reason = $1 WHERE id = $2`,
    [reason, predictionId]
  );

  res.json({ success: true, message: 'Prediction flagged for model improvement review' });
});
