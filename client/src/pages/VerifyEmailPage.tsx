import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setError('No token provided')
      return
    }

    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token }),
    })
      .then(async res => {
        if (res.ok) {
          window.location.href = '/'
        } else {
          const data = await res.json()
          setError(data.error || 'Verification failed')
        }
      })
      .catch(() => setError('Verification failed'))
  }, [token])

  if (error) {
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
        <div style={{ textAlign: 'center', padding: 32 }}>
          <p style={{ color: 'var(--dc-error)', fontSize: 14, marginBottom: 16 }}>{error}</p>
          <Link to="/login" style={{ color: 'var(--dc-primary)', fontSize: 14 }}>
            Back to login
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
      <div style={{ textAlign: 'center', padding: 32 }}>
        <p style={{ color: 'var(--dc-text-muted)', fontSize: 14 }}>Verifying your email...</p>
      </div>
    </div>
  )
}
