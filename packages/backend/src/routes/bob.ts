/**
 * NEXORA AI — IBM Bob / watsonx.ai Triage Routes
 *
 * POST /api/bob/triage        — run triage for an alert (calls watsonx or fallback)
 * GET  /api/bob/triage/:alertId — get cached triage result
 */

import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { triageAlert } from '../services/bobService';
import { query } from '../database/db';

export const bobRouter = Router();

/**
 * POST /api/bob/triage
 * Body: { alert_id: string }
 * Auth: state_admin, super_admin, worker
 */
bobRouter.post(
  '/triage',
  authenticate,
  requireRole('state_admin', 'super_admin', 'worker'),
  async (req: Request, res: Response) => {
    const { alert_id } = req.body as { alert_id?: string };

    if (!alert_id) {
      return res.status(400).json({
        success: false,
        message: 'alert_id is required in request body',
      });
    }

    // Verify alert exists and user has access
    const alertCheck = await query<any>(
      `SELECT a.id, a.state_id FROM alerts a WHERE a.id = $1`,
      [alert_id]
    );

    if (alertCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    const user = (req as any).user;
    if (user.role === 'state_admin' && alertCheck[0].state_id !== user.stateId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: alert belongs to a different state',
      });
    }

    const result = await triageAlert(alert_id);

    return res.json({ success: true, data: result });
  }
);

/**
 * GET /api/bob/triage/:alertId
 * Returns the most recent cached triage result for an alert
 */
bobRouter.get(
  '/triage/:alertId',
  authenticate,
  requireRole('state_admin', 'super_admin', 'worker'),
  async (req: Request, res: Response) => {
    const { alertId } = req.params;

    const cached = await query<any>(
      `SELECT * FROM bob_triage_cache
       WHERE alert_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [alertId]
    );

    if (cached.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No triage result found for this alert. Call POST /api/bob/triage first.',
      });
    }

    const row = cached[0];
    return res.json({
      success: true,
      data: {
        triage_id: row.id,
        alert_id: alertId,
        summary: row.summary,
        recommended_action: row.recommended_action,
        urgency_level: row.urgency_level,
        powered_by: row.powered_by,
        cached: true,
        created_at: row.created_at,
      },
    });
  }
);
