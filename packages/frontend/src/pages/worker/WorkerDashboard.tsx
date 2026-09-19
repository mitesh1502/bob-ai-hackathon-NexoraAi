import React from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function WorkerDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery('worker-dashboard', () =>
    api.get('/dashboard/worker').then((r) => r.data.data)
  );

  const d = data ?? {};

  return (
    <div className="min-h-screen bg-gray-50">
      <header
        className="px-6 py-4 flex items-center justify-between shadow-sm"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-sm"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-primary)' }}
          >NX</div>
          <span className="font-extrabold" style={{ color: 'var(--color-text-on-dark)' }}>NEXORA AI</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{user?.fullName}</span>
          <span
            className="badge text-xs capitalize"
            style={{
              backgroundColor: 'rgba(79,182,196,0.18)',
              color: 'var(--color-secondary)',
              border: '1px solid rgba(79,182,196,0.35)',
            }}
          >Worker</span>
          <a
            href="/api/auth/logout"
            className="text-sm text-red-400 hover:text-red-300 transition-colors"
            onClick={(e) => { e.preventDefault(); localStorage.clear(); window.location.href = '/login'; }}
          >
            Logout
          </a>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.fullName}</h1>
          <p className="text-gray-500 text-sm">Worker Portal — Field Inspections</p>
        </div>

        {isLoading && <div className="animate-pulse text-gray-400 text-center py-8">Loading...</div>}

        {/* My Alerts */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">My Alerts</h2>
            <Link
              to="/worker/alerts"
              className="text-sm font-medium transition-colors"
              style={{ color: 'var(--color-secondary)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-secondary)')}
            >View All</Link>
          </div>
          <p className="text-xs text-gray-400 text-center py-2">
            <Link to="/worker/alerts" className="text-blue-600 underline">Go to My Alerts →</Link>
          </p>
        </div>

        {/* Active Tasks */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">My Assigned Tasks</h2>
            <Link
              to="/worker/tasks"
              className="text-sm font-medium transition-colors"
              style={{ color: 'var(--color-secondary)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-secondary)')}
            >View All</Link>
          </div>
          {(d.tasks ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No tasks assigned currently.</p>
          ) : (
            <div className="space-y-3">
              {(d.tasks ?? []).slice(0, 5).map((task: any) => (
                <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold">{task.task_code}</span>
                      <span className={`badge text-xs ${task.current_risk_level === 'critical' ? 'risk-critical' : task.current_risk_level === 'high' ? 'risk-high' : 'risk-moderate'}`}>
                        {task.current_risk_level?.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">Asset: {task.asset_code} · Due: {task.due_date ?? 'ASAP'}</p>
                  </div>
                  <Link to={`/worker/tasks/${task.id}/report`} className="btn-primary text-sm">
                    Start Inspection
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent reports with risk score changes */}
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-4">My Recent Reports</h2>
          {(d.recentReports ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No reports submitted yet.</p>
          ) : (
            <div className="space-y-2">
              {(d.recentReports ?? []).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                  <div>
                    <span className="font-mono font-bold">{r.asset_code}</span>
                    <span className={`ml-2 badge text-xs ${r.status === 'approved' ? 'bg-green-100 text-green-700' : r.status === 'correction_requested' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                      {r.status}
                    </span>
                    {r.correction_reason && (
                      <p className="text-xs text-amber-700 mt-1">⚠ Correction needed: {r.correction_reason}</p>
                    )}
                  </div>
                  <div className="text-right">
                    {r.risk_score_after != null && (
                      <>
                        <div className="text-xs text-gray-500">Risk: {Math.round(r.risk_score_before)} → {Math.round(r.risk_score_after)}</div>
                        <div className={`text-xs font-bold ${r.score_delta > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {r.score_delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(r.score_delta))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
