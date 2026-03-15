import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import SocialAuthButtons from '../components/SocialAuthButtons'
import { useAuth } from '../contexts/AuthContext'
import { useBranding } from '../hooks/useBranding'

export default function RegisterPage() {
  const { authenticated, needsSetup, register, enabledProviders } = useAuth()
  const branding = useBranding()
  const passwordEnabled = enabledProviders.includes('password')
  const magicLinkEnabled = enabledProviders.includes('magic_link')
  const showPasswordFields = passwordEnabled && !magicLinkEnabled
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [magicSent, setMagicSent] = useState(false)

  if (needsSetup) return <Navigate to="/setup" replace />
  if (authenticated) return <Navigate to="/" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (magicLinkEnabled) {
      // Magic link registration: just send the magic link
      if (!name || !email) {
        setError('Name and email are required')
        return
      }
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

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await register(name, email, password)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'var(--dc-input-bg)',
    border: '1px solid var(--dc-input-border)',
    borderRadius: 6,
    color: 'var(--dc-input-text)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
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
          Create an account
        </p>

        <SocialAuthButtons
          enabledProviders={enabledProviders}
          mode="register"
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

        {!(passwordEnabled || magicLinkEnabled) ? null : magicSent ? (
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
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--dc-text-secondary)',
                  marginBottom: 4,
                }}
              >
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="Your name"
                style={inputStyle}
              />
            </div>
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
                style={inputStyle}
              />
            </div>
            {showPasswordFields && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--dc-text-secondary)',
                      marginBottom: 4,
                    }}
                  >
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    style={inputStyle}
                  />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--dc-text-secondary)',
                      marginBottom: 4,
                    }}
                  >
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    style={inputStyle}
                  />
                </div>
              </>
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
                  : 'Creating account...'
                : magicLinkEnabled
                  ? 'Send magic link'
                  : 'Create account'}
            </button>
          </form>
        )}

        <p
          style={{
            color: 'var(--dc-text-muted)',
            fontSize: 13,
            textAlign: 'center',
            marginTop: 24,
          }}
        >
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--dc-primary)', textDecoration: 'none' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
