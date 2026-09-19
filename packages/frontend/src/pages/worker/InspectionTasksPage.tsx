import React from 'react';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function InspectionTasksPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery('worker-tasks', () =>
    api.get('/inspections/tasks/my').then((r) => r.data.data)
  );

  const tasks = data ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <Link to="/worker/dashboard" className="text-gray-500 hover:text-gray-700">←</Link>
        <h1 className="font-bold text-gray-900">My Inspection Tasks</h1>
        <span className="badge bg-gray-100 text-gray-600 ml-auto">{tasks.length} tasks</span>
      </header>
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-3">
        {isLoading && <p className="text-center text-gray-400 py-8">Loading tasks...</p>}
        {!isLoading && tasks.length === 0 && (
          <div className="card text-center py-10">
            <p className="text-gray-400">No inspection tasks assigned currently.</p>
          </div>
        )}
        {tasks.map((task: any) => (
          <div key={task.id} className="card flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-sm font-bold">{task.task_code}</span>
                <span className={`badge text-xs ${task.current_risk_level === 'critical' ? 'risk-critical' : task.current_risk_level === 'high' ? 'risk-high' : 'risk-moderate'}`}>
                  {task.current_risk_level?.toUpperCase()}
                </span>
                <span className={`badge text-xs ${task.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {task.status}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                <span className="font-mono font-bold">{task.asset_code}</span>
                {' · '}{task.asset_type?.replace('_', ' ')}
              </p>
              {task.due_date && (
                <p className="text-xs text-gray-500 mt-1">Due: {task.due_date}</p>
              )}
              {task.asset_lat && task.asset_lng && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${task.asset_lat}&mlon=${task.asset_lng}&zoom=16`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs hover:underline" style={{ color: 'var(--color-secondary)' }}
                >
                  📍 View on Map
                </a>
              )}
            </div>
            {!['approved', 'rejected'].includes(task.status) && (
              <Link to={`/worker/tasks/${task.id}/report`} className="btn-primary text-sm flex-shrink-0">
                {task.status === 'submitted' ? 'View Report' : 'Start Inspection'}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
