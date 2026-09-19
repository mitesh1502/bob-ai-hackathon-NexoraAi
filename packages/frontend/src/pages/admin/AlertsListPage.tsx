import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import AdminLayout from '../../components/AdminLayout';
import api from '../../lib/api';

const PRIORITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border border-red-300',
  high:     'bg-orange-100 text-orange-700 border border-orange-300',
  medium:   'bg-yellow-100 text-yellow-700 border border-yellow-300',
  low:      'bg-gray-100 text-gray-600 border border-gray-300',
};

const STATUS_BADGE: Record<string, string> = {
  new:                        'bg-blue-50 text-blue-700',
  reviewed_by_state_admin:    'bg-indigo-50 text-indigo-700',
  worker_assignment_pending:  'bg-yellow-50 text-yellow-700',
  assigned_to_worker:         'bg-teal-50 text-teal-700',
  accepted_by_worker:         'bg-teal-100 text-teal-800',
  travel_started:             'bg-cyan-50 text-cyan-700',
  worker_arrived:             'bg-cyan-100 text-cyan-800',
  inspection_in_progress:     'bg-blue-100 text-blue-800',
  report_draft:               'bg-gray-100 text-gray-600',
  report_submitted:           'bg-purple-50 text-purple-700',
  state_admin_review:         'bg-purple-100 text-purple-800',
  more_information_requested: 'bg-amber-50 text-amber-700',
  report_approved:            'bg-green-50 text-green-700',
  corrective_action_pending:  'bg-orange-50 text-orange-700',
  corrective_action_approved: 'bg-orange-100 text-orange-800',
  maintenance_in_progress:    'bg-blue-50 text-blue-700',
  maintenance_completed:      'bg-teal-50 text-teal-700',
  followup_inspection_pending:'bg-yellow-50 text-yellow-700',
  risk_recalculated:          'bg-indigo-50 text-indigo-700',
  state_admin_verified:       'bg-green-100 text-green-800',
  resolved:                   'bg-green-200 text-green-900',
  closed:                     'bg-gray-200 text-gray-700',
  escalated:                  'bg-red-100 text-red-700',
  emergency_response_required:'bg-red-600 text-white',
};

export default function AlertsListPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    status: '', priority: '', page: 1,
  });

  const { data, isLoading } = useQuery(
    ['alerts', filters],
    () => {
      const params = new URLSearchParams({ page: String(filters.page), pageSize: '20' });
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      return api.get(`/alerts?${params}`).then((r) => r.data);
    },
    { keepPreviousData: true }
  );

  const alerts: any[] = data?.data ?? [];
  const total: number = data?.total ?? 0;

  const sel = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';

  return (
    <AdminLayout title="Alerts">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Alert Management</h2>
            <p className="text-xs text-gray-500">{total} alert{total !== 1 ? 's' : ''} in your state</p>
          </div>
          <button onClick={() => navigate('/state/alerts/new')} className="btn-primary text-sm">
            + Create Alert
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select className={sel} value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}>
            <option value="">All Statuses</option>
            <option value="new">New</option>
            <option value="worker_assignment_pending">Pending Assignment</option>
            <option value="assigned_to_worker">Assigned</option>
            <option value="report_submitted">Report Submitted</option>
            <option value="state_admin_review">Needs Review</option>
            <option value="escalated">Escalated</option>
            <option value="closed">Closed</option>
          </select>
          <select className={sel} value={filters.priority} onChange={e => setFilters(f => ({ ...f, priority: e.target.value, page: 1 }))}>
            <option value="">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* Alert list */}
        {isLoading ? (
          <div className="animate-pulse text-gray-400 text-center py-12">Loading alerts…</div>
        ) : alerts.length === 0 ? (
          <div className="card text-center py-16 text-gray-400">
            <p className="text-2xl mb-2">📋</p>
            <p>No alerts found. <button onClick={() => navigate('/state/alerts/new')} className="text-blue-600 underline">Create one.</button></p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div key={alert.id}
                onClick={() => navigate(`/state/alerts/${alert.id}`)}
                className="card hover:shadow-md cursor-pointer transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-sm font-bold">{alert.alert_number}</span>
                      <span className={`badge text-xs ${PRIORITY_BADGE[alert.priority] ?? ''}`}>
                        {alert.priority?.toUpperCase()}
                      </span>
                      <span className={`badge text-xs ${STATUS_BADGE[alert.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {alert.status?.replace(/_/g, ' ')}
                      </span>
                      {alert.is_safety_concern && (
                        <span className="badge bg-red-100 text-red-700 text-xs">🚨 Safety</span>
                      )}
                    </div>
                    <p className="font-medium text-gray-800 truncate">{alert.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {[alert.village_name, alert.taluka_name, alert.district_name].filter(Boolean).join(' · ')}
                    </p>
                    {alert.assigned_worker_name && (
                      <p className="text-xs text-teal-600 mt-0.5">👷 {alert.assigned_worker_name}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {alert.current_risk_score != null && (
                      <div className="text-2xl font-bold text-gray-900">{Math.round(alert.current_risk_score)}</div>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(alert.created_at).toLocaleDateString('en-IN')}
                    </div>
                    {alert.recommended_response_deadline && (
                      <div className={`text-xs mt-1 font-medium ${new Date(alert.recommended_response_deadline) < new Date() ? 'text-red-600' : 'text-gray-500'}`}>
                        ⏰ {new Date(alert.recommended_response_deadline).toLocaleDateString('en-IN')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > 20 && (
          <div className="flex justify-center gap-3 pt-2">
            <button disabled={filters.page <= 1}
              onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
              className="btn-secondary text-sm disabled:opacity-40">← Prev</button>
            <span className="text-sm text-gray-500 self-center">
              Page {filters.page} of {Math.ceil(total / 20)}
            </span>
            <button disabled={filters.page >= Math.ceil(total / 20)}
              onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
              className="btn-secondary text-sm disabled:opacity-40">Next →</button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
