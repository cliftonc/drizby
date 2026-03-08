import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ResetPasswordPage() {
  const { authenticated, needsSetup, refetch } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (needsSetup) return <Navigate to="/setup" replace />
  if (authenticated) return <Navigate to="/" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to reset password')
      } else {
        // Server set session cookie — refetch auth and redirect
        await refetch()
        navigate('/', { replace: true })
        return
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
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
        <div style={{ width: '100%', maxWidth: 380, padding: 32, textAlign: 'center' }}>
          <p style={{ color: 'var(--dc-error)', fontSize: 14, marginBottom: 16 }}>
            Invalid reset link. No token provided.
          </p>
          <Link to="/login" style={{ color: 'var(--dc-primary)', textDecoration: 'none', fontSize: 13 }}>
            Back to sign in
          </Link>
        </div>
      </div>
    )
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
          Set a new password
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
              New password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
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
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--dc-text-secondary)',
                marginBottom: 4,
              }}
            >
              Confirm password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={8}
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
            {loading ? 'Resetting...' : 'Reset password'}
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
          <Link to="/login" style={{ color: 'var(--dc-primary)', textDecoration: 'none' }}>
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
