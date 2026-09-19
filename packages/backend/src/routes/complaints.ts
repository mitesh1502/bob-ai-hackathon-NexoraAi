import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../middleware/errorHandler';
import { query } from '../database/db';
import { storageService } from '../services/storageService';
import { notificationService } from '../services/notificationService';
import { validateGpsPhoto } from '../services/photoGpsService';
import { auditService } from '../services/auditService';
import { config } from '../config/env';
import { authenticate, requireRole, enforceStateAccess } from '../middleware/auth';

export const complaintRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(400, 'Only image files are accepted for complaint photos'));
    }
  },
});

// ── Step 1+2+3: Submit a complaint (public — no auth required) ──
// Must include at least one GIS-tagged photo.
complaintRouter.post(
  '/',
  upload.single('photo'),
  async (req, res) => {
    const dataStr = req.body.data;
    if (!dataStr) throw new AppError(400, 'Missing complaint data');

    const schema = z.object({
      // Citizen info
      fullName: z.string().min(2),
      mobile: z.string().optional(),
      email: z.string().email().optional(),
      stateId: z.string().uuid(),
      districtId: z.string().uuid(),
      city: z.string().optional(),
      pinCode: z.string().optional(),
      addressText: z.string().optional(),
      preferredContact: z.enum(['mobile','email','both']).optional(),
      // Complaint
      category: z.string().min(1),
      assetType: z.string().optional(),
      brandModel: z.string().optional(),
      serialNumber: z.string().optional(),
      description: z.string().min(10),
      dateNoticed: z.string().optional(),
      isSafetyConcern: z.boolean().optional(),
      // GPS (manual fallback — used only if EXIF is absent and user provides location)
      manualLat: z.number().optional(),
      manualLng: z.number().optional(),
    });

    const data = schema.parse(JSON.parse(dataStr));

    // ── CRITICAL: enforce GIS-tagged photo ───────────────────
    if (!req.file) {
      throw new AppError(
        400,
        'A GIS-tagged photo is required to submit a complaint. ' +
        'Please enable location services on your device and retake the photo.'
      );
    }

    const gpsResult = await validateGpsPhoto(
      req.file.buffer,
      data.manualLat,
      data.manualLng
    );

    if (!gpsResult.valid) {
      throw new AppError(
        400,
        `Cannot register complaint: ${gpsResult.error} ` +
        'A photo with valid GPS location evidence is mandatory.'
      );
    }

    // Create citizen record
    const citizenId = uuidv4();
    await query(
      `INSERT INTO citizens (id, full_name, mobile, email, state_id, district_id,
        city, pin_code, address_text, preferred_contact)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT DO NOTHING`,
      [citizenId, data.fullName, data.mobile ?? null, data.email ?? null,
       data.stateId, data.districtId, data.city ?? null,
       data.pinCode ?? null, data.addressText ?? null, data.preferredContact ?? 'mobile']
    );

    // Create complaint
    const complaintId = uuidv4();
    const complaintNumber = `NXC-${Date.now().toString(36).toUpperCase()}`;

    await query(
      `INSERT INTO complaints
         (id, complaint_number, citizen_id, state_id, district_id,
          category, asset_type, brand_model, serial_number, description,
          date_noticed, is_safety_concern,
          location_lat, location_lng, location_address, location_method, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
               $13,$14,$15,$16,'submitted')`,
      [
        complaintId, complaintNumber, citizenId,
        data.stateId, data.districtId,
        data.category, data.assetType ?? null, data.brandModel ?? null,
        data.serialNumber ?? null, data.description,
        data.dateNoticed ?? null, data.isSafetyConcern ?? false,
        gpsResult.lat, gpsResult.lng,
        data.addressText ?? null, gpsResult.method,
      ]
    );

    // Upload photo and store with GPS metadata
    const photoUrl = await storageService.upload(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      `complaints/${complaintId}`
    );

    await query(
      `INSERT INTO complaint_attachments
         (id, complaint_id, file_url, file_type, file_size_bytes,
          gps_lat, gps_lng, gps_timestamp, tamper_hash, is_primary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE)`,
      [
        uuidv4(), complaintId, photoUrl,
        req.file.mimetype, req.file.size,
        gpsResult.lat, gpsResult.lng,
        gpsResult.capturedAt ?? new Date().toISOString(),
        gpsResult.tamperHash, 
      ]
    );

    // Send confirmation
    if (data.email || data.mobile) {
      await notificationService.send({
        event: 'complaint_submitted',
        recipientType: 'citizen',
        recipientId: citizenId,
        recipientEmail: data.email,
        recipientMobile: data.mobile,
        variables: {
          fullName: data.fullName,
          complaintNumber,
          trackingInstructions: 'Visit our website and click "Track Complaint" to check status',
        },
      });
    }

    await auditService.log({
      actorType: 'system',
      action: 'complaint_submitted',
      entityType: 'complaint',
      entityId: complaintId,
      stateId: data.stateId,
    });

    res.status(201).json({
      success: true,
      data: {
        complaintNumber,
        complaintId,
        status: 'submitted',
        gpsMethod: gpsResult.method,
        message:
          'Your complaint has been registered. ' +
          `Use complaint number ${complaintNumber} to track its status.`,
      },
    });
  }
);

// ── Public: Track complaint by number ────────────────────────
complaintRouter.get('/track/:complaintNumber', async (req, res) => {
  const { complaintNumber } = req.params;
  const rows = await query<any>(
    `SELECT c.id, c.complaint_number, c.category, c.description,
            c.status, c.created_at, c.updated_at,
            s.name AS state_name, d.name AS district_name
     FROM complaints c
     JOIN states s ON s.id = c.state_id
     JOIN districts d ON d.id = c.district_id
     WHERE c.complaint_number = $1`,
    [complaintNumber]
  );
  if (!rows[0]) throw new AppError(404, 'Complaint not found');
  // Never expose citizen personal data in public tracking
  res.json({ success: true, data: rows[0] });
});

// ── Authenticated: List complaints (admin) ────────────────────
complaintRouter.get('/', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { page = '1', pageSize = '20', status, districtId } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const sizeNum = parseInt(pageSize, 10);
  const offset = (pageNum - 1) * sizeNum;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  if (req.user!.role === 'state_admin') {
    conditions.push(`c.state_id = $${p++}`);
    params.push(req.user!.stateId);
  }
  if (status) { conditions.push(`c.status = $${p++}`); params.push(status); }
  if (districtId) { conditions.push(`c.district_id = $${p++}`); params.push(districtId); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows, total] = await Promise.all([
    query<any>(
      `SELECT c.*, s.name AS state_name, d.name AS district_name,
              ci.full_name AS citizen_name, ci.mobile AS citizen_mobile
       FROM complaints c
       JOIN states s ON s.id = c.state_id
       JOIN districts d ON d.id = c.district_id
       LEFT JOIN citizens ci ON ci.id = c.citizen_id
       ${where}
       ORDER BY c.created_at DESC
       LIMIT $${p} OFFSET $${p + 1}`,
      [...params, sizeNum, offset]
    ),
    query<any>(`SELECT COUNT(*) FROM complaints c ${where}`, params),
  ]);

  res.json({
    success: true,
    data: rows,
    total: parseInt(total[0]?.count ?? '0', 10),
    page: pageNum,
    pageSize: sizeNum,
  });
});

// ── Update complaint status (admin) ───────────────────────────
complaintRouter.patch('/:id/status', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { id } = req.params;
  const { status, reason, assignedWorkerId } = z.object({
    status: z.string(),
    reason: z.string().optional(),
    assignedWorkerId: z.string().uuid().optional(),
  }).parse(req.body);

  const complaint = await query<any>(`SELECT * FROM complaints WHERE id = $1`, [id]);
  if (!complaint[0]) throw new AppError(404, 'Complaint not found');
  if (req.user!.role === 'state_admin') enforceStateAccess(complaint[0].state_id, req);

  await query(
    `UPDATE complaints SET status = $1, updated_at = NOW(), updated_by = $2
     ${assignedWorkerId ? ', assigned_worker_id = $4' : ''}
     WHERE id = $3`,
    assignedWorkerId
      ? [status, req.user!.id, id, assignedWorkerId]
      : [status, req.user!.id, id]
  );

  await auditService.log({
    actorType: 'user',
    actorId: req.user!.id,
    action: `complaint_status_changed_to_${status}`,
    entityType: 'complaint',
    entityId: id,
    stateId: complaint[0].state_id,
    newValues: { status, reason },
  });

  res.json({ success: true, message: `Complaint status updated to ${status}` });
});
