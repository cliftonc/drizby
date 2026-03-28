import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import SocialAuthButtons from '../components/SocialAuthButtons'
import { useAuth } from '../contexts/AuthContext'
import { useBranding } from '../hooks/useBranding'

export default function LoginPage() {
  const { authenticated, needsSetup, pendingAdminSetup, login, enabledProviders } = useAuth()
  const branding = useBranding()
  const [searchParams] = useSearchParams()
  const passwordEnabled = enabledProviders.includes('password')
  const magicLinkEnabled = enabledProviders.includes('magic_link')
  const samlEnabled = enabledProviders.includes('saml')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(searchParams.get('error') || '')
  const [loading, setLoading] = useState(false)
  const [magicSent, setMagicSent] = useState(false)

  if (needsSetup) return <Navigate to="/setup" replace />
  if (pendingAdminSetup) return <Navigate to="/pending-setup" replace />

  // Support returnTo for OAuth consent flow redirect through login
  const returnTo = searchParams.get('returnTo')
  if (authenticated && returnTo?.startsWith('/oauth/')) {
    window.location.href = returnTo
    return null
  }
  if (authenticated) return <Navigate to="/" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (magicLinkEnabled) {
      if (!email) return
      setLoading(true)
      try {
        await fetch('/api/auth/magic-link/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email }),
        })
        setMagicSent(true)
      } finally {
        setLoading(false)
      }
      return
    }

    setLoading(true)
    try {
      await login(email, password)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--dc-auth-bg)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380, padding: 32 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <img src={branding.logoUrl} alt="" style={{ width: 32, height: 32 }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--dc-text)', margin: 0 }}>
            {branding.name}
          </h1>
        </div>
        <p
          style={{
            color: 'var(--dc-text-muted)',
            fontSize: 14,
            textAlign: 'center',
            marginBottom: 32,
          }}
        >
          Sign in to your account
        </p>

        {samlEnabled && (
          <>
            <a
              href="/api/auth/saml/login"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                padding: '8px 16px',
                backgroundColor: 'var(--dc-primary)',
                color: 'var(--dc-primary-content)',
                fontWeight: 500,
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                textDecoration: 'none',
                boxSizing: 'border-box' as const,
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Sign in with SSO
            </a>
            {(passwordEnabled ||
              magicLinkEnabled ||
              enabledProviders.some(p =>
                ['google', 'github', 'gitlab', 'microsoft', 'slack'].includes(p)
              )) && (
              <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0' }}>
                <div style={{ flex: 1, borderTop: '1px solid var(--dc-border)' }} />
                <span style={{ padding: '0 12px', color: 'var(--dc-text-muted)', fontSize: 13 }}>
                  or
                </span>
                <div style={{ flex: 1, borderTop: '1px solid var(--dc-border)' }} />
              </div>
            )}
          </>
        )}

        <SocialAuthButtons
          enabledProviders={enabledProviders}
          mode="login"
          hideDivider={!passwordEnabled && !magicLinkEnabled}
        />

        {error && (
          <div
            style={{
              backgroundColor: 'var(--dc-error-bg)',
              border: '1px solid var(--dc-error-border)',
              color: 'var(--dc-error)',
              fontSize: 13,
              padding: '10px 14px',
              borderRadius: 6,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {(passwordEnabled || magicLinkEnabled) &&
          (magicSent ? (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 6,
                backgroundColor: 'var(--dc-success-bg, #dcfce7)',
                border: '1px solid var(--dc-success, #22c55e)',
                color: 'var(--dc-success, #16a34a)',
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              Check your email for a sign-in link.
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: magicLinkEnabled ? 20 : 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--dc-text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: 'var(--dc-input-bg)',
                    border: '1px solid var(--dc-input-border)',
                    borderRadius: 6,
                    color: 'var(--dc-input-text)',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              {passwordEnabled && !magicLinkEnabled && (
                <div style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 4,
                    }}
                  >
                    <label
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: 'var(--dc-text-secondary)',
                      }}
                    >
                      Password
                    </label>
                    <Link
                      to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}
                      tabIndex={-1}
                      style={{ fontSize: 12, color: 'var(--dc-primary)', textDecoration: 'none' }}
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: 'var(--dc-input-bg)',
                      border: '1px solid var(--dc-input-border)',
                      borderRadius: 6,
                      color: 'var(--dc-input-text)',
                      fontSize: 14,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '8px 16px',
                  backgroundColor: 'var(--dc-primary)',
                  color: 'var(--dc-primary-content)',
                  fontWeight: 500,
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {loading
                  ? magicLinkEnabled
                    ? 'Sending...'
                    : 'Signing in...'
                  : magicLinkEnabled
                    ? 'Send magic link'
                    : 'Sign in'}
              </button>
            </form>
          ))}

        {passwordEnabled && (
          <p
            style={{
              color: 'var(--dc-text-muted)',
              fontSize: 13,
              textAlign: 'center',
              marginTop: 16,
              marginBottom: 0,
            }}
          >
            Don't have an account?{' '}
            <Link to="/register" style={{ color: 'var(--dc-primary)', textDecoration: 'none' }}>
              Create an account
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
