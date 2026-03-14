import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useBranding } from '../hooks/useBranding'

export default function PendingApprovalPage() {
  const { logout } = useAuth()
  const branding = useBranding()
  const navigate = useNavigate()

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
          <div style={{ fontSize: 32, marginBottom: 16 }}>&#9203;</div>
          <h2
            style={{ fontSize: 18, fontWeight: 600, color: 'var(--dc-text)', margin: '0 0 12px' }}
          >
            Account Pending Approval
          </h2>
          <p style={{ color: 'var(--dc-text-muted)', fontSize: 14, lineHeight: 1.5, margin: 0 }}>
            Your account is pending approval. An administrator will review your request.
          </p>
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
