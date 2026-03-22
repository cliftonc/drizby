import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useBranding } from '../hooks/useBranding'
import PendingApprovalPage from '../pages/PendingApprovalPage'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const {
    isLoading,
    needsSetup,
    pendingAdminSetup,
    needsSeed,
    authenticated,
    user,
    compiling,
    compilationProgress,
  } = useAuth()
  const branding = useBranding()

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: 16,
          backgroundColor: 'var(--dc-background)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={branding.logoUrl} alt={branding.name} style={{ width: 28, height: 28 }} />
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--dc-text)' }}>
            {branding.name}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--dc-text-muted)',
            fontSize: 13,
          }}
        >
          <style>{'@keyframes auth-spin { to { transform: rotate(360deg); } }'}</style>
          <div
            style={{
              width: 14,
              height: 14,
              border: '2px solid var(--dc-border, #ddd)',
              borderTop: '2px solid var(--dc-primary, #3b82f6)',
              borderRadius: '50%',
              animation: 'auth-spin 1s linear infinite',
            }}
          />
          {compiling && compilationProgress
            ? `Compiling ${compilationProgress.label.replace('Compiling ', '')}...`
            : 'Connecting...'}
        </div>
      </div>
    )
  }

  if (needsSetup) {
    return <Navigate to="/setup" replace />
  }

  if (pendingAdminSetup) {
    return <Navigate to="/pending-setup" replace />
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />
  }

  // Admin needs to seed demo data after password reset
  if (needsSeed && user?.role === 'admin') {
    return <Navigate to="/setup" replace />
  }

  if (user?.role === 'user') {
    return <PendingApprovalPage emailVerified={user.emailVerified !== false} />
  }

  return <>{children}</>
}
