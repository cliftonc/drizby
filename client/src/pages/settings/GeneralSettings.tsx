import { useCallback, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useConfirm } from '../../hooks/useConfirm'
import { usePrompt } from '../../hooks/usePrompt'

export default function GeneralSettings() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to change password')
      }
      setMessage('Password updated successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const [reseeding, setReseeding] = useState(false)
  const [reseedMessage, setReseedMessage] = useState('')
  const [reseedError, setReseedError] = useState('')
  const [clearing, setClearing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [confirm, ConfirmDialog] = useConfirm()
  const [prompt, PromptDialog] = usePrompt()

  const handleReseedDemo = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Reseed Demo Data',
      message:
        'This will delete and recreate the demo database with fresh sample data. Your other connections and data will not be affected.',
      confirmText: 'Reseed',
      variant: 'danger',
    })
    if (!confirmed) return

    setReseeding(true)
    setReseedError('')
    setReseedMessage('')
    try {
      const res = await fetch('/api/settings/reseed-demo', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Reseed failed')
      }
      setReseedMessage('Demo data reseeded successfully. Reloading...')
      setTimeout(() => window.location.reload(), 1500)
    } catch (err: any) {
      setReseedError(err.message)
      setReseeding(false)
    }
  }, [confirm])

  const handleClearDemo = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Clear Demo Data',
      message:
        'This will remove the demo connection, its dashboards, cubes, schemas, and the demo Department groups. Your other connections and user-created groups will not be affected.',
      confirmText: 'Clear Demo',
      variant: 'danger',
    })
    if (!confirmed) return

    setClearing(true)
    setReseedError('')
    setReseedMessage('')
    try {
      const res = await fetch('/api/settings/clear-demo', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Clear failed')
      }
      setReseedMessage('Demo data cleared. Reloading...')
      setTimeout(() => window.location.reload(), 1500)
    } catch (err: any) {
      setReseedError(err.message)
      setClearing(false)
    }
  }, [confirm])

  const handleFactoryReset = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Factory Reset',
      message:
        'This will permanently delete ALL data: connections, schemas, cubes, dashboards, notebooks, users, and settings. This cannot be undone.',
      confirmText: 'Continue',
      variant: 'danger',
    })
    if (!confirmed) return

    const typed = await prompt({
      title: 'Confirm Factory Reset',
      message: 'Type "RESET" to confirm you want to wipe all data.',
      placeholder: 'RESET',
      submitText: 'Reset Everything',
    })
    if (typed !== 'RESET') return

    setResetting(true)
    try {
      const res = await fetch('/api/settings/factory-reset', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Reset failed')
      }
      // Redirect to root — the server will show setup page after restart
      window.location.href = '/'
    } catch (err: any) {
      setError(err.message)
      setResetting(false)
    }
  }, [confirm, prompt])

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 12px',
    backgroundColor: 'var(--dc-input-bg)',
    border: '1px solid var(--dc-input-border)',
    borderRadius: 6,
    color: 'var(--dc-input-text)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: 'var(--dc-text)',
          marginBottom: 24,
          marginTop: 0,
        }}
      >
        Your Profile
      </h2>

      <div
        style={{
          marginBottom: 32,
          padding: 16,
          backgroundColor: 'var(--dc-surface)',
          borderRadius: 8,
          border: '1px solid var(--dc-border)',
        }}
      >
        <h3
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--dc-text-secondary)',
            marginBottom: 12,
            marginTop: 0,
          }}
        >
          Profile
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--dc-text-muted)' }}>Name</span>
            <span style={{ color: 'var(--dc-text)' }}>{user?.name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--dc-text-muted)' }}>Email</span>
            <span style={{ color: 'var(--dc-text)' }}>{user?.email}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--dc-text-muted)' }}>Role</span>
            <span style={{ color: 'var(--dc-text)', textTransform: 'capitalize' }}>
              {user?.role}
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          padding: 16,
          backgroundColor: 'var(--dc-surface)',
          borderRadius: 8,
          border: '1px solid var(--dc-border)',
        }}
      >
        <h3
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--dc-text-secondary)',
            marginBottom: 12,
            marginTop: 0,
          }}
        >
          Change Password
        </h3>

        {error && (
          <div
            style={{
              backgroundColor: 'var(--dc-error-bg)',
              border: '1px solid var(--dc-error-border)',
              color: 'var(--dc-error)',
              fontSize: 12,
              padding: '8px 12px',
              borderRadius: 6,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}
        {message && (
          <div
            style={{
              backgroundColor: 'var(--dc-success-bg)',
              border: '1px solid var(--dc-success-border)',
              color: 'var(--dc-success)',
              fontSize: 12,
              padding: '8px 12px',
              borderRadius: 6,
              marginBottom: 12,
            }}
          >
            {message}
          </div>
        )}

        <form onSubmit={handlePasswordChange}>
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--dc-text-muted)',
                marginBottom: 4,
              }}
            >
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--dc-text-muted)',
                marginBottom: 4,
              }}
            >
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--dc-text-muted)',
                marginBottom: 4,
              }}
            >
              Confirm New Password
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
              padding: '6px 16px',
              backgroundColor: 'var(--dc-primary)',
              color: 'var(--dc-primary-content)',
              fontWeight: 500,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
      {user?.role === 'admin' && (
        <div
          style={{
            marginTop: 32,
            padding: 16,
            backgroundColor: 'var(--dc-surface)',
            borderRadius: 8,
            border: '1px solid var(--dc-error-border, #ef4444)',
          }}
        >
          <h3
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--dc-error, #ef4444)',
              marginBottom: 4,
              marginTop: 0,
            }}
          >
            Danger Zone
          </h3>
          <p
            style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginBottom: 12, marginTop: 0 }}
          >
            Regenerate the demo database with fresh sample data. Other connections are not affected.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleReseedDemo}
              disabled={reseeding}
              style={{
                padding: '6px 16px',
                backgroundColor: 'transparent',
                color: 'var(--dc-warning, #f59e0b)',
                fontWeight: 500,
                borderRadius: 6,
                border: '1px solid var(--dc-warning, #f59e0b)',
                cursor: reseeding ? 'not-allowed' : 'pointer',
                fontSize: 13,
                opacity: reseeding ? 0.5 : 1,
              }}
            >
              {reseeding ? 'Reseeding...' : 'Reseed Demo Data'}
            </button>
            <button
              onClick={handleClearDemo}
              disabled={clearing}
              style={{
                padding: '6px 16px',
                backgroundColor: 'transparent',
                color: 'var(--dc-warning, #f59e0b)',
                fontWeight: 500,
                borderRadius: 6,
                border: '1px solid var(--dc-warning, #f59e0b)',
                cursor: clearing ? 'not-allowed' : 'pointer',
                fontSize: 13,
                opacity: clearing ? 0.5 : 1,
              }}
            >
              {clearing ? 'Clearing...' : 'Clear Demo Data'}
            </button>
          </div>
          {reseedError && (
            <div
              style={{
                backgroundColor: 'var(--dc-error-bg)',
                border: '1px solid var(--dc-error-border)',
                color: 'var(--dc-error)',
                fontSize: 12,
                padding: '8px 12px',
                borderRadius: 6,
                marginTop: 12,
              }}
            >
              {reseedError}
            </div>
          )}
          {reseedMessage && (
            <div
              style={{
                backgroundColor: 'var(--dc-success-bg)',
                border: '1px solid var(--dc-success-border)',
                color: 'var(--dc-success)',
                fontSize: 12,
                padding: '8px 12px',
                borderRadius: 6,
                marginTop: 12,
              }}
            >
              {reseedMessage}
            </div>
          )}
          <div style={{ borderTop: '1px solid var(--dc-border)', margin: '16px 0' }} />
          <p
            style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginBottom: 12, marginTop: 0 }}
          >
            Permanently delete all data and reset Drizby to a fresh state. Demo data will be
            re-created on next server restart.
          </p>
          <button
            onClick={handleFactoryReset}
            disabled={resetting}
            style={{
              padding: '6px 16px',
              backgroundColor: 'transparent',
              color: 'var(--dc-error, #ef4444)',
              fontWeight: 500,
              borderRadius: 6,
              border: '1px solid var(--dc-error-border, #ef4444)',
              cursor: resetting ? 'not-allowed' : 'pointer',
              fontSize: 13,
              opacity: resetting ? 0.5 : 1,
            }}
          >
            {resetting ? 'Resetting...' : 'Factory Reset'}
          </button>
        </div>
      )}

      <ConfirmDialog />
      <PromptDialog />
    </div>
  )
}
