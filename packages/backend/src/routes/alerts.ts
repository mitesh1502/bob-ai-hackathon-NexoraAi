/**
 * NEXORA AI — Alert Routes
 *
 * Endpoints:
 *   POST   /api/alerts                        Create alert (state_admin / super_admin)
 *   GET    /api/alerts                        List alerts (state-scoped)
 *   GET    /api/alerts/:id                    Get single alert with full context
 *   PATCH  /api/alerts/:id/status             Transition alert status
 *   GET    /api/alerts/:id/worker-recommendations  Ranked candidate list
 *   POST   /api/alerts/:id/assign             Assign worker
 *   POST   /api/alerts/:alertId/assignments/:assignmentId/respond   Worker accept/decline
 *   POST   /api/alerts/:id/arrival            Record worker arrival + GPS check
 *   POST   /api/alerts/:id/reports            Submit field report
 *   PATCH  /api/alerts/:id/reports/:reportId/review  Admin review
 *   POST   /api/alerts/:id/corrective-actions  Create corrective action
 *   PATCH  /api/alerts/:id/corrective-actions/:actionId/complete  Mark completed with evidence
 *   POST   /api/alerts/:id/followup           Request follow-up inspection
 *   POST   /api/alerts/:id/escalate           Escalate alert
 *   PATCH  /api/alerts/:id/close              Close alert after verification
 */

import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { authenticate, requireRole, enforceStateAccess } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { query, transaction } from '../database/db';
import { storageService } from '../services/storageService';
import { auditService } from '../services/auditService';
import {
  recommendWorkersForAlert,
  recordAssignment,
  haversineKm,
} from '../services/alertAssignmentService';
import {
  computeAlertRisk,
  persistAlertRiskHistory,
  applyAlertRiskToAsset,
} from '../services/alertRiskPipeline';
import { sendAlertNotification } from '../services/notificationService';
import { config } from '../config/env';

export const alertRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
});

// ── Helpers ───────────────────────────────────────────────────

async function recordStatusChange(params: {
  alertId: string;
  fromStatus: string | null;
  toStatus: string;
  changedByType: 'user' | 'worker' | 'system';
  changedBy: string | null;
  reason?: string | null;
  metadata?: object | null;
}): Promise<void> {
  await query(
    `INSERT INTO alert_status_history
       (id, alert_id, from_status, to_status, changed_by_type, changed_by, reason, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      uuidv4(),
      params.alertId,
      params.fromStatus,
      params.toStatus,
      params.changedByType,
      params.changedBy,
      params.reason ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null,
    ]
  );
}

async function updateAlertStatus(
  alertId: string,
  toStatus: string,
  updatedBy: string
): Promise<void> {
  await query(
    `UPDATE alerts SET status = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3`,
    [toStatus, updatedBy, alertId]
  );
}

// ── Schemas ───────────────────────────────────────────────────

const createAlertSchema = z.object({
  // Section 1 — Identification
  title: z.string().min(3).max(400),
  category: z.enum([
    'electrical_fault', 'structural_damage', 'safety_hazard',
    'maintenance_overdue', 'sensor_anomaly', 'weather_related',
    'citizen_complaint', 'operational_failure', 'environmental', 'other',
  ]),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  severity: z.enum(['minor', 'moderate', 'major', 'critical']).default('moderate'),
  sourceType: z.enum([
    'citizen_complaint', 'critical_asset', 'risk_score_jump', 'sensor_warning',
    'weather_warning', 'repeated_outage', 'multiple_complaints', 'prior_worker_report',
    'maintenance_failure', 'unmonitored_area', 'safety_issue', 'operator_report',
    'ai_prediction', 'department_request', 'system_threshold',
  ]),
  linkedComplaintId: z.string().uuid().optional().nullable(),
  linkedAssetId: z.string().uuid().optional().nullable(),
  linkedRiskPredictionId: z.string().uuid().optional().nullable(),

  // Section 2 — Geographic
  stateId: z.string().uuid(),
  districtId: z.string().uuid(),
  talukaId: z.string().uuid().optional().nullable(),
  villageId: z.string().uuid().optional().nullable(),
  areaType: z.enum(['rural', 'urban', 'semi_urban']).optional().nullable(),
  pinCode: z.string().optional().nullable(),
  fullAddress: z.string().optional().nullable(),
  locationLat: z.number().optional().nullable(),
  locationLng: z.number().optional().nullable(),
  accessInstructions: z.string().optional().nullable(),
  nearbyLandmark: z.string().optional().nullable(),
  serviceAreaBoundary: z.any().optional().nullable(),

  // Section 3 — Problem info
  description: z.string().min(10),
  potentialImpact: z.string().optional().nullable(),
  detectedAt: z.string().optional().nullable(),
  assetCondition: z.string().optional().nullable(),
  currentRiskScore: z.number().optional().nullable(),
  previousRiskScore: z.number().optional().nullable(),
  mainRiskFactors: z.any().optional().nullable(),
  isSafetyConcern: z.boolean().default(false),
  publicImpact: z.string().optional().nullable(),
  affectedCustomerCount: z.number().int().optional().nullable(),
  criticalFacilities: z.string().optional().nullable(),
  requiredTechnicalField: z.string().optional().nullable(),
  requiredQualification: z.string().optional().nullable(),
  recommendedResponseDeadline: z.string().optional().nullable(),

  // Section 4 — Evidence
  evidenceLinks: z.array(z.object({
    type: z.string(),
    url: z.string(),
    id: z.string().optional(),
    label: z.string().optional(),
  })).optional().nullable(),
});

// ── POST /api/alerts — Create alert ──────────────────────────
alertRouter.post(
  '/',
  authenticate,
  requireRole('super_admin', 'state_admin'),
  async (req, res) => {
    const data = createAlertSchema.parse(req.body);

    if (req.user!.role === 'state_admin') {
      enforceStateAccess(data.stateId, req);
    }

    // Validate linked complaint/asset belong to the same state
    if (data.linkedAssetId) {
      const asset = await query<any>(`SELECT state_id FROM assets WHERE id = $1`, [data.linkedAssetId]);
      if (!asset[0]) throw new AppError(404, 'Linked asset not found');
      if (asset[0].state_id !== data.stateId) {
        throw new AppError(400, 'Linked asset does not belong to the selected state');
      }
    }
    if (data.linkedComplaintId) {
      const complaint = await query<any>(`SELECT state_id FROM complaints WHERE id = $1`, [data.linkedComplaintId]);
      if (!complaint[0]) throw new AppError(404, 'Linked complaint not found');
      if (complaint[0].state_id !== data.stateId) {
        throw new AppError(400, 'Linked complaint does not belong to the selected state');
      }
    }

    // Geo mismatch warning: if lat/lng provided, verify it roughly matches district
    // (we check whether any district lookup would point elsewhere — front-end handles the UI warning)
    let geoMismatchWarned = false;
    if (data.locationLat != null && data.locationLng != null) {
      // Simplified check: flag as warned; full GIS check requires PostGIS
      geoMismatchWarned = false; // Set to true if GIS mismatch detected
    }

    const alertId = uuidv4();
    const alertNumber = `ALT-${Date.now().toString(36).toUpperCase()}`;

    await transaction(async (client) => {
      await client.query(
        `INSERT INTO alerts (
          id, alert_number, title, category, priority, severity, source_type,
          linked_complaint_id, linked_asset_id, linked_risk_prediction_id,
          state_id, district_id, taluka_id, village_id, area_type, pin_code,
          full_address, location_lat, location_lng, location_confirmed_by,
          geo_mismatch_warned, access_instructions, nearby_landmark, service_area_boundary,
          description, potential_impact, detected_at, asset_condition,
          current_risk_score, previous_risk_score, main_risk_factors,
          is_safety_concern, public_impact, affected_customer_count,
          critical_facilities, required_technical_field, required_qualification,
          recommended_response_deadline, evidence_links,
          status, created_by
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
          $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
          $31,$32,$33,$34,$35,$36,$37,$38,$39,'new',$40
        )`,
        [
          alertId, alertNumber, data.title, data.category, data.priority, data.severity, data.sourceType,
          data.linkedComplaintId ?? null, data.linkedAssetId ?? null, data.linkedRiskPredictionId ?? null,
          data.stateId, data.districtId, data.talukaId ?? null, data.villageId ?? null,
          data.areaType ?? null, data.pinCode ?? null, data.fullAddress ?? null,
          data.locationLat ?? null, data.locationLng ?? null, req.user!.id,
          geoMismatchWarned, data.accessInstructions ?? null, data.nearbyLandmark ?? null,
          data.serviceAreaBoundary ? JSON.stringify(data.serviceAreaBoundary) : null,
          data.description, data.potentialImpact ?? null,
          data.detectedAt ? new Date(data.detectedAt).toISOString() : null,
          data.assetCondition ?? null, data.currentRiskScore ?? null, data.previousRiskScore ?? null,
          data.mainRiskFactors ? JSON.stringify(data.mainRiskFactors) : null,
          data.isSafetyConcern, data.publicImpact ?? null, data.affectedCustomerCount ?? null,
          data.criticalFacilities ?? null, data.requiredTechnicalField ?? null,
          data.requiredQualification ?? null,
          data.recommendedResponseDeadline ? new Date(data.recommendedResponseDeadline).toISOString() : null,
          data.evidenceLinks ? JSON.stringify(data.evidenceLinks) : null,
          req.user!.id,
        ]
      );

      await client.query(
        `INSERT INTO alert_status_history
           (id, alert_id, from_status, to_status, changed_by_type, changed_by, reason)
         VALUES ($1,$2,NULL,'new','user',$3,'Alert created')`,
        [uuidv4(), alertId, req.user!.id]
      );
    });

    await auditService.log({
      actorType: 'user',
      actorId: req.user!.id,
      action: 'alert_created',
      entityType: 'alert',
      entityId: alertId,
      stateId: data.stateId,
      newValues: { alertNumber, title: data.title, priority: data.priority, sourceType: data.sourceType },
    });

    // Notify state admin (confirmation) via in-app
    await sendAlertNotification({
      alertId,
      event: 'alert_created',
      recipientType: 'state_admin',
      recipientId: req.user!.id,
      variables: {
        alertNumber,
        title: data.title,
        priority: data.priority,
        sourceType: data.sourceType,
      },
    });

    res.status(201).json({
      success: true,
      data: { alertId, alertNumber },
      message: `Alert ${alertNumber} created successfully`,
    });
  }
);

// ── GET /api/alerts — List alerts ────────────────────────────
alertRouter.get(
  '/',
  authenticate,
  requireRole('super_admin', 'state_admin', 'worker'),
  async (req, res) => {
    const {
      page = '1', pageSize = '20',
      status, priority, category, districtId, talukaId, villageId,
    } = req.query as Record<string, string>;

    const pageNum = parseInt(page, 10);
    const sizeNum = Math.min(parseInt(pageSize, 10), 100);
    const offset = (pageNum - 1) * sizeNum;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    // State isolation
    if (req.user!.role === 'state_admin') {
      conditions.push(`a.state_id = $${p++}`);
      params.push(req.user!.stateId);
    }
    // Worker sees only alerts assigned to them
    if (req.user!.role === 'worker') {
      conditions.push(
        `a.id IN (SELECT alert_id FROM alert_assignments WHERE worker_id = $${p++} AND is_active = TRUE)`
      );
      params.push(req.user!.id);
    }

    if (status)     { conditions.push(`a.status = $${p++}`);      params.push(status); }
    if (priority)   { conditions.push(`a.priority = $${p++}`);    params.push(priority); }
    if (category)   { conditions.push(`a.category = $${p++}`);    params.push(category); }
    if (districtId) { conditions.push(`a.district_id = $${p++}`); params.push(districtId); }
    if (talukaId)   { conditions.push(`a.taluka_id = $${p++}`);   params.push(talukaId); }
    if (villageId)  { conditions.push(`a.village_id = $${p++}`);  params.push(villageId); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows, countRows] = await Promise.all([
      query<any>(
        `SELECT a.id, a.alert_number, a.title, a.category, a.priority, a.severity,
                a.source_type, a.status, a.is_safety_concern,
                a.location_lat, a.location_lng, a.full_address,
                a.current_risk_score, a.recommended_response_deadline,
                a.linked_asset_id, a.linked_complaint_id,
                a.created_at, a.updated_at,
                s.name  AS state_name,
                d.name  AS district_name,
                t.name  AS taluka_name,
                v.name  AS village_name,
                -- active assignment worker
                (SELECT wp.full_name FROM alert_assignments aa
                 JOIN worker_profiles wp ON wp.id = aa.worker_id
                 WHERE aa.alert_id = a.id AND aa.is_active = TRUE
                 ORDER BY aa.assigned_at DESC LIMIT 1) AS assigned_worker_name
         FROM alerts a
         LEFT JOIN states   s ON s.id = a.state_id
         LEFT JOIN districts d ON d.id = a.district_id
         LEFT JOIN talukas  t ON t.id = a.taluka_id
         LEFT JOIN villages v ON v.id = a.village_id
         ${where}
         ORDER BY
           CASE a.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                           WHEN 'medium' THEN 3 ELSE 4 END,
           a.created_at DESC
         LIMIT $${p} OFFSET $${p + 1}`,
        [...params, sizeNum, offset]
      ),
      query<any>(`SELECT COUNT(*) FROM alerts a ${where}`, params),
    ]);

    res.json({
      success: true,
      data: rows,
      total: parseInt(countRows[0]?.count ?? '0', 10),
      page: pageNum,
      pageSize: sizeNum,
    });
  }
);

// ── GET /api/alerts/:id — Get full alert context ──────────────
alertRouter.get(
  '/:id',
  authenticate,
  requireRole('super_admin', 'state_admin', 'worker'),
  async (req, res) => {
    const { id } = req.params;

    const rows = await query<any>(
      `SELECT a.*,
              s.name  AS state_name,
              d.name  AS district_name,
              t.name  AS taluka_name,
              v.name  AS village_name
       FROM alerts a
       LEFT JOIN states   s ON s.id = a.state_id
       LEFT JOIN districts d ON d.id = a.district_id
       LEFT JOIN talukas  t ON t.id = a.taluka_id
       LEFT JOIN villages v ON v.id = a.village_id
       WHERE a.id = $1`,
      [id]
    );
    if (!rows[0]) throw new AppError(404, 'Alert not found');
    const alert = rows[0];

    // Access control
    if (req.user!.role === 'state_admin') enforceStateAccess(alert.state_id, req);
    if (req.user!.role === 'worker') {
      const assignment = await query<any>(
        `SELECT id FROM alert_assignments WHERE alert_id = $1 AND worker_id = $2 AND is_active = TRUE`,
        [id, req.user!.id]
      );
      if (!assignment[0]) throw new AppError(403, 'Access denied');
    }

    // Enrich with related data
    const [assignments, statusHistory, arrivals, fieldReports, escalations] = await Promise.all([
      query<any>(
        `SELECT aa.*, wp.full_name AS worker_name, wp.field_of_work, wp.mobile
         FROM alert_assignments aa
         JOIN worker_profiles wp ON wp.id = aa.worker_id
         WHERE aa.alert_id = $1
         ORDER BY aa.assigned_at DESC`,
        [id]
      ),
      query<any>(
        `SELECT * FROM alert_status_history
         WHERE alert_id = $1 ORDER BY changed_at ASC`,
        [id]
      ),
      query<any>(
        `SELECT * FROM worker_arrival_records WHERE alert_id = $1 ORDER BY arrived_at DESC`,
        [id]
      ),
      query<any>(
        `SELECT afr.*, wp.full_name AS worker_name
         FROM alert_field_reports afr
         JOIN worker_profiles wp ON wp.id = afr.worker_id
         WHERE afr.alert_id = $1
         ORDER BY afr.created_at DESC`,
        [id]
      ),
      query<any>(
        `SELECT * FROM alert_escalations WHERE alert_id = $1 ORDER BY created_at DESC`,
        [id]
      ),
    ]);

    res.json({
      success: true,
      data: {
        ...alert,
        assignments,
        statusHistory,
        arrivals,
        fieldReports,
        escalations,
      },
    });
  }
);

// ── PATCH /api/alerts/:id/status — Transition status ─────────
alertRouter.patch(
  '/:id/status',
  authenticate,
  requireRole('super_admin', 'state_admin'),
  async (req, res) => {
    const { id } = req.params;
    const { toStatus, reason } = z.object({
      toStatus: z.string(),
      reason: z.string().optional(),
    }).parse(req.body);

    const alert = await query<any>(`SELECT * FROM alerts WHERE id = $1`, [id]);
    if (!alert[0]) throw new AppError(404, 'Alert not found');
    if (req.user!.role === 'state_admin') enforceStateAccess(alert[0].state_id, req);

    const fromStatus = alert[0].status;

    await updateAlertStatus(id, toStatus, req.user!.id);
    await recordStatusChange({
      alertId: id,
      fromStatus,
      toStatus,
      changedByType: 'user',
      changedBy: req.user!.id,
      reason: reason ?? null,
    });

    await auditService.log({
      actorType: 'user',
      actorId: req.user!.id,
      action: 'alert_status_changed',
      entityType: 'alert',
      entityId: id,
      stateId: alert[0].state_id,
      oldValues: { status: fromStatus },
      newValues: { status: toStatus, reason },
    });

    res.json({ success: true, message: `Alert status updated to ${toStatus}` });
  }
);

// ── GET /api/alerts/:id/worker-recommendations ───────────────
alertRouter.get(
  '/:id/worker-recommendations',
  authenticate,
  requireRole('super_admin', 'state_admin'),
  async (req, res) => {
    const { id } = req.params;

    const alert = await query<any>(`SELECT * FROM alerts WHERE id = $1`, [id]);
    if (!alert[0]) throw new AppError(404, 'Alert not found');
    if (req.user!.role === 'state_admin') enforceStateAccess(alert[0].state_id, req);

    const recommendations = await recommendWorkersForAlert({
      stateId: alert[0].state_id,
      districtId: alert[0].district_id,
      talukaId: alert[0].taluka_id,
      villageId: alert[0].village_id,
      lat: alert[0].location_lat,
      lng: alert[0].location_lng,
      requiredField: alert[0].required_technical_field,
      requiredQualification: alert[0].required_qualification,
      recommendedResponseDeadline: alert[0].recommended_response_deadline,
    });

    res.json({ success: true, data: recommendations });
  }
);

// ── POST /api/alerts/:id/assign — Assign worker ───────────────
alertRouter.post(
  '/:id/assign',
  authenticate,
  requireRole('super_admin', 'state_admin'),
  async (req, res) => {
    const { id } = req.params;
    const {
      workerId, assignmentReason, recommendationRank, recommendationReasons,
      expectedArrivalAt, expectedReportBy, reassignmentReason,
    } = z.object({
      workerId: z.string().uuid(),
      assignmentReason: z.string().min(5),
      recommendationRank: z.number().int().min(1).optional(),
      recommendationReasons: z.array(z.object({
        code: z.string(), label: z.string(), score: z.number(),
      })).optional(),
      expectedArrivalAt: z.string().optional().nullable(),
      expectedReportBy: z.string().optional().nullable(),
      reassignmentReason: z.string().optional().nullable(),
    }).parse(req.body);

    const alert = await query<any>(`SELECT * FROM alerts WHERE id = $1`, [id]);
    if (!alert[0]) throw new AppError(404, 'Alert not found');
    if (req.user!.role === 'state_admin') enforceStateAccess(alert[0].state_id, req);

    // Check worker state — cross-state requires Super Admin auth
    const worker = await query<any>(
      `SELECT wp.*, s.name AS state_name FROM worker_profiles wp
       LEFT JOIN states s ON s.id = wp.assigned_state_id
       WHERE wp.id = $1 AND wp.status = 'employed' AND wp.is_active = TRUE`,
      [workerId]
    );
    if (!worker[0]) throw new AppError(404, 'Worker not found or not employed');

    if (worker[0].assigned_state_id !== alert[0].state_id) {
      if (req.user!.role !== 'super_admin') {
        // Check if cross-state auth exists
        const auth = await query<any>(
          `SELECT id FROM cross_state_authorizations
           WHERE alert_id = $1 AND worker_id = $2 AND status = 'authorized'`,
          [id, workerId]
        );
        if (!auth[0]) {
          throw new AppError(403, 'Cross-state assignment requires Super Admin authorization');
        }
      }
    }

    // Mandatory reassignment reason if there's an existing active assignment
    const existingAssignment = await query<any>(
      `SELECT id FROM alert_assignments WHERE alert_id = $1 AND is_active = TRUE`,
      [id]
    );
    if (existingAssignment[0] && !reassignmentReason) {
      throw new AppError(400, 'A reassignment reason is required when reassigning an alert');
    }

    const fromStatus = alert[0].status;
    const assignmentId = await recordAssignment({
      alertId: id,
      workerId,
      assignedBy: req.user!.id,
      assignmentReason,
      recommendationRank: recommendationRank ?? 0,
      recommendationReasons: recommendationReasons ?? [],
      expectedArrivalAt: expectedArrivalAt ?? null,
      expectedReportBy: expectedReportBy ?? null,
      reassignmentReason: reassignmentReason ?? null,
    });

    await updateAlertStatus(id, 'assigned_to_worker', req.user!.id);
    await recordStatusChange({
      alertId: id,
      fromStatus,
      toStatus: 'assigned_to_worker',
      changedByType: 'user',
      changedBy: req.user!.id,
      reason: reassignmentReason ?? assignmentReason,
      metadata: { assignmentId, workerId },
    });

    // Notify worker
    await sendAlertNotification({
      alertId: id,
      event: 'alert_assigned_to_worker',
      recipientType: 'worker',
      recipientId: workerId,
      recipientEmail: worker[0].email,
      recipientMobile: worker[0].mobile,
      variables: {
        alertNumber: alert[0].alert_number,
        workerName: worker[0].full_name,
        location: alert[0].full_address ?? `${alert[0].location_lat ?? ''},${alert[0].location_lng ?? ''}`,
        deadline: alert[0].recommended_response_deadline
          ? new Date(alert[0].recommended_response_deadline).toLocaleString('en-IN')
          : 'ASAP',
      },
    });

    await auditService.log({
      actorType: 'user',
      actorId: req.user!.id,
      action: existingAssignment[0] ? 'alert_reassigned' : 'alert_assigned',
      entityType: 'alert',
      entityId: id,
      stateId: alert[0].state_id,
      newValues: { workerId, assignmentReason, reassignmentReason: reassignmentReason ?? null },
    });

    res.status(201).json({
      success: true,
      data: { assignmentId },
      message: `Alert assigned to worker successfully`,
    });
  }
);

// ── POST /api/alerts/:alertId/assignments/:assignmentId/respond — Worker response ──
alertRouter.post(
  '/:alertId/assignments/:assignmentId/respond',
  authenticate,
  requireRole('worker'),
  async (req, res) => {
    const { alertId, assignmentId } = req.params;
    const { action, reason } = z.object({
      action: z.enum(['accept', 'decline', 'request_reassignment', 'report_inaccessible', 'report_unsafe']),
      reason: z.string().optional(),
    }).parse(req.body);

    if (action !== 'accept' && !reason) {
      throw new AppError(400, `A reason is required for action: ${action}`);
    }

    const assignment = await query<any>(
      `SELECT aa.*, a.state_id, a.alert_number, a.status AS alert_status
       FROM alert_assignments aa
       JOIN alerts a ON a.id = aa.alert_id
       WHERE aa.id = $1 AND aa.worker_id = $2 AND aa.is_active = TRUE`,
      [assignmentId, req.user!.id]
    );
    if (!assignment[0]) throw new AppError(404, 'Assignment not found');
    if (assignment[0].alert_id !== alertId) throw new AppError(400, 'Assignment does not belong to this alert');

    const acceptanceMap: Record<string, string> = {
      accept: 'accepted',
      decline: 'declined',
      request_reassignment: 'reassignment_requested',
      report_inaccessible: 'reassignment_requested',
      report_unsafe: 'reassignment_requested',
    };
    const alertStatusMap: Record<string, string> = {
      accept: 'accepted_by_worker',
      decline: 'assignment_declined',
      request_reassignment: 'worker_assignment_pending',
      report_inaccessible: 'location_inaccessible',
      report_unsafe: 'unsafe_to_enter',
    };

    const newAcceptanceStatus = acceptanceMap[action];
    const newAlertStatus = alertStatusMap[action];
    const now = new Date().toISOString();

    await query(
      `UPDATE alert_assignments
       SET acceptance_status = $1,
           declined_reason   = $2,
           accepted_at       = $3,
           declined_at       = $4
       WHERE id = $5`,
      [
        newAcceptanceStatus,
        action !== 'accept' ? (reason ?? null) : null,
        action === 'accept' ? now : null,
        action !== 'accept' ? now : null,
        assignmentId,
      ]
    );

    await updateAlertStatus(alertId, newAlertStatus, req.user!.id);
    await recordStatusChange({
      alertId,
      fromStatus: assignment[0].alert_status,
      toStatus: newAlertStatus,
      changedByType: 'worker',
      changedBy: req.user!.id,
      reason: reason ?? null,
      metadata: { action, assignmentId },
    });

    // Notify state admin of acceptance/decline
    const notifEvent = action === 'accept'
      ? 'alert_accepted_by_worker'
      : action === 'decline'
        ? 'alert_declined_by_worker'
        : 'alert_location_inaccessible';

    const adminRows = await query<any>(
      `SELECT u.id, u.email FROM users u WHERE u.role = 'state_admin' AND u.state_id = $1`,
      [assignment[0].state_id]
    );
    for (const admin of adminRows) {
      await sendAlertNotification({
        alertId,
        event: notifEvent,
        recipientType: 'state_admin',
        recipientId: admin.id,
        recipientEmail: admin.email,
        variables: {
          alertNumber: assignment[0].alert_number,
          workerName: req.user!.email ?? '',
          reason: reason ?? '',
        },
      });
    }

    res.json({ success: true, message: `Assignment ${action}ed successfully` });
  }
);

// ── POST /api/alerts/:alertId/arrival — Record arrival + GPS ─
alertRouter.post(
  '/:alertId/arrival',
  authenticate,
  requireRole('worker'),
  upload.single('arrivalPhoto'),
  async (req, res) => {
    const { alertId } = req.params;
    const arrivalData = z.object({
      assignmentId: z.string().uuid(),
      assetId: z.string().uuid().optional().nullable(),
      complaintId: z.string().uuid().optional().nullable(),
      gpsLat: z.number().optional().nullable(),
      gpsLng: z.number().optional().nullable(),
      gpsAccuracyM: z.number().optional().nullable(),
      deviceInfo: z.any().optional().nullable(),
      workerMismatchExplanation: z.string().optional().nullable(),
      gpsUnavailableReason: z.string().optional().nullable(),
      gpsExceptionEvidence: z.string().optional().nullable(),
    }).parse(typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body);

    const assignment = await query<any>(
      `SELECT aa.*, a.location_lat AS assigned_lat, a.location_lng AS assigned_lng,
               a.state_id, a.alert_number, a.status AS alert_status,
               a.is_safety_concern
       FROM alert_assignments aa
       JOIN alerts a ON a.id = aa.alert_id
       WHERE aa.id = $1 AND aa.worker_id = $2 AND aa.is_active = TRUE`,
      [arrivalData.assignmentId, req.user!.id]
    );
    if (!assignment[0]) throw new AppError(403, 'Assignment not found or not yours');
    if (assignment[0].alert_id !== alertId) throw new AppError(400, 'Assignment mismatch');

    // Calculate distance from assigned coordinates
    const GPS_TOLERANCE_M = 200;
    let distanceM: number | null = null;
    let gpsStatus: string = 'pending';

    if (
      arrivalData.gpsLat != null && arrivalData.gpsLng != null &&
      assignment[0].assigned_lat != null && assignment[0].assigned_lng != null
    ) {
      const distKm = haversineKm(
        arrivalData.gpsLat, arrivalData.gpsLng,
        assignment[0].assigned_lat, assignment[0].assigned_lng
      );
      distanceM = Math.round(distKm * 1000);
      gpsStatus = distanceM <= GPS_TOLERANCE_M ? 'verified' : 'mismatch_confirmed';
    } else if (arrivalData.gpsUnavailableReason) {
      gpsStatus = 'gps_unavailable_exception';
    }

    // Upload arrival photo if provided
    let arrivalPhotoUrl: string | null = null;
    let arrivalPhotoHash: string | null = null;
    if (req.file) {
      arrivalPhotoUrl = await storageService.upload(
        req.file.buffer, req.file.originalname, req.file.mimetype,
        `alerts/${alertId}/arrival`
      );
      arrivalPhotoHash = crypto
        .createHash('sha256')
        .update(req.file.buffer)
        .digest('hex');
    }

    const arrivalId = uuidv4();
    await query(
      `INSERT INTO worker_arrival_records (
        id, alert_id, assignment_id, worker_id, asset_id, complaint_id,
        gps_lat, gps_lng, gps_accuracy_m, device_info,
        assigned_lat, assigned_lng, distance_from_assigned_m,
        gps_tolerance_m, gps_status,
        mismatch_confirmed_by_worker, worker_mismatch_explanation,
        gps_unavailable_reason, gps_exception_evidence,
        arrival_photo_url, arrival_photo_hash
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [
        arrivalId, alertId, arrivalData.assignmentId, req.user!.id,
        arrivalData.assetId ?? null, arrivalData.complaintId ?? null,
        arrivalData.gpsLat ?? null, arrivalData.gpsLng ?? null,
        arrivalData.gpsAccuracyM ?? null,
        arrivalData.deviceInfo ? JSON.stringify(arrivalData.deviceInfo) : null,
        assignment[0].assigned_lat, assignment[0].assigned_lng, distanceM,
        GPS_TOLERANCE_M, gpsStatus,
        gpsStatus === 'mismatch_confirmed' ? true : false,
        arrivalData.workerMismatchExplanation ?? null,
        arrivalData.gpsUnavailableReason ?? null,
        arrivalData.gpsExceptionEvidence ?? null,
        arrivalPhotoUrl, arrivalPhotoHash,
      ]
    );

    await updateAlertStatus(alertId, 'worker_arrived', req.user!.id);
    await recordStatusChange({
      alertId,
      fromStatus: assignment[0].alert_status,
      toStatus: 'worker_arrived',
      changedByType: 'worker',
      changedBy: req.user!.id,
      reason: 'Worker marked arrival',
      metadata: { gpsStatus, distanceM },
    });

    const mismatch = gpsStatus === 'mismatch_confirmed';
    res.json({
      success: true,
      data: {
        arrivalId,
        gpsStatus,
        distanceFromAssignedM: distanceM,
        mismatchWarning: mismatch,
        mismatchMessage: mismatch
          ? `Your GPS location is ${distanceM}m from the assigned location (tolerance: ${GPS_TOLERANCE_M}m). Please confirm or explain.`
          : null,
      },
    });
  }
);

// ── POST /api/alerts/:id/reports — Submit field report ────────
alertRouter.post(
  '/:id/reports',
  authenticate,
  requireRole('worker'),
  upload.array('photos', 30),
  async (req, res) => {
    const { id: alertId } = req.params;
    const raw = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body;

    const reportSchema = z.object({
      assignmentId: z.string().uuid(),
      assetId: z.string().uuid().optional().nullable(),
      complaintId: z.string().uuid().optional().nullable(),
      // Section A
      arrivalTimestamp: z.string().optional().nullable(),
      startTimestamp: z.string().optional().nullable(),
      completionTimestamp: z.string().optional().nullable(),
      gpsLat: z.number().optional().nullable(),
      gpsLng: z.number().optional().nullable(),
      weatherCondition: z.string().optional().nullable(),
      accessCondition: z.string().optional().nullable(),
      siteSafetyCondition: z.string().optional().nullable(),
      publicPresence: z.boolean().optional(),
      publicHazard: z.boolean().optional(),
      assetOperatingStatus: z.string().optional().nullable(),
      // Section B
      whatWasObserved: z.string().optional().nullable(),
      citizenReported: z.string().optional().nullable(),
      changesSinceLast: z.string().optional().nullable(),
      evidenceFound: z.string().optional().nullable(),
      problemStatus: z.enum(['active', 'intermittent', 'resolved']).optional().nullable(),
      immediateSafetyRisk: z.boolean().optional(),
      assetOperatesNormally: z.boolean().optional().nullable(),
      anotherAssetContributing: z.boolean().optional(),
      urgentEscalationNeeded: z.boolean().optional(),
      // Worker feedback
      problemConfirmed: z.boolean().optional().nullable(),
      problemActiveNow: z.boolean().optional().nullable(),
      problemIntermittent: z.boolean().optional().nullable(),
      isSafetyRiskNow: z.boolean().optional(),
      repairRecommendation: z.string().optional().nullable(),
      complaintValidity: z.enum(['valid', 'partially_valid', 'not_confirmed']).optional().nullable(),
      recommendedActionText: z.string().optional().nullable(),
      recommendedUrgency: z.string().optional().nullable(),
      followupNeeded: z.boolean().optional(),
      workerExplanation: z.string().optional().nullable(),
      isDraft: z.boolean().optional().default(false),
      // Findings
      negativeFindingCodes: z.array(z.object({
        findingCode: z.string(),
        severity: z.enum(['minor', 'moderate', 'major', 'critical']),
        confidence: z.number().min(0).max(1).default(1.0),
        description: z.string().optional(),
        measuredValue: z.number().optional().nullable(),
        measuredUnit: z.string().optional().nullable(),
        immediateSafetyFlag: z.boolean().default(false),
        recommendedAction: z.string().optional().nullable(),
      })).optional().default([]),
      positiveFindingCodes: z.array(z.object({
        findingCode: z.string(),
        evidenceType: z.string().optional(),
        measuredValue: z.number().optional().nullable(),
        measuredUnit: z.string().optional().nullable(),
        comment: z.string().optional(),
        confidence: z.number().min(0).max(1).default(1.0),
        verificationStatus: z.enum([
          'verified_positive', 'worker_reported_unverified',
          'not_checked', 'not_applicable', 'unknown',
        ]).default('worker_reported_unverified'),
        relatedRiskFactor: z.string().optional().nullable(),
      })).optional().default([]),
    });

    const data = reportSchema.parse(raw);

    const assignment = await query<any>(
      `SELECT aa.*, a.state_id, a.district_id, a.taluka_id, a.village_id,
               a.alert_number, a.status AS alert_status
       FROM alert_assignments aa
       JOIN alerts a ON a.id = aa.alert_id
       WHERE aa.id = $1 AND aa.worker_id = $2 AND aa.is_active = TRUE`,
      [data.assignmentId, req.user!.id]
    );
    if (!assignment[0]) throw new AppError(403, 'Assignment not found or not yours');
    if (assignment[0].alert_id !== alertId) throw new AppError(400, 'Assignment mismatch');

    // Critical findings must be escalated even from draft
    const hasCriticalFinding = data.negativeFindingCodes.some(
      (f) => f.severity === 'critical' || f.immediateSafetyFlag
    );

    const reportId = uuidv4();
    const status = data.isDraft ? 'draft' : 'submitted';

    await transaction(async (client) => {
      await client.query(
        `INSERT INTO alert_field_reports (
          id, alert_id, assignment_id, worker_id, asset_id, complaint_id,
          state_id, district_id, taluka_id, village_id,
          arrival_timestamp, start_timestamp, completion_timestamp,
          gps_lat, gps_lng, weather_condition, access_condition,
          site_safety_condition, public_presence, public_hazard, asset_operating_status,
          what_was_observed, citizen_reported, changes_since_last, evidence_found,
          problem_status, immediate_safety_risk, asset_operates_normally,
          another_asset_contributing, urgent_escalation_needed,
          problem_confirmed, problem_active_now, problem_intermittent,
          is_safety_risk_now, repair_recommendation, complaint_validity,
          recommended_action_text, recommended_urgency, followup_needed,
          worker_explanation, status, submitted_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
          $22,$23,$24,$25,$26,$27,$28,$29,$30,
          $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42
        )`,
        [
          reportId, alertId, data.assignmentId, req.user!.id,
          data.assetId ?? null, data.complaintId ?? null,
          assignment[0].state_id, assignment[0].district_id,
          assignment[0].taluka_id ?? null, assignment[0].village_id ?? null,
          data.arrivalTimestamp ?? null, data.startTimestamp ?? null,
          data.completionTimestamp ?? null,
          data.gpsLat ?? null, data.gpsLng ?? null,
          data.weatherCondition ?? null, data.accessCondition ?? null,
          data.siteSafetyCondition ?? null,
          data.publicPresence ?? false, data.publicHazard ?? false,
          data.assetOperatingStatus ?? null,
          data.whatWasObserved ?? null, data.citizenReported ?? null,
          data.changesSinceLast ?? null, data.evidenceFound ?? null,
          data.problemStatus ?? null, data.immediateSafetyRisk ?? false,
          data.assetOperatesNormally ?? null,
          data.anotherAssetContributing ?? false, data.urgentEscalationNeeded ?? false,
          data.problemConfirmed ?? null, data.problemActiveNow ?? null,
          data.problemIntermittent ?? null, data.isSafetyRiskNow ?? false,
          data.repairRecommendation ?? null, data.complaintValidity ?? null,
          data.recommendedActionText ?? null, data.recommendedUrgency ?? null,
          data.followupNeeded ?? false, data.workerExplanation ?? null,
          status,
          status === 'submitted' ? new Date().toISOString() : null,
        ]
      );

      // Insert negative findings
      for (const f of data.negativeFindingCodes) {
        await client.query(
          `INSERT INTO negative_findings (
            id, report_id, alert_id, worker_id, finding_code, severity,
            worker_confidence, measured_value, measured_unit,
            description, immediate_safety_flag, recommended_action
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            uuidv4(), reportId, alertId, req.user!.id,
            f.findingCode, f.severity, f.confidence,
            f.measuredValue ?? null, f.measuredUnit ?? null,
            f.description ?? null, f.immediateSafetyFlag,
            f.recommendedAction ?? null,
          ]
        );
      }

      // Insert positive findings
      for (const f of data.positiveFindingCodes) {
        await client.query(
          `INSERT INTO positive_findings (
            id, report_id, alert_id, worker_id, finding_code,
            evidence_type, measured_value, measured_unit, comment,
            worker_confidence, verification_status, related_risk_factor,
            can_cancel_critical
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,FALSE)`,
          [
            uuidv4(), reportId, alertId, req.user!.id,
            f.findingCode, f.evidenceType ?? null,
            f.measuredValue ?? null, f.measuredUnit ?? null,
            f.comment ?? null, f.confidence,
            f.verificationStatus, f.relatedRiskFactor ?? null,
          ]
        );
      }
    });

    // Upload and store photos
    const files = (req.files as Express.Multer.File[]) ?? [];
    for (const file of files) {
      const url = await storageService.upload(
        file.buffer, file.originalname, file.mimetype,
        `alerts/${alertId}/reports/${reportId}`
      );
      const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
      await query(
        `INSERT INTO geo_tagged_images
           (id, alert_id, worker_id, category, original_file_url, tamper_hash,
            gps_source, upload_timestamp)
         VALUES ($1,$2,$3,'other',$4,$5,'app_captured',NOW())`,
        [uuidv4(), alertId, req.user!.id, url, hash]
      );
    }

    if (!data.isDraft) {
      await updateAlertStatus(alertId, 'report_submitted', req.user!.id);
      await recordStatusChange({
        alertId,
        fromStatus: assignment[0].alert_status,
        toStatus: 'report_submitted',
        changedByType: 'worker',
        changedBy: req.user!.id,
        reason: 'Field report submitted',
        metadata: { reportId },
      });

      // Auto-escalate critical findings
      if (hasCriticalFinding) {
        await updateAlertStatus(alertId, 'escalated', req.user!.id);
        await recordStatusChange({
          alertId,
          fromStatus: 'report_submitted',
          toStatus: 'escalated',
          changedByType: 'system',
          changedBy: null,
          reason: 'Critical finding auto-escalation triggered',
        });

        // Notify state admin of critical finding
        const adminRows = await query<any>(
          `SELECT id, email FROM users WHERE role = 'state_admin' AND state_id = $1`,
          [assignment[0].state_id]
        );
        for (const admin of adminRows) {
          await sendAlertNotification({
            alertId,
            event: 'alert_safety_concern',
            recipientType: 'state_admin',
            recipientId: admin.id,
            recipientEmail: admin.email,
            variables: {
              alertNumber: assignment[0].alert_number,
              workerName: req.user!.email ?? '',
            },
          });
        }
      } else {
        // Notify state admin for regular review
        const adminRows = await query<any>(
          `SELECT id, email FROM users WHERE role = 'state_admin' AND state_id = $1`,
          [assignment[0].state_id]
        );
        for (const admin of adminRows) {
          await sendAlertNotification({
            alertId,
            event: 'alert_report_submitted',
            recipientType: 'state_admin',
            recipientId: admin.id,
            recipientEmail: admin.email,
            variables: {
              alertNumber: assignment[0].alert_number,
              workerName: req.user!.email ?? '',
            },
          });
        }
      }
    } else {
      await updateAlertStatus(alertId, 'report_draft', req.user!.id);
      await recordStatusChange({
        alertId,
        fromStatus: assignment[0].alert_status,
        toStatus: 'report_draft',
        changedByType: 'worker',
        changedBy: req.user!.id,
        reason: 'Draft saved',
      });
    }

    res.status(201).json({
      success: true,
      data: { reportId, status, hasCriticalFinding },
      message: data.isDraft ? 'Report saved as draft' : 'Report submitted for review',
    });
  }
);

// ── PATCH /api/alerts/:id/reports/:reportId/review ────────────
alertRouter.patch(
  '/:id/reports/:reportId/review',
  authenticate,
  requireRole('super_admin', 'state_admin'),
  async (req, res) => {
    const { id: alertId, reportId } = req.params;
    const {
      action, notes, correctionReason, overrideReason,
    } = z.object({
      action: z.enum([
        'approve', 'reject', 'request_correction',
        'request_more_photos', 'override_ai',
      ]),
      notes: z.string().optional(),
      correctionReason: z.string().optional(),
      overrideReason: z.string().optional(),
    }).parse(req.body);

    if (action === 'override_ai' && !overrideReason) {
      throw new AppError(400, 'An override reason is required when overriding the AI recommendation');
    }

    const report = await query<any>(
      `SELECT afr.*, a.state_id, a.alert_number
       FROM alert_field_reports afr
       JOIN alerts a ON a.id = afr.alert_id
       WHERE afr.id = $1 AND afr.alert_id = $2`,
      [reportId, alertId]
    );
    if (!report[0]) throw new AppError(404, 'Report not found');
    if (req.user!.role === 'state_admin') enforceStateAccess(report[0].state_id, req);

    const statusMap: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected',
      request_correction: 'correction_requested',
      request_more_photos: 'correction_requested',
      override_ai: 'correction_requested',
    };
    const alertStatusMap: Record<string, string> = {
      approve: 'report_approved',
      reject: 'state_admin_review',
      request_correction: 'more_information_requested',
      request_more_photos: 'more_information_requested',
      override_ai: 'more_information_requested',
    };

    const reportStatus = statusMap[action];
    const newAlertStatus = alertStatusMap[action];

    await query(
      `UPDATE alert_field_reports
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_notes = $3,
           correction_requested = $4, correction_reason = $5
       WHERE id = $6`,
      [
        reportStatus, req.user!.id, notes ?? null,
        action !== 'approve' && action !== 'reject',
        correctionReason ?? overrideReason ?? null,
        reportId,
      ]
    );

    const fromStatus = (await query<any>(`SELECT status FROM alerts WHERE id = $1`, [alertId]))[0]?.status;
    await updateAlertStatus(alertId, newAlertStatus, req.user!.id);
    await recordStatusChange({
      alertId,
      fromStatus,
      toStatus: newAlertStatus,
      changedByType: 'user',
      changedBy: req.user!.id,
      reason: correctionReason ?? overrideReason ?? notes ?? null,
      metadata: { action, reportId },
    });

    // Record admin feedback
    await query(
      `INSERT INTO alert_admin_feedback
         (id, alert_id, report_id, admin_id, feedback_type, message, override_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        uuidv4(), alertId, reportId, req.user!.id,
        action, notes ?? correctionReason ?? '',
        overrideReason ?? null,
      ]
    );

    // Notify worker
    const notifEvent = action === 'approve' ? 'alert_report_approved' : 'alert_correction_requested';
    await sendAlertNotification({
      alertId,
      event: notifEvent,
      recipientType: 'worker',
      recipientId: report[0].worker_id,
      variables: {
        alertNumber: report[0].alert_number,
        workerName: '',
        reason: correctionReason ?? overrideReason ?? '',
      },
    });

    res.json({ success: true, message: `Report ${action}d` });
  }
);

// ── POST /api/alerts/:id/corrective-actions ───────────────────
alertRouter.post(
  '/:id/corrective-actions',
  authenticate,
  requireRole('super_admin', 'state_admin'),
  async (req, res) => {
    const { id: alertId } = req.params;
    const { actionType, description, assignedWorkerId, reportId } = z.object({
      actionType: z.string(),
      description: z.string().optional(),
      assignedWorkerId: z.string().uuid().optional().nullable(),
      reportId: z.string().uuid().optional().nullable(),
    }).parse(req.body);

    const alert = await query<any>(`SELECT * FROM alerts WHERE id = $1`, [alertId]);
    if (!alert[0]) throw new AppError(404, 'Alert not found');
    if (req.user!.role === 'state_admin') enforceStateAccess(alert[0].state_id, req);

    const actionId = uuidv4();
    await query(
      `INSERT INTO alert_corrective_actions
         (id, alert_id, report_id, action_type, description, approved_by,
          approved_at, assigned_worker_id)
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7)`,
      [
        actionId, alertId, reportId ?? null,
        actionType, description ?? null, req.user!.id,
        assignedWorkerId ?? null,
      ]
    );

    const fromStatus = alert[0].status;
    await updateAlertStatus(alertId, 'corrective_action_approved', req.user!.id);
    await recordStatusChange({
      alertId,
      fromStatus,
      toStatus: 'corrective_action_approved',
      changedByType: 'user',
      changedBy: req.user!.id,
      reason: `Corrective action approved: ${actionType}`,
      metadata: { actionId },
    });

    // Notify assigned worker
    if (assignedWorkerId) {
      const worker = await query<any>(
        `SELECT email, mobile, full_name FROM worker_profiles WHERE id = $1`,
        [assignedWorkerId]
      );
      if (worker[0]) {
        await sendAlertNotification({
          alertId,
          event: 'alert_corrective_approved',
          recipientType: 'worker',
          recipientId: assignedWorkerId,
          recipientEmail: worker[0].email,
          recipientMobile: worker[0].mobile,
          variables: {
            alertNumber: alert[0].alert_number,
            workerName: worker[0].full_name,
          },
        });
      }
    }

    res.status(201).json({ success: true, data: { actionId } });
  }
);

// ── PATCH /api/alerts/:id/corrective-actions/:actionId/complete ──
alertRouter.patch(
  '/:id/corrective-actions/:actionId/complete',
  authenticate,
  requireRole('worker'),
  upload.single('afterPhoto'),
  async (req, res) => {
    const { id: alertId, actionId } = req.params;
    const raw = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body;
    const {
      completionNotes, assetOperatingStatus,
      evidenceGpsLat, evidenceGpsLng, maintenanceRecordUrl,
    } = z.object({
      completionNotes: z.string().optional(),
      assetOperatingStatus: z.string().optional(),
      evidenceGpsLat: z.number().optional().nullable(),
      evidenceGpsLng: z.number().optional().nullable(),
      maintenanceRecordUrl: z.string().optional().nullable(),
    }).parse(raw);

    const action = await query<any>(
      `SELECT aca.*, a.state_id FROM alert_corrective_actions aca
       JOIN alerts a ON a.id = aca.alert_id
       WHERE aca.id = $1 AND aca.alert_id = $2`,
      [actionId, alertId]
    );
    if (!action[0]) throw new AppError(404, 'Corrective action not found');

    // Upload after-photo
    let afterPhotoUrl: string | null = null;
    let afterPhotoHash: string | null = null;
    let afterPhotoId: string | null = null;
    if (req.file) {
      afterPhotoUrl = await storageService.upload(
        req.file.buffer, req.file.originalname, req.file.mimetype,
        `alerts/${alertId}/after`
      );
      afterPhotoHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
      afterPhotoId = uuidv4();
      await query(
        `INSERT INTO geo_tagged_images
           (id, alert_id, worker_id, category, original_file_url, tamper_hash,
            gps_source, is_before_maintenance, app_gps_lat, app_gps_lng)
         VALUES ($1,$2,$3,'after_correction',$4,$5,'app_captured',FALSE,$6,$7)`,
        [
          afterPhotoId, alertId, req.user!.id,
          afterPhotoUrl, afterPhotoHash,
          evidenceGpsLat ?? null, evidenceGpsLng ?? null,
        ]
      );
    }

    // Evidence required: at minimum worker confirmation
    await query(
      `UPDATE alert_corrective_actions
       SET completed_by = $1, completion_timestamp = NOW(), completion_notes = $2,
           after_photo_id = $3, maintenance_record_url = $4,
           worker_confirmation = TRUE, asset_operating_status = $5,
           evidence_gps_lat = $6, evidence_gps_lng = $7, evidence_timestamp = NOW()
       WHERE id = $8`,
      [
        req.user!.id, completionNotes ?? null, afterPhotoId,
        maintenanceRecordUrl ?? null, assetOperatingStatus ?? null,
        evidenceGpsLat ?? null, evidenceGpsLng ?? null, actionId,
      ]
    );

    const fromStatus = (await query<any>(`SELECT status FROM alerts WHERE id = $1`, [alertId]))[0]?.status;
    await updateAlertStatus(alertId, 'maintenance_completed', req.user!.id);
    await recordStatusChange({
      alertId,
      fromStatus,
      toStatus: 'maintenance_completed',
      changedByType: 'worker',
      changedBy: req.user!.id,
      reason: 'Worker reported maintenance completion with evidence',
      metadata: { actionId, afterPhotoId },
    });

    res.json({
      success: true,
      message: 'Completion recorded. Awaiting admin approval before risk score recalculation.',
    });
  }
);

// ── POST /api/alerts/:id/followup — Request follow-up ─────────
alertRouter.post(
  '/:id/followup',
  authenticate,
  requireRole('super_admin', 'state_admin'),
  async (req, res) => {
    const { id: alertId } = req.params;
    const { assignedWorkerId, dueBy } = z.object({
      assignedWorkerId: z.string().uuid().optional().nullable(),
      dueBy: z.string().optional().nullable(),
    }).parse(req.body);

    const alert = await query<any>(`SELECT * FROM alerts WHERE id = $1`, [alertId]);
    if (!alert[0]) throw new AppError(404, 'Alert not found');
    if (req.user!.role === 'state_admin') enforceStateAccess(alert[0].state_id, req);

    const followupId = uuidv4();
    await query(
      `INSERT INTO alert_followup_inspections
         (id, alert_id, requested_by, assigned_worker_id, due_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [followupId, alertId, req.user!.id, assignedWorkerId ?? null,
       dueBy ? new Date(dueBy).toISOString() : null]
    );

    const fromStatus = alert[0].status;
    await updateAlertStatus(alertId, 'followup_inspection_pending', req.user!.id);
    await recordStatusChange({
      alertId, fromStatus, toStatus: 'followup_inspection_pending',
      changedByType: 'user', changedBy: req.user!.id,
      reason: 'Follow-up inspection requested', metadata: { followupId },
    });

    if (assignedWorkerId) {
      const worker = await query<any>(
        `SELECT email, mobile, full_name FROM worker_profiles WHERE id = $1`,
        [assignedWorkerId]
      );
      if (worker[0]) {
        await sendAlertNotification({
          alertId,
          event: 'alert_followup_required',
          recipientType: 'worker',
          recipientId: assignedWorkerId,
          recipientEmail: worker[0].email,
          recipientMobile: worker[0].mobile,
          variables: {
            alertNumber: alert[0].alert_number,
            workerName: worker[0].full_name,
          },
        });
      }
    }

    res.status(201).json({ success: true, data: { followupId } });
  }
);

// ── POST /api/alerts/:id/escalate ─────────────────────────────
alertRouter.post(
  '/:id/escalate',
  authenticate,
  requireRole('super_admin', 'state_admin'),
  async (req, res) => {
    const { id: alertId } = req.params;
    const { escalatedToType, escalatedToId, reason } = z.object({
      escalatedToType: z.enum(['super_admin', 'emergency_team', 'department']),
      escalatedToId: z.string().uuid().optional().nullable(),
      reason: z.string().min(5),
    }).parse(req.body);

    const alert = await query<any>(`SELECT * FROM alerts WHERE id = $1`, [alertId]);
    if (!alert[0]) throw new AppError(404, 'Alert not found');
    if (req.user!.role === 'state_admin') enforceStateAccess(alert[0].state_id, req);

    const escalationId = uuidv4();
    await query(
      `INSERT INTO alert_escalations
         (id, alert_id, escalated_by, escalated_to_type, escalated_to_id, reason)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [escalationId, alertId, req.user!.id, escalatedToType, escalatedToId ?? null, reason]
    );

    const fromStatus = alert[0].status;
    await updateAlertStatus(alertId, 'escalated', req.user!.id);
    await recordStatusChange({
      alertId, fromStatus, toStatus: 'escalated',
      changedByType: 'user', changedBy: req.user!.id, reason,
      metadata: { escalationId, escalatedToType },
    });

    await sendAlertNotification({
      alertId,
      event: 'alert_escalated',
      recipientType: 'state_admin',
      recipientId: req.user!.id,
      variables: {
        alertNumber: alert[0].alert_number,
        reason,
      },
    });

    res.status(201).json({ success: true, data: { escalationId } });
  }
);

// ── PATCH /api/alerts/:id/close — Close alert after verification ──
alertRouter.patch(
  '/:id/close',
  authenticate,
  requireRole('super_admin', 'state_admin'),
  async (req, res) => {
    const { id: alertId } = req.params;
    const { verificationNotes } = z.object({
      verificationNotes: z.string().min(10),
    }).parse(req.body);

    const alert = await query<any>(`SELECT * FROM alerts WHERE id = $1`, [alertId]);
    if (!alert[0]) throw new AppError(404, 'Alert not found');
    if (req.user!.role === 'state_admin') enforceStateAccess(alert[0].state_id, req);

    // Must be in a closeable state
    const closeableStatuses = ['state_admin_verified', 'resolved', 'report_approved'];
    if (!closeableStatuses.includes(alert[0].status)) {
      throw new AppError(400,
        `Alert cannot be closed from status "${alert[0].status}". It must be verified or resolved first.`
      );
    }

    await query(
      `UPDATE alerts
       SET status = 'closed', closed_at = NOW(), closed_by = $1,
           close_verification_notes = $2, updated_at = NOW(), updated_by = $1
       WHERE id = $3`,
      [req.user!.id, verificationNotes, alertId]
    );
    await recordStatusChange({
      alertId,
      fromStatus: alert[0].status,
      toStatus: 'closed',
      changedByType: 'user',
      changedBy: req.user!.id,
      reason: verificationNotes,
    });

    await auditService.log({
      actorType: 'user',
      actorId: req.user!.id,
      action: 'alert_closed',
      entityType: 'alert',
      entityId: alertId,
      stateId: alert[0].state_id,
      newValues: { status: 'closed', verificationNotes },
    });

    res.json({ success: true, message: 'Alert closed after verification' });
  }
);

// ── POST /api/alerts/:id/recalculate-risk ─────────────────────
// Admin triggers pipeline run; result is persisted and asset score updated.
alertRouter.post(
  '/:id/recalculate-risk',
  authenticate,
  requireRole('super_admin', 'state_admin'),
  async (req, res) => {
    const { id: alertId } = req.params;
    const { reportId } = z.object({
      reportId: z.string().uuid().optional().nullable(),
    }).parse(req.body);

    const alert = await query<any>(`SELECT * FROM alerts WHERE id = $1`, [alertId]);
    if (!alert[0]) throw new AppError(404, 'Alert not found');
    if (req.user!.role === 'state_admin') enforceStateAccess(alert[0].state_id, req);

    const assetId = alert[0].linked_asset_id ?? null;

    const result = await computeAlertRisk({ alertId, reportId: reportId ?? null, assetId });
    const historyId = await persistAlertRiskHistory({
      assetId: assetId ?? alertId,
      alertId,
      reportId: reportId ?? null,
      result,
      reviewedBy: req.user!.id,
    });

    if (assetId) {
      await applyAlertRiskToAsset(assetId, result);
    }

    const fromStatus = alert[0].status;
    await updateAlertStatus(alertId, 'risk_recalculated', req.user!.id);
    await recordStatusChange({
      alertId, fromStatus, toStatus: 'risk_recalculated',
      changedByType: 'user', changedBy: req.user!.id,
      reason: 'Risk recalculated by admin after verified evidence',
      metadata: { historyId },
    });

    res.json({
      success: true,
      data: {
        historyId,
        scoreBefore: result.scoreBefore,
        levelBefore: result.levelBefore,
        finalScore: result.finalScore,
        finalLevel: result.finalLevel,
        scoreDelta: result.scoreDelta,
        safetyOverrideApplied: result.safetyOverrideApplied,
        safetyOverrideReason: result.safetyOverrideReason,
        pipelineBreakdown: {
          adminInfoDelta: result.adminInfoDelta,
          arrivalVerificationDelta: result.arrivalVerificationDelta,
          negativeFindingsDelta: result.negativeFindingsDelta,
          positiveFindingsDelta: result.positiveFindingsDelta,
          evidenceImagesDelta: result.evidenceImagesDelta,
          measurementsDelta: result.measurementsDelta,
          sensorReadingsDelta: result.sensorReadingsDelta,
          weatherDelta: result.weatherDelta,
          historicalIncidentsDelta: result.historicalIncidentsDelta,
          maintenanceStatusDelta: result.maintenanceStatusDelta,
        },
        positiveFactors: result.positiveFactors,
        negativeFactors: result.negativeFactors,
        evidenceUsed: result.evidenceUsed,
        missingInformation: result.missingInformation,
        confidence: result.confidence,
        modelVersion: result.modelVersion,
        calculatedAt: result.calculatedAt,
      },
    });
  }
);

// ── GET /api/alerts/:id/risk-history ──────────────────────────
alertRouter.get(
  '/:id/risk-history',
  authenticate,
  requireRole('super_admin', 'state_admin'),
  async (req, res) => {
    const { id: alertId } = req.params;
    const alert = await query<any>(`SELECT state_id FROM alerts WHERE id = $1`, [alertId]);
    if (!alert[0]) throw new AppError(404, 'Alert not found');
    if (req.user!.role === 'state_admin') enforceStateAccess(alert[0].state_id, req);

    const rows = await query<any>(
      `SELECT rsh.*, u.full_name AS reviewed_by_name
       FROM risk_score_history rsh
       LEFT JOIN users u ON u.id = rsh.reviewed_by
       WHERE rsh.alert_id = $1
       ORDER BY rsh.calculated_at ASC`,
      [alertId]
    );
    res.json({ success: true, data: rows });
  }
);
