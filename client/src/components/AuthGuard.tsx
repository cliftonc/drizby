import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import PendingApprovalPage from '../pages/PendingApprovalPage'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, needsSetup, pendingAdminSetup, needsSeed, authenticated, user } = useAuth()

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: '#888',
        }}
      >
        Loading...
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
