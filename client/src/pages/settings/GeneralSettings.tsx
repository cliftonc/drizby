import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'

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
        body: JSON.stringify({ currentPassword, newPassword })
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

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 12px', backgroundColor: 'var(--dc-input-bg)', border: '1px solid var(--dc-input-border)',
    borderRadius: 6, color: 'var(--dc-input-text)', fontSize: 13, outline: 'none', boxSizing: 'border-box'
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--dc-text)', marginBottom: 24, marginTop: 0 }}>Your Profile</h2>

      <div style={{ marginBottom: 32, padding: 16, backgroundColor: 'var(--dc-surface)', borderRadius: 8, border: '1px solid var(--dc-border)' }}>
        <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--dc-text-secondary)', marginBottom: 12, marginTop: 0 }}>Profile</h3>
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
            <span style={{ color: 'var(--dc-text)', textTransform: 'capitalize' }}>{user?.role}</span>
          </div>
        </div>
      </div>

      <div style={{ padding: 16, backgroundColor: 'var(--dc-surface)', borderRadius: 8, border: '1px solid var(--dc-border)' }}>
        <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--dc-text-secondary)', marginBottom: 12, marginTop: 0 }}>Change Password</h3>

        {error && (
          <div style={{ backgroundColor: 'var(--dc-error-bg)', border: '1px solid var(--dc-error-border)', color: 'var(--dc-error)', fontSize: 12, padding: '8px 12px', borderRadius: 6, marginBottom: 12 }}>{error}</div>
        )}
        {message && (
          <div style={{ backgroundColor: 'var(--dc-success-bg)', border: '1px solid var(--dc-success-border)', color: 'var(--dc-success)', fontSize: 12, padding: '8px 12px', borderRadius: 6, marginBottom: 12 }}>{message}</div>
        )}

        <form onSubmit={handlePasswordChange}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--dc-text-muted)', marginBottom: 4 }}>Current Password</label>
            <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--dc-text-muted)', marginBottom: 4 }}>New Password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--dc-text-muted)', marginBottom: 4 }}>Confirm New Password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required style={inputStyle} />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ padding: '6px 16px', backgroundColor: 'var(--dc-primary)', color: 'var(--dc-primary-content)', fontWeight: 500, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, opacity: loading ? 0.5 : 1 }}
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
