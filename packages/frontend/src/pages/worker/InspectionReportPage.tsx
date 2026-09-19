import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import { toast } from 'react-toastify';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface ObservationEntry {
  observationCode: string;
  type: 'positive' | 'negative';
  severity?: string;
  confidence?: number;
  description?: string;
  measuredValue?: number;
  measuredUnit?: string;
  comment?: string;
}

const NEGATIVE_CODES = [
  'corrosion', 'exposed_wiring', 'overheating', 'burning_smell', 'cracked_insulation',
  'water_ingress', 'oil_leakage', 'loose_connections', 'damaged_enclosure',
  'excessive_vibration', 'unusual_noise', 'overloading', 'repeated_tripping',
  'poor_earthing', 'broken_protective_covers', 'pest_animal_damage', 'flood_exposure',
  'structural_instability', 'unauthorized_modification', 'high_temperature',
  'abnormal_readings', 'evidence_of_arcing', 'missing_signage', 'restricted_access',
  'poor_ventilation',
];

const POSITIVE_CODES = [
  'no_visible_damage', 'enclosure_intact', 'proper_earthing_confirmed',
  'normal_temperature', 'normal_sound', 'normal_vibration', 'no_corrosion',
  'no_water_ingress', 'wiring_properly_insulated', 'protective_covers_intact',
  'load_within_range', 'signage_present', 'recent_maintenance_completed',
  'adequate_ventilation', 'no_repeated_faults', 'area_clean_accessible',
  'sensor_readings_normal',
];

export default function InspectionReportPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: taskData } = useQuery(['task', taskId], () =>
    api.get(`/inspections/tasks/my`).then((r) => r.data.data.find((t: any) => t.id === taskId))
  );

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    weatherCondition: '', siteAccess: 'accessible', safetyStatus: 'safe',
    visibleCondition: '', operationalStatus: '', immediateSafetyConcern: false,
    recommendedAction: '', urgency: 'routine', notes: '', gpsLat: '', gpsLng: '',
  });
  const [observations, setObservations] = useState<ObservationEntry[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const checklist = taskData?.dynamic_checklist
    ? (typeof taskData.dynamic_checklist === 'string'
        ? JSON.parse(taskData.dynamic_checklist)
        : taskData.dynamic_checklist)
    : [];

  const addObservation = (code: string, type: 'positive' | 'negative') => {
    if (observations.find((o) => o.observationCode === code)) {
      setObservations((obs) => obs.filter((o) => o.observationCode !== code));
    } else {
      setObservations((obs) => [...obs, { observationCode: code, type, confidence: 1.0 }]);
    }
  };

  const handlePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setPhotos((prev) => [...prev, ...files].slice(0, 20));
  };

  const handleSubmit = async (isDraft = false) => {
    if (!taskId) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      photos.forEach((p) => formData.append('photos', p));

      const payload = {
        taskId,
        assetId: taskData?.asset_id,
        ...form,
        gpsLat: form.gpsLat ? parseFloat(form.gpsLat) : undefined,
        gpsLng: form.gpsLng ? parseFloat(form.gpsLng) : undefined,
        observations,
        isDraft,
      };
      formData.append('data', JSON.stringify(payload));

      const res = await api.post('/inspections/reports', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setResult(res.data.data);
      if (!isDraft) setStep(5);
      else toast.success('Draft saved');
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  if (result && step === 5) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card max-w-lg w-full">
          <div className="text-center mb-6">
            <div className="text-green-500 text-5xl mb-3">✓</div>
            <h2 className="text-xl font-bold text-gray-900">Report Submitted</h2>
          </div>

          {/* Risk score before/after — critical transparency feature */}
          <div className="rounded-xl p-4 mb-4 border" style={{ backgroundColor: 'rgba(30,58,76,0.05)', borderColor: 'rgba(30,58,76,0.12)' }}>
            <h3 className="font-semibold mb-3" style={{ color: 'var(--color-primary)' }}>Risk Score Impact of Your Observations</h3>
            <div className="flex items-center justify-center gap-6">
              <div className="text-center">
                <p className="text-xs text-gray-500">Before</p>
                <p className="text-3xl font-bold text-gray-700">{Math.round(result.riskScoreBefore)}</p>
              </div>
              <div className="text-center">
                <p className={`text-3xl font-bold ${result.scoreDelta > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {result.scoreDelta > 0 ? '▲' : '▼'} {Math.abs(Math.round(result.scoreDelta))}
                </p>
                <p className="text-xs text-gray-500">Change</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">After</p>
                <p className={`text-3xl font-bold ${result.riskScoreAfter >= 75 ? 'text-red-600' : result.riskScoreAfter >= 50 ? 'text-orange-600' : 'text-green-600'}`}>
                  {Math.round(result.riskScoreAfter)}
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500 text-center mt-3 italic">
              Your observations directly moved this asset's predicted risk score.
              An administrator will review this prediction before any action is taken.
            </p>
          </div>

          <div className="flex gap-3">
            <button className="btn-primary flex-1" onClick={() => navigate('/worker/tasks')}>
              Back to Tasks
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/worker/tasks')} className="text-gray-500 hover:text-gray-700">←</button>
        <h1 className="font-bold text-gray-900">Inspection Report</h1>
        {taskData && (
          <span className="badge bg-gray-100 text-gray-600 text-xs ml-auto">{taskData.task_code}</span>
        )}
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Task info */}
        {taskData && (
          <div className="card text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-gray-500">Asset:</span> <strong className="font-mono">{taskData.asset_code}</strong></div>
              <div><span className="text-gray-500">Type:</span> {taskData.asset_type?.replace('_', ' ')}</div>
              <div><span className="text-gray-500">Risk Level:</span>
                <span className={`ml-1 badge ${taskData.current_risk_level === 'critical' ? 'risk-critical' : taskData.current_risk_level === 'high' ? 'risk-high' : 'risk-moderate'}`}>
                  {taskData.current_risk_level?.toUpperCase()}
                </span>
              </div>
              <div><span className="text-gray-500">Due:</span> {taskData.due_date ?? 'ASAP'}</div>
            </div>
          </div>
        )}

        {/* Dynamic checklist */}
        {checklist.length > 0 && (
          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-3">Inspection Checklist</h3>
            <p className="text-xs text-gray-500 mb-3">
              This checklist was generated based on the asset type, current risk flags, and weather conditions.
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {checklist.map((item: any, i: number) => (
                <div key={i} className={`p-2 rounded-lg text-xs ${item.isSafetyWarning ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-100'}`}>
                  <div className="flex items-start gap-2">
                    {item.isSafetyWarning && <span className="text-red-600 font-bold mt-0.5">⚠</span>}
                    <div>
                      <p className={`font-medium ${item.isSafetyWarning ? 'text-red-800' : 'text-gray-800'}`}>{item.task}</p>
                      <p className="text-gray-500 mt-0.5">{item.why}</p>
                      {item.isSafetyWarning && item.safetyEscalation && (
                        <p className="text-red-700 font-medium mt-1">{item.safetyEscalation}</p>
                      )}
                      <p className="mt-0.5" style={{ color: 'var(--color-secondary)' }}>Evidence needed: {item.evidenceRequired}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Site conditions */}
        <div className="card">
          <h3 className="font-semibold text-gray-700 mb-4">Site Conditions</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="form-label text-xs">Weather Condition</label>
              <select className="form-input text-sm" value={form.weatherCondition}
                onChange={(e) => setForm((f) => ({ ...f, weatherCondition: e.target.value }))}>
                <option value="">Select</option>
                {['Clear', 'Cloudy', 'Rainy', 'Heavy Rain', 'Storm', 'Hot', 'Humid'].map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label text-xs">Site Access</label>
              <select className="form-input text-sm" value={form.siteAccess}
                onChange={(e) => setForm((f) => ({ ...f, siteAccess: e.target.value }))}>
                <option value="accessible">Accessible</option>
                <option value="restricted">Restricted</option>
                <option value="not_accessible">Not Accessible</option>
              </select>
            </div>
            <div>
              <label className="form-label text-xs">Safety Status</label>
              <select className="form-input text-sm" value={form.safetyStatus}
                onChange={(e) => setForm((f) => ({ ...f, safetyStatus: e.target.value }))}>
                <option value="safe">Safe</option>
                <option value="caution">Caution Required</option>
                <option value="unsafe">Unsafe — Do Not Proceed</option>
              </select>
            </div>
            <div>
              <label className="form-label text-xs">Operational Status</label>
              <select className="form-input text-sm" value={form.operationalStatus}
                onChange={(e) => setForm((f) => ({ ...f, operationalStatus: e.target.value }))}>
                <option value="">Select</option>
                <option value="normal">Normal</option>
                <option value="degraded">Degraded</option>
                <option value="fault">Fault Detected</option>
                <option value="offline">Offline</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.immediateSafetyConcern}
                onChange={(e) => setForm((f) => ({ ...f, immediateSafetyConcern: e.target.checked }))}
                className="accent-red-600" />
              <span className="text-red-700 font-medium">Immediate safety concern — escalate immediately</span>
            </label>
          </div>
        </div>

        {/* Observations — KEY SECTION */}
        <div className="card">
          <h3 className="font-semibold text-gray-700 mb-2">Your Observations</h3>
          <p className="text-xs text-gray-500 mb-4 italic">
            ⚠ Important: Your observations are evidence only. The AI engine — not you —
            calculates the risk score change. Negative observations raise risk; positive ones
            lower it where appropriate.
          </p>

          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-red-700 mb-2">⚠ Negative Conditions Observed</h4>
              <div className="flex flex-wrap gap-2">
                {NEGATIVE_CODES.map((code) => {
                  const selected = observations.find((o) => o.observationCode === code && o.type === 'negative');
                  return (
                    <button
                      key={code}
                      onClick={() => addObservation(code, 'negative')}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        selected
                          ? 'bg-red-100 border-red-400 text-red-800 font-medium'
                          : 'bg-white border-gray-300 text-gray-600 hover:border-red-300'
                      }`}
                    >
                      {code.replace(/_/g, ' ')}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-green-700 mb-2">✓ Positive Conditions Confirmed</h4>
              <div className="flex flex-wrap gap-2">
                {POSITIVE_CODES.map((code) => {
                  const selected = observations.find((o) => o.observationCode === code && o.type === 'positive');
                  return (
                    <button
                      key={code}
                      onClick={() => addObservation(code, 'positive')}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        selected
                          ? 'bg-green-100 border-green-400 text-green-800 font-medium'
                          : 'bg-white border-gray-300 text-gray-600 hover:border-green-300'
                      }`}
                    >
                      {code.replace(/_/g, ' ')}
                    </button>
                  );
                })}
              </div>
            </div>

            {observations.length > 0 && (
              <div className="p-3 rounded-lg text-xs" style={{ backgroundColor: 'rgba(30,58,76,0.06)', color: 'var(--color-primary)' }}>
                {observations.filter((o) => o.type === 'negative').length} negative and{' '}
                {observations.filter((o) => o.type === 'positive').length} positive observation(s) selected.
                These will be used to update the asset's risk score upon submission.
              </div>
            )}
          </div>
        </div>

        {/* Notes + GPS */}
        <div className="card space-y-4">
          <div>
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={3} value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Additional observations, measurements, or context..." />
          </div>
          <div>
            <label className="form-label">Recommended Action</label>
            <textarea className="form-input" rows={2} value={form.recommendedAction}
              onChange={(e) => setForm((f) => ({ ...f, recommendedAction: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Urgency</label>
            <select className="form-input" value={form.urgency}
              onChange={(e) => setForm((f) => ({ ...f, urgency: e.target.value }))}>
              <option value="routine">Routine</option>
              <option value="scheduled">Scheduled</option>
              <option value="urgent">Urgent</option>
              <option value="immediate">Immediate</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label text-xs">Your GPS Latitude</label>
              <input type="number" step="any" className="form-input text-sm" value={form.gpsLat}
                onChange={(e) => setForm((f) => ({ ...f, gpsLat: e.target.value }))} />
            </div>
            <div>
              <label className="form-label text-xs">Your GPS Longitude</label>
              <input type="number" step="any" className="form-input text-sm" value={form.gpsLng}
                onChange={(e) => setForm((f) => ({ ...f, gpsLng: e.target.value }))} />
            </div>
          </div>
        </div>

        {/* Photos */}
        <div className="card">
          <h3 className="font-semibold text-gray-700 mb-3">Photos (GIS-tagged, max 20)</h3>
          <p className="text-xs text-gray-500 mb-3">
            Attach before/close-up/wide-area/after-maintenance photos. All photos should be taken
            with location services enabled.
          </p>
          <input type="file" accept="image/*" multiple onChange={handlePhotos}
            className="block text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0"
            style={{ '--tw-file-bg': 'rgba(30,58,76,0.07)' } as React.CSSProperties} />
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {photos.map((p, i) => (
                <div key={i} className="relative">
                  <img src={URL.createObjectURL(p)} alt="" className="w-16 h-16 object-cover rounded-lg" />
                  <button
                    onClick={() => setPhotos((ph) => ph.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pb-8">
          <button
            onClick={() => handleSubmit(true)}
            disabled={submitting}
            className="btn-outline flex-1"
          >
            Save Draft
          </button>
          <button
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            className="btn-primary flex-1"
          >
            {submitting ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  );
}
