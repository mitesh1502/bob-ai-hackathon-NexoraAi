import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../lib/api';

interface ComplaintData {
  fullName: string;
  mobile: string;
  email: string;
  stateId: string;
  districtId: string;
  city: string;
  pinCode: string;
  addressText: string;
  preferredContact: string;
  category: string;
  assetType: string;
  description: string;
  dateNoticed: string;
  isSafetyConcern: boolean;
  manualLat?: number;
  manualLng?: number;
}

const CATEGORIES = [
  'Transformer fault', 'Power outage', 'Electrical fire/smoke', 'Exposed wiring',
  'Overloaded line', 'Meter issue', 'Street light fault', 'Overhead line hazard',
  'Substation issue', 'Other',
];

export default function ComplaintSubmitPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [gpsInfo, setGpsInfo] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string>('');
  const [manualGps, setManualGps] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [loading, setLoading] = useState(false);
  const [states, setStates] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [result, setResult] = useState<{ complaintNumber: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<ComplaintData>({
    fullName: '', mobile: '', email: '', stateId: '', districtId: '',
    city: '', pinCode: '', addressText: '', preferredContact: 'mobile',
    category: '', assetType: '', description: '',
    dateNoticed: '', isSafetyConcern: false,
  });

  React.useEffect(() => {
    api.get('/citizens/states').then((r) => setStates(r.data.data));
  }, []);

  const loadDistricts = (stateId: string) => {
    api.get(`/citizens/districts/${stateId}`).then((r) => setDistricts(r.data.data));
    setForm((f) => ({ ...f, stateId, districtId: '' }));
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setGpsError('');

    // Show preview
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);

    // Try to get current GPS position
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsInfo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setGpsError('');
        },
        () => {
          setGpsError(
            'Location access denied. Please enable location permissions or use manual coordinates.'
          );
          setManualGps(true);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setGpsError('Geolocation not supported. Please enter location manually.');
      setManualGps(true);
    }
  };

  const handleSubmit = async () => {
    if (!photo) {
      toast.error('A GIS-tagged photo is required to submit a complaint');
      return;
    }
    if (!gpsInfo && (!manualGps || !manualLat || !manualLng)) {
      toast.error('Location information is required. Please enable GPS or enter coordinates manually.');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('photo', photo);

      const payload: any = {
        ...form,
        isSafetyConcern: form.isSafetyConcern,
      };
      if (gpsInfo) {
        payload.manualLat = gpsInfo.lat;
        payload.manualLng = gpsInfo.lng;
      } else if (manualGps) {
        payload.manualLat = parseFloat(manualLat);
        payload.manualLng = parseFloat(manualLng);
      }
      formData.append('data', JSON.stringify(payload));

      const res = await api.post('/complaints', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setResult(res.data.data);
      setStep(4);
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ??
        'Failed to submit complaint. Please check all required fields and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const f = (key: keyof ComplaintData, val: any) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  if (step === 4 && result) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card max-w-lg text-center">
          <div className="text-green-500 text-6xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Complaint Registered</h2>
          <p className="text-gray-600 mb-4">Your complaint has been successfully registered.</p>
          <div className="rounded-lg p-4 mb-6 border" style={{ backgroundColor: 'rgba(30,58,76,0.06)', borderColor: 'rgba(30,58,76,0.15)' }}>
            <p className="text-sm text-gray-500 mb-1">Your Complaint Number</p>
            <p className="text-2xl font-bold font-mono" style={{ color: 'var(--color-primary)' }}>{result.complaintNumber}</p>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Save this number to track your complaint status at any time.
          </p>
          <div className="flex gap-3 justify-center">
            <Link to="/track" className="btn-primary">Track Your Complaint</Link>
            <Link to="/" className="btn-outline">Go Home</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-gray-900">NEXORA AI</Link>
        <span className="text-sm text-gray-500">Citizen Complaint — No account required</span>
      </header>

      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        {/* Steps */}
        <div className="flex items-center gap-2 mb-8">
          {['Your Details', 'Complaint Info', 'Photo & Location', 'Submit'].map((label, i) => (
            <React.Fragment key={i}>
              <div
                className={`flex items-center gap-2 ${step > i + 1 ? 'text-green-600' : step !== i + 1 ? 'text-gray-400' : ''}`}
                style={step === i + 1 ? { color: 'var(--color-primary)' } : {}}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                    ${step > i + 1 ? 'bg-green-600 text-white' : step !== i + 1 ? 'bg-gray-200 text-gray-500' : ''}`}
                  style={step === i + 1 ? { backgroundColor: 'var(--color-primary)', color: 'white' } : {}}
                >
                  {step > i + 1 ? '✓' : i + 1}
                </div>
                <span className="hidden sm:block text-sm font-medium">{label}</span>
              </div>
              {i < 3 && <div className="flex-1 h-0.5 bg-gray-200" />}
            </React.Fragment>
          ))}
        </div>

        <div className="card">
          {/* Step 1: Citizen Details */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4">Your Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Full Name <span className="text-red-500">*</span></label>
                  <input className="form-input" value={form.fullName} onChange={(e) => f('fullName', e.target.value)} required />
                </div>
                <div>
                  <label className="form-label">Mobile Number</label>
                  <input className="form-input" value={form.mobile} onChange={(e) => f('mobile', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={(e) => f('email', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Preferred Contact</label>
                  <select className="form-input" value={form.preferredContact} onChange={(e) => f('preferredContact', e.target.value)}>
                    <option value="mobile">Mobile/SMS</option>
                    <option value="email">Email</option>
                    <option value="both">Both</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">State <span className="text-red-500">*</span></label>
                  <select className="form-input" value={form.stateId} onChange={(e) => loadDistricts(e.target.value)} required>
                    <option value="">-- Select State --</option>
                    {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">District <span className="text-red-500">*</span></label>
                  <select className="form-input" value={form.districtId} onChange={(e) => f('districtId', e.target.value)} required>
                    <option value="">-- Select District --</option>
                    {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">City/Village</label>
                  <input className="form-input" value={form.city} onChange={(e) => f('city', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">PIN Code</label>
                  <input className="form-input" value={form.pinCode} onChange={(e) => f('pinCode', e.target.value)} maxLength={6} />
                </div>
              </div>
              <div>
                <label className="form-label">Address</label>
                <textarea className="form-input" rows={2} value={form.addressText} onChange={(e) => f('addressText', e.target.value)} />
              </div>
              <div className="flex justify-end">
                <button
                  className="btn-primary"
                  onClick={() => {
                    if (!form.fullName || !form.stateId || !form.districtId) {
                      toast.error('Please fill in required fields');
                      return;
                    }
                    setStep(2);
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Complaint Info */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4">Complaint Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Category <span className="text-red-500">*</span></label>
                  <select className="form-input" value={form.category} onChange={(e) => f('category', e.target.value)} required>
                    <option value="">-- Select Category --</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Asset/Equipment Type</label>
                  <input className="form-input" value={form.assetType} onChange={(e) => f('assetType', e.target.value)} placeholder="e.g. Transformer, Street light" />
                </div>
                <div>
                  <label className="form-label">Date Noticed</label>
                  <input type="date" className="form-input" value={form.dateNoticed} onChange={(e) => f('dateNoticed', e.target.value)} />
                </div>
                <div className="flex items-center gap-3 mt-6">
                  <input
                    type="checkbox"
                    id="safety"
                    checked={form.isSafetyConcern}
                    onChange={(e) => f('isSafetyConcern', e.target.checked)}
                    className="w-4 h-4 accent-red-600"
                  />
                  <label htmlFor="safety" className="text-sm font-medium text-red-700">
                    This is a safety concern (live wire, fire risk, etc.)
                  </label>
                </div>
              </div>
              <div>
                <label className="form-label">Description <span className="text-red-500">*</span> (min. 10 characters)</label>
                <textarea
                  className="form-input"
                  rows={4}
                  value={form.description}
                  onChange={(e) => f('description', e.target.value)}
                  placeholder="Describe the issue in detail — what you see, hear, smell, and when it started"
                  required
                />
              </div>
              <div className="flex justify-between">
                <button className="btn-outline" onClick={() => setStep(1)}>← Back</button>
                <button
                  className="btn-primary"
                  onClick={() => {
                    if (!form.category || form.description.length < 10) {
                      toast.error('Please fill category and description (min. 10 chars)');
                      return;
                    }
                    setStep(3);
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Photo + GPS — MANDATORY */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-2">Mandatory GIS-Tagged Photo</h2>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <strong>⚠ Required:</strong> A photo with GPS location is <em>mandatory</em> to submit a complaint.
                Please enable location services on your device before taking the photo.
                Without valid location evidence, the complaint cannot be registered.
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
                {photoPreview ? (
                  <div className="space-y-3">
                    <img src={photoPreview} alt="Preview" className="max-h-48 mx-auto rounded-lg object-cover" />
                    {gpsInfo ? (
                      <div className="flex items-center justify-center gap-2 text-green-700 text-sm font-medium">
                        <span>✓</span>
                        <span>GPS captured: {gpsInfo.lat.toFixed(5)}, {gpsInfo.lng.toFixed(5)}</span>
                      </div>
                    ) : gpsError ? (
                      <div className="text-amber-700 text-sm">{gpsError}</div>
                    ) : (
                      <div className="text-gray-500 text-sm">Detecting location…</div>
                    )}
                    <button className="btn-outline text-sm" onClick={() => { setPhoto(null); setPhotoPreview(null); setGpsInfo(null); setGpsError(''); }}>
                      Remove photo
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-5xl">📷</div>
                    <p className="text-gray-600 text-sm">
                      Take a photo of the fault/issue with your device camera.
                      Make sure location services are enabled.
                    </p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoCapture}
                      className="hidden"
                    />
                    <button className="btn-primary" onClick={() => fileRef.current?.click()}>
                      📷 Take Photo / Upload
                    </button>
                  </div>
                )}
              </div>

              {/* Manual GPS fallback */}
              {manualGps && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-sm font-medium text-gray-700">
                    Manual Location Entry (approved fallback — your device will record a timestamp)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label text-xs">Latitude</label>
                      <input
                        type="number" step="any" className="form-input text-sm"
                        placeholder="e.g. 19.0760"
                        value={manualLat} onChange={(e) => setManualLat(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label text-xs">Longitude</label>
                      <input
                        type="number" step="any" className="form-input text-sm"
                        placeholder="e.g. 72.8777"
                        value={manualLng} onChange={(e) => setManualLng(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    Use Google Maps to find your coordinates: right-click a location → select the coordinates shown.
                  </p>
                </div>
              )}

              <div className="flex justify-between">
                <button className="btn-outline" onClick={() => setStep(2)}>← Back</button>
                <button
                  className="btn-primary"
                  onClick={handleSubmit}
                  disabled={loading || !photo}
                >
                  {loading ? 'Submitting…' : 'Submit Complaint'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
