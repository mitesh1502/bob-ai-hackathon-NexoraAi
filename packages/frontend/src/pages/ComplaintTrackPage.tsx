import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  assigned: 'Assigned to Worker',
  worker_visit_scheduled: 'Worker Visit Scheduled',
  inspection_in_progress: 'Inspection in Progress',
  inspection_completed: 'Inspection Completed',
  awaiting_additional_information: 'Awaiting Additional Information',
  maintenance_recommended: 'Maintenance Recommended',
  resolved: 'Resolved',
  rejected: 'Rejected',
  closed: 'Closed',
};

const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-gray-100 text-gray-700',
  under_review: 'bg-yellow-100 text-yellow-800',
  assigned: 'bg-gray-100 text-gray-700',
  resolved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  closed: 'bg-gray-100 text-gray-800',
};

export default function ComplaintTrackPage() {
  const [number, setNumber] = useState('');
  const [complaint, setComplaint] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!number.trim()) return;
    setLoading(true);
    setError('');
    setComplaint(null);
    try {
      const res = await api.get(`/complaints/track/${number.trim()}`);
      setComplaint(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Complaint not found');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-gray-900">NEXORA AI</Link>
        <Link to="/complaint" className="btn-primary text-sm">Submit New Complaint</Link>
      </header>

      <div className="max-w-xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Track Your Complaint</h1>
        <p className="text-gray-600 text-sm mb-6">
          Enter your complaint number to check the current status.
        </p>

        <form onSubmit={handleTrack} className="card">
          <label className="form-label">Complaint Number</label>
          <div className="flex gap-3">
            <input
              type="text"
              className="form-input flex-1 font-mono uppercase"
              placeholder="NXC-XXXXXXX"
              value={number}
              onChange={(e) => setNumber(e.target.value.toUpperCase())}
              required
            />
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? '…' : 'Track'}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {complaint && (
          <div className="card mt-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Complaint Number</p>
                <p className="text-lg font-bold font-mono" style={{ color: 'var(--color-secondary)' }}>{complaint.complaint_number}</p>
              </div>
              <span className={`badge text-sm ${STATUS_COLORS[complaint.status] ?? 'bg-gray-100 text-gray-800'}`}>
                {STATUS_LABELS[complaint.status] ?? complaint.status}
              </span>
            </div>

            <div className="border-t pt-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-500">Category</p>
                  <p className="font-medium">{complaint.category}</p>
                </div>
                <div>
                  <p className="text-gray-500">Location</p>
                  <p className="font-medium">{complaint.district_name}, {complaint.state_name}</p>
                </div>
                <div>
                  <p className="text-gray-500">Submitted</p>
                  <p className="font-medium">{new Date(complaint.created_at).toLocaleDateString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-gray-500">Last Updated</p>
                  <p className="font-medium">{new Date(complaint.updated_at).toLocaleDateString('en-IN')}</p>
                </div>
              </div>
              <div>
                <p className="text-gray-500">Description</p>
                <p className="font-medium">{complaint.description}</p>
              </div>
            </div>

            {/* Status timeline */}
            <div className="border-t pt-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Status Journey</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <div
                    key={key}
                    className={`text-xs px-2 py-1 rounded-full border`}
                    style={complaint.status === key
                      ? { backgroundColor: 'var(--color-primary)', color: 'white', borderColor: 'var(--color-primary)', fontWeight: 700 }
                      : { backgroundColor: '#f9fafb', color: '#9ca3af', borderColor: '#e5e7eb' }}
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
