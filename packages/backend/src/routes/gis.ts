import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { query } from '../database/db';
import { AppError } from '../middleware/errorHandler';

export const gisRouter = Router();

// ── Assets GeoJSON (for map) ───────────────────────────────────
gisRouter.get('/assets', authenticate, async (req, res) => {
  const { stateId, districtId, riskLevel, assetType } = req.query as Record<string, string>;

  const conditions = ['a.is_active = TRUE', 'a.location_lat IS NOT NULL'];
  const params: unknown[] = [];
  let p = 1;

  // Enforce state isolation
  if (req.user!.role === 'state_admin') {
    conditions.push(`a.state_id = $${p++}`);
    params.push(req.user!.stateId);
  } else if (stateId) {
    conditions.push(`a.state_id = $${p++}`);
    params.push(stateId);
  }

  if (districtId) { conditions.push(`a.district_id = $${p++}`); params.push(districtId); }
  if (riskLevel)  { conditions.push(`a.current_risk_level = $${p++}`); params.push(riskLevel); }
  if (assetType)  { conditions.push(`a.asset_type = $${p++}`); params.push(assetType); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const rows = await query<any>(
    `SELECT a.id, a.asset_code, a.asset_type, a.current_risk_level,
            a.current_risk_score, a.status,
            a.location_lng AS lng, a.location_lat AS lat,
            s.name AS state_name, d.name AS district_name
     FROM assets a
     JOIN states s ON s.id = a.state_id
     JOIN districts d ON d.id = a.district_id
     ${where}
     LIMIT 2000`,
    params
  );

  // Return as GeoJSON FeatureCollection
  const features = rows.map((r: any) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
    properties: {
      id: r.id,
      assetCode: r.asset_code,
      assetType: r.asset_type,
      riskLevel: r.current_risk_level,
      riskScore: r.current_risk_score,
      status: r.status,
      stateName: r.state_name,
      districtName: r.district_name,
      color: riskColor(r.current_risk_level),
    },
  }));

  res.json({ type: 'FeatureCollection', features });
});

// ── Complaints GeoJSON (for map) ──────────────────────────────
gisRouter.get('/complaints', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { stateId, districtId } = req.query as Record<string, string>;

  const conditions = ['c.location_lat IS NOT NULL'];
  const params: unknown[] = [];
  let p = 1;

  if (req.user!.role === 'state_admin') {
    conditions.push(`c.state_id = $${p++}`);
    params.push(req.user!.stateId);
  } else if (stateId) {
    conditions.push(`c.state_id = $${p++}`);
    params.push(stateId);
  }
  if (districtId) { conditions.push(`c.district_id = $${p++}`); params.push(districtId); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const rows = await query<any>(
    `SELECT c.id, c.complaint_number, c.category, c.status, c.is_safety_concern,
            c.location_lng AS lng, c.location_lat AS lat,
            d.name AS district_name, s.name AS state_name
     FROM complaints c
     JOIN states s ON s.id = c.state_id
     JOIN districts d ON d.id = c.district_id
     ${where}
     LIMIT 2000`,
    params
  );

  const features = rows.map((r: any) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
    properties: {
      id: r.id,
      complaintNumber: r.complaint_number,
      category: r.category,
      status: r.status,
      isSafetyConcern: r.is_safety_concern,
      districtName: r.district_name,
      stateName: r.state_name,
    },
  }));

  res.json({ type: 'FeatureCollection', features });
});

// ── States list (no boundary geometry without PostGIS) ────────
gisRouter.get('/states', async (_req, res) => {
  const rows = await query<any>(
    `SELECT id, name, code FROM states WHERE is_active = TRUE ORDER BY name`
  );
  // Support both GeoJSON and plain data consumers
  const features = rows.map((r: any) => ({
    type: 'Feature',
    geometry: null,
    properties: { id: r.id, name: r.name, code: r.code },
  }));
  res.json({ type: 'FeatureCollection', features, data: rows });
});

// ── Districts list (no boundary geometry without PostGIS) ─────
gisRouter.get('/districts/:stateId', async (req, res) => {
  const rows = await query<any>(
    `SELECT d.id, d.name, d.code FROM districts d
     WHERE d.state_id = $1 AND d.is_active = TRUE`,
    [req.params.stateId]
  );
  const features = rows.map((r: any) => ({
    type: 'Feature',
    geometry: null,
    properties: { id: r.id, name: r.name, code: r.code },
  }));
  res.json({ type: 'FeatureCollection', features });
});

// ── Risk heatmap data ─────────────────────────────────────────
gisRouter.get('/risk-heatmap', authenticate, async (req, res) => {
  const stateId = req.user!.role === 'state_admin'
    ? req.user!.stateId
    : req.query.stateId as string | undefined;

  const conditions = ['a.is_active = TRUE', 'a.location_lat IS NOT NULL'];
  const params: unknown[] = [];
  let p = 1;
  if (stateId) { conditions.push(`a.state_id = $${p++}`); params.push(stateId); }

  const rows = await query<any>(
    `SELECT a.location_lng AS lng, a.location_lat AS lat,
            a.current_risk_score AS intensity
     FROM assets a
     WHERE ${conditions.join(' AND ')}`,
    params
  );

  res.json({ success: true, data: rows });
});

// ── Worker locations (admin only — no identity on public maps) ─
gisRouter.get('/workers', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const stateId = req.user!.role === 'state_admin'
    ? req.user!.stateId
    : req.query.stateId as string | undefined;

  const conditions = ['wp.is_active = TRUE', `wp.status = 'employed'`];
  const params: unknown[] = [];
  let p = 1;
  if (stateId) { conditions.push(`wp.state_id = $${p++}`); params.push(stateId); }

  const rows = await query<any>(
    `SELECT wp.id, wp.field_of_work, wp.status,
            d.name AS district_name, s.name AS state_name
     FROM worker_profiles wp
     JOIN states s ON s.id = wp.state_id
     JOIN districts d ON d.id = wp.district_id
     WHERE ${conditions.join(' AND ')}`,
    params
  );

  // No personal data (name, mobile, email) exposed on map
  res.json({ success: true, data: rows });
});

function riskColor(level: string): string {
  const map: Record<string, string> = {
    low: '#22c55e',
    moderate: '#eab308',
    high: '#f97316',
    critical: '#ef4444',
  };
  return map[level] ?? '#6b7280';
}

// ── Districts by query param ?stateId= (for frontend dropdowns) ─
gisRouter.get('/districts', async (req, res) => {
  const { stateId } = req.query as Record<string, string>;
  if (!stateId) {
    res.json({ success: true, data: [] });
    return;
  }
  const rows = await query<any>(
    `SELECT id, name, code FROM districts WHERE state_id = $1 AND is_active = TRUE ORDER BY name`,
    [stateId]
  );
  res.json({ success: true, data: rows });
});

// ── Talukas by ?districtId= ────────────────────────────────────
gisRouter.get('/talukas', async (req, res) => {
  const { districtId } = req.query as Record<string, string>;
  if (!districtId) { res.json({ success: true, data: [] }); return; }
  const rows = await query<any>(
    `SELECT id, name FROM talukas WHERE district_id = $1 AND is_active = TRUE ORDER BY name`,
    [districtId]
  );
  res.json({ success: true, data: rows });
});

// ── Villages by ?talukaId= ─────────────────────────────────────
gisRouter.get('/villages', async (req, res) => {
  const { talukaId } = req.query as Record<string, string>;
  if (!talukaId) { res.json({ success: true, data: [] }); return; }
  const rows = await query<any>(
    `SELECT id, name FROM villages WHERE taluka_id = $1 AND is_active = TRUE ORDER BY name`,
    [talukaId]
  );
  res.json({ success: true, data: rows });
});

// ── States flat list for dropdowns ────────────────────────────
gisRouter.get('/states/list', async (_req, res) => {
  const rows = await query<any>(
    `SELECT id, name, code FROM states WHERE is_active = TRUE ORDER BY name`
  );
  res.json({ success: true, data: rows });
});
