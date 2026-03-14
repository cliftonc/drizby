import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useBranding } from '../hooks/useBranding'

type Phase = 'form' | 'seeding' | 'complete' | 'done'

interface SeedProgress {
  step: string
  progress: number
  detail?: string
}

export default function SetupPage() {
  const { needsSetup, needsSeed, authenticated, refetch } = useAuth()
  const branding = useBranding()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<Phase>(needsSeed && authenticated ? 'seeding' : 'form')
  const [seedProgress, setSeedProgress] = useState<SeedProgress>({ step: '', progress: 0 })
  const [autoSeedStarted, setAutoSeedStarted] = useState(false)

  // Auto-trigger seeding when admin arrives after password reset
  useEffect(() => {
    if (needsSeed && authenticated && !autoSeedStarted) {
      setAutoSeedStarted(true)
      startSeeding()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsSeed, authenticated, autoSeedStarted])

  // During seeding/complete phases, don't redirect — even if auth context updates
  if (phase === 'done') {
    refetch()
    return <Navigate to="/" replace />
  }
  if (phase !== 'seeding' && phase !== 'complete') {
    if (needsSeed && authenticated) {
      // Auto-trigger seeding for admin after password reset
    } else if (!needsSetup && authenticated) {
      return <Navigate to="/" replace />
    } else if (!needsSetup && !needsSeed) {
      return <Navigate to="/login" replace />
    }
  }

  const startSeeding = () => {
    setPhase('seeding')
    setSeedProgress({ step: 'Starting...', progress: 0 })

    setTimeout(async () => {
      try {
        const res = await fetch('/api/seed-demo', { credentials: 'include' })

        if (!res.ok) {
          setPhase('done')
          return
        }

        const contentType = res.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          setPhase('done')
          return
        }

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data:')) {
              const data = JSON.parse(line.slice(5).trim())
              if (data.step) {
                setSeedProgress(data)
              }
              if (data.status === 'ok') {
                setSeedProgress({ step: 'Done!', progress: 100 })
                setPhase('complete')
                setTimeout(() => setPhase('done'), 1000)
                return
              }
              if (data.message) {
                setError(`Seeding failed: ${data.message}`)
                setPhase('form')
                return
              }
            }
          }
        }

        // Stream ended without explicit complete event
        setSeedProgress({ step: 'Done!', progress: 100 })
        setPhase('complete')
        setTimeout(() => setPhase('done'), 1000)
      } catch (err: any) {
        setError(`Seeding failed: ${err.message}`)
        setPhase('form')
      }
    }, 50)
  }

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
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Setup failed')
      }
      // Admin account created — now seed demo data
      startSeeding()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'var(--dc-input-bg)',
    border: '1px solid var(--dc-input-border)',
    borderRadius: 6,
    color: 'var(--dc-input-text)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
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
            Welcome to {branding.name}
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
          {phase === 'seeding' || phase === 'complete'
            ? 'Setting up demo data...'
            : 'Create your admin account to get started'}
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

        {phase === 'seeding' || phase === 'complete' ? (
          <div>
            <div
              style={{
                fontSize: 14,
                color: 'var(--dc-text)',
                marginBottom: 8,
                fontWeight: 500,
              }}
            >
              {seedProgress.step}
            </div>
            {seedProgress.detail && (
              <div style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginBottom: 12 }}>
                {seedProgress.detail}
              </div>
            )}
            <div
              style={{
                width: '100%',
                height: 6,
                backgroundColor: 'var(--dc-input-border)',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${seedProgress.progress}%`,
                  height: '100%',
                  backgroundColor: 'var(--dc-primary)',
                  borderRadius: 3,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        ) : (
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
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="Your name"
                style={inputStyle}
              />
            </div>
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
                style={inputStyle}
              />
            </div>
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
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="At least 8 characters"
                style={inputStyle}
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
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                style={inputStyle}
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
              {loading ? 'Creating account...' : 'Create Admin Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
