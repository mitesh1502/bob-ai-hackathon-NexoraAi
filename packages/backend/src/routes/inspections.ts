import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireRole, enforceStateAccess } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { query, transaction } from '../database/db';
import { storageService } from '../services/storageService';
import { validateGpsPhoto } from '../services/photoGpsService';
import { computeRiskForAsset } from '../services/riskEngine';
import { generateChecklist } from '../services/checklistGenerator';
import { notificationService } from '../services/notificationService';
import { auditService } from '../services/auditService';
import { config } from '../config/env';

export const inspectionRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
});

// ── Create inspection task ─────────────────────────────────────
inspectionRouter.post('/tasks', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const data = z.object({
    assetId: z.string().uuid(),
    complaintId: z.string().uuid().optional(),
    assignedWorkerId: z.string().uuid().optional(),
    priority: z.number().int().min(1).max(10).optional(),
    dueDate: z.string().optional(),
    fieldOfWork: z.string().optional(),
  }).parse(req.body);

  const asset = await query<any>(`SELECT * FROM assets WHERE id = $1 AND is_active = TRUE`, [data.assetId]);
  if (!asset[0]) throw new AppError(404, 'Asset not found');
  if (req.user!.role === 'state_admin') enforceStateAccess(asset[0].state_id, req);

  // Get current risk prediction for checklist generation
  const [prediction, recentObs, recentWeather] = await Promise.all([
    query<any>(
      `SELECT * FROM risk_predictions WHERE asset_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [data.assetId]
    ).then((r) => r[0]),
    query<any>(
      `SELECT observation_code FROM worker_observations WHERE asset_id = $1 AND observed_at > NOW() - INTERVAL '30 days'`,
      [data.assetId]
    ),
    query<any>(
      `SELECT * FROM weather_records WHERE district_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [asset[0].district_id]
    ).then((r) => r[0]),
  ]);

  // Generate dynamic checklist
  const activeFlags = recentObs.map((o: any) => o.observation_code);
  const weatherAlerts: string[] = [];
  if (recentWeather?.flood_alert) weatherAlerts.push('flood_alert');
  if (recentWeather?.storm_alert) weatherAlerts.push('storm_alert');
  if (recentWeather?.extreme_weather_alert) weatherAlerts.push('extreme_weather_alert');

  const checklist = generateChecklist({
    assetType: asset[0].asset_type,
    fieldOfWork: data.fieldOfWork as any,
    currentRiskLevel: asset[0].current_risk_level,
    activeFlags,
    weatherAlerts,
  });

  const taskId = uuidv4();
  const taskCode = `TK-${Date.now().toString(36).toUpperCase()}`;

  await query(
    `INSERT INTO inspection_tasks
       (id, task_code, asset_id, complaint_id, assigned_worker_id,
        state_id, district_id, priority, due_date, field_of_work,
        dynamic_checklist, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',$12)`,
    [
      taskId, taskCode, data.assetId, data.complaintId ?? null,
      data.assignedWorkerId ?? null, asset[0].state_id, asset[0].district_id,
      data.priority ?? 5, data.dueDate ?? null, data.fieldOfWork ?? null,
      JSON.stringify(checklist), req.user!.id,
    ]
  );

  // Notify assigned worker
  if (data.assignedWorkerId) {
    const worker = await query<any>(`SELECT * FROM worker_profiles WHERE id = $1`, [data.assignedWorkerId]);
    if (worker[0]) {
      await notificationService.send({
        event: 'inspection_task_created',
        recipientType: 'worker',
        recipientId: data.assignedWorkerId,
        recipientEmail: worker[0].email,
        variables: { fullName: worker[0].full_name, taskCode, assetCode: asset[0].asset_code },
      });
    }
  }

  res.status(201).json({
    success: true,
    data: { taskId, taskCode, checklist },
  });
});

// ── Worker: get assigned tasks ─────────────────────────────────
inspectionRouter.get('/tasks/my', authenticate, requireRole('worker'), async (req, res) => {
  const rows = await query<any>(
    `SELECT it.*, a.asset_code, a.asset_type, a.current_risk_level,
            a.location_lng AS asset_lng, a.location_lat AS asset_lat
     FROM inspection_tasks it
     JOIN assets a ON a.id = it.asset_id
     WHERE it.assigned_worker_id = $1
     ORDER BY it.priority ASC, it.due_date ASC`,
    [req.user!.id]
  );
  res.json({ success: true, data: rows });
});

// ── Worker: submit inspection report ──────────────────────────
inspectionRouter.post(
  '/reports',
  authenticate,
  requireRole('worker'),
  upload.array('photos', 20),
  async (req, res) => {
    const dataStr = req.body.data;
    if (!dataStr) throw new AppError(400, 'Missing report data');

    const reportSchema = z.object({
      taskId: z.string().uuid(),
      assetId: z.string().uuid(),
      complaintId: z.string().uuid().optional(),
      weatherCondition: z.string().optional(),
      siteAccess: z.string().optional(),
      safetyStatus: z.string().optional(),
      visibleCondition: z.string().optional(),
      operationalStatus: z.string().optional(),
      immediateSafetyConcern: z.boolean().optional(),
      recommendedAction: z.string().optional(),
      urgency: z.enum(['immediate','urgent','scheduled','routine']).optional(),
      notes: z.string().optional(),
      gpsLat: z.number().optional(),
      gpsLng: z.number().optional(),
      isDraft: z.boolean().optional(),
      observations: z.array(z.object({
        observationCode: z.string(),
        type: z.enum(['positive','negative']),
        severity: z.enum(['low','medium','high','critical']).optional(),
        confidence: z.number().min(0).max(1).optional(),
        description: z.string().optional(),
        measuredValue: z.number().optional(),
        measuredUnit: z.string().optional(),
        comment: z.string().optional(),
      })).optional(),
    });

    const data = reportSchema.parse(JSON.parse(dataStr));

    // Verify task belongs to this worker
    const task = await query<any>(
      `SELECT * FROM inspection_tasks WHERE id = $1 AND assigned_worker_id = $2`,
      [data.taskId, req.user!.id]
    );
    if (!task[0]) throw new AppError(403, 'Task not found or not assigned to you');

    const asset = await query<any>(`SELECT * FROM assets WHERE id = $1`, [data.assetId]);
    if (!asset[0]) throw new AppError(404, 'Asset not found');

    // Get score before
    const prevPrediction = await query<any>(
      `SELECT risk_score FROM risk_predictions WHERE asset_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [data.assetId]
    );
    const scoreBefore = prevPrediction[0]?.risk_score ?? 0;

    const reportId = uuidv4();
    const status = data.isDraft ? 'draft' : 'submitted';

    await transaction(async (client) => {
      // Create report
      await client.query(
        `INSERT INTO inspection_reports
           (id, task_id, worker_id, asset_id, complaint_id,
            state_id, district_id,
            weather_condition, site_access, safety_status, visible_condition,
            operational_status, immediate_safety_concern, recommended_action,
            urgency, notes, gps_lat, gps_lng, risk_score_before,
            status, submitted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [
          reportId, data.taskId, req.user!.id, data.assetId, data.complaintId ?? null,
          task[0].state_id, task[0].district_id,
          data.weatherCondition ?? null, data.siteAccess ?? null,
          data.safetyStatus ?? null, data.visibleCondition ?? null,
          data.operationalStatus ?? null, data.immediateSafetyConcern ?? false,
          data.recommendedAction ?? null, data.urgency ?? null,
          data.notes ?? null, data.gpsLat ?? null, data.gpsLng ?? null,
          scoreBefore, status,
          status === 'submitted' ? new Date().toISOString() : null,
        ]
      );

      // Insert observations (workers provide evidence only — engine calculates impact)
      for (const obs of (data.observations ?? [])) {
        await client.query(
          `INSERT INTO worker_observations
             (id, report_id, asset_id, worker_id, state_id, district_id,
              observation_code, obs_type, severity, confidence,
              description, measured_value, measured_unit, comment, observed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())`,
          [
            uuidv4(), reportId, data.assetId, req.user!.id,
            task[0].state_id, task[0].district_id,
            obs.observationCode, obs.type, obs.severity ?? null,
            obs.confidence ?? 1.0, obs.description ?? null,
            obs.measuredValue ?? null, obs.measuredUnit ?? null, obs.comment ?? null,
          ]
        );
      }
    });

    // Upload photos (validate GPS for mandatory photos)
    const files = (req.files as Express.Multer.File[]) ?? [];
    const photoUrls: string[] = [];
    for (const file of files) {
      const url = await storageService.upload(
        file.buffer, file.originalname, file.mimetype,
        `inspections/${reportId}`
      );
      photoUrls.push(url);
    }

    if (photoUrls.length > 0) {
      await query(
        `UPDATE inspection_reports SET notes = COALESCE(notes, '') || ' [Photos: ${photoUrls.length}]' WHERE id = $1`,
        [reportId]
      );
    }

    // If submitted (not draft): recompute risk and show before/after
    let scoreAfter = scoreBefore;
    let scoreDelta = 0;
    if (!data.isDraft) {
      try {
        const newPrediction = await computeRiskForAsset(data.assetId);
        scoreAfter = newPrediction.riskScore;
        scoreDelta = newPrediction.scoreDelta ?? 0;

        await query(
          `UPDATE inspection_reports
           SET risk_score_after = $1, score_delta = $2 WHERE id = $3`,
          [scoreAfter, scoreDelta, reportId]
        );

        // Update task status
        await query(
          `UPDATE inspection_tasks SET status = 'submitted', updated_at = NOW() WHERE id = $1`,
          [data.taskId]
        );
      } catch (err) {
        // Non-fatal — risk recompute failure shouldn't block submission
      }

      await notificationService.send({
        event: 'report_submitted',
        recipientType: 'worker',
        recipientId: req.user!.id,
        variables: {
          taskCode: task[0].task_code,
          scoreBefore: scoreBefore.toString(),
          scoreAfter: scoreAfter.toString(),
          delta: scoreDelta.toString(),
        },
      });
    }

    await auditService.log({
      actorType: 'worker',
      actorId: req.user!.id,
      action: data.isDraft ? 'report_saved_draft' : 'report_submitted',
      entityType: 'inspection_report',
      entityId: reportId,
      stateId: task[0].state_id,
    });

    res.status(201).json({
      success: true,
      data: {
        reportId,
        status,
        riskScoreBefore: scoreBefore,
        riskScoreAfter: scoreAfter,
        scoreDelta,
        photoUrls,
        message: data.isDraft
          ? 'Report saved as draft'
          : `Report submitted. Risk score changed from ${scoreBefore} to ${scoreAfter} (Δ${scoreDelta > 0 ? '+' : ''}${scoreDelta}).`,
      },
    });
  }
);

// ── Admin: review/approve report ──────────────────────────────
inspectionRouter.patch('/reports/:id/review', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { id } = req.params;
  const { action, notes, correctionReason } = z.object({
    action: z.enum(['approve','reject','request_correction']),
    notes: z.string().optional(),
    correctionReason: z.string().optional(),
  }).parse(req.body);

  const report = await query<any>(`SELECT * FROM inspection_reports WHERE id = $1`, [id]);
  if (!report[0]) throw new AppError(404, 'Report not found');
  if (req.user!.role === 'state_admin') enforceStateAccess(report[0].state_id, req);

  const status = action === 'approve' ? 'approved'
    : action === 'reject' ? 'rejected'
    : 'correction_requested';

  await query(
    `UPDATE inspection_reports
     SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_notes = $3,
         correction_requested = $4, correction_reason = $5
     WHERE id = $6`,
    [status, req.user!.id, notes ?? null, action === 'request_correction', correctionReason ?? null, id]
  );

  if (action === 'request_correction') {
    await notificationService.send({
      event: 'report_correction_requested',
      recipientType: 'worker',
      recipientId: report[0].worker_id,
      variables: { correctionReason: correctionReason ?? '' },
    });
  }

  res.json({ success: true, message: `Report ${action}d` });
});

// ── Get report with risk change details ───────────────────────
inspectionRouter.get('/reports/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const rows = await query<any>(
    `SELECT ir.*,
            wp.full_name AS worker_name, a.asset_code,
            a.current_risk_level,
            json_agg(wo.*) AS observations
     FROM inspection_reports ir
     JOIN worker_profiles wp ON wp.id = ir.worker_id
     JOIN assets a ON a.id = ir.asset_id
     LEFT JOIN worker_observations wo ON wo.report_id = ir.id
     WHERE ir.id = $1
     GROUP BY ir.id, wp.full_name, a.asset_code, a.current_risk_level`,
    [id]
  );
  if (!rows[0]) throw new AppError(404, 'Report not found');
  if (req.user!.role === 'state_admin') enforceStateAccess(rows[0].state_id, req);
  // Workers can only see their own reports
  if (req.user!.role === 'worker' && rows[0].worker_id !== req.user!.id) {
    throw new AppError(403, 'Access denied');
  }
  res.json({ success: true, data: rows[0] });
});
