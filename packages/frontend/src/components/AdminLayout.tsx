import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: '🏠', roles: ['super_admin'] },
  { label: 'Dashboard', path: '/state/dashboard', icon: '🏠', roles: ['state_admin'] },
  { label: 'Alerts',    path: '/state/alerts',    icon: '🚨', roles: ['state_admin', 'super_admin'] },
  { label: 'GIS Map',   path: '/admin/map',        icon: '🗺️', roles: ['super_admin', 'state_admin'] },
  { label: 'Assets',    path: '/admin/assets',     icon: '🏭', roles: ['super_admin', 'state_admin'] },
  { label: 'Risk & AI', path: '/admin/risk',       icon: '🔮', roles: ['super_admin', 'state_admin'] },
  { label: 'Maintenance',path: '/admin/maintenance',icon: '🔧', roles: ['super_admin', 'state_admin'] },
  { label: 'Complaints', path: '/admin/complaints', icon: '📋', roles: ['super_admin', 'state_admin'] },
  { label: 'Crew Planning', path: '/admin/crew',   icon: '👥', roles: ['super_admin', 'state_admin'] },
  { label: 'Workers',   path: '/admin/workers',    icon: '👷', roles: ['super_admin', 'state_admin'] },
  { label: 'Settings',  path: '/admin/settings',   icon: '⚙️', roles: ['super_admin'] },
  { label: 'Audit Logs',path: '/admin/audit',      icon: '📜', roles: ['super_admin'] },
];

export default function AdminLayout({ children, title }: { children: React.ReactNode; title?: string }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);

  const visibleNav = NAV_ITEMS.filter((n) => user && n.roles.includes(user.role));

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={`${sidebarOpen ? 'w-64' : 'w-16'} flex-shrink-0 flex flex-col transition-all duration-200 overflow-hidden border-r`}
        style={{
          backgroundColor: '#ffffff',
          borderColor: 'rgba(30,58,76,0.12)',
        }}
      >
        {/* Logo row */}
        <div
          className="flex items-center gap-3 px-4 py-5 border-b"
          style={{ borderColor: 'rgba(30,58,76,0.10)' }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-sm flex-shrink-0"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-primary)' }}
          >
            NX
          </div>
          {sidebarOpen && (
            <div>
              <div className="font-bold text-sm" style={{ color: 'var(--color-primary)' }}>NEXORA AI</div>
              <div className="text-xs capitalize" style={{ color: 'var(--color-text-muted)' }}>
                {user?.role.replace(/_/g, ' ')}
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {visibleNav.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`sidebar-link ${active ? 'active' : ''} ${!sidebarOpen ? 'justify-center' : ''}`}
                title={!sidebarOpen ? item.label : undefined}
              >
                <span className="text-lg">{item.icon}</span>
                {sidebarOpen && <span className="text-sm">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User / Logout */}
        <div className="border-t p-4" style={{ borderColor: 'rgba(30,58,76,0.10)' }}>
          {sidebarOpen && (
            <div className="text-xs mb-2 truncate" style={{ color: 'var(--color-text-muted)' }}>
              {user?.email}
            </div>
          )}
          <button
            onClick={logout}
            className={`flex items-center gap-2 text-sm text-red-500 hover:text-red-700 transition-colors ${!sidebarOpen ? 'justify-center' : ''}`}
            title="Logout"
          >
            <span>🚪</span>
            {sidebarOpen && 'Logout'}
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header
          className="h-14 border-b flex items-center px-4 gap-4 flex-shrink-0"
          style={{
            backgroundColor: 'var(--color-primary)',
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'white')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
            aria-label="Toggle sidebar"
          >
            ☰
          </button>

          {title && (
            <h1 className="text-base font-semibold flex-1" style={{ color: 'var(--color-text-on-dark)' }}>
              {title}
            </h1>
          )}

          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden sm:block" style={{ color: 'var(--color-text-muted)' }}>
              {user?.fullName}
            </span>
            {/* Role badge — dusk navy on lighter bg */}
            <span
              className="badge capitalize"
              style={{
                backgroundColor: 'rgba(79,182,196,0.18)',
                color: 'var(--color-secondary)',
                border: '1px solid rgba(79,182,196,0.35)',
              }}
            >
              {user?.role.replace(/_/g, ' ')}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
