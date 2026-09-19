import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from 'react-query';
import AdminLayout from '../../components/AdminLayout';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

// ── Constants ─────────────────────────────────────────────────

const ALERT_CATEGORIES = [
  { value: 'electrical_fault',    label: 'Electrical Fault' },
  { value: 'structural_damage',   label: 'Structural Damage' },
  { value: 'safety_hazard',       label: 'Safety Hazard' },
  { value: 'maintenance_overdue', label: 'Maintenance Overdue' },
  { value: 'sensor_anomaly',      label: 'Sensor Anomaly' },
  { value: 'weather_related',     label: 'Weather Related' },
  { value: 'citizen_complaint',   label: 'Citizen Complaint' },
  { value: 'operational_failure', label: 'Operational Failure' },
  { value: 'environmental',       label: 'Environmental' },
  { value: 'other',               label: 'Other' },
];

const ALERT_SOURCES = [
  { value: 'citizen_complaint',    label: 'Citizen Complaint' },
  { value: 'critical_asset',       label: 'Critical / High-Risk Asset' },
  { value: 'risk_score_jump',      label: 'Sudden Risk Score Jump' },
  { value: 'sensor_warning',       label: 'Sensor Warning' },
  { value: 'weather_warning',      label: 'Weather Warning' },
  { value: 'repeated_outage',      label: 'Repeated Outage' },
  { value: 'multiple_complaints',  label: 'Multiple Complaints (same area)' },
  { value: 'prior_worker_report',  label: 'Prior Worker Report' },
  { value: 'maintenance_failure',  label: 'Maintenance Failure' },
  { value: 'unmonitored_area',     label: 'Unmonitored Area' },
  { value: 'safety_issue',         label: 'Suspected Safety Issue' },
  { value: 'operator_report',      label: 'Operator Report' },
  { value: 'ai_prediction',        label: 'AI Prediction' },
  { value: 'department_request',   label: 'Request from Another Department' },
  { value: 'system_threshold',     label: 'System-Generated (Threshold Hit)' },
];

const FIELD_OF_WORK = [
  { value: 'electrical_engineering', label: 'Electrical Engineering' },
  { value: 'civil_engineering',      label: 'Civil Engineering' },
  { value: 'mechanical_engineering', label: 'Mechanical Engineering' },
  { value: 'other',                  label: 'Other' },
];

type Step = 1 | 2 | 3 | 4;

const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: 'Identification' },
  { step: 2, label: 'Geographic' },
  { step: 3, label: 'Problem Info' },
  { step: 4, label: 'Evidence' },
];

interface FormData {
  // Section 1
  title: string;
  category: string;
  priority: string;
  severity: string;
  sourceType: string;
  linkedComplaintId: string;
  linkedAssetId: string;
  linkedRiskPredictionId: string;
  // Section 2
  stateId: string;
  districtId: string;
  talukaId: string;
  villageId: string;
  areaType: string;
  pinCode: string;
  fullAddress: string;
  locationLat: string;
  locationLng: string;
  accessInstructions: string;
  nearbyLandmark: string;
  // Section 3
  description: string;
  potentialImpact: string;
  detectedAt: string;
  assetCondition: string;
  currentRiskScore: string;
  previousRiskScore: string;
  isSafetyConcern: boolean;
  publicImpact: string;
  affectedCustomerCount: string;
  criticalFacilities: string;
  requiredTechnicalField: string;
  requiredQualification: string;
  recommendedResponseDeadline: string;
  // Section 4
  evidenceLinks: Array<{ type: string; url: string; label: string }>;
}

const INITIAL_FORM: FormData = {
  title: '', category: '', priority: 'medium', severity: 'moderate',
  sourceType: '', linkedComplaintId: '', linkedAssetId: '', linkedRiskPredictionId: '',
  stateId: '', districtId: '', talukaId: '', villageId: '',
  areaType: 'rural', pinCode: '', fullAddress: '', locationLat: '', locationLng: '',
  accessInstructions: '', nearbyLandmark: '',
  description: '', potentialImpact: '', detectedAt: '', assetCondition: '',
  currentRiskScore: '', previousRiskScore: '',
  isSafetyConcern: false, publicImpact: '', affectedCustomerCount: '',
  criticalFacilities: '', requiredTechnicalField: '', requiredQualification: '',
  recommendedResponseDeadline: '',
  evidenceLinks: [],
};

// ── Component ─────────────────────────────────────────────────

export default function CreateAlertPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [geoWarning, setGeoWarning] = useState<string | null>(null);
  const [newEvidenceLink, setNewEvidenceLink] = useState({ type: '', url: '', label: '' });

  // Pre-fill state for state_admin
  useEffect(() => {
    if (user?.stateId && !form.stateId) {
      setForm((f) => ({ ...f, stateId: user.stateId! }));
    }
  }, [user]);

  // Load geography
  const { data: states = [] } = useQuery('states', () =>
    api.get('/gis/states').then((r) => r.data.data ?? []),
    { staleTime: 60000 }
  );
  const { data: districts = [] } = useQuery(
    ['districts', form.stateId],
    () => form.stateId
      ? api.get(`/gis/districts?stateId=${form.stateId}`).then((r) => r.data.data ?? [])
      : Promise.resolve([]),
    { enabled: !!form.stateId }
  );
  const { data: talukas = [] } = useQuery(
    ['talukas', form.districtId],
    () => form.districtId
      ? api.get(`/gis/talukas?districtId=${form.districtId}`).then((r) => r.data.data ?? [])
      : Promise.resolve([]),
    { enabled: !!form.districtId }
  );
  const { data: villages = [] } = useQuery(
    ['villages', form.talukaId],
    () => form.talukaId
      ? api.get(`/gis/villages?talukaId=${form.talukaId}`).then((r) => r.data.data ?? [])
      : Promise.resolve([]),
    { enabled: !!form.talukaId }
  );

  const set = (key: keyof FormData, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Geo mismatch warning: crude lat/lng range check for India
  const checkGeoMismatch = () => {
    const lat = parseFloat(form.locationLat);
    const lng = parseFloat(form.locationLng);
    if (isNaN(lat) || isNaN(lng)) return;
    if (lat < 8 || lat > 37 || lng < 68 || lng > 97) {
      setGeoWarning('Warning: the entered coordinates appear to be outside India. Please verify.');
    } else {
      setGeoWarning(null);
    }
  };

  // Use browser geolocation to fill lat/lng
  const fillCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      set('locationLat', pos.coords.latitude.toString());
      set('locationLng', pos.coords.longitude.toString());
      checkGeoMismatch();
    });
  };

  const createMutation = useMutation(
    (payload: any) => api.post('/alerts', payload).then((r) => r.data),
    {
      onSuccess: (data) => {
        navigate(`/state/alerts/${data.data.alertId}`);
      },
    }
  );

  const handleSubmit = () => {
    const payload = {
      title: form.title,
      category: form.category,
      priority: form.priority,
      severity: form.severity,
      sourceType: form.sourceType,
      linkedComplaintId: form.linkedComplaintId || null,
      linkedAssetId: form.linkedAssetId || null,
      linkedRiskPredictionId: form.linkedRiskPredictionId || null,
      stateId: form.stateId,
      districtId: form.districtId,
      talukaId: form.talukaId || null,
      villageId: form.villageId || null,
      areaType: form.areaType || null,
      pinCode: form.pinCode || null,
      fullAddress: form.fullAddress || null,
      locationLat: form.locationLat ? parseFloat(form.locationLat) : null,
      locationLng: form.locationLng ? parseFloat(form.locationLng) : null,
      accessInstructions: form.accessInstructions || null,
      nearbyLandmark: form.nearbyLandmark || null,
      description: form.description,
      potentialImpact: form.potentialImpact || null,
      detectedAt: form.detectedAt || null,
      assetCondition: form.assetCondition || null,
      currentRiskScore: form.currentRiskScore ? parseFloat(form.currentRiskScore) : null,
      previousRiskScore: form.previousRiskScore ? parseFloat(form.previousRiskScore) : null,
      isSafetyConcern: form.isSafetyConcern,
      publicImpact: form.publicImpact || null,
      affectedCustomerCount: form.affectedCustomerCount ? parseInt(form.affectedCustomerCount) : null,
      criticalFacilities: form.criticalFacilities || null,
      requiredTechnicalField: form.requiredTechnicalField || null,
      requiredQualification: form.requiredQualification || null,
      recommendedResponseDeadline: form.recommendedResponseDeadline || null,
      evidenceLinks: form.evidenceLinks.length > 0 ? form.evidenceLinks : null,
    };
    createMutation.mutate(payload);
  };

  const canAdvance = (): boolean => {
    if (step === 1) return !!(form.title && form.category && form.sourceType);
    if (step === 2) return !!(form.stateId && form.districtId);
    if (step === 3) return !!(form.description && form.description.length >= 10);
    return true;
  };

  // ── Field helpers ──────────────────────────────────────────
  const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';
  const sel = inp;

  return (
    <AdminLayout title="Create Alert">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Step indicator */}
        <div className="flex gap-1">
          {STEPS.map(({ step: s, label }) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                step === s
                  ? 'bg-blue-600 text-white'
                  : step > s
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
              }`}
            >
              {s}. {label}
              {step > s && ' ✓'}
            </button>
          ))}
        </div>

        <div className="card space-y-5">
          {/* ── Section 1: Identification ─────────────────── */}
          {step === 1 && (
            <>
              <h2 className="font-semibold text-gray-800 text-base">Section 1 — Identification</h2>
              <Field label="Alert Title" required>
                <input className={inp} value={form.title} onChange={e => set('title', e.target.value)} placeholder="Brief title describing the issue" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Category" required>
                  <select className={sel} value={form.category} onChange={e => set('category', e.target.value)}>
                    <option value="">Select category…</option>
                    {ALERT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </Field>
                <Field label="Source" required>
                  <select className={sel} value={form.sourceType} onChange={e => set('sourceType', e.target.value)}>
                    <option value="">Select source…</option>
                    {ALERT_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Priority">
                  <select className={sel} value={form.priority} onChange={e => set('priority', e.target.value)}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </Field>
                <Field label="Severity">
                  <select className={sel} value={form.severity} onChange={e => set('severity', e.target.value)}>
                    <option value="minor">Minor</option>
                    <option value="moderate">Moderate</option>
                    <option value="major">Major</option>
                    <option value="critical">Critical</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <Field label="Linked Complaint ID (optional)">
                  <input className={inp} value={form.linkedComplaintId} onChange={e => set('linkedComplaintId', e.target.value)} placeholder="UUID of complaint" />
                </Field>
                <Field label="Linked Asset ID (optional)">
                  <input className={inp} value={form.linkedAssetId} onChange={e => set('linkedAssetId', e.target.value)} placeholder="UUID of asset" />
                </Field>
                <Field label="Linked Risk Prediction ID (optional)">
                  <input className={inp} value={form.linkedRiskPredictionId} onChange={e => set('linkedRiskPredictionId', e.target.value)} placeholder="UUID of risk prediction" />
                </Field>
              </div>
            </>
          )}

          {/* ── Section 2: Geographic ─────────────────────── */}
          {step === 2 && (
            <>
              <h2 className="font-semibold text-gray-800 text-base">Section 2 — Geographic</h2>
              {geoWarning && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800">
                  ⚠ {geoWarning}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Field label="State" required>
                  <select className={sel} value={form.stateId} onChange={e => { set('stateId', e.target.value); set('districtId', ''); set('talukaId', ''); set('villageId', ''); }}
                    disabled={user?.role === 'state_admin'}>
                    <option value="">Select state…</option>
                    {(states as any[]).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
                <Field label="District" required>
                  <select className={sel} value={form.districtId} onChange={e => { set('districtId', e.target.value); set('talukaId', ''); set('villageId', ''); }}>
                    <option value="">Select district…</option>
                    {(districts as any[]).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
                <Field label="Taluka">
                  <select className={sel} value={form.talukaId} onChange={e => { set('talukaId', e.target.value); set('villageId', ''); }}>
                    <option value="">Select taluka…</option>
                    {(talukas as any[]).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </Field>
                <Field label="Village">
                  <select className={sel} value={form.villageId} onChange={e => set('villageId', e.target.value)}>
                    <option value="">Select village…</option>
                    {(villages as any[]).map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Area Type">
                  <select className={sel} value={form.areaType} onChange={e => set('areaType', e.target.value)}>
                    <option value="rural">Rural</option>
                    <option value="urban">Urban</option>
                    <option value="semi_urban">Semi-Urban</option>
                  </select>
                </Field>
                <Field label="PIN Code">
                  <input className={inp} value={form.pinCode} onChange={e => set('pinCode', e.target.value)} placeholder="6-digit PIN" maxLength={6} />
                </Field>
              </div>
              <Field label="Full Address">
                <textarea className={inp} rows={2} value={form.fullAddress} onChange={e => set('fullAddress', e.target.value)} placeholder="Full site address" />
              </Field>
              <div className="grid grid-cols-2 gap-3 items-end">
                <Field label="Latitude">
                  <input className={inp} type="number" step="any" value={form.locationLat}
                    onChange={e => { set('locationLat', e.target.value); }}
                    onBlur={checkGeoMismatch}
                    placeholder="e.g. 23.0225" />
                </Field>
                <Field label="Longitude">
                  <input className={inp} type="number" step="any" value={form.locationLng}
                    onChange={e => { set('locationLng', e.target.value); }}
                    onBlur={checkGeoMismatch}
                    placeholder="e.g. 72.5714" />
                </Field>
              </div>
              <button
                type="button"
                onClick={fillCurrentLocation}
                className="text-xs text-blue-600 hover:underline"
              >
                📍 Use my current location
              </button>
              {form.locationLat && form.locationLng && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                  Map marker placed at {parseFloat(form.locationLat).toFixed(5)}, {parseFloat(form.locationLng).toFixed(5)}.
                  Open in maps:{' '}
                  <a
                    href={`https://www.google.com/maps?q=${form.locationLat},${form.locationLng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline font-medium"
                  >
                    Google Maps ↗
                  </a>
                </div>
              )}
              <Field label="Access Instructions">
                <input className={inp} value={form.accessInstructions} onChange={e => set('accessInstructions', e.target.value)} placeholder="How to reach the site" />
              </Field>
              <Field label="Nearby Landmark">
                <input className={inp} value={form.nearbyLandmark} onChange={e => set('nearbyLandmark', e.target.value)} placeholder="Reference landmark" />
              </Field>
            </>
          )}

          {/* ── Section 3: Problem Info ───────────────────── */}
          {step === 3 && (
            <>
              <h2 className="font-semibold text-gray-800 text-base">Section 3 — Problem Information</h2>
              <Field label="Description" required>
                <textarea className={inp} rows={4} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Describe the issue in detail (min 10 characters)" />
              </Field>
              <Field label="What Has / May Happen">
                <textarea className={inp} rows={2} value={form.potentialImpact} onChange={e => set('potentialImpact', e.target.value)} placeholder="Potential impact or consequence" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Detected Date / Time">
                  <input className={inp} type="datetime-local" value={form.detectedAt} onChange={e => set('detectedAt', e.target.value)} />
                </Field>
                <Field label="Current Asset Condition">
                  <input className={inp} value={form.assetCondition} onChange={e => set('assetCondition', e.target.value)} placeholder="e.g. Operational, Degraded, Failed" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Current Risk Score">
                  <input className={inp} type="number" min="0" max="100" value={form.currentRiskScore} onChange={e => set('currentRiskScore', e.target.value)} placeholder="0–100" />
                </Field>
                <Field label="Previous Risk Score">
                  <input className={inp} type="number" min="0" max="100" value={form.previousRiskScore} onChange={e => set('previousRiskScore', e.target.value)} placeholder="0–100" />
                </Field>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="safetyConcern" checked={form.isSafetyConcern}
                  onChange={e => set('isSafetyConcern', e.target.checked)}
                  className="w-4 h-4 text-red-600" />
                <label htmlFor="safetyConcern" className="text-sm font-medium text-red-700">
                  🚨 This is a safety concern
                </label>
              </div>
              <Field label="Public Impact">
                <input className={inp} value={form.publicImpact} onChange={e => set('publicImpact', e.target.value)} placeholder="Impact on public / affected services" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Affected Customer Count">
                  <input className={inp} type="number" min="0" value={form.affectedCustomerCount} onChange={e => set('affectedCustomerCount', e.target.value)} />
                </Field>
                <Field label="Critical Facilities Affected">
                  <input className={inp} value={form.criticalFacilities} onChange={e => set('criticalFacilities', e.target.value)} placeholder="Hospital, school, etc." />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Required Technical Field">
                  <select className={sel} value={form.requiredTechnicalField} onChange={e => set('requiredTechnicalField', e.target.value)}>
                    <option value="">Any field</option>
                    {FIELD_OF_WORK.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </Field>
                <Field label="Required Qualification">
                  <input className={inp} value={form.requiredQualification} onChange={e => set('requiredQualification', e.target.value)} placeholder="e.g. Licensed Electrician" />
                </Field>
              </div>
              <Field label="Recommended Response Deadline">
                <input className={inp} type="datetime-local" value={form.recommendedResponseDeadline} onChange={e => set('recommendedResponseDeadline', e.target.value)} />
              </Field>
            </>
          )}

          {/* ── Section 4: Evidence ───────────────────────── */}
          {step === 4 && (
            <>
              <h2 className="font-semibold text-gray-800 text-base">Section 4 — Evidence Links</h2>
              <p className="text-xs text-gray-500">Link to existing photos, sensor graphs, weather warnings, inspection reports, or other supporting documents.</p>

              {/* Existing links */}
              {form.evidenceLinks.length > 0 && (
                <div className="space-y-2">
                  {form.evidenceLinks.map((link, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-sm">
                      <span className="badge bg-blue-100 text-blue-700 text-xs">{link.type}</span>
                      <span className="flex-1 truncate">{link.label || link.url}</span>
                      <button onClick={() => set('evidenceLinks', form.evidenceLinks.filter((_, j) => j !== i))}
                        className="text-red-500 hover:text-red-700 text-xs">Remove</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new link */}
              <div className="p-4 border border-dashed border-gray-300 rounded-lg space-y-3">
                <p className="text-xs font-medium text-gray-600">Add Evidence Link</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type">
                    <select className={sel} value={newEvidenceLink.type}
                      onChange={e => setNewEvidenceLink(n => ({ ...n, type: e.target.value }))}>
                      <option value="">Select type…</option>
                      <option value="complaint_photo">Complaint Photo</option>
                      <option value="asset_photo">Asset Photo</option>
                      <option value="sensor_graph">Sensor Graph</option>
                      <option value="weather_warning">Weather Warning</option>
                      <option value="historical_incident">Historical Incident</option>
                      <option value="inspection_report">Prior Inspection Report</option>
                      <option value="document">Supporting Document</option>
                    </select>
                  </Field>
                  <Field label="Label">
                    <input className={inp} value={newEvidenceLink.label}
                      onChange={e => setNewEvidenceLink(n => ({ ...n, label: e.target.value }))}
                      placeholder="Description" />
                  </Field>
                </div>
                <Field label="URL">
                  <input className={inp} value={newEvidenceLink.url}
                    onChange={e => setNewEvidenceLink(n => ({ ...n, url: e.target.value }))}
                    placeholder="https://…" />
                </Field>
                <button
                  type="button"
                  onClick={() => {
                    if (newEvidenceLink.type && newEvidenceLink.url) {
                      set('evidenceLinks', [...form.evidenceLinks, { ...newEvidenceLink }]);
                      setNewEvidenceLink({ type: '', url: '', label: '' });
                    }
                  }}
                  className="btn-primary text-sm"
                >
                  + Add Link
                </button>
              </div>

              {/* Review summary */}
              <div className="p-4 bg-gray-50 rounded-lg space-y-1 text-sm">
                <p className="font-semibold text-gray-700 mb-2">Review Before Submission</p>
                <p><span className="text-gray-500">Title:</span> {form.title || '—'}</p>
                <p><span className="text-gray-500">Category:</span> {form.category || '—'} · {form.priority} priority · {form.severity} severity</p>
                <p><span className="text-gray-500">Source:</span> {form.sourceType || '—'}</p>
                <p><span className="text-gray-500">Location:</span> {form.fullAddress || `${form.locationLat || '?'}, ${form.locationLng || '?'}`}</p>
                <p><span className="text-gray-500">Safety concern:</span> {form.isSafetyConcern ? '🚨 YES' : 'No'}</p>
                <p><span className="text-gray-500">Evidence links:</span> {form.evidenceLinks.length}</p>
              </div>
            </>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="flex justify-between gap-3">
          {step > 1 ? (
            <button type="button" onClick={() => setStep((s) => (s - 1) as Step)} className="btn-secondary">
              ← Back
            </button>
          ) : (
            <button type="button" onClick={() => navigate(-1)} className="btn-secondary">
              Cancel
            </button>
          )}
          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s + 1) as Step)}
              disabled={!canAdvance()}
              className="btn-primary disabled:opacity-40"
            >
              Next →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={createMutation.isLoading || !canAdvance()}
              className="btn-primary disabled:opacity-40"
            >
              {createMutation.isLoading ? 'Creating…' : '✓ Create Alert'}
            </button>
          )}
        </div>

        {createMutation.isError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {(createMutation.error as any)?.response?.data?.message ?? 'Failed to create alert. Please try again.'}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
