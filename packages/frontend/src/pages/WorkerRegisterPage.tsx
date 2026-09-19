import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../lib/api';

interface FormData {
  // Step 1
  fullName: string; mobile: string; email: string; password: string;
  confirmPassword: string; dateOfBirth: string; gender: string; communicationPref: string;
  // Step 2 - Identity
  aadhaarToken: string; consentGiven: boolean;
  // Step 3 - Residence
  stateId: string; districtId: string; cityVillage: string; pinCode: string; addressText: string;
  // Step 4 - Work
  fieldOfWork: string;
  // Step 5 - Preferences
  travelWilling: boolean; employmentType: string; availabilityDate: string;
  // Step 8
  agreedToTerms: boolean;
}

const STEPS = [
  'Personal Info', 'Identity', 'Residence', 'Field of Work',
  'Education', 'Experience', 'Preferences', 'Review & Submit',
];

const FIELDS_OF_WORK = [
  { value: 'electrical_engineering', label: 'Electrical Engineering' },
  { value: 'mechanical_engineering', label: 'Mechanical Engineering' },
  { value: 'civil_engineering', label: 'Civil Engineering' },
  { value: 'other', label: 'Other' },
];

export default function WorkerRegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [states, setStates] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [appNumber, setAppNumber] = useState('');
  const [form, setForm] = useState<FormData>({
    fullName: '', mobile: '', email: '', password: '', confirmPassword: '',
    dateOfBirth: '', gender: '', communicationPref: 'email',
    aadhaarToken: '', consentGiven: false,
    stateId: '', districtId: '', cityVillage: '', pinCode: '', addressText: '',
    fieldOfWork: '',
    travelWilling: false, employmentType: 'full_time', availabilityDate: '',
    agreedToTerms: false,
  });

  useEffect(() => {
    api.get('/citizens/states').then((r) => setStates(r.data.data)).catch(() => null);
  }, []);

  const loadDistricts = (stateId: string) => {
    api.get(`/citizens/districts/${stateId}`).then((r) => setDistricts(r.data.data));
    setForm((f) => ({ ...f, stateId, districtId: '' }));
  };

  const f = (key: keyof FormData, val: any) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (!form.agreedToTerms || !form.consentGiven) {
      toast.error('Consent and terms are required');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/workers/register', {
        fullName: form.fullName,
        email: form.email,
        mobile: form.mobile,
        password: form.password,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        communicationPref: form.communicationPref,
        stateId: form.stateId,
        districtId: form.districtId,
        cityVillage: form.cityVillage || undefined,
        pinCode: form.pinCode || undefined,
        addressText: form.addressText || undefined,
        aadhaarToken: form.aadhaarToken
          ? form.aadhaarToken.slice(-4) // Only last 4 digits sent
          : undefined,
        consentGiven: form.consentGiven,
        fieldOfWork: form.fieldOfWork,
        travelWilling: form.travelWilling,
        employmentType: form.employmentType,
        availabilityDate: form.availabilityDate || undefined,
        agreedToTerms: form.agreedToTerms,
      });
      setAppNumber(res.data.data.applicationNumber);
      setStep(9); // Success
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  // Success screen
  if (step === 9) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card max-w-lg text-center">
          <div className="text-green-500 text-6xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Submitted</h2>
          <p className="text-gray-600 mb-4">Your worker registration has been submitted for review.</p>
          <div className="rounded-lg p-4 mb-6 border" style={{ backgroundColor: 'rgba(30,58,76,0.06)', borderColor: 'rgba(30,58,76,0.15)' }}>
            <p className="text-sm text-gray-500">Application Number</p>
            <p className="text-xl font-bold font-mono" style={{ color: 'var(--color-primary)' }}>{appNumber}</p>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            You will receive email/SMS notifications on the status of your application.
            Once approved, you can log in to the Worker Portal.
          </p>
          <div className="flex gap-3 justify-center">
            <Link to="/login" className="btn-primary">Worker Login</Link>
            <Link to="/" className="btn-outline">Go Home</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-gray-900">NEXORA AI</Link>
        <span className="text-sm text-gray-500">Worker Registration</span>
      </header>

      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-8 overflow-x-auto">
          {STEPS.map((label, i) => (
            <React.Fragment key={i}>
              <div
                className={`flex-shrink-0 flex items-center gap-1 ${step > i + 1 ? 'text-green-600' : step !== i + 1 ? 'text-gray-400' : ''}`}
                style={step === i + 1 ? { color: 'var(--color-primary)' } : {}}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${step > i + 1 ? 'bg-green-600 text-white' : step !== i + 1 ? 'bg-gray-200 text-gray-500' : ''}`}
                  style={step === i + 1 ? { backgroundColor: 'var(--color-primary)', color: 'white' } : {}}
                >
                  {step > i + 1 ? '✓' : i + 1}
                </div>
                <span className="hidden lg:block text-xs font-medium whitespace-nowrap">{label}</span>
              </div>
              {i < STEPS.length - 1 && <div className="flex-1 h-0.5 bg-gray-200 min-w-2" />}
            </React.Fragment>
          ))}
        </div>

        <div className="card">
          <h2 className="text-xl font-bold mb-4">Step {step}: {STEPS[step - 1]}</h2>

          {/* Step 1: Personal Info */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="form-label">Full Name <span className="text-red-500">*</span></label>
                  <input className="form-input" value={form.fullName} onChange={(e) => f('fullName', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Mobile Number <span className="text-red-500">*</span></label>
                  <input className="form-input" type="tel" value={form.mobile} onChange={(e) => f('mobile', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Email Address <span className="text-red-500">*</span></label>
                  <input className="form-input" type="email" value={form.email} onChange={(e) => f('email', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Password <span className="text-red-500">*</span></label>
                  <input className="form-input" type="password" value={form.password} onChange={(e) => f('password', e.target.value)}
                    placeholder="Min. 8 chars, uppercase, number, symbol" />
                </div>
                <div>
                  <label className="form-label">Confirm Password <span className="text-red-500">*</span></label>
                  <input className="form-input" type="password" value={form.confirmPassword} onChange={(e) => f('confirmPassword', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Date of Birth</label>
                  <input className="form-input" type="date" value={form.dateOfBirth} onChange={(e) => f('dateOfBirth', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Gender</label>
                  <select className="form-input" value={form.gender} onChange={(e) => f('gender', e.target.value)}>
                    <option value="">-- Select --</option>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                    <option>Prefer not to say</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Communication Preference</label>
                  <select className="form-input" value={form.communicationPref} onChange={(e) => f('communicationPref', e.target.value)}>
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Identity */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border text-sm" style={{ backgroundColor: 'rgba(30,58,76,0.05)', borderColor: 'rgba(30,58,76,0.15)', color: 'var(--color-primary)' }}>
                <strong>🔒 Privacy Notice:</strong> Only the last 4 digits of your Aadhaar number are stored.
                Your full Aadhaar number is never recorded, displayed, or transmitted.
              </div>
              <div>
                <label className="form-label">Aadhaar Last 4 Digits (optional)</label>
                <input
                  className="form-input font-mono"
                  maxLength={4}
                  pattern="[0-9]{4}"
                  placeholder="Last 4 digits only"
                  value={form.aadhaarToken}
                  onChange={(e) => f('aadhaarToken', e.target.value.replace(/\D/g, '').slice(-4))}
                />
                <p className="text-xs text-gray-500 mt-1">
                  We store only the last 4 digits as a token. Full Aadhaar numbers are never stored.
                </p>
              </div>
              <div className="flex items-start gap-3 p-4 border rounded-lg">
                <input type="checkbox" id="consent" checked={form.consentGiven}
                  onChange={(e) => f('consentGiven', e.target.checked)}
                  className="mt-1" style={{ accentColor: 'var(--color-primary)' } as React.CSSProperties} />
                <label htmlFor="consent" className="text-sm text-gray-700">
                  I consent to NEXORA AI collecting and processing my identity information
                  for employment verification purposes, in accordance with applicable Indian privacy laws.
                  I understand this data will be used only for assignment and verification.
                </label>
              </div>
            </div>
          )}

          {/* Step 3: Residence */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <label className="form-label">City/Town/Village</label>
                  <input className="form-input" value={form.cityVillage} onChange={(e) => f('cityVillage', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">PIN Code</label>
                  <input className="form-input font-mono" maxLength={6} value={form.pinCode} onChange={(e) => f('pinCode', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="form-label">Full Address</label>
                <textarea className="form-input" rows={2} value={form.addressText} onChange={(e) => f('addressText', e.target.value)} />
              </div>
              <p className="text-xs text-gray-500">
                ℹ Your residence state/district determines your assignment priority.
                Workers are first assigned to their home district, then nearby districts,
                then other districts in the same state if local capacity is full.
              </p>
            </div>
          )}

          {/* Step 4: Field of Work */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <label className="form-label">Primary Field of Work <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {FIELDS_OF_WORK.map((fw) => (
                    <label
                      key={fw.value}
                      className="flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-colors"
                      style={form.fieldOfWork === fw.value
                        ? { borderColor: 'var(--color-primary)', backgroundColor: 'rgba(30,58,76,0.05)' }
                        : { borderColor: '#e5e7eb' }}
                    >
                      <input type="radio" name="fieldOfWork" value={fw.value}
                        checked={form.fieldOfWork === fw.value}
                        onChange={() => f('fieldOfWork', fw.value)}
                        style={{ accentColor: 'var(--color-primary)' } as React.CSSProperties} />
                      <span className="font-medium text-sm">{fw.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Steps 5 & 6: Education/Experience — simplified for prototype */}
          {step === 5 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 italic">
                Education details are collected here. For the prototype, document uploads are available
                after registration via the worker profile portal.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Highest Qualification</label>
                  <select className="form-input">
                    <option>Secondary (10th)</option>
                    <option>Senior Secondary (12th)</option>
                    <option>ITI/Diploma</option>
                    <option>B.E./B.Tech</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Year of Completion</label>
                  <input className="form-input" type="number" min={1990} max={new Date().getFullYear()} />
                </div>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 italic">Work experience details.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Years of Experience</label>
                  <input className="form-input" type="number" min={0} max={50} />
                </div>
                <div>
                  <label className="form-label">Previous Employer</label>
                  <input className="form-input" placeholder="Company name" />
                </div>
              </div>
            </div>
          )}

          {/* Step 7: Preferences */}
          {step === 7 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Employment Type</label>
                  <select className="form-input" value={form.employmentType} onChange={(e) => f('employmentType', e.target.value)}>
                    <option value="full_time">Full Time</option>
                    <option value="part_time">Part Time</option>
                    <option value="contract">Contract</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Availability Date</label>
                  <input className="form-input" type="date" value={form.availabilityDate}
                    onChange={(e) => f('availabilityDate', e.target.value)} />
                </div>
              </div>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={form.travelWilling}
                  onChange={(e) => f('travelWilling', e.target.checked)}
                  className="w-4 h-4" style={{ accentColor: 'var(--color-primary)' } as React.CSSProperties} />
                <span className="text-sm text-gray-700">I am willing to travel to nearby districts/states if required</span>
              </label>
            </div>
          )}

          {/* Step 8: Review & Submit */}
          {step === 8 && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg text-sm space-y-2">
                <h3 className="font-semibold text-gray-800 mb-3">Review Your Application</h3>
                {[
                  ['Full Name', form.fullName], ['Email', form.email], ['Mobile', form.mobile],
                  ['Field of Work', form.fieldOfWork?.replace('_', ' ')],
                  ['State', states.find((s) => s.id === form.stateId)?.name],
                  ['District', districts.find((d) => d.id === form.districtId)?.name],
                  ['Travel Willing', form.travelWilling ? 'Yes' : 'No'],
                ].map(([label, value]) => value && (
                  <div key={label} className="flex justify-between">
                    <span className="text-gray-500">{label}:</span>
                    <span className="font-medium capitalize">{value}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-3 p-4 border rounded-lg">
                <input type="checkbox" id="terms" checked={form.agreedToTerms}
                  onChange={(e) => f('agreedToTerms', e.target.checked)}
                  className="mt-1" style={{ accentColor: 'var(--color-primary)' } as React.CSSProperties} />
                <label htmlFor="terms" className="text-sm text-gray-700">
                  I agree to the Terms & Conditions and Privacy Policy of NEXORA AI.
                  I confirm that all information provided is accurate and complete.
                  I understand that providing false information may result in rejection or termination.
                </label>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-6">
            <button
              className="btn-outline"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
            >
              ← Back
            </button>
            {step < 8 ? (
              <button
                className="btn-primary"
                onClick={() => {
                  // Basic validation per step
                  if (step === 1 && (!form.fullName || !form.email || !form.mobile || !form.password)) {
                    toast.error('Please fill in all required fields');
                    return;
                  }
                  if (step === 3 && (!form.stateId || !form.districtId)) {
                    toast.error('State and district are required');
                    return;
                  }
                  if (step === 4 && !form.fieldOfWork) {
                    toast.error('Please select a field of work');
                    return;
                  }
                  setStep((s) => s + 1);
                }}
              >
                Next →
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={handleSubmit}
                disabled={loading || !form.agreedToTerms}
              >
                {loading ? 'Submitting…' : 'Submit Application'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
