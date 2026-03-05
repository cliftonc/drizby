import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, needsSetup, authenticated } = useAuth()

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888' }}>
        Loading...
      </div>
    )
  }

  if (needsSetup) {
    return <Navigate to="/setup" replace />
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
