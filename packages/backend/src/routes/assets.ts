import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireRole, enforceStateAccess } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { query } from '../database/db';
import { auditService } from '../services/auditService';
import { computeRiskForAsset } from '../services/riskEngine';

export const assetRouter = Router();

const assetSchema = z.object({
  assetCode: z.string().min(1),
  assetType: z.enum(['transformer','distribution_panel','appliance','feeder',
    'substation_equipment','pole_mounted','switchgear','cable_line','generator','other']),
  category: z.string().optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  stateId: z.string().uuid(),
  districtId: z.string().uuid(),
  addressText: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  installDate: z.string().optional(),
  ratedCapacityKva: z.number().optional(),
  currentLoadKw: z.number().optional(),
  connectedCustomers: z.number().int().optional(),
  criticalFacilities: z.string().optional(),
  sensorAvailable: z.boolean().optional(),
  status: z.string().optional(),
});

// ── Create asset ───────────────────────────────────────────────
assetRouter.post('/', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const data = assetSchema.parse(req.body);

  if (req.user!.role === 'state_admin') {
    enforceStateAccess(data.stateId, req);
  }

  // Check duplicate asset code
  const existing = await query(`SELECT id FROM assets WHERE asset_code = $1`, [data.assetCode]);
  if (existing.length > 0) throw new AppError(409, 'Asset code already exists');

  const assetId = uuidv4();
  await query(
    `INSERT INTO assets
       (id, asset_code, asset_type, category, manufacturer, model, serial_number,
        state_id, district_id, address_text, location_lat, location_lng, install_date,
        rated_capacity_kva, current_load_kw, connected_customers, critical_facilities,
        sensor_available, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
             $13,$14,$15,$16,$17,$18,$19,$20)`,
    [
      assetId, data.assetCode, data.assetType, data.category ?? null,
      data.manufacturer ?? null, data.model ?? null, data.serialNumber ?? null,
      data.stateId, data.districtId, data.addressText ?? null,
      data.lat ?? null, data.lng ?? null,
      data.installDate ?? null, data.ratedCapacityKva ?? null,
      data.currentLoadKw ?? null, data.connectedCustomers ?? 0,
      data.criticalFacilities ?? null, data.sensorAvailable ?? false,
      data.status ?? 'operational', req.user!.id,
    ]
  );

  await auditService.log({
    actorType: 'user',
    actorId: req.user!.id,
    action: 'asset_created',
    entityType: 'asset',
    entityId: assetId,
    stateId: data.stateId,
    newValues: { assetCode: data.assetCode, assetType: data.assetType },
  });

  // Compute initial risk
  await computeRiskForAsset(assetId).catch(() => null);

  res.status(201).json({ success: true, data: { assetId } });
});

// ── List assets ────────────────────────────────────────────────
assetRouter.get('/', authenticate, async (req, res) => {
  const {
    page = '1', pageSize = '20',
    stateId, districtId, assetType, riskLevel, status,
  } = req.query as Record<string, string>;

  const pageNum = parseInt(page, 10);
  const sizeNum = parseInt(pageSize, 10);
  const offset = (pageNum - 1) * sizeNum;

  const conditions: string[] = ['a.is_active = TRUE'];
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
  if (assetType)  { conditions.push(`a.asset_type = $${p++}`); params.push(assetType); }
  if (riskLevel)  { conditions.push(`a.current_risk_level = $${p++}`); params.push(riskLevel); }
  if (status)     { conditions.push(`a.status = $${p++}`); params.push(status); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const [rows, total] = await Promise.all([
    query<any>(
      `SELECT a.*, s.name AS state_name, d.name AS district_name,
              t.name AS taluka_name, v.name AS village_name,
              a.location_lng AS lng, a.location_lat AS lat
       FROM assets a
       JOIN states s ON s.id = a.state_id
       JOIN districts d ON d.id = a.district_id
       LEFT JOIN talukas t ON t.id = a.taluka_id
       LEFT JOIN villages v ON v.id = a.village_id
       ${where}
       ORDER BY a.current_risk_score DESC
       LIMIT $${p} OFFSET $${p + 1}`,
      [...params, sizeNum, offset]
    ),
    query<any>(`SELECT COUNT(*) FROM assets a ${where}`, params),
  ]);

  res.json({
    success: true,
    data: rows,
    total: parseInt(total[0]?.count ?? '0', 10),
    page: pageNum,
    pageSize: sizeNum,
  });
});

// ── Get single asset ───────────────────────────────────────────
assetRouter.get('/:id/incidents', authenticate, async (req, res) => {
  const asset = await query<any>(`SELECT state_id FROM assets WHERE id = $1`, [req.params.id]);
  if (!asset[0]) throw new AppError(404, 'Asset not found');
  if (req.user!.role === 'state_admin') enforceStateAccess(asset[0].state_id, req);
  const rows = await query<any>(
    `SELECT * FROM historical_incidents
     WHERE asset_id = $1
     ORDER BY occurred_at DESC LIMIT 10`,
    [req.params.id]
  );
  res.json({ success: true, data: rows });
});

assetRouter.get('/:id', authenticate, async (req, res) => {
  const rows = await query<any>(
    `SELECT a.*, s.name AS state_name, d.name AS district_name,
            t.name AS taluka_name, v.name AS village_name,
            a.location_lng AS lng, a.location_lat AS lat
     FROM assets a
     JOIN states s ON s.id = a.state_id
     JOIN districts d ON d.id = a.district_id
     LEFT JOIN talukas t ON t.id = a.taluka_id
     LEFT JOIN villages v ON v.id = a.village_id
     WHERE a.id = $1 AND a.is_active = TRUE`,
    [req.params.id]
  );
  if (!rows[0]) throw new AppError(404, 'Asset not found');
  if (req.user!.role === 'state_admin') enforceStateAccess(rows[0].state_id, req);
  res.json({ success: true, data: rows[0] });
});

// ── Update asset ───────────────────────────────────────────────
assetRouter.put('/:id', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { id } = req.params;
  const existing = await query<any>(`SELECT * FROM assets WHERE id = $1`, [id]);
  if (!existing[0]) throw new AppError(404, 'Asset not found');
  if (req.user!.role === 'state_admin') enforceStateAccess(existing[0].state_id, req);

  const data = assetSchema.partial().parse(req.body);

  await query(
    `UPDATE assets SET
       asset_type = COALESCE($1, asset_type),
       manufacturer = COALESCE($2, manufacturer),
       model = COALESCE($3, model),
       address_text = COALESCE($4, address_text),
       rated_capacity_kva = COALESCE($5, rated_capacity_kva),
       current_load_kw = COALESCE($6, current_load_kw),
       connected_customers = COALESCE($7, connected_customers),
       status = COALESCE($8, status),
       updated_at = NOW(), updated_by = $9
     WHERE id = $10`,
    [
      data.assetType ?? null, data.manufacturer ?? null, data.model ?? null,
      data.addressText ?? null, data.ratedCapacityKva ?? null,
      data.currentLoadKw ?? null, data.connectedCustomers ?? null,
      data.status ?? null, req.user!.id, id,
    ]
  );

  await auditService.log({
    actorType: 'user',
    actorId: req.user!.id,
    action: 'asset_updated',
    entityType: 'asset',
    entityId: id,
    stateId: existing[0].state_id,
    newValues: data,
  });

  // Recompute risk after update
  await computeRiskForAsset(id).catch(() => null);

  res.json({ success: true, message: 'Asset updated' });
});
