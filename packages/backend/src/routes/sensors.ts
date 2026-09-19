import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireRole } from '../middleware/auth';
import { query } from '../database/db';
import { weatherService } from '../services/weatherService';
import { AppError } from '../middleware/errorHandler';

export const weatherRouter = Router();

// ── Ingest/refresh weather for a district ─────────────────────
weatherRouter.post('/ingest/:districtId', authenticate, requireRole('super_admin', 'state_admin'), async (req, res) => {
  const { districtId } = req.params;
  const { lat, lng } = z.object({
    lat: z.number().optional(),
    lng: z.number().optional(),
  }).parse(req.body);

  const data = await weatherService.ingestAndStore(districtId, lat, lng);
  res.json({ success: true, data });
});

// ── Get latest weather for a district ─────────────────────────
weatherRouter.get('/district/:districtId', authenticate, async (req, res) => {
  const rows = await query<any>(
    `SELECT * FROM weather_records WHERE district_id = $1
     ORDER BY recorded_at DESC LIMIT 5`,
    [req.params.districtId]
  );
  res.json({ success: true, data: rows });
});

// ── Sensor ingestion ───────────────────────────────────────────
export const sensorRouter = Router();

sensorRouter.post('/readings', authenticate, async (req, res) => {
  const schema = z.object({
    readings: z.array(z.object({
      sensorId: z.string().uuid(),
      value: z.number().optional(),
      isOutlier: z.boolean().optional(),
      isMissing: z.boolean().optional(),
      sensorFailed: z.boolean().optional(),
      faultCode: z.string().optional(),
      recordedAt: z.string().optional(),
    })),
  });

  const { readings } = schema.parse(req.body);

  for (const reading of readings) {
    const sensor = await query<any>(
      `SELECT * FROM asset_sensors WHERE id = $1`,
      [reading.sensorId]
    );
    if (!sensor[0]) continue;

    const asset = await query<any>(
      `SELECT state_id, district_id FROM assets WHERE id = $1`,
      [sensor[0].asset_id]
    );
    if (!asset[0]) continue;

    await query(
      `INSERT INTO sensor_readings
         (id, sensor_id, asset_id, state_id, district_id, value, unit,
          is_outlier, is_missing, sensor_failed, fault_code, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        uuidv4(),
        reading.sensorId,
        sensor[0].asset_id,
        asset[0].state_id,
        asset[0].district_id,
        reading.value ?? null,
        sensor[0].unit,
        reading.isOutlier ?? false,
        reading.isMissing ?? false,
        reading.sensorFailed ?? false,
        reading.faultCode ?? null,
        reading.recordedAt ?? new Date().toISOString(),
      ]
    );
  }

  res.json({ success: true, message: `${readings.length} reading(s) ingested` });
});

sensorRouter.get('/asset/:assetId', authenticate, async (req, res) => {
  const rows = await query<any>(
    `SELECT sr.*, ase.sensor_type, ase.unit AS sensor_unit
     FROM sensor_readings sr
     JOIN asset_sensors ase ON ase.id = sr.sensor_id
     WHERE sr.asset_id = $1
     ORDER BY sr.recorded_at DESC LIMIT 50`,
    [req.params.assetId]
  );
  res.json({ success: true, data: rows });
});
