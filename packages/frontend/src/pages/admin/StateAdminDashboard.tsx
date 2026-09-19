import React from 'react';
import { useQuery } from 'react-query';
import AdminLayout from '../../components/AdminLayout';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const RISK_BADGE: Record<string, string> = {
  critical: 'risk-critical',
  high: 'risk-high',
  moderate: 'risk-moderate',
  low: 'risk-low',
};

export default function StateAdminDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery('state-admin-dashboard', () =>
    api.get('/dashboard/state-admin').then((r) => r.data.data)
  );

  if (isLoading) {
    return (
      <AdminLayout title="State Dashboard">
        <div className="animate-pulse text-gray-400 text-center py-20">Loading dashboard...</div>
      </AdminLayout>
    );
  }

  const d = data ?? {};

  const totalAssets = (d.assetCounts ?? []).reduce((s: number, c: any) => s + parseInt(c.count, 10), 0);
  const criticalCount = parseInt(d.assetCounts?.find((c: any) => c.current_risk_level === 'critical')?.count ?? '0', 10);
  const openComplaints = (d.openComplaints ?? []).reduce((s: number, c: any) => {
    if (!['resolved','rejected','closed'].includes(c.status)) return s + parseInt(c.count, 10);
    return s;
  }, 0);

  return (
    <AdminLayout title={`State Admin Dashboard`}>
      <div className="space-y-6">
        {/* State label */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Viewing data for state:</span>
          <span className="badge" style={{ backgroundColor: 'rgba(79,182,196,0.15)', color: 'var(--color-secondary)', border: '1px solid rgba(79,182,196,0.30)' }}>{user?.stateId ? 'Assigned State' : 'All States'}</span>
          <span className="text-xs text-gray-400">(State-level isolation enforced)</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Assets', value: totalAssets, icon: '🏭' },
            { label: 'Critical Risk', value: criticalCount, icon: '🔴' },
            { label: 'Open Complaints', value: openComplaints, icon: '📋' },
            { label: 'Pending Reports', value: d.pendingReports ?? 0, icon: '📄' },
          ].map((stat) => (
            <div key={stat.label} className="card flex items-center gap-3">
              <div className="text-2xl">{stat.icon}</div>
              <div>
                <p className="text-xs text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Weather threats */}
        {d.weatherThreats?.length > 0 && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="font-semibold text-amber-800 mb-2">⚠ Weather Threats in Your State</p>
            <div className="flex flex-wrap gap-2">
              {d.weatherThreats.map((w: any, i: number) => (
                <span key={i} className="badge bg-amber-100 text-amber-800 text-xs">
                  {w.district_name}: {[
                    w.extreme_weather_alert && 'Extreme',
                    w.flood_alert && 'Flood',
                    w.storm_alert && 'Storm',
                  ].filter(Boolean).join(', ')}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* District risk breakdown */}
          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-4">District Risk Breakdown</h3>
            <div className="space-y-2">
              {(d.districtRisk ?? []).map((dist: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{dist.district_name}</span>
                  <div className="flex gap-3">
                    <span className="text-red-600 font-bold">{dist.critical} crit</span>
                    <span className="text-orange-600 font-bold">{dist.high} high</span>
                    <span className="text-gray-500">{dist.total} total</span>
                  </div>
                </div>
              ))}
              {(!d.districtRisk || d.districtRisk.length === 0) && (
                <p className="text-sm text-gray-400 text-center py-4">No data available</p>
              )}
            </div>
          </div>

          {/* Worker stats */}
          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-4">Worker Statistics</h3>
            <div className="space-y-2">
              {(d.workerStats ?? []).map((w: any, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="capitalize">{w.status?.replace('_', ' ')}</span>
                  <span className="font-bold">{w.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent predictions — with before/after and top factors */}
        <div className="card">
          <h3 className="font-semibold text-gray-700 mb-4">🔮 Recent Risk Predictions</h3>
          <p className="text-xs text-gray-500 mb-4 italic">
            These are AI-predicted estimates. Each requires administrator review before action is taken.
          </p>
          <div className="space-y-3">
            {(d.recentPredictions ?? []).map((p: any, i: number) => {
              const factors = typeof p.top_factors === 'string'
                ? JSON.parse(p.top_factors) : p.top_factors ?? [];
              const missingFlags = p.missing_data_flags ?? [];

              return (
                <div key={i} className="p-4 border rounded-xl hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="font-mono text-sm font-bold">{p.asset_code}</span>
                        <span className={`badge ${RISK_BADGE[p.current_risk_level] ?? 'bg-gray-100 text-gray-800'} text-xs`}>
                          {p.current_risk_level?.toUpperCase()}
                        </span>
                        <span className="badge bg-gray-100 text-gray-600 text-xs capitalize">
                          {p.maintenance_urgency?.replace('_', ' ')}
                        </span>
                        {missingFlags.length > 0 && (
                          <span className="badge bg-yellow-100 text-yellow-800 text-xs" title={missingFlags.join(', ')}>
                            ⚠ {missingFlags.length} missing data source{missingFlags.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mb-2">{p.explanation}</p>
                      {factors.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {factors.slice(0, 4).map((f: any, fi: number) => (
                            <span
                              key={fi}
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                f.contribution > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                              }`}
                            >
                              {f.contribution > 0 ? '▲' : '▼'} {f.factor}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-2xl font-bold text-gray-900">{Math.round(p.risk_score)}</div>
                      {p.score_delta != null && (
                        <div className={`text-sm font-medium ${p.score_delta > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {p.score_delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(p.score_delta))}
                        </div>
                      )}
                      {p.previous_score != null && (
                        <div className="text-xs text-gray-400">prev: {Math.round(p.previous_score)}</div>
                      )}
                      <div className="text-xs text-gray-400 mt-1">
                        conf: {Math.round((p.confidence_score ?? 0) * 100)}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {(!d.recentPredictions || d.recentPredictions.length === 0) && (
              <p className="text-sm text-gray-400 text-center py-6">No predictions available.</p>
            )}
          </div>
        </div>

        {/* Recent worker observations */}
        <div className="card">
          <h3 className="font-semibold text-gray-700 mb-4">👷 Recent Worker Observations</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="pb-2">Worker</th>
                  <th className="pb-2">Asset</th>
                  <th className="pb-2">Observation</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Severity</th>
                  <th className="pb-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {(d.recentObservations ?? []).map((o: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2">{o.worker_name}</td>
                    <td className="py-2 font-mono">{o.asset_code}</td>
                    <td className="py-2">{o.observation_code?.replace(/_/g, ' ')}</td>
                    <td className="py-2">
                      <span className={`badge ${o.obs_type === 'negative' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'} text-xs`}>
                        {o.obs_type}
                      </span>
                    </td>
                    <td className="py-2 capitalize">{o.severity ?? '—'}</td>
                    <td className="py-2 text-gray-400">{new Date(o.observed_at).toLocaleDateString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
