/**
 * NEXORA AI — Measurements Route
 *
 * POST /api/measurements        — Create measurement record
 * GET  /api/measurements?alertId= — List measurements for an alert
 */
import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireRole, enforceStateAccess } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { query } from '../database/db';

export const measurementRouter = Router();

// ── POST /api/measurements ────────────────────────────────────
measurementRouter.post(
  '/',
  authenticate,
  requireRole('worker'),
  async (req, res) => {
    const data = z.object({
      alertId:           z.string().uuid().optional().nullable(),
      reportId:          z.string().uuid().optional().nullable(),
      assetId:           z.string().uuid().optional().nullable(),
      measurementType:   z.string(),
      name:              z.string(),
      value:             z.number(),
      unit:              z.string(),
      normalRangeMin:    z.number().optional().nullable(),
      normalRangeMax:    z.number().optional().nullable(),
      isOutOfRange:      z.boolean().default(false),
      outOfRangeDirection: z.string().optional().nullable(),
      instrumentUsed:    z.string().optional().nullable(),
      calibrationStatus: z.string().optional().nullable(),
      gpsLat:            z.number().optional().nullable(),
      gpsLng:            z.number().optional().nullable(),
      confidence:        z.number().min(0).max(1).default(1.0),
    }).parse(req.body);

    // Verify worker is assigned to alert (if alertId provided)
    if (data.alertId) {
      const assignment = await query<any>(
        `SELECT id FROM alert_assignments
         WHERE alert_id = $1 AND worker_id = $2 AND is_active = TRUE`,
        [data.alertId, req.user!.id]
      );
      if (!assignment[0]) throw new AppError(403, 'Not assigned to this alert');
    }

    const id = uuidv4();
    await query(
      `INSERT INTO measurement_records (
        id, alert_id, report_id, worker_id, asset_id,
        measurement_type, name, value, unit,
        normal_range_min, normal_range_max,
        is_out_of_range, out_of_range_direction,
        instrument_used, calibration_status,
        gps_lat, gps_lng, confidence, measured_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())`,
      [
        id,
        data.alertId ?? null,
        data.reportId ?? null,
        req.user!.id,
        data.assetId ?? null,
        data.measurementType,
        data.name,
        data.value,
        data.unit,
        data.normalRangeMin ?? null,
        data.normalRangeMax ?? null,
        data.isOutOfRange,
        data.outOfRangeDirection ?? null,
        data.instrumentUsed ?? null,
        data.calibrationStatus ?? null,
        data.gpsLat ?? null,
        data.gpsLng ?? null,
        data.confidence,
      ]
    );

    res.status(201).json({ success: true, data: { id } });
  }
);

// ── GET /api/measurements?alertId= ───────────────────────────
measurementRouter.get(
  '/',
  authenticate,
  requireRole('super_admin', 'state_admin', 'worker'),
  async (req, res) => {
    const { alertId, reportId } = req.query as Record<string, string>;
    if (!alertId && !reportId) throw new AppError(400, 'alertId or reportId required');

    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    if (alertId) { conditions.push(`m.alert_id = $${p++}`); params.push(alertId); }
    if (reportId) { conditions.push(`m.report_id = $${p++}`); params.push(reportId); }
    if (req.user!.role === 'worker') {
      conditions.push(`m.worker_id = $${p++}`);
      params.push(req.user!.id);
    }

    const rows = await query<any>(
      `SELECT m.*, wp.full_name AS worker_name
       FROM measurement_records m
       LEFT JOIN worker_profiles wp ON wp.id = m.worker_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY m.measured_at DESC`,
      params
    );
    res.json({ success: true, data: rows });
  }
);
