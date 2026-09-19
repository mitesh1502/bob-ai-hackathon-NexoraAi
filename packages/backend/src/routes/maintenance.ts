import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, enforceStateAccess } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { query } from '../database/db';
import { maintenanceService } from '../services/maintenanceService';
import { auditService } from '../services/auditService';

export const maintenanceRouter = Router();

// ── Generate priority queue ────────────────────────────────────
maintenanceRouter.get('/priority-queue', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const stateId = req.user!.role === 'state_admin'
    ? req.user!.stateId
    : req.query.stateId as string | undefined;

  const queue = await maintenanceService.generatePriorityQueue(
    stateId,
    req.query.districtId as string | undefined
  );

  res.json({ success: true, data: queue });
});

// ── Get maintenance plans ──────────────────────────────────────
maintenanceRouter.get('/plans', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { status, page = '1', pageSize = '20' } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const sizeNum = parseInt(pageSize, 10);
  const offset = (pageNum - 1) * sizeNum;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  if (req.user!.role === 'state_admin') {
    conditions.push(`mp.state_id = $${p++}`);
    params.push(req.user!.stateId);
  }
  if (status) { conditions.push(`mp.status = $${p++}`); params.push(status); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows, total] = await Promise.all([
    query<any>(
      `SELECT mp.*, a.asset_code, a.asset_type,
              s.name AS state_name, d.name AS district_name
       FROM maintenance_plans mp
       JOIN assets a ON a.id = mp.asset_id
       JOIN states s ON s.id = mp.state_id
       JOIN districts d ON d.id = mp.district_id
       ${where}
       ORDER BY mp.priority_rank ASC NULLS LAST, mp.risk_score DESC
       LIMIT $${p} OFFSET $${p + 1}`,
      [...params, sizeNum, offset]
    ),
    query<any>(`SELECT COUNT(*) FROM maintenance_plans mp ${where}`, params),
  ]);

  res.json({
    success: true,
    data: rows,
    total: parseInt(total[0]?.count ?? '0', 10),
  });
});

// ── Admin: approve/reject/modify a plan ───────────────────────
maintenanceRouter.patch('/plans/:id/action', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { id } = req.params;
  const { action, modificationReason, rejectionReason } = z.object({
    action: z.enum(['approve','reject','modify']),
    modificationReason: z.string().optional(),
    rejectionReason: z.string().optional(),
  }).parse(req.body);

  const plan = await query<any>(`SELECT * FROM maintenance_plans WHERE id = $1`, [id]);
  if (!plan[0]) throw new AppError(404, 'Maintenance plan not found');
  if (req.user!.role === 'state_admin') enforceStateAccess(plan[0].state_id, req);

  if ((action === 'reject') && !rejectionReason) {
    throw new AppError(400, 'Rejection reason is required');
  }
  if ((action === 'modify') && !modificationReason) {
    throw new AppError(400, 'Modification reason is required');
  }

  const newStatus = action === 'approve' ? 'approved'
    : action === 'reject' ? 'rejected'
    : 'modified';

  await query(
    `UPDATE maintenance_plans
     SET status = $1, approved_by = $2, approved_at = NOW(),
         modified_reason = $3, rejection_reason = $4, updated_at = NOW()
     WHERE id = $5`,
    [newStatus, req.user!.id, modificationReason ?? null, rejectionReason ?? null, id]
  );

  await auditService.log({
    actorType: 'user',
    actorId: req.user!.id,
    action: `maintenance_plan_${action}`,
    entityType: 'maintenance_plan',
    entityId: id,
    stateId: plan[0].state_id,
    newValues: { action, modificationReason, rejectionReason },
  });

  res.json({ success: true, message: `Maintenance plan ${action}d` });
});

// ── Get qualified workers for a plan ──────────────────────────
maintenanceRouter.get('/plans/:id/qualified-workers', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const plan = await query<any>(`SELECT * FROM maintenance_plans WHERE id = $1`, [req.params.id]);
  if (!plan[0]) throw new AppError(404, 'Plan not found');
  if (req.user!.role === 'state_admin') enforceStateAccess(plan[0].state_id, req);

  const workers = await maintenanceService.findQualifiedWorkers(
    plan[0].asset_id,
    plan[0].required_skill,
    plan[0].state_id,
    plan[0].district_id
  );

  res.json({ success: true, data: workers });
});

// ── Assign crew to a plan ──────────────────────────────────────
maintenanceRouter.post('/plans/:id/crew', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { id } = req.params;
  const { workerIds, reason } = z.object({
    workerIds: z.array(z.string().uuid()).min(1),
    reason: z.string().optional(),
  }).parse(req.body);

  const plan = await query<any>(`SELECT * FROM maintenance_plans WHERE id = $1`, [id]);
  if (!plan[0]) throw new AppError(404, 'Plan not found');
  if (req.user!.role === 'state_admin') enforceStateAccess(plan[0].state_id, req);

  // NEVER auto-assign to high-risk without admin approval
  if (['critical','high'].includes(plan[0].risk_level) && plan[0].status !== 'approved') {
    throw new AppError(
      400,
      'Plan must be admin-approved before assigning crew to a high or critical risk task'
    );
  }

  const { v4: uuidv4 } = await import('uuid');
  for (let i = 0; i < workerIds.length; i++) {
    const workerId = workerIds[i];
    const worker = await query<any>(`SELECT * FROM worker_profiles WHERE id = $1`, [workerId]);
    if (!worker[0]) continue;

    const outOfDistrict = worker[0].district_id !== plan[0].district_id;

    await query(
      `INSERT INTO crew_assignments
         (id, plan_id, worker_id, state_id, district_id,
          is_lead, approved_by, out_of_district, assignment_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        uuidv4(), id, workerId,
        plan[0].state_id, plan[0].district_id,
        i === 0, req.user!.id, outOfDistrict,
        outOfDistrict ? (reason ?? 'Local capacity full') : null,
      ]
    );
  }

  res.json({ success: true, message: `${workerIds.length} worker(s) assigned to crew` });
});
