// Admin pages — fully wired to real API
import React, { useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import AdminLayout from '../../components/AdminLayout';
import api from '../../lib/api';

// ── Assets Page ───────────────────────────────────────────────
export function AssetsPage() {
  const [filters, setFilters] = useState({ riskLevel: '', assetType: '', page: 1 });
  const { data, isLoading } = useQuery(
    ['assets', filters],
    () => api.get('/assets', { params: filters }).then((r) => r.data)
  );

  return (
    <AdminLayout title="Asset Registry">
      <div className="space-y-4">
        <div className="flex gap-3 flex-wrap">
          <select className="form-input w-40"
            value={filters.riskLevel}
            onChange={(e) => setFilters((f) => ({ ...f, riskLevel: e.target.value, page: 1 }))}>
            <option value="">All Risk Levels</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="moderate">Moderate</option>
            <option value="low">Low</option>
          </select>
          <select className="form-input w-48"
            value={filters.assetType}
            onChange={(e) => setFilters((f) => ({ ...f, assetType: e.target.value, page: 1 }))}>
            <option value="">All Types</option>
            <option value="transformer">Transformer</option>
            <option value="substation_equipment">Substation</option>
            <option value="feeder">Feeder</option>
          </select>
          <Link to="/admin/assets/new" className="btn-primary text-sm ml-auto">+ Add Asset</Link>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="pb-2">Asset Code</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Risk Score</th>
                <th className="pb-2">Risk Level</th>
                <th className="pb-2">State</th>
                <th className="pb-2">District</th>
                <th className="pb-2">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">Loading assets...</td></tr>
              )}
              {(data?.data ?? []).map((a: any) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2 font-mono font-bold text-sm">{a.asset_code}</td>
                  <td className="py-2 capitalize">{a.asset_type?.replace('_', ' ')}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${
                          a.current_risk_level === 'critical' ? 'bg-red-500' :
                          a.current_risk_level === 'high' ? 'bg-orange-500' :
                          a.current_risk_level === 'moderate' ? 'bg-yellow-500' : 'bg-green-500'
                        }`} style={{ width: `${a.current_risk_score}%` }} />
                      </div>
                      <span className="text-xs font-bold">{Math.round(a.current_risk_score)}</span>
                    </div>
                  </td>
                  <td className="py-2">
                    <span className={`badge text-xs ${
                      a.current_risk_level === 'critical' ? 'risk-critical' :
                      a.current_risk_level === 'high' ? 'risk-high' :
                      a.current_risk_level === 'moderate' ? 'risk-moderate' : 'risk-low'
                    }`}>
                      {a.current_risk_level?.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2">{a.state_name}</td>
                  <td className="py-2">{a.district_name}</td>
                  <td className="py-2 capitalize">{a.status}</td>
                  <td className="py-2">
                    <Link to={`/admin/assets/${a.id}`} className="hover:underline text-xs" style={{ color: 'var(--color-secondary)' }}>Details →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

// ── Asset Detail Page ─────────────────────────────────────────
export function AssetDetailPage() {
  const id = window.location.pathname.split('/').pop();
  const { data, isLoading } = useQuery(['asset', id], () =>
    api.get(`/assets/${id}`).then((r) => r.data.data)
  );
  const { data: riskData } = useQuery(['asset-risk', id], () =>
    api.get(`/risk/${id}/latest`).then((r) => r.data.data).catch(() => null)
  );
  const { data: sensorData } = useQuery(['asset-sensors', id], () =>
    api.get(`/sensors/asset/${id}`).then((r) => r.data.data ?? []).catch(() => [])
  );
  const { data: incidentData } = useQuery(['asset-incidents', id], () =>
    api.get(`/assets/${id}/incidents`).then((r) => r.data.data ?? []).catch(() => [])
  );
  const { data: weatherData } = useQuery(
    ['asset-weather', data?.district_id],
    () => data?.district_id
      ? api.get(`/weather/district/${data.district_id}`).then((r) => r.data.data ?? []).catch(() => [])
      : Promise.resolve([]),
    { enabled: !!data?.district_id }
  );
  const [computing, setComputing] = useState(false);

  const recomputeRisk = async () => {
    setComputing(true);
    try {
      await api.post(`/risk/${id}/compute`);
      toast.success('Risk score recomputed');
      window.location.reload();
    } catch {
      toast.error('Failed to recompute risk');
    } finally {
      setComputing(false);
    }
  };

  if (isLoading) return <AdminLayout title="Asset Details"><div className="animate-pulse text-center py-20 text-gray-400">Loading...</div></AdminLayout>;

  const a = data ?? {};
  const topFactors = typeof riskData?.top_factors === 'string'
    ? JSON.parse(riskData.top_factors)
    : riskData?.top_factors ?? [];
  const latestWeather = (weatherData as any[] ?? [])[0];

  const riskBorderColor = riskData?.risk_level === 'critical' ? '#ef4444'
    : riskData?.risk_level === 'high' ? '#f97316'
    : riskData?.risk_level === 'moderate' ? '#eab308' : '#22c55e';

  function sensorContributionLabel(s: any): { label: string; color: string } {
    if (s.sensor_failed) return { label: '⚠ +Critical flag (sensor failure = elevated risk)', color: 'text-red-700' };
    if (s.is_outlier) return { label: '+High contribution (reading outside normal range)', color: 'text-orange-700' };
    if (s.is_missing) return { label: '+Moderate contribution (missing data raises risk)', color: 'text-yellow-700' };
    return { label: '✓ Within normal range (−3 from risk)', color: 'text-green-700' };
  }

  function weatherContributionLabel(w: any): string {
    if (w?.extreme_weather_alert) return '+30 to risk score';
    if (w?.flood_alert) return '+25 to risk score';
    if (w?.storm_alert) return '+20 to risk score';
    if (w?.lightning_risk) return '+20 to risk score';
    if (w?.heatwave_alert) return '+15 to risk score';
    return 'No active alerts';
  }

  function incidentContribution(inc: any, idx: number): string {
    const base = inc.is_recurring ? 12 : 6;
    const recencyDays = Math.floor((Date.now() - new Date(inc.occurred_at).getTime()) / 86400000);
    const recencyBonus = recencyDays < 90 ? 8 : recencyDays < 180 ? 4 : 0;
    return `+${base + recencyBonus - idx * 2 > 0 ? base + recencyBonus - idx * 2 : 1} to risk`;
  }

  return (
    <AdminLayout title={`Asset: ${a.asset_code}`}>
      <div className="space-y-6 max-w-5xl">
        <div className="flex gap-3">
          <Link to="/admin/assets" className="btn-outline text-sm">← Assets</Link>
          <button onClick={recomputeRisk} disabled={computing} className="btn-primary text-sm ml-auto">
            {computing ? 'Computing…' : '🔮 Recompute Risk'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Asset info */}
          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-4">Asset Information</h3>
            <div className="space-y-2 text-sm">
              {[
                ['Code', a.asset_code], ['Type', a.asset_type?.replace(/_/g, ' ')],
                ['Manufacturer', a.manufacturer], ['Model', a.model],
                ['State', a.state_name], ['District', a.district_name],
                ['Taluka', a.taluka_name], ['Village', a.village_name],
                ['Installed', a.install_date], ['Status', a.status],
                ['Connected Customers', a.connected_customers?.toLocaleString()],
                ['Rated Capacity', a.rated_capacity_kva && `${a.rated_capacity_kva} kVA`],
                ['Current Load', a.current_load_kw && `${a.current_load_kw} kW`],
              ].filter(([, v]) => v).map(([label, value]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-medium capitalize">{value as string}</span>
                </div>
              ))}
            </div>
            {/* Grid Impact */}
            {a.grid_impact_severity != null && (
              <div className="mt-4 pt-3 border-t">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500 font-medium">Grid Impact Severity</span>
                  <span className="font-bold text-orange-700">{Math.round(a.grid_impact_severity)}/100</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="h-2 rounded-full bg-orange-500"
                    style={{ width: `${Math.min(100, a.grid_impact_severity)}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {a.connected_customers?.toLocaleString()} connected customers
                  {a.critical_facilities ? ` · ${a.critical_facilities}` : ''}
                </p>
              </div>
            )}
          </div>

          {/* Risk prediction — "Why" block */}
          {riskData && (
            <div className="card" style={{ borderLeft: `4px solid ${riskBorderColor}` }}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-lg">🔍</span>
                <h3 className="font-semibold text-gray-700">
                  Why Risk Score = {Math.round(riskData.risk_score)}/100
                </h3>
              </div>
              <p className="text-xs text-gray-400 italic mb-3">
                AI-predicted estimate — requires administrator review before action.
              </p>
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-20 h-20 rounded-full flex flex-col items-center justify-center border-4 ${
                  riskData.risk_level === 'critical' ? 'border-red-500 bg-red-50' :
                  riskData.risk_level === 'high' ? 'border-orange-500 bg-orange-50' :
                  riskData.risk_level === 'moderate' ? 'border-yellow-500 bg-yellow-50' :
                  'border-green-500 bg-green-50'
                }`}>
                  <span className="text-2xl font-bold text-gray-900">{Math.round(riskData.risk_score)}</span>
                  <span className="text-xs capitalize font-medium">{riskData.risk_level}</span>
                </div>
                <p className="text-sm text-gray-700 flex-1">{riskData.explanation}</p>
              </div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Top Contributing Factors:</p>
              <div className="space-y-1 text-xs">
                {topFactors.slice(0, 6).map((f: any, i: number) => (
                  <div key={i} className="flex justify-between">
                    <span className={f.contribution > 0 ? 'text-red-700' : 'text-green-700'}>
                      {f.contribution > 0 ? '▲' : '▼'} {f.factor}
                    </span>
                    <span className="font-mono">{f.contribution > 0 ? '+' : ''}{f.contribution.toFixed(1)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-2 border-t text-xs text-gray-400">
                Review status: <span className="font-medium capitalize">{riskData.human_review_status}</span>
                {' · '}Computed: {new Date(riskData.created_at).toLocaleString('en-IN')}
              </div>
            </div>
          )}
        </div>

        {/* Sensor Readings */}
        <div className="card">
          <h3 className="font-semibold text-gray-700 mb-3">📡 Sensor Readings — Risk Contribution</h3>
          {(sensorData as any[] ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 italic">No sensor readings available for this asset.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2">Sensor Type</th>
                    <th className="pb-2">Value</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Contribution</th>
                    <th className="pb-2">Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {(sensorData as any[]).slice(0, 10).map((s: any, i: number) => {
                    const contrib = sensorContributionLabel(s);
                    return (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1.5 capitalize font-medium">{s.sensor_type?.replace(/_/g, ' ')}</td>
                        <td className="py-1.5 font-mono">{s.value} {s.unit}</td>
                        <td className="py-1.5">
                          <span className={`badge text-xs ${
                            s.sensor_failed ? 'bg-red-100 text-red-700' :
                            s.is_outlier ? 'bg-orange-100 text-orange-700' :
                            s.is_missing ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {s.sensor_failed ? 'FAILED' : s.is_outlier ? 'OUTLIER' : s.is_missing ? 'MISSING' : 'NORMAL'}
                          </span>
                        </td>
                        <td className={`py-1.5 ${contrib.color}`}>{contrib.label}</td>
                        <td className="py-1.5 text-gray-400">{new Date(s.recorded_at).toLocaleString('en-IN')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(sensorData as any[]).length > 0 && (
                <p className="text-xs text-gray-400 mt-2">
                  Last updated: {new Date((sensorData as any[])[0]?.recorded_at).toLocaleString('en-IN')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Weather Forecast */}
        <div className="card">
          <h3 className="font-semibold text-gray-700 mb-3">🌦 Weather Forecast — Risk Contribution</h3>
          {!latestWeather ? (
            <p className="text-sm text-gray-400 italic">No weather data available for this district.</p>
          ) : (
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  ['🌡 Temperature', `${latestWeather.temperature_c}°C`],
                  ['🌧 Rainfall', `${latestWeather.rainfall_mm} mm`],
                  ['💨 Wind', `${latestWeather.wind_speed_kmh} km/h`],
                  ['💧 Humidity', `${latestWeather.humidity_pct}%`],
                ].map(([label, val]) => (
                  <div key={label as string} className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="font-bold text-sm">{val}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {[
                  { flag: latestWeather.extreme_weather_alert, label: 'Extreme Weather Alert', contrib: '+30 to risk score', color: 'bg-red-100 text-red-700' },
                  { flag: latestWeather.flood_alert, label: 'Flood Alert', contrib: '+25 to risk score', color: 'bg-blue-100 text-blue-700' },
                  { flag: latestWeather.storm_alert, label: 'Storm Alert', contrib: '+20 to risk score', color: 'bg-purple-100 text-purple-700' },
                  { flag: latestWeather.lightning_risk, label: 'Lightning Risk', contrib: '+20 to risk score', color: 'bg-yellow-100 text-yellow-700' },
                  { flag: latestWeather.heatwave_alert, label: 'Heatwave Alert', contrib: '+15 to risk score', color: 'bg-orange-100 text-orange-700' },
                ].filter(w => w.flag).map((w, i) => (
                  <div key={i} className={`flex justify-between items-center px-3 py-2 rounded-lg ${w.color}`}>
                    <span className="font-medium text-sm">⚠ {w.label}</span>
                    <span className="text-xs font-bold">{w.contrib}</span>
                  </div>
                ))}
                {![latestWeather.extreme_weather_alert, latestWeather.flood_alert, latestWeather.storm_alert,
                   latestWeather.lightning_risk, latestWeather.heatwave_alert].some(Boolean) && (
                  <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">✓ No active weather alerts — no weather risk contribution</p>
                )}
              </div>
              {latestWeather.alert_description && (
                <p className="text-xs text-gray-500 mt-2 italic">{latestWeather.alert_description}</p>
              )}
              <p className="text-xs text-gray-400 mt-2">Data source: {latestWeather.source ?? 'weather_records'}</p>
            </div>
          )}
        </div>

        {/* Historical Incidents */}
        <div className="card">
          <h3 className="font-semibold text-gray-700 mb-3">📋 Historical Incidents — Risk Contribution</h3>
          {(incidentData as any[] ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 italic">No historical incidents recorded for this asset.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2">Outage (h)</th>
                    <th className="pb-2">Affected</th>
                    <th className="pb-2">Cause</th>
                    <th className="pb-2">Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {(incidentData as any[]).map((inc: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5">{new Date(inc.occurred_at).toLocaleDateString('en-IN')}</td>
                      <td className="py-1.5 capitalize">{inc.incident_type?.replace(/_/g, ' ')}</td>
                      <td className="py-1.5">{inc.outage_duration_h ?? '—'}</td>
                      <td className="py-1.5">{inc.affected_connections?.toLocaleString() ?? '—'}</td>
                      <td className="py-1.5 max-w-[160px] truncate">{inc.failure_cause ?? '—'}</td>
                      <td className="py-1.5 text-red-700 font-bold">{incidentContribution(inc, i)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

// ── Complaints Page ────────────────────────────────────────────
export function ComplaintsAdminPage() {
  const [filters, setFilters] = useState({ status: '', page: 1 });
  const { data, isLoading } = useQuery(['complaints', filters], () =>
    api.get('/complaints', { params: filters }).then((r) => r.data)
  );

  return (
    <AdminLayout title="Complaints Management">
      <div className="space-y-4">
        <select className="form-input w-48"
          value={filters.status}
          onChange={(e) => setFilters({ status: e.target.value, page: 1 })}>
          <option value="">All Statuses</option>
          {['submitted','under_review','assigned','resolved','rejected'].map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="pb-2">Number</th>
                <th className="pb-2">Category</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">State</th>
                <th className="pb-2">District</th>
                <th className="pb-2">Safety</th>
                <th className="pb-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading...</td></tr>}
              {(data?.data ?? []).map((c: any) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2 font-mono text-xs font-bold" style={{ color: 'var(--color-primary)' }}>{c.complaint_number}</td>
                  <td className="py-2">{c.category}</td>
                  <td className="py-2">
                    <span className="badge bg-gray-100 text-gray-700 text-xs">{c.status}</span>
                  </td>
                  <td className="py-2">{c.state_name}</td>
                  <td className="py-2">{c.district_name}</td>
                  <td className="py-2">{c.is_safety_concern ? '⚠ Yes' : '—'}</td>
                  <td className="py-2 text-gray-400 text-xs">{new Date(c.created_at).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

// ── Workers Page ───────────────────────────────────────────────
export function WorkersAdminPage() {
  const [filters, setFilters] = useState({ status: '', page: 1 });
  const [viewWorker, setViewWorker] = useState<any>(null);
  const [reassignWorker, setReassignWorker] = useState<any>(null);
  const [reassignDistrictId, setReassignDistrictId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(['workers', filters], () =>
    api.get('/workers', { params: filters }).then((r) => r.data)
  );

  const { data: statesData } = useQuery('states-list', () =>
    api.get('/citizens/states').then((r) => r.data.data ?? []).catch(() => [])
  );
  const { data: districtsData } = useQuery(
    ['districts-reassign', reassignWorker?.state_id],
    () => reassignWorker?.state_id
      ? api.get(`/citizens/districts/${reassignWorker.state_id}`).then((r) => r.data.data ?? []).catch(() => [])
      : Promise.resolve([]),
    { enabled: !!reassignWorker?.state_id }
  );

  const updateStatus = async (workerId: string, status: string, reason?: string) => {
    await api.patch(`/workers/${workerId}/status`, { status, reason: reason ?? `Status changed to ${status}` });
    queryClient.invalidateQueries(['workers']);
    toast.success(`Worker status updated to ${status}`);
  };

  const doReassign = async () => {
    if (!reassignWorker || !reassignDistrictId || !reassignReason.trim()) {
      toast.error('District and reason are required for reassignment');
      return;
    }
    await api.patch(`/workers/${reassignWorker.id}/status`, {
      status: 'employed',
      districtId: reassignDistrictId,
      reassignReason: reassignReason,
      reason: reassignReason,
    });
    queryClient.invalidateQueries(['workers']);
    toast.success('Worker reassigned');
    setReassignWorker(null);
    setReassignDistrictId('');
    setReassignReason('');
  };

  return (
    <AdminLayout title="Workers Management">
      <div className="space-y-4">
        <select className="form-input w-48"
          value={filters.status}
          onChange={(e) => setFilters({ status: e.target.value, page: 1 })}>
          <option value="">All Statuses</option>
          {['pending_review','approved','employed','rejected','suspended','inactive'].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="pb-2">Name</th>
                <th className="pb-2">App No.</th>
                <th className="pb-2">Field</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">State</th>
                <th className="pb-2">District</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading...</td></tr>}
              {(data?.data ?? []).map((w: any) => (
                <tr key={w.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{w.full_name}</td>
                  <td className="py-2 font-mono text-xs">{w.application_number}</td>
                  <td className="py-2 text-xs capitalize">{w.field_of_work?.replace(/_/g, ' ')}</td>
                  <td className="py-2">
                    <span className={`badge text-xs ${
                      w.status === 'employed' ? 'bg-green-100 text-green-700' :
                      w.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      w.status === 'suspended' ? 'bg-orange-100 text-orange-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {w.status?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-2">{w.state_name}</td>
                  <td className="py-2">{w.district_name}</td>
                  <td className="py-2">
                    <div className="flex gap-1.5 flex-wrap">
                      {/* View — always shown */}
                      <button
                        onClick={() => setViewWorker(w)}
                        className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded hover:bg-blue-100"
                      >View</button>
                      {/* Approve/Reject — pending only */}
                      {w.status === 'pending_review' && (
                        <>
                          <button
                            onClick={() => updateStatus(w.id, 'approved')}
                            className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200"
                          >Approve</button>
                          <button
                            onClick={() => { const r = window.prompt('Rejection reason:'); if (r) updateStatus(w.id, 'rejected', r); }}
                            className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200"
                          >Reject</button>
                        </>
                      )}
                      {/* Reassign — employed workers only */}
                      {w.status === 'employed' && (
                        <button
                          onClick={() => { setReassignWorker(w); setReassignDistrictId(''); setReassignReason(''); }}
                          className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded hover:bg-purple-100"
                        >Reassign</button>
                      )}
                      {/* Suspend — employed workers */}
                      {w.status === 'employed' && (
                        <button
                          onClick={() => { const r = window.prompt('Suspension reason (required):'); if (r) updateStatus(w.id, 'suspended', r); }}
                          className="text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded hover:bg-orange-100"
                        >Suspend</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Worker detail modal */}
        {viewWorker && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setViewWorker(null)}>
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-bold text-gray-800 text-lg">Worker Profile</h3>
                <button onClick={() => setViewWorker(null)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-gray-500">Full Name</dt><dd className="font-medium">{viewWorker.full_name}</dd>
                <dt className="text-gray-500">Application No.</dt><dd className="font-mono text-xs">{viewWorker.application_number}</dd>
                <dt className="text-gray-500">Email</dt><dd>{viewWorker.email}</dd>
                <dt className="text-gray-500">Mobile</dt><dd>{viewWorker.mobile}</dd>
                <dt className="text-gray-500">Field of Work</dt><dd className="capitalize">{viewWorker.field_of_work?.replace(/_/g, ' ')}</dd>
                <dt className="text-gray-500">State</dt><dd>{viewWorker.state_name}</dd>
                <dt className="text-gray-500">District</dt><dd>{viewWorker.district_name}</dd>
                <dt className="text-gray-500">Status</dt>
                <dd><span className="badge text-xs bg-blue-50 text-blue-700">{viewWorker.status?.replace(/_/g, ' ')}</span></dd>
              </dl>
            </div>
          </div>
        )}

        {/* Reassign modal */}
        {reassignWorker && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <h3 className="font-bold text-gray-800 text-lg mb-4">Reassign Worker</h3>
              <p className="text-sm text-gray-600 mb-4">
                Reassigning <strong>{reassignWorker.full_name}</strong> — currently in <strong>{reassignWorker.district_name}</strong>, {reassignWorker.state_name}.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="form-label text-xs">New District</label>
                  <select className="form-input text-sm" value={reassignDistrictId}
                    onChange={(e) => setReassignDistrictId(e.target.value)}>
                    <option value="">Select district…</option>
                    {(districtsData ?? []).map((d: any) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label text-xs">Reason for Reassignment (required)</label>
                  <textarea className="form-input text-sm" rows={3}
                    placeholder="e.g. Local capacity full, skills match, worker request…"
                    value={reassignReason}
                    onChange={(e) => setReassignReason(e.target.value)} />
                </div>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setReassignWorker(null)} className="btn-outline text-sm">Cancel</button>
                  <button onClick={doReassign} className="btn-primary text-sm" disabled={!reassignDistrictId || !reassignReason.trim()}>
                    Confirm Reassignment
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

// ── Maintenance Page ──────────────────────────────────────────
export function MaintenancePage() {
  const [filters, setFilters] = useState({ riskLevel: '', status: '', stateFilter: '' });
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, refetch } = useQuery(
    ['maintenance-queue', filters],
    () => api.get('/maintenance/priority-queue').then((r) => r.data.data)
  );
  const { data: statesData } = useQuery('states-list', () =>
    api.get('/citizens/states').then((r) => r.data.data ?? []).catch(() => [])
  );

  const refreshQueue = async () => {
    setRefreshing(true);
    try {
      await api.post('/risk/compute-all');
      await refetch();
      toast.success('Risk queue refreshed');
    } catch {
      toast.error('Failed to refresh queue');
    } finally {
      setRefreshing(false);
    }
  };

  const approveItem = async (planId: string) => {
    try {
      await api.patch(`/maintenance/plans/${planId}/action`, { action: 'approve', reason: 'Approved via dashboard' });
      toast.success('Plan approved');
      refetch();
    } catch { toast.error('Action failed'); }
  };

  const rejectItem = async (planId: string) => {
    const reason = window.prompt('Rejection reason (required):');
    if (!reason) return;
    try {
      await api.patch(`/maintenance/plans/${planId}/action`, { action: 'reject', reason });
      toast.info('Plan rejected');
      refetch();
    } catch { toast.error('Action failed'); }
  };

  const filtered = (data ?? []).filter((item: any) => {
    if (filters.riskLevel && item.riskLevel !== filters.riskLevel) return false;
    if (filters.status && item.approvalStatus !== filters.status) return false;
    if (filters.stateFilter && item.stateName !== filters.stateFilter) return false;
    return true;
  });

  const stateNames = [...new Set((statesData ?? []).map((s: any) => s.name))].sort() as string[];

  return (
    <AdminLayout title="Maintenance Priority Queue">
      <div className="space-y-4">
        <p className="text-sm text-gray-500 italic">
          AI-generated priority queue. Ranking: risk × 0.4 + grid impact × 0.3 + failure prob × 0.2 + urgency × 0.1.
          All plans require administrator approval before crew assignment.
        </p>

        {/* Filters + Refresh */}
        <div className="flex gap-3 flex-wrap items-center">
          <select className="form-input w-40 text-sm" value={filters.riskLevel}
            onChange={e => setFilters(f => ({ ...f, riskLevel: e.target.value }))}>
            <option value="">All Risk Levels</option>
            {['critical','high','moderate','low'].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select className="form-input w-40 text-sm" value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">All Statuses</option>
            {['pending_approval','approved','rejected','in_progress','completed'].map(s =>
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            )}
          </select>
          <select className="form-input w-48 text-sm" value={filters.stateFilter}
            onChange={e => setFilters(f => ({ ...f, stateFilter: e.target.value }))}>
            <option value="">All States</option>
            {stateNames.map((s: string) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={refreshQueue} disabled={refreshing}
            className="btn-primary text-sm ml-auto flex items-center gap-2">
            {refreshing ? '⏳ Refreshing…' : '🔄 Refresh Queue'}
          </button>
        </div>

        {/* Table */}
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 pr-3">Rank</th>
                <th className="pb-2 pr-3">Asset</th>
                <th className="pb-2 pr-3">Location</th>
                <th className="pb-2 pr-3">Risk Score</th>
                <th className="pb-2 pr-3">Grid Impact</th>
                <th className="pb-2 pr-3">Priority Score</th>
                <th className="pb-2 pr-3">Top Factors</th>
                <th className="pb-2 pr-3">Recommended Action</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={10} className="text-center py-8 text-gray-400">Generating priority queue…</td></tr>}
              {filtered.map((item: any, i: number) => {
                const urgencyScore = ({'immediate':4,'urgent':3,'scheduled':2,'routine':1} as Record<string,number>)[item.maintenanceUrgency] ?? 1;
                const priorityScore = Math.round(
                  (item.riskScore ?? 0) * 0.4 +
                  (item.gridImpactSeverity ?? 0) * 0.3 +
                  (item.failureProbability ?? 0) * 100 * 0.2 +
                  urgencyScore * 10 * 0.1
                );
                return (
                  <tr key={i} className={`border-b last:border-0 hover:bg-gray-50 ${item.riskLevel === 'critical' ? 'bg-red-50/30' : ''}`}>
                    <td className="py-2 pr-3 font-bold text-gray-400 text-base">#{item.rank}</td>
                    <td className="py-2 pr-3">
                      <div className="font-mono font-bold text-xs">{item.assetCode}</div>
                      <span className={`badge text-xs mt-0.5 inline-block ${
                        item.riskLevel === 'critical' ? 'risk-critical' :
                        item.riskLevel === 'high' ? 'risk-high' : 'risk-moderate'
                      }`}>{item.riskLevel?.toUpperCase()}</span>
                    </td>
                    <td className="py-2 pr-3 text-gray-500">
                      <div>{item.stateName}</div>
                      <div className="text-gray-400">{item.districtName}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1">
                        <div className="w-12 bg-gray-200 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${
                            item.riskLevel === 'critical' ? 'bg-red-500' :
                            item.riskLevel === 'high' ? 'bg-orange-500' : 'bg-yellow-500'
                          }`} style={{ width: `${item.riskScore ?? 0}%` }} />
                        </div>
                        <span className="font-bold">{Math.round(item.riskScore ?? 0)}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1">
                        <div className="w-12 bg-gray-200 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-orange-400"
                            style={{ width: `${item.gridImpactSeverity ?? 0}%` }} />
                        </div>
                        <span className="font-bold text-orange-700">{Math.round(item.gridImpactSeverity ?? 0)}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 font-bold text-blue-700">{priorityScore}</td>
                    <td className="py-2 pr-3 max-w-[120px]">
                      <div className="flex flex-wrap gap-0.5">
                        {(item.mainContributingFactors ?? []).slice(0,3).map((f: string, fi: number) => (
                          <span key={fi} className="text-xs bg-red-50 text-red-600 px-1 py-0 rounded">{f}</span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 pr-3 max-w-[140px] text-gray-700">{item.recommendedAction}</td>
                    <td className="py-2 pr-3">
                      <span className={`badge text-xs ${
                        item.approvalStatus === 'approved' ? 'bg-green-100 text-green-700' :
                        item.approvalStatus === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>{item.approvalStatus?.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="py-2">
                      {item.approvalStatus !== 'approved' && item.approvalStatus !== 'rejected' && item.planId && (
                        <div className="flex gap-1">
                          <button onClick={() => approveItem(item.planId)}
                            className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200">✓</button>
                          <button onClick={() => rejectItem(item.planId)}
                            className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200">✗</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={10} className="text-center py-8 text-gray-400">
                  No items match filters. Try clearing filters or refresh the queue.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

// ── Risk Predictions Page ─────────────────────────────────────
export function RiskPredictionsPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ riskLevel: '', page: 1, pageSize: 20 });
  const [overrideTarget, setOverrideTarget] = useState<any>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideScore, setOverrideScore] = useState('');

  const { data, isLoading } = useQuery(
    ['risk-predictions-list', filters],
    () => api.get('/risk/predictions', { params: filters }).then((r) => r.data),
    { keepPreviousData: true }
  );

  const doReview = async (predictionId: string, action: 'approve' | 'reject' | 'override', reason: string, score?: number) => {
    await api.patch(`/risk/${predictionId}/review`, {
      action, overrideReason: reason, ...(score !== undefined ? { overrideScore: score } : {}),
    });
    queryClient.invalidateQueries(['risk-predictions-list']);
    toast.success(`Prediction ${action}d`);
    setOverrideTarget(null);
  };

  const predictions: any[] = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <AdminLayout title="Risk Predictions & AI Governance">
      <div className="space-y-4">
        <p className="text-sm text-gray-500 italic">
          Every prediction is versioned, timestamped, and shows before/after score and top contributing factors.
          Admins can approve, reject, or override (with mandatory reason). Output is never a guaranteed fact — always requires review.
        </p>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap items-center">
          <select className="form-input w-44 text-sm" value={filters.riskLevel}
            onChange={(e) => setFilters((f) => ({ ...f, riskLevel: e.target.value, page: 1 }))}>
            <option value="">All Risk Levels</option>
            {['critical','high','moderate','low'].map((l) => (
              <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
            ))}
          </select>
          {pagination && (
            <span className="text-sm text-gray-500 ml-auto">
              {pagination.total} prediction{pagination.total !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Prediction cards */}
        <div className="space-y-3">
          {isLoading && <p className="text-center text-gray-400 py-8">Loading predictions…</p>}
          {!isLoading && predictions.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-8">No predictions found. Run "Refresh Risk Queue" from the Maintenance page to generate predictions.</p>
          )}
          {predictions.map((p: any) => (
            <div key={p.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Header row */}
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`badge text-xs ${
                      p.risk_level === 'critical' ? 'risk-critical' :
                      p.risk_level === 'high' ? 'risk-high' :
                      p.risk_level === 'moderate' ? 'risk-moderate' : 'risk-low'
                    }`}>{p.risk_level?.toUpperCase()}</span>
                    <span className={`badge text-xs ${
                      p.human_review_status === 'approved' ? 'bg-green-100 text-green-700' :
                      p.human_review_status === 'rejected' ? 'bg-red-100 text-red-700' :
                      p.human_review_status === 'overridden' ? 'bg-purple-100 text-purple-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{p.human_review_status}</span>
                    <span className="text-xs text-gray-400">v{p.model_version ?? '1.0.0'}</span>
                    <span className="text-xs font-semibold text-gray-700">{p.asset_code}</span>
                    <span className="text-xs text-gray-500 capitalize">{p.asset_type?.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-gray-400">· {p.state_name}, {p.district_name}</span>
                  </div>

                  {/* Explanation */}
                  <p className="text-sm text-gray-700 mb-2 leading-relaxed">{p.explanation}</p>

                  {/* Confidence + failure prob */}
                  <div className="flex gap-4 text-xs text-gray-500 mb-2">
                    <span>Confidence: <strong>{p.confidence_score != null ? `${Math.round(p.confidence_score * 100)}%` : '—'}</strong></span>
                    <span>Failure prob: <strong>{p.failure_probability != null ? `${Math.round(p.failure_probability * 100)}%` : '—'}</strong></span>
                    <span>Urgency: <strong>{p.maintenance_urgency ?? '—'}</strong></span>
                  </div>

                  <p className="text-xs text-gray-400">{new Date(p.created_at).toLocaleString('en-IN')}</p>
                </div>

                {/* Score + delta + actions */}
                <div className="flex flex-col items-center gap-2 flex-shrink-0">
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${
                      p.risk_level === 'critical' ? 'text-red-600' :
                      p.risk_level === 'high' ? 'text-orange-500' :
                      p.risk_level === 'moderate' ? 'text-yellow-600' : 'text-green-600'
                    }`}>{Math.round(p.risk_score)}</div>
                    {p.score_delta != null && Math.abs(p.score_delta) >= 0.5 && (
                      <div className={`text-xs font-bold ${p.score_delta > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {p.score_delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(p.score_delta))}
                      </div>
                    )}
                  </div>
                  {p.human_review_status === 'pending' && (
                    <div className="flex flex-col gap-1.5 w-full">
                      <button
                        onClick={() => { const r = window.prompt('Approval note (required):'); if (r) doReview(p.id, 'approve', r); }}
                        className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 whitespace-nowrap">
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => { const r = window.prompt('Rejection reason (required):'); if (r) doReview(p.id, 'reject', r); }}
                        className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 whitespace-nowrap">
                        ✗ Reject
                      </button>
                      <button
                        onClick={() => { setOverrideTarget(p); setOverrideReason(''); setOverrideScore(String(Math.round(p.risk_score))); }}
                        className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded hover:bg-purple-100 whitespace-nowrap">
                        ✎ Override
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {pagination && pagination.total > filters.pageSize && (
          <div className="flex justify-center gap-3">
            <button disabled={filters.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
              className="btn-outline text-xs">← Prev</button>
            <span className="text-sm text-gray-500">Page {filters.page} of {Math.ceil(pagination.total / filters.pageSize)}</span>
            <button disabled={filters.page >= Math.ceil(pagination.total / filters.pageSize)}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
              className="btn-outline text-xs">Next →</button>
          </div>
        )}

        {/* Override modal */}
        {overrideTarget && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <h3 className="font-bold text-gray-800 text-lg mb-3">Override Prediction</h3>
              <p className="text-sm text-gray-600 mb-4">
                Overriding prediction for <strong>{overrideTarget.asset_code}</strong> (current score: {Math.round(overrideTarget.risk_score)}).
                A mandatory reason must be provided — this override is recorded in the audit log.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="form-label text-xs">New Risk Score (0–100)</label>
                  <input type="number" min={0} max={100} className="form-input text-sm" value={overrideScore}
                    onChange={(e) => setOverrideScore(e.target.value)} />
                </div>
                <div>
                  <label className="form-label text-xs">Override Reason (required)</label>
                  <textarea className="form-input text-sm" rows={3}
                    placeholder="Describe why this override is necessary…"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)} />
                </div>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setOverrideTarget(null)} className="btn-outline text-sm">Cancel</button>
                  <button
                    onClick={() => doReview(overrideTarget.id, 'override', overrideReason, parseFloat(overrideScore))}
                    disabled={!overrideReason.trim() || isNaN(parseFloat(overrideScore))}
                    className="btn-primary text-sm">
                    Apply Override
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

// ── Settings Page ─────────────────────────────────────────────
export function SettingsPage() {
  const { data } = useQuery('settings', () => api.get('/settings').then((r) => r.data.data));
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  React.useEffect(() => { if (data) setForm(data); }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/settings', form);
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="Website Settings">
      <div className="max-w-2xl space-y-6">
        <div className="card space-y-4">
          <h3 className="font-semibold text-gray-700">Branding</h3>
          {[
            { key: 'siteName', label: 'Site Name', type: 'text' },
            { key: 'logoUrl', label: 'Logo URL', type: 'url' },
            { key: 'faviconUrl', label: 'Favicon URL', type: 'url' },
            { key: 'backgroundImageUrl', label: 'Hero Background Image URL', type: 'url' },
            { key: 'loginBgUrl', label: 'Login Background URL', type: 'url' },
            { key: 'dashboardTitle', label: 'Dashboard Title', type: 'text' },
            { key: 'footerText', label: 'Footer Text', type: 'text' },
          ].map(({ key, label, type }) => (
            <div key={key}>
              <label className="form-label text-xs">{label}</label>
              <input
                type={type}
                className="form-input"
                value={form[key] ?? ''}
                onChange={(e) => setForm((f: any) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="grid grid-cols-3 gap-3">
            {['primaryColor', 'secondaryColor', 'accentColor'].map((key) => (
              <div key={key}>
                <label className="form-label text-xs capitalize">{key.replace('Color', ' Color')}</label>
                <div className="flex gap-2">
                  <input type="color" className="w-10 h-10 rounded cursor-pointer" value={form[key] ?? '#000000'}
                    onChange={(e) => setForm((f: any) => ({ ...f, [key]: e.target.value }))} />
                  <input className="form-input font-mono text-sm" value={form[key] ?? ''}
                    onChange={(e) => setForm((f: any) => ({ ...f, [key]: e.target.value }))} maxLength={7} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </AdminLayout>
  );
}

// ── Audit Logs Page ───────────────────────────────────────────
export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery(['audit', page], () =>
    api.get('/audit', { params: { page, pageSize: 50 } }).then((r) => r.data)
  );

  return (
    <AdminLayout title="Audit Logs">
      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">Time</th>
              <th className="pb-2">Actor</th>
              <th className="pb-2">Action</th>
              <th className="pb-2">Entity</th>
              <th className="pb-2">IP</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading...</td></tr>}
            {(data?.data ?? []).map((log: any) => (
              <tr key={log.id} className="border-b last:border-0">
                <td className="py-1.5 text-gray-400">{new Date(log.created_at).toLocaleString('en-IN')}</td>
                <td className="py-1.5">{log.actor_email ?? log.actor_type}</td>
                <td className="py-1.5 font-medium">{log.action}</td>
                <td className="py-1.5 text-gray-500">{log.entity_type} {log.entity_id?.slice(0, 8)}…</td>
                <td className="py-1.5 text-gray-400 font-mono">{log.ip_address ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-center gap-3 mt-4">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-outline text-xs">← Prev</button>
          <span className="text-sm text-gray-500">Page {page}</span>
          <button disabled={(data?.data?.length ?? 0) < 50} onClick={() => setPage((p) => p + 1)} className="btn-outline text-xs">Next →</button>
        </div>
      </div>
    </AdminLayout>
  );
}

// ── Crew Pre-Positioning Page ─────────────────────────────────
export function CrewPrePositioningPage() {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);

  const { data: queueData, isLoading: queueLoading } = useQuery('crew-queue', () =>
    api.get('/maintenance/priority-queue').then((r) => r.data.data ?? []).catch(() => [])
  );

  const { data: workersData } = useQuery(
    ['qualified-workers', selectedPlanId],
    () => selectedPlanId
      ? api.get(`/maintenance/plans/${selectedPlanId}/qualified-workers`).then((r) => r.data.data ?? []).catch(() => [])
      : Promise.resolve([]),
    { enabled: !!selectedPlanId }
  );

  // Weather alerts query for all districts
  const { data: weatherAlerts } = useQuery('all-weather-alerts', () =>
    api.get('/dashboard/super-admin').then((r) => r.data.data?.weatherAlerts ?? []).catch(() => [])
  );

  const assignCrew = async (workerId: string) => {
    if (!selectedPlanId) return;
    setAssigning(workerId);
    try {
      await api.post(`/maintenance/plans/${selectedPlanId}/crew`, { workerId });
      toast.success('Worker assigned as crew');
    } catch {
      toast.error('Failed to assign worker');
    } finally {
      setAssigning(null);
    }
  };

  // Plans that need crew: high/critical, not yet completed
  const criticalPlans = (queueData ?? []).filter((p: any) =>
    ['critical','high'].includes(p.riskLevel) && !['completed','rejected'].includes(p.approvalStatus)
  );

  const selectedPlan = criticalPlans.find((p: any) => p.planId === selectedPlanId || p.assetId === selectedPlanId);

  // Pre-positioning recommendations: districts with weather alerts AND high/critical assets
  const alertDistricts = (weatherAlerts ?? []).map((w: any) => w.district);
  const recommendations = alertDistricts
    .map((district: string) => {
      const assetsInDistrict = criticalPlans.filter((p: any) => p.districtName === district);
      if (assetsInDistrict.length === 0) return null;
      const alertRow = (weatherAlerts ?? []).find((w: any) => w.district === district);
      const alertType = alertRow?.extreme_weather_alert ? 'Extreme Weather' : alertRow?.storm_alert ? 'Storm' : alertRow?.flood_alert ? 'Flood' : 'Weather Alert';
      return { district, alertType, assetCount: assetsInDistrict.length };
    })
    .filter(Boolean) as Array<{district: string; alertType: string; assetCount: number}>;

  return (
    <AdminLayout title="Crew Pre-Positioning">
      <div className="space-y-6">
        {/* Recommendations banner */}
        {recommendations.length > 0 && (
          <div className="space-y-2">
            {recommendations.map((rec, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm">
                <span className="text-xl">⚡</span>
                <span>
                  <strong>Pre-position electrical crew in {rec.district}</strong> —{' '}
                  {rec.alertType} forecast, <strong>{rec.assetCount}</strong> high-risk asset{rec.assetCount > 1 ? 's' : ''} in area.
                  Recommended staging: {rec.district} district headquarters.
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Plans list */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-3">
              🔴 High/Critical Plans Needing Crew ({criticalPlans.length})
            </h3>
            {queueLoading && <p className="text-gray-400 text-sm py-4 text-center">Loading...</p>}
            <div className="space-y-2">
              {criticalPlans.map((plan: any, i: number) => (
                <button
                  key={i}
                  onClick={() => setSelectedPlanId(plan.planId ?? plan.assetId)}
                  className={`w-full text-left card border-l-4 transition-all ${
                    (selectedPlanId === plan.planId || selectedPlanId === plan.assetId)
                      ? 'ring-2 ring-blue-400'
                      : 'hover:shadow-md'
                  } ${plan.riskLevel === 'critical' ? 'border-red-500' : 'border-orange-500'}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-xs">{plan.assetCode}</span>
                    <span className={`badge text-xs ${plan.riskLevel === 'critical' ? 'risk-critical' : 'risk-high'}`}>
                      {plan.riskLevel?.toUpperCase()}
                    </span>
                    <span className={`badge text-xs ml-auto ${
                      plan.approvalStatus === 'approved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>{plan.approvalStatus?.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {plan.stateName} · {plan.districtName}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{plan.recommendedAction}</div>
                </button>
              ))}
              {!queueLoading && criticalPlans.length === 0 && (
                <div className="card text-center text-gray-400 py-8 text-sm">
                  No high/critical plans requiring crew at this time.
                </div>
              )}
            </div>
          </div>

          {/* Right: Selected plan detail + workers */}
          <div>
            {!selectedPlan ? (
              <div className="card text-center text-gray-400 py-16 text-sm">
                ← Select a plan to view qualified workers and assign crew
              </div>
            ) : (
              <div className="space-y-4">
                {/* Asset context */}
                <div className="card border-l-4 border-blue-400">
                  <h4 className="font-semibold text-gray-700 mb-2">📍 {selectedPlan.assetCode}</h4>
                  <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600">
                    <span>State: <strong>{selectedPlan.stateName}</strong></span>
                    <span>District: <strong>{selectedPlan.districtName}</strong></span>
                    <span>Risk: <strong className="text-red-700">{Math.round(selectedPlan.riskScore ?? 0)}</strong></span>
                    <span>Grid Impact: <strong className="text-orange-700">{Math.round(selectedPlan.gridImpactSeverity ?? 0)}</strong></span>
                    <span>Urgency: <strong>{selectedPlan.maintenanceUrgency}</strong></span>
                    <span>Skill: <strong>{selectedPlan.requiredSkill?.replace(/_/g, ' ')}</strong></span>
                  </div>
                  {/* Weather context for this district */}
                  {(weatherAlerts ?? []).some((w: any) => w.district === selectedPlan.districtName) && (
                    <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                      ⚡ Storm/weather forecast in <strong>{selectedPlan.districtName}</strong> within 48h —{' '}
                      pre-position crew by {new Date(Date.now() + 24*3600000).toLocaleDateString('en-IN')}
                    </div>
                  )}
                </div>

                {/* Qualified workers */}
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2 text-sm">👷 Qualified Workers</h4>
                  {(workersData as any[] ?? []).length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No qualified workers found for this plan's skill requirement.</p>
                  ) : (
                    <div className="space-y-2">
                      {(workersData as any[]).slice(0, 10).map((w: any, i: number) => {
                        const proximity = w.district_name === selectedPlan.districtName
                          ? 'Local'
                          : w.state_name === selectedPlan.stateName
                          ? 'Same state'
                          : 'Out of district';
                        const proximityColor = proximity === 'Local' ? 'text-green-700' :
                          proximity === 'Same state' ? 'text-yellow-700' : 'text-gray-500';
                        return (
                          <div key={i} className="flex items-center gap-3 p-2 border rounded-lg bg-white">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{w.full_name}</div>
                              <div className="text-xs text-gray-500">
                                {w.field_of_work?.replace(/_/g, ' ')} · {w.district_name}, {w.state_name}
                              </div>
                              <span className={`text-xs font-medium ${proximityColor}`}>📍 {proximity}</span>
                            </div>
                            <button
                              onClick={() => assignCrew(w.id)}
                              disabled={assigning === w.id}
                              className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50 flex-shrink-0"
                            >
                              {assigning === w.id ? '…' : 'Assign'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export default AssetsPage;
