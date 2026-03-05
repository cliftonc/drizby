import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'

interface UserRow {
  id: number
  email: string
  name: string
  role: string
  isBlocked: boolean
  createdAt: string
}

export default function TeamPage() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = currentUser?.role === 'admin'

  const [showCreate, setShowCreate] = useState(false)
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'member' })
  const [createError, setCreateError] = useState('')

  const { data: users = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await fetch('/api/users', { credentials: 'include' })
      if (res.status === 403) return []
      if (!res.ok) throw new Error('Failed to fetch users')
      return res.json()
    }
  })

  const createMutation = useMutation({
    mutationFn: async (data: typeof newUser) => {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setShowCreate(false)
      setNewUser({ name: '', email: '', password: '', role: 'member' })
      setCreateError('')
    },
    onError: (err: Error) => setCreateError(err.message)
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; role?: string; isBlocked?: boolean }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] })
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] })
  })

  if (isLoading) return <div style={{ color: 'var(--dc-text-muted)' }}>Loading...</div>

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 12px', backgroundColor: 'var(--dc-input-bg)', border: '1px solid var(--dc-input-border)',
    borderRadius: 6, color: 'var(--dc-input-text)', fontSize: 13, outline: 'none', boxSizing: 'border-box'
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--dc-text)', margin: 0 }}>Team</h2>
        {isAdmin && (
          <button
            onClick={() => setShowCreate(!showCreate)}
            style={{ padding: '6px 16px', backgroundColor: 'var(--dc-primary)', color: 'var(--dc-primary-content)', fontWeight: 500, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13 }}
          >
            {showCreate ? 'Cancel' : 'Add User'}
          </button>
        )}
      </div>

      {showCreate && (
        <div style={{ marginBottom: 24, padding: 16, backgroundColor: 'var(--dc-surface)', borderRadius: 8, border: '1px solid var(--dc-border)' }}>
          {createError && (
            <div style={{ backgroundColor: 'var(--dc-error-bg)', border: '1px solid var(--dc-error-border)', color: 'var(--dc-error)', fontSize: 12, padding: '8px 12px', borderRadius: 6, marginBottom: 12 }}>{createError}</div>
          )}
          <form onSubmit={e => { e.preventDefault(); createMutation.mutate(newUser) }} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--dc-text-muted)', marginBottom: 4 }}>Name</label>
              <input value={newUser.name} onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))} required style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--dc-text-muted)', marginBottom: 4 }}>Email</label>
              <input type="email" value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} required style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--dc-text-muted)', marginBottom: 4 }}>Password</label>
              <input type="password" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} placeholder="Optional for OAuth" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--dc-text-muted)', marginBottom: 4 }}>Role</label>
              <select value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))} style={inputStyle}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                type="submit"
                disabled={createMutation.isPending}
                style={{ padding: '6px 16px', backgroundColor: 'var(--dc-primary)', color: 'var(--dc-primary-content)', fontWeight: 500, borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, opacity: createMutation.isPending ? 0.5 : 1 }}
              >
                {createMutation.isPending ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ border: '1px solid var(--dc-border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--dc-surface-secondary)', color: 'var(--dc-text-muted)', textAlign: 'left' }}>
              <th style={{ padding: '8px 16px', fontWeight: 500 }}>Name</th>
              <th style={{ padding: '8px 16px', fontWeight: 500 }}>Email</th>
              <th style={{ padding: '8px 16px', fontWeight: 500 }}>Role</th>
              <th style={{ padding: '8px 16px', fontWeight: 500 }}>Status</th>
              {isAdmin && <th style={{ padding: '8px 16px', fontWeight: 500 }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id} style={{ color: 'var(--dc-text-secondary)', borderTop: i > 0 ? '1px solid var(--dc-border)' : undefined }}>
                <td style={{ padding: '8px 16px' }}>
                  {u.name}
                  {u.id === currentUser?.id && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--dc-text-muted)' }}>(you)</span>}
                </td>
                <td style={{ padding: '8px 16px', color: 'var(--dc-text-muted)' }}>{u.email}</td>
                <td style={{ padding: '8px 16px' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11,
                    backgroundColor: u.role === 'admin' ? 'var(--dc-badge-admin-bg)' : 'var(--dc-muted-bg)',
                    color: u.role === 'admin' ? 'var(--dc-badge-admin-text)' : 'var(--dc-text-muted)'
                  }}>
                    {u.role}
                  </span>
                </td>
                <td style={{ padding: '8px 16px' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11,
                    backgroundColor: u.isBlocked ? 'var(--dc-badge-blocked-bg)' : 'var(--dc-badge-active-bg)',
                    color: u.isBlocked ? 'var(--dc-badge-blocked-text)' : 'var(--dc-badge-active-text)'
                  }}>
                    {u.isBlocked ? 'Blocked' : 'Active'}
                  </span>
                </td>
                {isAdmin && (
                  <td style={{ padding: '8px 16px' }}>
                    {u.id !== currentUser?.id && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => updateMutation.mutate({ id: u.id, role: u.role === 'admin' ? 'member' : 'admin' })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--dc-primary)' }}>
                          {u.role === 'admin' ? 'Demote' : 'Promote'}
                        </button>
                        <button onClick={() => updateMutation.mutate({ id: u.id, isBlocked: !u.isBlocked })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--dc-warning)' }}>
                          {u.isBlocked ? 'Unblock' : 'Block'}
                        </button>
                        <button onClick={() => { if (confirm(`Delete ${u.name}?`)) deleteMutation.mutate(u.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--dc-error)' }}>
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
