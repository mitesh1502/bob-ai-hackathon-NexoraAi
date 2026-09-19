import { Router } from 'express';
import { query } from '../database/db';

export const citizenRouter = Router();

citizenRouter.get('/states', async (_req, res) => {
  const rows = await query<any>(
    `SELECT id, name, code FROM states WHERE is_active = TRUE ORDER BY name`
  );
  res.json({ success: true, data: rows });
});

citizenRouter.get('/districts/:stateId', async (req, res) => {
  const rows = await query<any>(
    `SELECT id, name FROM districts WHERE state_id = $1 AND is_active = TRUE ORDER BY name`,
    [req.params.stateId]
  );
  res.json({ success: true, data: rows });
});

// GET /api/citizens/talukas/:districtId
citizenRouter.get('/talukas/:districtId', async (req, res) => {
  const rows = await query<any>(
    `SELECT id, name FROM talukas WHERE district_id = $1 AND is_active = TRUE ORDER BY name`,
    [req.params.districtId]
  );
  res.json({ success: true, data: rows });
});

// GET /api/citizens/villages/:talukaId
citizenRouter.get('/villages/:talukaId', async (req, res) => {
  const rows = await query<any>(
    `SELECT id, name FROM villages WHERE taluka_id = $1 AND is_active = TRUE ORDER BY name`,
    [req.params.talukaId]
  );
  res.json({ success: true, data: rows });
});
