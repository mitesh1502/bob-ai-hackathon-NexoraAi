import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import WorkerRegisterPage from './pages/WorkerRegisterPage';
import ComplaintSubmitPage from './pages/ComplaintSubmitPage';
import ComplaintTrackPage from './pages/ComplaintTrackPage';
import SuperAdminDashboard from './pages/admin/SuperAdminDashboard';
import StateAdminDashboard from './pages/admin/StateAdminDashboard';
import WorkerDashboard from './pages/worker/WorkerDashboard';
import {
  AssetsPage, AssetDetailPage, ComplaintsAdminPage, WorkersAdminPage,
  MaintenancePage, RiskPredictionsPage, SettingsPage, AuditLogsPage,
  CrewPrePositioningPage,
} from './pages/admin/AdminPages';
import GisMapPage from './pages/admin/GisMapPage';
import InspectionTasksPage from './pages/worker/InspectionTasksPage';
import InspectionReportPage from './pages/worker/InspectionReportPage';
import WorkerAlertsListPage from './pages/worker/WorkerAlertsListPage';
import WorkerAlertPage from './pages/worker/WorkerAlertPage';
import CreateAlertPage from './pages/admin/CreateAlertPage';
import AlertsListPage from './pages/admin/AlertsListPage';
import AlertDetailPage from './pages/admin/AlertDetailPage';
import WorkerCoverageAreaPage from './pages/admin/WorkerCoverageAreaPage';
import NotFoundPage from './pages/NotFoundPage';

function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: string[];
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/unauthorized" replace />;

  return <>{children}</>;
}

function RoleRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'super_admin') return <Navigate to="/admin/dashboard" replace />;
  if (user.role === 'state_admin') return <Navigate to="/state/dashboard" replace />;
  if (user.role === 'worker') return <Navigate to="/worker/dashboard" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<WorkerRegisterPage />} />
          <Route path="/complaint" element={<ComplaintSubmitPage />} />
          <Route path="/track" element={<ComplaintTrackPage />} />
          <Route path="/portal" element={<RoleRedirect />} />

          {/* Super Admin routes */}
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute roles={['super_admin']}>
                <SuperAdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/assets"
            element={
              <ProtectedRoute roles={['super_admin']}>
                <AssetsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/assets/:id"
            element={
              <ProtectedRoute roles={['super_admin', 'state_admin']}>
                <AssetDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/complaints"
            element={
              <ProtectedRoute roles={['super_admin', 'state_admin']}>
                <ComplaintsAdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/workers"
            element={
              <ProtectedRoute roles={['super_admin', 'state_admin']}>
                <WorkersAdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/maintenance"
            element={
              <ProtectedRoute roles={['super_admin', 'state_admin']}>
                <MaintenancePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/map"
            element={
              <ProtectedRoute roles={['super_admin', 'state_admin']}>
                <GisMapPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/risk"
            element={
              <ProtectedRoute roles={['super_admin', 'state_admin']}>
                <RiskPredictionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute roles={['super_admin']}>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <ProtectedRoute roles={['super_admin']}>
                <AuditLogsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/crew"
            element={
              <ProtectedRoute roles={['super_admin', 'state_admin']}>
                <CrewPrePositioningPage />
              </ProtectedRoute>
            }
          />

          {/* State Admin routes */}
          <Route
            path="/state/dashboard"
            element={
              <ProtectedRoute roles={['state_admin']}>
                <StateAdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/state/alerts"
            element={
              <ProtectedRoute roles={['state_admin', 'super_admin']}>
                <AlertsListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/state/alerts/new"
            element={
              <ProtectedRoute roles={['state_admin', 'super_admin']}>
                <CreateAlertPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/state/alerts/:alertId"
            element={
              <ProtectedRoute roles={['state_admin', 'super_admin']}>
                <AlertDetailPage />
              </ProtectedRoute>
            }
          />

          {/* Worker routes */}
          <Route
            path="/worker/dashboard"
            element={
              <ProtectedRoute roles={['worker']}>
                <WorkerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/worker/tasks"
            element={
              <ProtectedRoute roles={['worker']}>
                <InspectionTasksPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/worker/tasks/:taskId/report"
            element={
              <ProtectedRoute roles={['worker']}>
                <InspectionReportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/worker/alerts"
            element={
              <ProtectedRoute roles={['worker']}>
                <WorkerAlertsListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/worker/alerts/:alertId"
            element={
              <ProtectedRoute roles={['worker']}>
                <WorkerAlertPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/workers/:workerId/coverage"
            element={
              <ProtectedRoute roles={['state_admin', 'super_admin']}>
                <WorkerCoverageAreaPage />
              </ProtectedRoute>
            }
          />

          {/* Unauthorized */}
          <Route
            path="/unauthorized"
            element={
              <div className="flex items-center justify-center min-h-screen">
                <div className="card max-w-md text-center">
                  <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
                  <p className="text-gray-600 mb-4">You do not have permission to view this page.</p>
                  <a href="/" className="btn-primary inline-block">Go Home</a>
                </div>
              </div>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
