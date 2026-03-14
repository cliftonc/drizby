import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useBranding } from '../hooks/useBranding'

export default function ForgotPasswordPage() {
  const { authenticated, needsSetup } = useAuth()
  const branding = useBranding()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  if (needsSetup) return <Navigate to="/setup" replace />
  if (authenticated) return <Navigate to="/" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } catch {
      // Ignore errors — always show success
    } finally {
      setLoading(false)
      setSubmitted(true)
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
          Reset your password
        </p>

        {submitted ? (
          <div
            style={{
              backgroundColor: 'var(--dc-surface)',
              border: '1px solid var(--dc-border)',
              padding: '16px',
              borderRadius: 6,
              textAlign: 'center',
            }}
          >
            <p style={{ color: 'var(--dc-text)', fontSize: 14, margin: '0 0 8px' }}>
              If an account exists with that email, we've sent a password reset link.
            </p>
            <p style={{ color: 'var(--dc-text-muted)', fontSize: 13, margin: 0 }}>
              Check your inbox and follow the instructions.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
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
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}

        <p
          style={{
            color: 'var(--dc-text-muted)',
            fontSize: 13,
            textAlign: 'center',
            marginTop: 16,
            marginBottom: 0,
          }}
        >
          <Link to="/login" style={{ color: 'var(--dc-primary)', textDecoration: 'none' }}>
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
