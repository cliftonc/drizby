import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const { authenticated, needsSetup, pendingAdminSetup, login, googleEnabled } = useAuth()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(searchParams.get('error') || '')
  const [loading, setLoading] = useState(false)

  if (needsSetup) return <Navigate to="/setup" replace />
  if (pendingAdminSetup) return <Navigate to="/pending-setup" replace />
  if (authenticated) return <Navigate to="/" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
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
          <img src="/logo.png" alt="" style={{ width: 32, height: 32 }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--dc-text)', margin: 0 }}>
            Drizby
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
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

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

        {googleEnabled && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0' }}>
              <div style={{ flex: 1, borderTop: '1px solid var(--dc-border)' }} />
              <span style={{ padding: '0 12px', color: 'var(--dc-text-muted)', fontSize: 13 }}>
                or
              </span>
              <div style={{ flex: 1, borderTop: '1px solid var(--dc-border)' }} />
            </div>
            <a
              href="/api/auth/google"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                padding: '8px 16px',
                backgroundColor: 'var(--dc-surface)',
                color: 'var(--dc-text)',
                fontWeight: 500,
                borderRadius: 6,
                border: '1px solid var(--dc-border)',
                cursor: 'pointer',
                fontSize: 14,
                textDecoration: 'none',
                boxSizing: 'border-box',
              }}
            >
              <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </a>
          </>
        )}
      </div>
    </div>
  )
}
