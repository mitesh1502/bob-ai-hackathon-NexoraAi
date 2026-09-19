import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

interface SiteSettings {
  siteName: string;
  logoUrl?: string;
  backgroundImageUrl?: string;
  primaryColor: string;
  footerText: string;
}

const DEFAULT_SETTINGS: SiteSettings = {
  siteName: 'NEXORA AI',
  primaryColor: '#1E3A4C',
  footerText: '© 2024 NEXORA AI. All rights reserved.',
};

// Fallback hero: vivid gradient matching the photo palette when no image is set
const FALLBACK_HERO =
  'linear-gradient(135deg, #0E1E29 0%, #1E3A4C 35%, #2a5566 60%, #1a3040 80%, #12181F 100%)';

export default function LandingPage() {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    api.get('/settings').then((res) => {
      if (res.data.data) setSettings({ ...DEFAULT_SETTINGS, ...res.data.data });
    }).catch(() => null);
  }, []);

  // Hero photo: admin-configured URL → bundled asset → CSS gradient fallback
  const heroImageUrl = settings.backgroundImageUrl || '/assets/hero-bg.jpg';

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header style={{ backgroundColor: 'var(--color-primary)' }} className="sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              {settings.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="h-9 w-auto" />
              ) : (
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center font-extrabold text-sm"
                  style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-primary)' }}
                >
                  NX
                </div>
              )}
              <span className="text-lg font-extrabold tracking-wide" style={{ color: 'var(--color-text-on-dark)' }}>
                {settings.siteName}
              </span>
            </div>

            {/* Nav links */}
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
              <a href="#about" className="hover:text-white transition-colors">About</a>
              <Link to="/register" className="hover:text-white transition-colors">Employment</Link>
              <Link to="/complaint" className="hover:text-white transition-colors">Citizen Complaint</Link>
              <Link to="/track" className="hover:text-white transition-colors">Track Complaint</Link>
              <a href="#contact" className="hover:text-white transition-colors">Contact</a>
            </nav>

            {/* Header CTA */}
            <div className="flex items-center gap-3">
              <Link
                to="/login"
                className="text-sm font-medium transition-colors px-3 py-1.5 rounded"
                style={{ color: 'var(--color-text-muted)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'white')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
              >
                Login
              </Link>
              <Link
                to="/register"
                className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-primary)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-warm)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent)')}
              >
                Apply as Worker
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section
        className="relative flex items-center justify-center min-h-[75vh]"
        style={{
          backgroundImage: `url('${heroImageUrl}'), ${FALLBACK_HERO}`,
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
        }}
      >
        {/* Dark overlay — heavier gradient so ALL text and buttons stay readable */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(6,12,20,0.72) 0%, rgba(6,12,20,0.52) 45%, rgba(6,12,20,0.75) 100%)',
          }}
        />

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center py-24">
          {/* Eyebrow tag */}
          <div
            className="inline-block rounded-full px-4 py-1.5 text-sm font-medium mb-6 border"
            style={{
              backgroundColor: 'rgba(79,182,196,0.15)',
              borderColor: 'rgba(79,182,196,0.40)',
              color: 'var(--color-secondary)',
              backdropFilter: 'blur(6px)',
            }}
          >
            India's Electrical Infrastructure Intelligence Platform
          </div>

          {/* Headline */}
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-6 leading-tight drop-shadow-lg"
            style={{ color: 'var(--color-text-on-dark)' }}
          >
            {settings.siteName}
          </h1>

          {/* Sub-headline */}
          <p
            className="text-lg sm:text-xl mb-10 max-w-2xl mx-auto leading-relaxed"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Predictive AI for Asset Health, Maintenance, Workforce Management,
            and Citizen Complaint Resolution across India's power grid.
          </p>

          {/* Hero CTA buttons */}
          <div className="flex flex-wrap justify-center gap-4">
            {/* Primary CTA — amber accent */}
            <Link
              to="/register"
              className="font-semibold px-6 py-3 rounded-lg transition-colors shadow-lg"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-primary)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-warm)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent)')}
            >
              Register as Worker
            </Link>

            {/* Secondary CTAs — teal outline glass */}
            {[
              { to: '/complaint', label: 'Register a Complaint' },
              { to: '/track',     label: 'Track a Complaint'    },
              { to: '/login',     label: 'Login'                },
            ].map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className="font-semibold px-6 py-3 rounded-lg border transition-colors"
                style={{
                  backgroundColor: 'rgba(79,182,196,0.12)',
                  borderColor: 'rgba(79,182,196,0.50)',
                  color: 'var(--color-text-on-dark)',
                  backdropFilter: 'blur(4px)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(79,182,196,0.25)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(79,182,196,0.12)';
                }}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Service Cards ───────────────────────────────────────── */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Our Services</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {SERVICES.map((service) => (
              <ServiceCard key={service.title} {...service} />
            ))}
          </div>
        </div>
      </section>

      {/* ── About ────────────────────────────────────────────────── */}
      <section id="about" className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">About NEXORA AI</h2>
          <p className="text-lg text-gray-600 leading-relaxed">
            NEXORA AI fuses worker field observations, sensor data, weather forecasts,
            historical incident records, GIS location data, and citizen complaints into
            one explainable risk engine. Every prediction is transparent, versioned, and
            requires administrator review before action is taken — AI as a decision-support
            tool, not a black box.
          </p>
        </div>
      </section>

      {/* ── Contact ──────────────────────────────────────────────── */}
      <section id="contact" className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Contact</h2>
          <p className="text-gray-600">
            For administrator access or technical support, contact your state nodal officer
            or the platform administrator at{' '}
            <a
              href="mailto:support@nexora-ai.in"
              className="hover:underline font-medium"
              style={{ color: 'var(--color-secondary)' }}
            >
              support@nexora-ai.in
            </a>
          </p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer style={{ backgroundColor: 'var(--color-bg-dark)' }} className="py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{settings.footerText}</p>
          <div className="flex justify-center gap-6 mt-4 text-sm">
            {[
              { to: '/complaint', label: 'Citizen Complaint' },
              { to: '/track',     label: 'Track Complaint'  },
              { to: '/register',  label: 'Worker Registration' },
              { to: '/login',     label: 'Admin Login'      },
            ].map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className="transition-colors"
                style={{ color: 'var(--color-text-muted)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'white')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

function ServiceCard({
  icon,
  title,
  description,
  link,
  linkLabel,
}: {
  icon: string;
  title: string;
  description: string;
  link?: string;
  linkLabel?: string;
}) {
  return (
    <div className="card hover:shadow-md transition-shadow group">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm mb-4">{description}</p>
      {link && (
        <Link
          to={link}
          className="text-sm font-medium transition-colors"
          style={{ color: 'var(--color-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-secondary)')}
        >
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

const SERVICES = [
  {
    icon: '👷',
    title: 'Worker Employment',
    description:
      "Apply to become a field inspection worker. Submit qualifications, documents, and preferences for assignment across India's electrical grid.",
    link: '/register',
    linkLabel: 'Apply Now',
  },
  {
    icon: '📋',
    title: 'Citizen Complaint',
    description:
      'Report electrical faults, equipment failures, or safety hazards in your area. Track your complaint in real time — no account needed.',
    link: '/complaint',
    linkLabel: 'Submit Complaint',
  },
  {
    icon: '🏭',
    title: 'Asset Health Monitoring',
    description:
      'Continuous monitoring of transformers, substations, feeders, and more using sensor data, worker observations, and AI risk scoring.',
  },
  {
    icon: '🔮',
    title: 'Predictive Maintenance',
    description:
      'Explainable AI identifies at-risk assets before failure, ranks them by grid impact, and generates priority maintenance queues.',
  },
  {
    icon: '🗺️',
    title: 'GIS Infrastructure Map',
    description:
      'Live geographic view of assets, risk levels, complaints, and weather overlays across India — filtered by state, district, and risk.',
  },
  {
    icon: '👤',
    title: 'Administrator Monitoring',
    description:
      'Role-based dashboards for Super Administrators and State Administrators with full state/district data isolation and audit trails.',
    link: '/login',
    linkLabel: 'Admin Login',
  },
];
