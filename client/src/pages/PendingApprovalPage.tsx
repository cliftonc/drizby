import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useBranding } from '../hooks/useBranding'

export default function PendingApprovalPage({ emailVerified = true }: { emailVerified?: boolean }) {
  const { logout, refetch } = useAuth()
  const branding = useBranding()
  const navigate = useNavigate()
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)

  const handleResendVerification = async () => {
    setResending(true)
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        credentials: 'include',
      })
      setResent(true)
    } catch {
      // ignore
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
      <div style={{ width: '100%', maxWidth: 420, padding: 32, textAlign: 'center' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginBottom: 24,
          }}
        >
          <img src={branding.logoUrl} alt="" style={{ width: 32, height: 32 }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--dc-text)', margin: 0 }}>
            {branding.name}
          </h1>
        </div>
        <div
          style={{
            padding: '24px',
            backgroundColor: 'var(--dc-surface)',
            border: '1px solid var(--dc-border)',
            borderRadius: 8,
            marginBottom: 24,
          }}
        >
          {!emailVerified ? (
            <>
              <div style={{ fontSize: 32, marginBottom: 16 }}>&#9993;</div>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--dc-text)',
                  margin: '0 0 12px',
                }}
              >
                Verify Your Email
              </h2>
              <p
                style={{
                  color: 'var(--dc-text-muted)',
                  fontSize: 14,
                  lineHeight: 1.5,
                  margin: '0 0 16px',
                }}
              >
                We sent a verification link to your email. Please check your inbox and click the
                link to verify your account.
              </p>
              {resent ? (
                <p style={{ color: 'var(--dc-accent)', fontSize: 14 }}>
                  Verification email sent! Check your inbox.
                </p>
              ) : (
                <button
                  onClick={handleResendVerification}
                  disabled={resending}
                  style={{
                    padding: '8px 24px',
                    backgroundColor: 'var(--dc-accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: resending ? 'not-allowed' : 'pointer',
                    fontSize: 14,
                    opacity: resending ? 0.7 : 1,
                    marginBottom: 8,
                  }}
                >
                  {resending ? 'Sending...' : 'Resend verification email'}
                </button>
              )}
              <p style={{ color: 'var(--dc-text-muted)', fontSize: 13, margin: '12px 0 0' }}>
                Already verified?{' '}
                <button
                  onClick={() => refetch()}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--dc-accent)',
                    cursor: 'pointer',
                    fontSize: 13,
                    padding: 0,
                    textDecoration: 'underline',
                  }}
                >
                  Refresh
                </button>
              </p>
            </>
          ) : (
            <>
              <div style={{ fontSize: 32, marginBottom: 16 }}>&#9203;</div>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--dc-text)',
                  margin: '0 0 12px',
                }}
              >
                Account Pending Approval
              </h2>
              <p
                style={{
                  color: 'var(--dc-text-muted)',
                  fontSize: 14,
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                Your account is pending approval. An administrator will review your request.
              </p>
            </>
          )}
        </div>
        <button
          onClick={async () => {
            await logout()
            navigate('/login')
          }}
          style={{
            padding: '8px 24px',
            backgroundColor: 'transparent',
            color: 'var(--dc-text-muted)',
            border: '1px solid var(--dc-border)',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
