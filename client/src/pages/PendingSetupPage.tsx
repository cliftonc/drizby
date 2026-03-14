import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useBranding } from '../hooks/useBranding'

export default function PendingSetupPage() {
  const { pendingAdminSetup, needsSetup, authenticated } = useAuth()
  const branding = useBranding()
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)

  if (needsSetup) return <Navigate to="/setup" replace />
  if (!pendingAdminSetup && authenticated) return <Navigate to="/" replace />
  if (!pendingAdminSetup) return <Navigate to="/login" replace />

  const handleResend = async () => {
    setResending(true)
    setResent(false)
    try {
      await fetch('/api/auth/resend-setup-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      setResent(true)
    } catch {
      // Ignore
    } finally {
      setResending(false)
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
      <div style={{ width: '100%', maxWidth: 420, padding: 32 }}>
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
            Almost ready
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
          Your {branding.name} instance is being set up
        </p>

        <div
          style={{
            backgroundColor: 'var(--dc-surface)',
            border: '1px solid var(--dc-border)',
            borderRadius: 8,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: 'var(--dc-primary-bg, #eef2ff)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--dc-primary)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
          </div>

          <p style={{ color: 'var(--dc-text)', fontSize: 15, fontWeight: 500, margin: '0 0 8px' }}>
            Check your inbox
          </p>
          <p
            style={{
              color: 'var(--dc-text-muted)',
              fontSize: 13,
              margin: '0 0 20px',
              lineHeight: 1.5,
            }}
          >
            A password reset link has been sent to the admin email address. Follow the link to set
            your password and complete setup.
          </p>

          <button
            onClick={handleResend}
            disabled={resending}
            style={{
              padding: '8px 20px',
              backgroundColor: 'transparent',
              color: 'var(--dc-primary)',
              fontWeight: 500,
              borderRadius: 6,
              border: '1px solid var(--dc-primary)',
              cursor: 'pointer',
              fontSize: 13,
              opacity: resending ? 0.5 : 1,
            }}
          >
            {resending ? 'Sending...' : 'Resend email'}
          </button>

          {resent && (
            <p
              style={{
                color: 'var(--dc-success, #10b981)',
                fontSize: 12,
                marginTop: 8,
                marginBottom: 0,
              }}
            >
              Email sent! Check your inbox.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
