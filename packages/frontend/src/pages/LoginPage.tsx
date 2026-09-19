import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requires2fa, setRequires2fa] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(identifier, password, requires2fa ? totpCode : undefined);
      if (result.requires2fa) {
        setRequires2fa(true);
        toast.info('Please enter your 6-digit authenticator code');
      } else {
        navigate('/portal');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{
        backgroundImage: "url('/assets/login-bg.jpg'), linear-gradient(135deg, #0E1E29 0%, #1E3A4C 45%, #12181F 100%)",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Dark overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, rgba(6,12,20,0.82) 0%, rgba(6,12,20,0.65) 50%, rgba(6,12,20,0.50) 100%)',
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            <span className="text-2xl font-extrabold" style={{ color: 'var(--color-primary)' }}>NX</span>
          </div>
          <h1 className="text-3xl font-extrabold" style={{ color: 'var(--color-text-on-dark)' }}>
            NEXORA AI
          </h1>
          <p className="mt-1" style={{ color: 'var(--color-text-muted)' }}>Sign in to your account</p>
        </div>

        {/* Card — semi-transparent dark surface */}
        <div
          className="rounded-xl border p-6 shadow-2xl"
          style={{
            backgroundColor: 'rgba(18,24,31,0.85)',
            borderColor: 'rgba(79,182,196,0.20)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            {!requires2fa ? (
              <>
                <div>
                  <label className="form-label" htmlFor="identifier"
                    style={{ color: 'var(--color-text-muted)' }}>
                    Email / Username / Employee ID / Mobile
                  </label>
                  <input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="block w-full rounded-lg p-2.5 text-sm focus:outline-none transition"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(79,182,196,0.30)',
                      color: 'var(--color-text-on-dark)',
                    }}
                    placeholder="Enter email, username, or mobile"
                    required
                    autoComplete="username"
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-secondary)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(79,182,196,0.30)')}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="password"
                    style={{ color: 'var(--color-text-muted)' }}>
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full rounded-lg p-2.5 text-sm focus:outline-none transition"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(79,182,196,0.30)',
                      color: 'var(--color-text-on-dark)',
                    }}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-secondary)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(79,182,196,0.30)')}
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="form-label" htmlFor="totp"
                  style={{ color: 'var(--color-text-muted)' }}>
                  6-Digit Authenticator Code
                </label>
                <input
                  id="totp"
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  className="block w-full rounded-lg p-2.5 text-center text-2xl tracking-widest focus:outline-none"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(79,182,196,0.30)',
                    color: 'var(--color-text-on-dark)',
                  }}
                  placeholder="000000"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  required
                  autoFocus
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-secondary)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(79,182,196,0.30)')}
                />
                <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                  Open your authenticator app and enter the current code.
                </p>
              </div>
            )}

            <button
              type="submit"
              className="w-full font-semibold py-2.5 rounded-lg transition-colors focus:outline-none disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-primary)' }}
              onMouseEnter={e => !loading && ((e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-accent-warm)')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-accent)')}
              onFocus={e => ((e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 3px rgba(242,166,90,0.40)')}
              onBlur={e => ((e.currentTarget as HTMLElement).style.boxShadow = 'none')}
              disabled={loading}
            >
              {loading ? 'Signing in…' : requires2fa ? 'Verify' : 'Sign In'}
            </button>
          </form>

          {/* Demo credentials */}
          <div
            className="mt-6 p-4 rounded-lg border text-xs"
            style={{
              backgroundColor: 'rgba(30,58,76,0.50)',
              borderColor: 'rgba(79,182,196,0.20)',
              color: 'var(--color-text-muted)',
            }}
          >
            <p className="font-semibold mb-2" style={{ color: 'var(--color-secondary)' }}>Demo Credentials:</p>
            <div className="space-y-1 font-mono">
              <p><span className="font-medium" style={{ color: 'var(--color-text-on-dark)' }}>Super Admin:</span> superadmin@nexora.ai / Admin@1234!</p>
              <p><span className="font-medium" style={{ color: 'var(--color-text-on-dark)' }}>State Admin MH:</span> admin.mh@nexora.ai / MhAdmin@123!</p>
              <p><span className="font-medium" style={{ color: 'var(--color-text-on-dark)' }}>State Admin KL:</span> admin.kl@nexora.ai / KlAdmin@123!</p>
              <p><span className="font-medium" style={{ color: 'var(--color-text-on-dark)' }}>Worker:</span> worker.kumar@nexora.ai / Worker@1234!</p>
            </div>
          </div>
        </div>

        {/* Footer links */}
        <div className="mt-6 text-center space-y-3">
          <div className="flex justify-center gap-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {[
              { to: '/complaint', label: 'Submit a Complaint' },
              { to: '/track',     label: 'Track Complaint'   },
              { to: '/register',  label: 'Apply as Worker'   },
            ].map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className="transition-colors"
                style={{ color: 'var(--color-text-muted)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-secondary)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
              >
                {label}
              </Link>
            ))}
          </div>
          <Link
            to="/"
            className="text-sm transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'white')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
