// ============================================================
// NEXORA AI — Shared Types
// ============================================================

// ── Roles ────────────────────────────────────────────────────
export type UserRole = 'super_admin' | 'state_admin' | 'worker' | 'citizen';

export type WorkerStatus =
  | 'draft'
  | 'pending_review'
  | 'documents_required'
  | 'approved'
  | 'rejected'
  | 'employed'
  | 'suspended'
  | 'inactive';

export type ComplaintStatus =
  | 'submitted'
  | 'under_review'
  | 'assigned'
  | 'worker_visit_scheduled'
  | 'inspection_in_progress'
  | 'inspection_completed'
  | 'awaiting_additional_information'
  | 'maintenance_recommended'
  | 'resolved'
  | 'rejected'
  | 'closed';

export type AssetType =
  | 'transformer'
  | 'distribution_panel'
  | 'appliance'
  | 'feeder'
  | 'substation_equipment'
  | 'pole_mounted'
  | 'switchgear'
  | 'cable_line'
  | 'generator'
  | 'other';

export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export type InspectionStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'correction_requested'
  | 'approved'
  | 'rejected';

export type MaintenancePlanStatus =
  | 'ai_recommended'
  | 'pending_approval'
  | 'approved'
  | 'modified'
  | 'rejected'
  | 'in_progress'
  | 'completed';

// ── Observations ─────────────────────────────────────────────
export type ObservationType = 'positive' | 'negative';
export type ObservationSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface WorkerObservation {
  id: string;
  inspectionReportId: string;
  assetId: string;
  workerId: string;
  category: string;
  type: ObservationType;
  severity: ObservationSeverity;
  confidence: number; // 0-1
  description: string;
  measuredValue?: number;
  measuredUnit?: string;
  comment?: string;
  photoUrls?: string[];
  gpsLat?: number;
  gpsLng?: number;
  timestamp: string;
  riskScoreImpact?: number; // calculated, not worker-set
}

// ── Risk Engine ───────────────────────────────────────────────
export interface RiskContributingFactor {
  factor: string;
  category:
    | 'worker_observation'
    | 'sensor'
    | 'weather'
    | 'historical'
    | 'asset_age'
    | 'load_capacity'
    | 'geographic';
  contribution: number; // positive = raises risk, negative = lowers
  description: string;
  evidence?: string;
}

export interface RiskPrediction {
  id: string;
  assetId: string;
  riskScore: number; // 0-100
  riskLevel: RiskLevel;
  previousScore?: number;
  scoreDelta?: number;
  failureProbability: number; // 0-1
  outageProbability: number; // 0-1
  gridImpactSeverity: number; // 0-100
  maintenanceUrgency: 'immediate' | 'urgent' | 'scheduled' | 'routine';
  confidenceScore: number; // 0-1
  topFactors: RiskContributingFactor[];
  explanation: string; // human-readable
  missingDataFlags: string[];
  modelVersion: string;
  inputSnapshot: Record<string, unknown>;
  timestamp: string;
  humanReviewStatus: 'pending' | 'approved' | 'rejected' | 'overridden';
  overrideReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

// ── GIS ──────────────────────────────────────────────────────
export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy?: number; // metres
  capturedAt?: string;
  method: 'gps' | 'manual_approved' | 'exif';
  tamperEvidentHash?: string;
}

// ── Pagination ────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── API Response envelope ─────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
  meta?: Record<string, unknown>;
}

// ── Notification triggers ─────────────────────────────────────
export type NotificationEvent =
  | 'worker_application_submitted'
  | 'worker_application_approved'
  | 'worker_application_rejected'
  | 'worker_assigned'
  | 'inspection_task_created'
  | 'report_submitted'
  | 'report_correction_requested'
  | 'complaint_submitted'
  | 'complaint_status_changed'
  | 'critical_asset_alert'
  | 'maintenance_recommended'
  | 'crew_prepositioning_recommended'
  | 'admin_approval_pending';

// ── Field of work ─────────────────────────────────────────────
export type FieldOfWork =
  | 'civil_engineering'
  | 'mechanical_engineering'
  | 'electrical_engineering'
  | 'other';

// ── Negative observation codes ────────────────────────────────
export const NEGATIVE_OBSERVATION_CODES = [
  'corrosion',
  'exposed_wiring',
  'overheating',
  'burning_smell',
  'cracked_insulation',
  'water_ingress',
  'oil_leakage',
  'loose_connections',
  'damaged_enclosure',
  'excessive_vibration',
  'unusual_noise',
  'overloading',
  'repeated_tripping',
  'poor_earthing',
  'broken_protective_covers',
  'pest_animal_damage',
  'flood_exposure',
  'structural_instability',
  'unauthorized_modification',
  'high_temperature',
  'abnormal_readings',
  'evidence_of_arcing',
  'missing_signage',
  'restricted_access',
  'poor_ventilation',
] as const;

export type NegativeObservationCode = (typeof NEGATIVE_OBSERVATION_CODES)[number];

// ── Positive observation codes ────────────────────────────────
export const POSITIVE_OBSERVATION_CODES = [
  'no_visible_damage',
  'enclosure_intact',
  'proper_earthing_confirmed',
  'normal_temperature',
  'normal_sound',
  'normal_vibration',
  'no_corrosion',
  'no_water_ingress',
  'wiring_properly_insulated',
  'protective_covers_intact',
  'load_within_range',
  'signage_present',
  'recent_maintenance_completed',
  'adequate_ventilation',
  'no_repeated_faults',
  'area_clean_accessible',
  'sensor_readings_normal',
] as const;

export type PositiveObservationCode = (typeof POSITIVE_OBSERVATION_CODES)[number];
