import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { auditService } from '../services/auditService';

export const auditRouter = Router();

auditRouter.get('/', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const {
    actorId, entityType, entityId, stateId,
    page = '1', pageSize = '50',
  } = req.query as Record<string, string>;

  // State admins can only see their state's audit logs
  const effectiveStateId = req.user!.role === 'state_admin'
    ? req.user!.stateId
    : stateId;

  const result = await auditService.list({
    actorId,
    entityType,
    entityId,
    stateId: effectiveStateId,
    page: parseInt(page, 10),
    pageSize: parseInt(pageSize, 10),
  });

  res.json({ success: true, ...result });
});
