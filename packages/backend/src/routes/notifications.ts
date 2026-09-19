import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { query } from '../database/db';

export const notificationRouter = Router();

notificationRouter.get('/', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { page = '1', pageSize = '20' } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const sizeNum = parseInt(pageSize, 10);
  const offset = (pageNum - 1) * sizeNum;

  const rows = await query<any>(
    `SELECT * FROM notifications ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [sizeNum, offset]
  );
  const total = await query<any>(`SELECT COUNT(*) FROM notifications`);

  res.json({
    success: true,
    data: rows,
    total: parseInt(total[0]?.count ?? '0', 10),
  });
});
