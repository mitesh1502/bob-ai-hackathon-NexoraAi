import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireRole, enforceStateAccess } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { query, transaction } from '../database/db';
import { authService } from '../services/authService';
import { storageService } from '../services/storageService';
import { notificationService } from '../services/notificationService';
import { auditService } from '../services/auditService';
import { config } from '../config/env';

export const workerRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (config.ALLOWED_UPLOAD_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(400, `File type not allowed: ${file.mimetype}`));
    }
  },
});

// ── Public: Register a worker application ─────────────────────
const workerRegSchema = z.object({
  fullName: z.string().min(2).max(200),
  email: z.string().email(),
  mobile: z.string().min(10).max(20),
  password: z.string().min(8),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  communicationPref: z.enum(['email', 'sms', 'both']).optional(),
  // Residence
  stateId: z.string().uuid(),
  districtId: z.string().uuid(),
  cityVillage: z.string().optional(),
  pinCode: z.string().optional(),
  addressText: z.string().optional(),
  // Identity
  aadhaarToken: z.string().optional(), // token/partial only
  consentGiven: z.boolean(),
  // Work
  fieldOfWork: z.enum(['civil_engineering','mechanical_engineering','electrical_engineering','other']),
  // Preferences
  travelWilling: z.boolean().optional(),
  employmentType: z.string().optional(),
  availabilityDate: z.string().optional(),
  // Terms
  agreedToTerms: z.boolean(),
});

workerRouter.post('/register', async (req, res) => {
  const data = workerRegSchema.parse(req.body);

  if (!data.consentGiven || !data.agreedToTerms) {
    throw new AppError(400, 'Consent and terms agreement are required');
  }

  // Check if email already exists
  const existing = await query(
    `SELECT id FROM worker_profiles WHERE email = $1`,
    [data.email]
  );
  if (existing.length > 0) {
    throw new AppError(409, 'An application with this email already exists');
  }

  const passwordHash = await authService.hashPassword(data.password);
  const appNumber = `NXW-${Date.now().toString(36).toUpperCase()}`;
  const workerId = uuidv4();

  await query(
    `INSERT INTO worker_profiles
       (id, email, mobile, password_hash, full_name, date_of_birth, gender,
        communication_pref, state_id, district_id, city_village, pin_code,
        address_text, aadhaar_token, consent_given, consent_date,
        field_of_work, travel_willing, employment_type, availability_date,
        application_number, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),$16,$17,$18,$19,$20,'pending_review')`,
    [
      workerId, data.email, data.mobile, passwordHash, data.fullName,
      data.dateOfBirth ?? null, data.gender ?? null, data.communicationPref ?? 'email',
      data.stateId, data.districtId, data.cityVillage ?? null, data.pinCode ?? null,
      data.addressText ?? null,
      data.aadhaarToken ? `MASKED-${data.aadhaarToken.slice(-4)}` : null, // NEVER store full Aadhaar
      true,
      data.fieldOfWork, data.travelWilling ?? false,
      data.employmentType ?? null, data.availabilityDate ?? null, appNumber,
    ]
  );

  await notificationService.send({
    event: 'worker_application_submitted',
    recipientType: 'worker',
    recipientId: workerId,
    recipientEmail: data.email,
    recipientMobile: data.mobile,
    variables: { fullName: data.fullName, applicationNumber: appNumber },
  });

  await auditService.log({
    actorType: 'worker',
    actorId: workerId,
    action: 'worker_application_submitted',
    entityType: 'worker_profile',
    entityId: workerId,
    stateId: data.stateId,
  });

  res.status(201).json({
    success: true,
    data: { applicationNumber: appNumber, workerId },
    message: 'Application submitted successfully',
  });
});

// ── Get worker profile (worker: own; admin: any) ──────────────
workerRouter.get('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  if (req.user!.role === 'worker' && req.user!.id !== id) {
    throw new AppError(403, 'Access denied');
  }

  const rows = await query<any>(
    `SELECT wp.*, s.name AS state_name, d.name AS district_name
     FROM worker_profiles wp
     LEFT JOIN states s ON s.id = wp.state_id
     LEFT JOIN districts d ON d.id = wp.district_id
     WHERE wp.id = $1`,
    [id]
  );
  if (!rows[0]) throw new AppError(404, 'Worker not found');

  const worker = rows[0];
  // State admin: enforce state isolation
  if (req.user!.role === 'state_admin') {
    enforceStateAccess(worker.state_id, req);
  }

  // Mask sensitive data
  worker.aadhaar_token = worker.aadhaar_token ? '****MASKED****' : null;
  worker.password_hash = undefined;

  res.json({ success: true, data: worker });
});

// ── List workers (admin) ──────────────────────────────────────
workerRouter.get('/', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { page = '1', pageSize = '20', status, districtId } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const sizeNum = parseInt(pageSize, 10);
  const offset = (pageNum - 1) * sizeNum;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  // State admin isolation
  if (req.user!.role === 'state_admin') {
    conditions.push(`wp.state_id = $${p++}`);
    params.push(req.user!.stateId);
  }
  if (status) { conditions.push(`wp.status = $${p++}`); params.push(status); }
  if (districtId) { conditions.push(`wp.district_id = $${p++}`); params.push(districtId); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows, countRows] = await Promise.all([
    query<any>(
      `SELECT wp.id, wp.full_name, wp.email, wp.mobile, wp.status,
              wp.field_of_work, wp.application_number, wp.state_id, wp.district_id,
              wp.created_at, s.name AS state_name, d.name AS district_name
       FROM worker_profiles wp
       LEFT JOIN states s ON s.id = wp.state_id
       LEFT JOIN districts d ON d.id = wp.district_id
       ${where} ORDER BY wp.created_at DESC
       LIMIT $${p} OFFSET $${p + 1}`,
      [...params, sizeNum, offset]
    ),
    query<any>(`SELECT COUNT(*) FROM worker_profiles wp ${where}`, params),
  ]);

  res.json({
    success: true,
    data: rows,
    total: parseInt(countRows[0]?.count ?? '0', 10),
    page: pageNum,
    pageSize: sizeNum,
  });
});

// ── Approve / reject worker (admin) ──────────────────────────
workerRouter.patch('/:id/status', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { id } = req.params;
  const { status, reason, districtId, reassignReason } = z.object({
    status: z.enum(['approved','rejected','documents_required','suspended','employed','inactive']),
    reason: z.string().optional(),
    districtId: z.string().uuid().optional(), // for reassignment
    reassignReason: z.string().optional(),    // logged reason for cross-district reassignment
  }).parse(req.body);

  const worker = await query<any>(`SELECT * FROM worker_profiles WHERE id = $1`, [id]);
  if (!worker[0]) throw new AppError(404, 'Worker not found');
  if (req.user!.role === 'state_admin') enforceStateAccess(worker[0].state_id, req);

  // If a districtId is provided for reassignment, validate it belongs to the worker's state
  // (cross-state reassignment requires Super Admin — State Admins can only reassign within their own state)
  if (districtId) {
    const distRow = await query<any>(`SELECT state_id FROM districts WHERE id = $1`, [districtId]);
    if (!distRow[0]) throw new AppError(400, 'Invalid district ID');
    if (req.user!.role === 'state_admin') enforceStateAccess(distRow[0].state_id, req);
  }

  const effectiveDistrictId = districtId ?? worker[0].district_id;
  const effectiveReason = reassignReason ?? reason ?? null;

  if (districtId) {
    await query(
      `UPDATE worker_profiles SET status = $1, district_id = $2, rejection_reason = $3, updated_at = NOW(), updated_by = $4 WHERE id = $5`,
      [status, effectiveDistrictId, effectiveReason, req.user!.id, id]
    );
  } else {
    await query(
      `UPDATE worker_profiles SET status = $1, rejection_reason = $2, updated_at = NOW(), updated_by = $3 WHERE id = $4`,
      [status, effectiveReason, req.user!.id, id]
    );
  }

  const event = status === 'approved' ? 'worker_application_approved' :
                status === 'rejected' ? 'worker_application_rejected' : null;

  if (event) {
    await notificationService.send({
      event,
      recipientType: 'worker',
      recipientId: id,
      recipientEmail: worker[0].email,
      variables: { fullName: worker[0].full_name, reason: reason ?? '' },
    });
  }

  await auditService.log({
    actorType: 'user',
    actorId: req.user!.id,
    action: districtId ? `worker_reassigned_to_district` : `worker_status_changed_to_${status}`,
    entityType: 'worker_profile',
    entityId: id,
    stateId: worker[0].state_id,
    newValues: { status, reason: effectiveReason, ...(districtId ? { newDistrictId: districtId, reassignReason } : {}) },
  });

  res.json({ success: true, message: `Worker status updated to ${status}` });
});

// ── Upload documents ──────────────────────────────────────────
workerRouter.post('/:id/documents', authenticate, upload.single('document'), async (req, res) => {
  const { id } = req.params;
  if (req.user!.role === 'worker' && req.user!.id !== id) {
    throw new AppError(403, 'Access denied');
  }
  if (!req.file) throw new AppError(400, 'No file uploaded');

  const docType = req.body.docType ?? 'general';
  const url = await storageService.upload(
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype,
    `workers/${id}/${docType}`
  );

  const column = docType === 'id_doc' ? 'id_doc_url'
    : docType === 'residence_proof' ? 'residence_proof_url'
    : docType === 'photo' ? 'photo_url'
    : null;

  if (column) {
    await query(`UPDATE worker_profiles SET ${column} = $1, updated_at = NOW() WHERE id = $2`, [url, id]);
  }

  res.json({ success: true, data: { url } });
});

// ── GET /workers/:id/coverage — list coverage areas ──────────
workerRouter.get('/:id/coverage', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { id } = req.params;
  const worker = await query<any>(`SELECT state_id FROM worker_profiles WHERE id = $1`, [id]);
  if (!worker[0]) throw new AppError(404, 'Worker not found');
  if (req.user!.role === 'state_admin') enforceStateAccess(worker[0].state_id, req);

  const rows = await query<any>(
    `SELECT wca.*, s.name AS state_name, d.name AS district_name, t.name AS taluka_name, v.name AS village_name
     FROM worker_coverage_areas wca
     LEFT JOIN states s ON s.id = wca.state_id
     LEFT JOIN districts d ON d.id = wca.district_id
     LEFT JOIN talukas t ON t.id = wca.taluka_id
     LEFT JOIN villages v ON v.id = wca.village_id
     WHERE wca.worker_id = $1 ORDER BY wca.is_primary DESC, wca.created_at ASC`,
    [id]
  );
  res.json({ success: true, data: rows });
});

// ── POST /workers/:id/coverage — add coverage area ────────────
workerRouter.post('/:id/coverage', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { id } = req.params;
  const { stateId, districtId, talukaId, villageId, isPrimary } = z.object({
    stateId: z.string().uuid(),
    districtId: z.string().uuid().optional().nullable(),
    talukaId: z.string().uuid().optional().nullable(),
    villageId: z.string().uuid().optional().nullable(),
    isPrimary: z.boolean().default(false),
  }).parse(req.body);

  const worker = await query<any>(`SELECT state_id FROM worker_profiles WHERE id = $1`, [id]);
  if (!worker[0]) throw new AppError(404, 'Worker not found');
  if (req.user!.role === 'state_admin') enforceStateAccess(worker[0].state_id, req);

  await query(
    `INSERT INTO worker_coverage_areas (id, worker_id, state_id, district_id, taluka_id, village_id, is_primary)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [uuidv4(), id, stateId, districtId ?? null, talukaId ?? null, villageId ?? null, isPrimary]
  );
  res.status(201).json({ success: true });
});

// ── DELETE /workers/:id/coverage/:areaId ─────────────────────
workerRouter.delete('/:id/coverage/:areaId', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { id, areaId } = req.params;
  const worker = await query<any>(`SELECT state_id FROM worker_profiles WHERE id = $1`, [id]);
  if (!worker[0]) throw new AppError(404, 'Worker not found');
  if (req.user!.role === 'state_admin') enforceStateAccess(worker[0].state_id, req);

  await query(`DELETE FROM worker_coverage_areas WHERE id = $1 AND worker_id = $2`, [areaId, id]);
  res.json({ success: true });
});
