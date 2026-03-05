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

  if (isLoading) return <div className="text-gray-400">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">Team</h2>
        {isAdmin && (
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="py-1.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
          >
            {showCreate ? 'Cancel' : 'Add User'}
          </button>
        )}
      </div>

      {showCreate && (
        <div className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          {createError && (
            <div className="bg-red-900/50 border border-red-700 text-red-200 text-sm px-3 py-2 rounded mb-3">{createError}</div>
          )}
          <form onSubmit={e => { e.preventDefault(); createMutation.mutate(newUser) }} className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input
                value={newUser.name}
                onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))}
                required
                className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={newUser.email}
                onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))}
                required
                className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Password</label>
              <input
                type="password"
                value={newUser.password}
                onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
                className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="Optional for OAuth users"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Role</label>
              <select
                value={newUser.role}
                onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}
                className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="py-1.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
              >
                {createMutation.isPending ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800/50 text-gray-400 text-left">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Status</th>
              {isAdmin && <th className="px-4 py-2 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {users.map(u => (
              <tr key={u.id} className="text-gray-300">
                <td className="px-4 py-2">
                  {u.name}
                  {u.id === currentUser?.id && <span className="ml-2 text-xs text-gray-500">(you)</span>}
                </td>
                <td className="px-4 py-2 text-gray-400">{u.email}</td>
                <td className="px-4 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs ${u.role === 'admin' ? 'bg-purple-900/50 text-purple-300' : 'bg-gray-700 text-gray-300'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs ${u.isBlocked ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300'}`}>
                    {u.isBlocked ? 'Blocked' : 'Active'}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-4 py-2">
                    {u.id !== currentUser?.id && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateMutation.mutate({ id: u.id, role: u.role === 'admin' ? 'member' : 'admin' })}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          {u.role === 'admin' ? 'Demote' : 'Promote'}
                        </button>
                        <button
                          onClick={() => updateMutation.mutate({ id: u.id, isBlocked: !u.isBlocked })}
                          className="text-xs text-yellow-400 hover:text-yellow-300"
                        >
                          {u.isBlocked ? 'Unblock' : 'Block'}
                        </button>
                        <button
                          onClick={() => { if (confirm(`Delete ${u.name}?`)) deleteMutation.mutate(u.id) }}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
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
