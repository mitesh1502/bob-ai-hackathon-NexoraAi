import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import api from '../../lib/api';

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-yellow-500', low: 'bg-gray-400',
};

export default function WorkerAlertsListPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery(
    'worker-alerts',
    () => api.get('/alerts?pageSize=50').then((r) => r.data.data ?? [])
  );

  const alerts: any[] = data ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/worker/dashboard')} className="text-gray-500 hover:text-gray-800">←</button>
        <h1 className="font-bold text-gray-800">My Alerts</h1>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-3">
        {isLoading && <div className="animate-pulse text-gray-400 text-center py-10">Loading…</div>}
        {!isLoading && alerts.length === 0 && (
          <div className="text-center text-gray-400 py-16">No alerts assigned to you.</div>
        )}
        {alerts.map((alert) => (
          <div key={alert.id}
            onClick={() => navigate(`/worker/alerts/${alert.id}`)}
            className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:shadow-sm transition-shadow">
            <div className="flex items-start gap-3">
              <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${PRIORITY_DOT[alert.priority] ?? 'bg-gray-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="font-mono text-xs font-bold text-gray-600">{alert.alert_number}</span>
                  {alert.is_safety_concern && <span className="text-xs text-red-600">🚨</span>}
                </div>
                <p className="font-medium text-gray-800 truncate">{alert.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {[alert.village_name, alert.taluka_name, alert.district_name].filter(Boolean).join(' · ')}
                </p>
                <p className="text-xs text-gray-400 capitalize mt-0.5">{alert.status?.replace(/_/g, ' ')}</p>
              </div>
              <div className="text-right flex-shrink-0">
                {alert.current_risk_score != null && (
                  <div className="font-bold text-lg text-gray-800">{Math.round(alert.current_risk_score)}</div>
                )}
                {alert.recommended_response_deadline && (
                  <div className={`text-xs ${new Date(alert.recommended_response_deadline) < new Date() ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                    ⏰ {new Date(alert.recommended_response_deadline).toLocaleDateString('en-IN')}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
