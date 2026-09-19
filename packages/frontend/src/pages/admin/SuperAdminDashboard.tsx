import React from 'react';
import { useQuery } from 'react-query';
import AdminLayout from '../../components/AdminLayout';
import api from '../../lib/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const RISK_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', moderate: '#eab308', low: '#22c55e',
};

function StatCard({ label, value, color = 'primary', icon }: { label: string; value: string | number; color?: string; icon?: string }) {
  // Map semantic color names to inline styles using the new brand palette
  const colorStyles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: 'rgba(30,58,76,0.08)', color: 'var(--color-primary)' },
    accent:  { backgroundColor: 'rgba(242,166,90,0.12)', color: 'var(--color-accent)' },
    teal:    { backgroundColor: 'rgba(79,182,196,0.12)', color: 'var(--color-secondary)' },
    // Semantic colours kept for data meaning
    red:     { backgroundColor: '#fef2f2', color: '#b91c1c' },
    green:   { backgroundColor: '#f0fdf4', color: '#15803d' },
    orange:  { backgroundColor: '#fff7ed', color: '#c2410c' },
    yellow:  { backgroundColor: '#fefce8', color: '#a16207' },
    // Legacy alias
    blue:    { backgroundColor: 'rgba(30,58,76,0.08)', color: 'var(--color-primary)' },
  };
  const iconStyle = colorStyles[color] ?? colorStyles.primary;
  return (
    <div className="card flex items-center gap-4">
      {icon && (
        <div
          className="text-3xl w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={iconStyle}
        >{icon}</div>
      )}
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export default function SuperAdminDashboard() {
  const { data, isLoading } = useQuery('super-admin-dashboard', () =>
    api.get('/dashboard/super-admin').then((r) => r.data.data)
  );

  if (isLoading) return <AdminLayout title="Super Admin Dashboard"><div className="animate-pulse text-gray-400 text-center py-20">Loading dashboard...</div></AdminLayout>;

  const d = data ?? {};

  // Build risk distribution chart data
  const riskData = ['critical', 'high', 'moderate', 'low'].map((level) => ({
    name: level.charAt(0).toUpperCase() + level.slice(1),
    count: parseInt(d.assetCounts?.find((a: any) => a.current_risk_level === level)?.count ?? '0', 10),
    color: RISK_COLORS[level],
  }));

  const totalAssets = riskData.reduce((sum, r) => sum + r.count, 0);
  const criticalCount = riskData.find((r) => r.name === 'Critical')?.count ?? 0;
  const openComplaintsTotal = d.openComplaints?.reduce((sum: number, c: any) => {
    if (!['resolved', 'rejected', 'closed'].includes(c.status)) return sum + parseInt(c.count, 10);
    return sum;
  }, 0) ?? 0;

  return (
    <AdminLayout title="Super Admin Dashboard">
      <div className="space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Assets" value={totalAssets} icon="🏭" color="blue" />
          <StatCard label="Critical Risk" value={criticalCount} icon="🔴" color="red" />
          <StatCard label="Open Complaints" value={openComplaintsTotal} icon="📋" color="orange" />
          <StatCard label="Pending Inspections" value={d.pendingInspections ?? 0} icon="🔍" color="yellow" />
        </div>

        {/* Weather alerts banner */}
        {d.weatherAlerts?.length > 0 && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="font-semibold text-red-800 mb-2">⚠ Active Weather Alerts</div>
            <div className="flex flex-wrap gap-2">
              {d.weatherAlerts.slice(0, 6).map((w: any, i: number) => (
                <span key={i} className="badge bg-red-100 text-red-800 text-xs">
                  {w.district}: {[
                    w.extreme_weather_alert && 'Extreme Weather',
                    w.flood_alert && 'Flood',
                    w.storm_alert && 'Storm',
                    w.heatwave_alert && 'Heatwave',
                  ].filter(Boolean).join(', ')}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Risk distribution chart */}
          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-4">Asset Risk Distribution</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={riskData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count">
                  {riskData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* State risk breakdown */}
          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-4">State Risk Summary</h3>
            <div className="overflow-auto max-h-52">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b">
                    <th className="pb-2">State</th>
                    <th className="pb-2 text-red-600">Critical</th>
                    <th className="pb-2 text-orange-600">High</th>
                    <th className="pb-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.stateRisk ?? []).map((s: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 font-medium">{s.state_name}</td>
                      <td className="py-2 text-red-600 font-bold">{s.critical}</td>
                      <td className="py-2 text-orange-600 font-bold">{s.high}</td>
                      <td className="py-2 text-gray-500">{s.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Critical assets */}
        <div className="card">
          <h3 className="font-semibold text-gray-700 mb-4">🔴 Critical Assets — Immediate Action Required</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="pb-2">Asset Code</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Risk Score</th>
                  <th className="pb-2">State</th>
                  <th className="pb-2">District</th>
                </tr>
              </thead>
              <tbody>
                {(d.criticalAssets ?? []).map((a: any, i: number) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 font-mono text-sm font-bold text-red-700">
                      <a href={`/admin/assets/${a.id}`} className="hover:underline">{a.asset_code}</a>
                    </td>
                    <td className="py-2 capitalize">{a.asset_type?.replace('_', ' ')}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div className="bg-red-500 h-2 rounded-full" style={{ width: `${a.current_risk_score}%` }} />
                        </div>
                        <span className="font-bold text-red-700">{Math.round(a.current_risk_score)}</span>
                      </div>
                    </td>
                    <td className="py-2">{a.state_name}</td>
                    <td className="py-2">{a.district_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(!d.criticalAssets || d.criticalAssets.length === 0) && (
              <p className="text-center text-gray-500 py-6 text-sm">No critical assets at this time.</p>
            )}
          </div>
        </div>

        {/* Pending AI predictions */}
        <div className="card">
          <h3 className="font-semibold text-gray-700 mb-4">🔮 Predictions Awaiting Review</h3>
          <div className="space-y-3">
            {(d.recentPredictions ?? []).map((p: any, i: number) => (
              <div key={i} className="p-3 border rounded-lg hover:bg-gray-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-bold">{p.asset_code}</span>
                      <span className={`badge badge-${p.current_risk_level}`}>{p.current_risk_level?.toUpperCase()}</span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2">{p.explanation}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-2xl font-bold text-gray-900">{Math.round(p.risk_score)}</div>
                    {p.score_delta != null && (
                      <div className={`text-xs font-medium ${p.score_delta > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {p.score_delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(p.score_delta))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {(!d.recentPredictions || d.recentPredictions.length === 0) && (
              <p className="text-sm text-gray-500 text-center py-4">No predictions awaiting review.</p>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
