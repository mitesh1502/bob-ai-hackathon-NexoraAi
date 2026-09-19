/**
 * NEXORA AI — Image Upload Route
 *
 * POST /api/images — Upload a geo-tagged evidence image
 * GET  /api/images?alertId=  — List images for an alert
 * PATCH /api/images/:id/verify — Admin verify/reject image
 */
import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireRole, enforceStateAccess } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { query } from '../database/db';
import { storageService } from '../services/storageService';
import { config } from '../config/env';

export const imageRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new AppError(400, 'Only image files are allowed'));
  },
});

// ── POST /api/images — Upload geo-tagged image ────────────────
imageRouter.post(
  '/',
  authenticate,
  requireRole('worker'),
  upload.single('image'),
  async (req, res) => {
    if (!req.file) throw new AppError(400, 'No image file uploaded');

    const {
      category, description, alertId, assetId, complaintId, taskId,
      gpsSource, gpsLat, gpsLng,
    } = z.object({
      category:    z.string(),
      description: z.string().optional(),
      alertId:     z.string().uuid().optional().nullable(),
      assetId:     z.string().uuid().optional().nullable(),
      complaintId: z.string().uuid().optional().nullable(),
      taskId:      z.string().uuid().optional().nullable(),
      gpsSource:   z.enum(['exif', 'app_captured', 'none']).default('none'),
      gpsLat:      z.string().optional().nullable(),
      gpsLng:      z.string().optional().nullable(),
    }).parse(req.body);

    // Verify worker is assigned to this alert
    if (alertId) {
      const assignment = await query<any>(
        `SELECT id FROM alert_assignments
         WHERE alert_id = $1 AND worker_id = $2 AND is_active = TRUE`,
        [alertId, req.user!.id]
      );
      if (!assignment[0]) throw new AppError(403, 'Not assigned to this alert');
    }

    // Compute tamper-evident hash
    const tamperHash = crypto
      .createHash('sha256')
      .update(req.file.buffer)
      .digest('hex');

    // Store original file
    const url = await storageService.upload(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      `evidence/${alertId ?? 'misc'}/${category}`
    );

    const imageId = uuidv4();
    await query(
      `INSERT INTO geo_tagged_images (
        id, alert_id, task_id, asset_id, complaint_id, worker_id,
        category, original_file_url,
        app_gps_lat, app_gps_lng, gps_source,
        upload_timestamp, tamper_hash,
        description, is_before_maintenance, verification_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12,$13,TRUE,'pending')`,
      [
        imageId,
        alertId ?? null,
        taskId ?? null,
        assetId ?? null,
        complaintId ?? null,
        req.user!.id,
        category,
        url,
        gpsLat ? parseFloat(gpsLat) : null,
        gpsLng ? parseFloat(gpsLng) : null,
        gpsSource,
        tamperHash,
        description ?? null,
      ]
    );

    res.status(201).json({
      success: true,
      data: { imageId, url, gpsSource, tamperHash },
    });
  }
);

// ── GET /api/images — List images for an alert ────────────────
imageRouter.get(
  '/',
  authenticate,
  requireRole('super_admin', 'state_admin', 'worker'),
  async (req, res) => {
    const { alertId, assetId } = req.query as Record<string, string>;
    if (!alertId && !assetId) throw new AppError(400, 'alertId or assetId required');

    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    if (alertId) { conditions.push(`g.alert_id = $${p++}`); params.push(alertId); }
    if (assetId) { conditions.push(`g.asset_id = $${p++}`); params.push(assetId); }

    // Workers can only see images they uploaded
    if (req.user!.role === 'worker') {
      conditions.push(`g.worker_id = $${p++}`);
      params.push(req.user!.id);
    }

    const rows = await query<any>(
      `SELECT g.*, wp.full_name AS worker_name
       FROM geo_tagged_images g
       LEFT JOIN worker_profiles wp ON wp.id = g.worker_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY g.upload_timestamp DESC`,
      params
    );

    res.json({ success: true, data: rows });
  }
);

// ── PATCH /api/images/:id/verify — Admin verify/reject ────────
imageRouter.patch(
  '/:id/verify',
  authenticate,
  requireRole('super_admin', 'state_admin'),
  async (req, res) => {
    const { id } = req.params;
    const { action, rejectedReason } = z.object({
      action: z.enum(['verify', 'reject']),
      rejectedReason: z.string().optional(),
    }).parse(req.body);

    if (action === 'reject' && !rejectedReason) {
      throw new AppError(400, 'A rejection reason is required');
    }

    const img = await query<any>(
      `SELECT g.*, a.state_id FROM geo_tagged_images g
       LEFT JOIN alerts a ON a.id = g.alert_id
       WHERE g.id = $1`,
      [id]
    );
    if (!img[0]) throw new AppError(404, 'Image not found');
    if (req.user!.role === 'state_admin' && img[0].state_id) {
      enforceStateAccess(img[0].state_id, req);
    }

    await query(
      `UPDATE geo_tagged_images
       SET verification_status = $1, rejected_reason = $2,
           reviewed_by = $3, reviewed_at = NOW()
       WHERE id = $4`,
      [
        action === 'verify' ? 'verified' : 'rejected',
        rejectedReason ?? null,
        req.user!.id,
        id,
      ]
    );

    res.json({ success: true, message: `Image ${action}d` });
  }
);
