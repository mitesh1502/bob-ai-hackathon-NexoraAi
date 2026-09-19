import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import MeasurementsSection from '../../components/MeasurementsSection';
import GeoTaggedImageUpload from '../../components/GeoTaggedImageUpload';

const RISK_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-300',
  high:     'bg-orange-100 text-orange-700 border-orange-300',
  moderate: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  low:      'bg-green-100 text-green-700 border-green-300',
};

const STATUS_LABELS: Record<string, string> = {
  assigned_to_worker:   'Assigned',
  accepted_by_worker:   'Accepted',
  travel_started:       'En Route',
  worker_arrived:       'Arrived',
  inspection_in_progress: 'In Progress',
  report_draft:         'Draft Saved',
  report_submitted:     'Submitted',
};

// ── Worker Alert Detail Page ──────────────────────────────────

export default function WorkerAlertPage() {
  const { alertId } = useParams<{ alertId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [activeSection, setActiveSection] = useState<'overview' | 'report'>('overview');
  const [declineReason, setDeclineReason] = useState('');
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [arrivalPhoto, setArrivalPhoto] = useState<File | null>(null);
  const [arrivalGps, setArrivalGps] = useState<{ lat: number; lng: number } | null>(null);
  const [mismatchWarning, setMismatchWarning] = useState<string | null>(null);
  const [mismatchExplain, setMismatchExplain] = useState('');
  const [showMismatch, setShowMismatch] = useState(false);

  // Report form state
  const [report, setReport] = useState({
    whatWasObserved: '',
    citizenReported: '',
    changesSinceLast: '',
    problemStatus: '',
    immediateSafetyRisk: false,
    assetOperatesNormally: null as boolean | null,
    urgentEscalationNeeded: false,
    problemConfirmed: null as boolean | null,
    problemActiveNow: null as boolean | null,
    complaintValidity: '',
    recommendedActionText: '',
    followupNeeded: false,
    workerExplanation: '',
    negativeFindingCodes: [] as any[],
    positiveFindingCodes: [] as any[],
  });
  const [isDraft, setIsDraft] = useState(false);

  const { data, isLoading } = useQuery(
    ['worker-alert', alertId],
    () => api.get(`/alerts/${alertId}`).then((r) => r.data.data),
    { enabled: !!alertId }
  );

  const alert = data;
  const activeAssignment = alert?.assignments?.find((a: any) => a.is_active);

  // ── Mutations ──────────────────────────────────────────────

  const respondMutation = useMutation(
    ({ action, reason }: { action: string; reason?: string }) =>
      api.post(`/alerts/${alertId}/assignments/${activeAssignment?.id}/respond`, { action, reason })
        .then((r) => r.data),
    { onSuccess: () => qc.invalidateQueries(['worker-alert', alertId]) }
  );

  const travelMutation = useMutation(
    () => api.patch(`/alerts/${alertId}/status`, { toStatus: 'travel_started', reason: 'Worker started travel' })
      .then((r) => r.data),
    { onSuccess: () => qc.invalidateQueries(['worker-alert', alertId]) }
  );

  const arrivalMutation = useMutation(
    async () => {
      const formData = new FormData();
      const payload: any = {
        assignmentId: activeAssignment?.id,
        assetId: alert?.linked_asset_id ?? null,
        complaintId: alert?.linked_complaint_id ?? null,
        gpsLat: arrivalGps?.lat ?? null,
        gpsLng: arrivalGps?.lng ?? null,
        workerMismatchExplanation: mismatchExplain || null,
      };
      formData.append('data', JSON.stringify(payload));
      if (arrivalPhoto) formData.append('arrivalPhoto', arrivalPhoto);
      return api.post(`/alerts/${alertId}/arrival`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data);
    },
    {
      onSuccess: (data) => {
        qc.invalidateQueries(['worker-alert', alertId]);
        if (data.data?.mismatchWarning) {
          setMismatchWarning(data.data.mismatchMessage);
          setShowMismatch(true);
        }
      },
    }
  );

  const reportMutation = useMutation(
    async (draft: boolean) => {
      const formData = new FormData();
      formData.append('data', JSON.stringify({
        assignmentId: activeAssignment?.id,
        assetId: alert?.linked_asset_id ?? null,
        complaintId: alert?.linked_complaint_id ?? null,
        gpsLat: arrivalGps?.lat ?? null,
        gpsLng: arrivalGps?.lng ?? null,
        ...report,
        isDraft: draft,
      }));
      return api.post(`/alerts/${alertId}/reports`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data);
    },
    {
      onSuccess: () => {
        qc.invalidateQueries(['worker-alert', alertId]);
        if (!isDraft) navigate('/worker/alerts');
      },
    }
  );

  // ── GPS capture ────────────────────────────────────────────

  const captureGps = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setArrivalGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setArrivalGps(null)
    );
  };

  if (isLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-pulse text-gray-400">Loading alert…</div>
    </div>
  );
  if (!alert) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Alert not found or not assigned to you.</p>
    </div>
  );

  const riskColor = RISK_COLORS[alert.current_risk_score >= 75 ? 'critical' : alert.current_risk_score >= 50 ? 'high' : alert.current_risk_score >= 25 ? 'moderate' : 'low'] ?? RISK_COLORS.low;
  const statusLabel = STATUS_LABELS[alert.status] ?? alert.status?.replace(/_/g, ' ');
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/worker/alerts')} className="text-gray-500 hover:text-gray-800">←</button>
        <div className="flex-1">
          <h1 className="font-bold text-gray-800">{alert.alert_number}</h1>
          <p className="text-xs text-gray-500">{statusLabel}</p>
        </div>
        {alert.is_safety_concern && (
          <span className="badge bg-red-100 text-red-700 text-xs border border-red-300">🚨 Safety Concern</span>
        )}
      </header>

      {/* Section tabs */}
      <div className="bg-white border-b flex">
        {(['overview', 'report'] as const).map((s) => (
          <button key={s} onClick={() => setActiveSection(s)}
            className={`flex-1 py-2 text-sm font-medium capitalize transition-colors ${activeSection === s ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>
            {s === 'overview' ? '📍 Overview' : '📝 Field Report'}
          </button>
        ))}
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">

        {activeSection === 'overview' && (
          <>
            {/* Risk score */}
            <div className={`card flex items-center gap-4 border ${riskColor}`}>
              <div className="text-3xl font-bold">{Math.round(alert.current_risk_score ?? 0)}</div>
              <div>
                <p className="text-xs font-medium opacity-70">Current Risk Score</p>
                <p className="font-semibold capitalize">{alert.current_risk_score >= 75 ? 'Critical' : alert.current_risk_score >= 50 ? 'High' : alert.current_risk_score >= 25 ? 'Moderate' : 'Low'}</p>
              </div>
            </div>

            {/* Location */}
            <div className="card space-y-2">
              <h3 className="font-semibold text-gray-700 text-sm">📍 Location</h3>
              <p className="text-sm">{alert.full_address ?? 'No address provided'}</p>
              <p className="text-xs text-gray-500">
                {alert.village_name && `${alert.village_name} · `}
                {alert.taluka_name && `${alert.taluka_name} · `}
                {alert.district_name} · {alert.state_name}
              </p>
              {alert.location_lat && alert.location_lng && (
                <a href={`https://www.google.com/maps?q=${alert.location_lat},${alert.location_lng}`}
                  target="_blank" rel="noreferrer"
                  className="inline-block text-xs text-blue-600 underline">
                  🗺 Navigate in Google Maps
                </a>
              )}
              {alert.nearby_landmark && <p className="text-xs text-gray-500">Landmark: {alert.nearby_landmark}</p>}
              {alert.access_instructions && (
                <p className="text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-800">
                  Access: {alert.access_instructions}
                </p>
              )}
            </div>

            {/* Alert details */}
            <div className="card space-y-2 text-sm">
              <h3 className="font-semibold text-gray-700">Alert Details</h3>
              <p><span className="text-gray-500">Category: </span>{alert.category?.replace(/_/g, ' ')}</p>
              <p><span className="text-gray-500">Priority: </span><span className="capitalize">{alert.priority}</span></p>
              <p><span className="text-gray-500">Source: </span>{alert.source_type?.replace(/_/g, ' ')}</p>
              {alert.description && <p className="text-gray-700 mt-1">{alert.description}</p>}
              {alert.recommended_response_deadline && (
                <p className="text-red-700 font-medium">
                  ⏰ Respond by: {new Date(alert.recommended_response_deadline).toLocaleString('en-IN')}
                </p>
              )}
              {alert.required_technical_field && (
                <p><span className="text-gray-500">Required field: </span>{alert.required_technical_field.replace(/_/g, ' ')}</p>
              )}
            </div>

            {/* Accept / Decline / Actions */}
            {activeAssignment?.acceptance_status === 'pending' && (
              <div className="card space-y-3">
                <h3 className="font-semibold text-gray-700 text-sm">Your Response Required</h3>
                <div className="flex gap-3">
                  <button onClick={() => respondMutation.mutate({ action: 'accept' })}
                    disabled={respondMutation.isLoading}
                    className="flex-1 btn-primary text-sm">
                    ✓ Accept
                  </button>
                  <button onClick={() => setShowDeclineModal(true)}
                    className="flex-1 btn-secondary text-sm text-red-600 border-red-300">
                    ✕ Decline
                  </button>
                </div>
                <button onClick={() => respondMutation.mutate({ action: 'request_reassignment', reason: 'Worker requested reassignment' })}
                  className="w-full text-xs text-gray-500 hover:text-gray-700 underline">
                  Request Reassignment
                </button>
              </div>
            )}

            {activeAssignment?.acceptance_status === 'accepted' && alert.status === 'accepted_by_worker' && (
              <button onClick={() => travelMutation.mutate()}
                disabled={travelMutation.isLoading}
                className="w-full btn-primary">
                🚗 Start Travel
              </button>
            )}

            {alert.status === 'travel_started' && (
              <div className="card space-y-3">
                <h3 className="font-semibold text-gray-700 text-sm">Mark Arrival</h3>
                <div className="space-y-2">
                  <button onClick={captureGps}
                    className="w-full text-sm border border-blue-300 text-blue-600 rounded-lg py-2 hover:bg-blue-50">
                    📡 {arrivalGps ? `GPS: ${arrivalGps.lat.toFixed(5)}, ${arrivalGps.lng.toFixed(5)}` : 'Capture GPS Location'}
                  </button>
                  <div>
                    <label className="text-xs text-gray-500">Arrival Photo</label>
                    <input type="file" accept="image/*" capture="environment"
                      className="w-full text-sm mt-1"
                      onChange={e => setArrivalPhoto(e.target.files?.[0] ?? null)} />
                  </div>
                  <button onClick={() => arrivalMutation.mutate()}
                    disabled={arrivalMutation.isLoading}
                    className="w-full btn-primary">
                    {arrivalMutation.isLoading ? 'Recording…' : '📍 Mark Arrival'}
                  </button>
                </div>
              </div>
            )}

            {alert.status === 'worker_arrived' && (
              <button onClick={() => {
                setActiveSection('report');
              }} className="w-full btn-primary">
                🔍 Start Inspection
              </button>
            )}

            {/* Decline modal */}
            {showDeclineModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
                  <h3 className="font-bold text-gray-800">Decline Alert</h3>
                  <textarea className={inp} rows={3} value={declineReason}
                    onChange={e => setDeclineReason(e.target.value)}
                    placeholder="Please provide a reason for declining (required)" />
                  <div className="flex gap-3">
                    <button onClick={() => setShowDeclineModal(false)} className="flex-1 btn-secondary text-sm">Cancel</button>
                    <button disabled={!declineReason.trim() || respondMutation.isLoading}
                      onClick={() => { respondMutation.mutate({ action: 'decline', reason: declineReason }); setShowDeclineModal(false); }}
                      className="flex-1 btn-primary text-sm bg-red-600 hover:bg-red-700">Decline</button>
                  </div>
                </div>
              </div>
            )}

            {/* GPS mismatch modal */}
            {showMismatch && mismatchWarning && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
                  <h3 className="font-bold text-amber-700">⚠ Location Mismatch</h3>
                  <p className="text-sm text-gray-700">{mismatchWarning}</p>
                  <textarea className={inp} rows={3} value={mismatchExplain}
                    onChange={e => setMismatchExplain(e.target.value)}
                    placeholder="Please explain the location difference" />
                  <button onClick={() => setShowMismatch(false)} className="w-full btn-primary text-sm">
                    Confirm & Continue
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {activeSection === 'report' && (
          <div className="space-y-4">
            <div className="card space-y-4">
              <h3 className="font-semibold text-gray-700">Section A — Site Details</h3>
              <div>
                <label className="text-xs text-gray-500">Asset Operating Status</label>
                <select className={inp + ' mt-1'} value={report.assetOperatesNormally === null ? '' : String(report.assetOperatesNormally)}
                  onChange={e => setReport(r => ({ ...r, assetOperatesNormally: e.target.value === '' ? null : e.target.value === 'true' }))}>
                  <option value="">Select…</option>
                  <option value="true">Operating Normally</option>
                  <option value="false">Not Operating Normally</option>
                </select>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={report.immediateSafetyRisk}
                    onChange={e => setReport(r => ({ ...r, immediateSafetyRisk: e.target.checked }))} />
                  Immediate Safety Risk
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={report.urgentEscalationNeeded}
                    onChange={e => setReport(r => ({ ...r, urgentEscalationNeeded: e.target.checked }))} />
                  Urgent Escalation Needed
                </label>
              </div>
            </div>

            <div className="card space-y-4">
              <h3 className="font-semibold text-gray-700">Section B — What Happened</h3>
              <div>
                <label className="text-xs text-gray-500">What was observed</label>
                <textarea className={inp + ' mt-1'} rows={3} value={report.whatWasObserved}
                  onChange={e => setReport(r => ({ ...r, whatWasObserved: e.target.value }))}
                  placeholder="Describe what you observed at the site" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Citizen's report (what they said)</label>
                <textarea className={inp + ' mt-1'} rows={2} value={report.citizenReported}
                  onChange={e => setReport(r => ({ ...r, citizenReported: e.target.value }))}
                  placeholder="What did the citizen / local person report?" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Changes since last inspection</label>
                <textarea className={inp + ' mt-1'} rows={2} value={report.changesSinceLast}
                  onChange={e => setReport(r => ({ ...r, changesSinceLast: e.target.value }))}
                  placeholder="What has changed?" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Problem Status</label>
                <select className={inp + ' mt-1'} value={report.problemStatus}
                  onChange={e => setReport(r => ({ ...r, problemStatus: e.target.value }))}>
                  <option value="">Select…</option>
                  <option value="active">Active</option>
                  <option value="intermittent">Intermittent</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            </div>

            <NegativeFindingsSection
              value={report.negativeFindingCodes}
              onChange={v => setReport(r => ({ ...r, negativeFindingCodes: v }))}
            />

            <PositiveFindingsSection
              value={report.positiveFindingCodes}
              onChange={v => setReport(r => ({ ...r, positiveFindingCodes: v }))}
            />

            <GeoTaggedImageUpload
              alertId={alertId!}
              assetId={alert?.linked_asset_id}
              complaintId={alert?.linked_complaint_id}
            />

            <MeasurementsSection
              alertId={alertId!}
              assetId={alert?.linked_asset_id}
            />

            <div className="card space-y-4">
              <h3 className="font-semibold text-gray-700">Worker Feedback & Recommendation</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Problem Confirmed?</label>
                  <select className={inp + ' mt-1'} value={report.problemConfirmed === null ? '' : String(report.problemConfirmed)}
                    onChange={e => setReport(r => ({ ...r, problemConfirmed: e.target.value === '' ? null : e.target.value === 'true' }))}>
                    <option value="">Select…</option>
                    <option value="true">Yes, confirmed</option>
                    <option value="false">Not confirmed</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Complaint Validity</label>
                  <select className={inp + ' mt-1'} value={report.complaintValidity}
                    onChange={e => setReport(r => ({ ...r, complaintValidity: e.target.value }))}>
                    <option value="">Select…</option>
                    <option value="valid">Valid</option>
                    <option value="partially_valid">Partially Valid</option>
                    <option value="not_confirmed">Not Confirmed</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Recommended Action</label>
                <select className={inp + ' mt-1'} value={report.recommendedActionText}
                  onChange={e => setReport(r => ({ ...r, recommendedActionText: e.target.value }))}>
                  <option value="">Select action…</option>
                  <option value="immediate_safety_escalation">Immediate Safety Escalation</option>
                  <option value="temporary_shutdown">Temporary Shutdown</option>
                  <option value="repair_wiring">Repair Wiring</option>
                  <option value="replace_cable">Replace Cable</option>
                  <option value="repair_earthing">Repair Earthing</option>
                  <option value="tighten_connection">Tighten/Replace Connection</option>
                  <option value="remove_corrosion">Remove Corrosion</option>
                  <option value="replace_equipment">Replace Equipment</option>
                  <option value="schedule_routine_maintenance">Schedule Routine Maintenance</option>
                  <option value="continue_monitoring">Continue Monitoring</option>
                  <option value="no_action_required">No Action Required</option>
                  <option value="assign_specialist">Assign Specialist</option>
                  <option value="escalate_to_another_team">Escalate to Another Team</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Explanation / Notes</label>
                <textarea className={inp + ' mt-1'} rows={3} value={report.workerExplanation}
                  onChange={e => setReport(r => ({ ...r, workerExplanation: e.target.value }))}
                  placeholder="Your explanation and any additional notes" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={report.followupNeeded}
                  onChange={e => setReport(r => ({ ...r, followupNeeded: e.target.checked }))} />
                Follow-up inspection needed
              </label>
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setIsDraft(true); reportMutation.mutate(true); }}
                disabled={reportMutation.isLoading}
                className="flex-1 btn-secondary text-sm">
                💾 Save Draft
              </button>
              <button onClick={() => { setIsDraft(false); reportMutation.mutate(false); }}
                disabled={reportMutation.isLoading}
                className="flex-1 btn-primary text-sm">
                {reportMutation.isLoading ? 'Submitting…' : '✓ Submit Report'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

const NEGATIVE_FINDINGS = [
  { code: 'exposed_wiring',          label: 'Exposed Wiring' },
  { code: 'damaged_insulation',      label: 'Damaged Insulation' },
  { code: 'overheating',             label: 'Overheating' },
  { code: 'burning_smell',           label: 'Burning Smell' },
  { code: 'visible_smoke',           label: 'Visible Smoke' },
  { code: 'corrosion',               label: 'Corrosion' },
  { code: 'water_ingress',           label: 'Water Ingress' },
  { code: 'flooding',                label: 'Flooding' },
  { code: 'oil_leakage',             label: 'Oil Leakage' },
  { code: 'loose_connection',        label: 'Loose Connection' },
  { code: 'abnormal_sound',          label: 'Abnormal Sound' },
  { code: 'excessive_vibration',     label: 'Excessive Vibration' },
  { code: 'overloading',             label: 'Overloading' },
  { code: 'repeated_tripping',       label: 'Repeated Tripping' },
  { code: 'poor_earthing',           label: 'Poor Earthing' },
  { code: 'broken_protective_cover', label: 'Broken Protective Cover' },
  { code: 'structural_damage',       label: 'Structural Damage' },
  { code: 'missing_safety_sign',     label: 'Missing Safety Sign' },
  { code: 'unsafe_public_access',    label: 'Unsafe Public Access' },
  { code: 'pest_animal_damage',      label: 'Pest/Animal Damage' },
  { code: 'unauthorized_modification','label': 'Unauthorized Modification' },
  { code: 'poor_ventilation',        label: 'Poor Ventilation' },
  { code: 'blocked_drainage',        label: 'Blocked Drainage' },
  { code: 'other',                   label: 'Other' },
];

const POSITIVE_FINDINGS = [
  { code: 'no_visible_damage',         label: 'No Visible Damage' },
  { code: 'normal_temperature',        label: 'Normal Temperature' },
  { code: 'normal_load',               label: 'Normal Load' },
  { code: 'normal_voltage',            label: 'Normal Voltage' },
  { code: 'proper_earthing_verified',  label: 'Proper Earthing Verified' },
  { code: 'intact_insulation',         label: 'Intact Insulation' },
  { code: 'enclosure_intact',          label: 'Enclosure/Cover Intact' },
  { code: 'no_water_ingress',          label: 'No Water Ingress/Corrosion/Oil Leakage' },
  { code: 'no_abnormal_sound',         label: 'No Abnormal Sound/Vibration' },
  { code: 'sensor_readings_in_range',  label: 'Sensor Readings In Range' },
  { code: 'recent_maintenance_verified','label': 'Recent Maintenance Verified' },
  { code: 'safety_signs_present',      label: 'Safety Signs Present' },
  { code: 'good_ventilation',          label: 'Good Ventilation' },
  { code: 'drainage_clear',            label: 'Drainage Clear' },
  { code: 'no_repeated_tripping',      label: 'No Repeated Tripping' },
  { code: 'no_immediate_hazard',       label: 'No Immediate Hazard' },
];

function NegativeFindingsSection({
  value,
  onChange,
}: {
  value: any[];
  onChange: (v: any[]) => void;
}) {
  const inp = 'w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none';

  const toggle = (code: string) => {
    if (value.find((f) => f.findingCode === code)) {
      onChange(value.filter((f) => f.findingCode !== code));
    } else {
      onChange([...value, { findingCode: code, severity: 'moderate', confidence: 1.0, immediateSafetyFlag: false, description: '' }]);
    }
  };

  const update = (code: string, key: string, val: any) => {
    onChange(value.map((f) => f.findingCode === code ? { ...f, [key]: val } : f));
  };

  return (
    <div className="card space-y-3">
      <h3 className="font-semibold text-gray-700">⛔ Negative Findings</h3>
      <div className="flex flex-wrap gap-2">
        {NEGATIVE_FINDINGS.map(({ code, label }) => {
          const selected = value.find((f) => f.findingCode === code);
          return (
            <button key={code} onClick={() => toggle(code)}
              className={`text-xs px-2 py-1 rounded-full border transition-colors ${selected
                ? (selected.severity === 'critical' ? 'bg-red-600 text-white border-red-600' : 'bg-red-100 text-red-700 border-red-300')
                : 'bg-white text-gray-600 border-gray-300 hover:border-red-300'}`}>
              {selected ? '✓ ' : ''}{label}
            </button>
          );
        })}
      </div>
      {value.map((f) => (
        <div key={f.findingCode} className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-2">
          <p className="text-xs font-semibold text-red-700">{f.findingCode.replace(/_/g, ' ')}</p>
          <div className="grid grid-cols-2 gap-2">
            <select className={inp} value={f.severity} onChange={e => update(f.findingCode, 'severity', e.target.value)}>
              <option value="minor">Minor</option>
              <option value="moderate">Moderate</option>
              <option value="major">Major</option>
              <option value="critical">Critical</option>
            </select>
            <select className={inp} value={String(f.confidence)}
              onChange={e => update(f.findingCode, 'confidence', parseFloat(e.target.value))}>
              <option value="1.0">High confidence</option>
              <option value="0.7">Medium confidence</option>
              <option value="0.5">Low confidence</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-red-700">
            <input type="checkbox" checked={f.immediateSafetyFlag}
              onChange={e => update(f.findingCode, 'immediateSafetyFlag', e.target.checked)} />
            Immediate safety flag
          </label>
          <input className={inp} placeholder="Description" value={f.description}
            onChange={e => update(f.findingCode, 'description', e.target.value)} />
        </div>
      ))}
    </div>
  );
}

function PositiveFindingsSection({
  value,
  onChange,
}: {
  value: any[];
  onChange: (v: any[]) => void;
}) {
  const inp = 'w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none';

  const toggle = (code: string) => {
    if (value.find((f) => f.findingCode === code)) {
      onChange(value.filter((f) => f.findingCode !== code));
    } else {
      onChange([...value, { findingCode: code, verificationStatus: 'worker_reported_unverified', confidence: 1.0, comment: '' }]);
    }
  };

  const update = (code: string, key: string, val: any) =>
    onChange(value.map((f) => f.findingCode === code ? { ...f, [key]: val } : f));

  return (
    <div className="card space-y-3">
      <h3 className="font-semibold text-gray-700">✅ Positive Findings</h3>
      <p className="text-xs text-gray-500">Only "Verified Positive" findings can reduce the risk score.</p>
      <div className="flex flex-wrap gap-2">
        {POSITIVE_FINDINGS.map(({ code, label }) => {
          const selected = value.find((f) => f.findingCode === code);
          return (
            <button key={code} onClick={() => toggle(code)}
              className={`text-xs px-2 py-1 rounded-full border transition-colors ${selected ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-600 border-gray-300 hover:border-green-300'}`}>
              {selected ? '✓ ' : ''}{label}
            </button>
          );
        })}
      </div>
      {value.map((f) => (
        <div key={f.findingCode} className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
          <p className="text-xs font-semibold text-green-700">{f.findingCode.replace(/_/g, ' ')}</p>
          <select className={inp} value={f.verificationStatus}
            onChange={e => update(f.findingCode, 'verificationStatus', e.target.value)}>
            <option value="verified_positive">✅ Verified Positive</option>
            <option value="worker_reported_unverified">Worker Reported (Unverified)</option>
            <option value="not_checked">Not Checked</option>
            <option value="not_applicable">Not Applicable</option>
            <option value="unknown">Unknown</option>
          </select>
          <input className={inp} placeholder="Comment" value={f.comment}
            onChange={e => update(f.findingCode, 'comment', e.target.value)} />
        </div>
      ))}
    </div>
  );
}
