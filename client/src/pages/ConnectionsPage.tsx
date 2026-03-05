import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

interface Connection {
  id: number
  name: string
  description: string | null
  engineType: string
  isActive: boolean
  createdAt: string
}

export default function ConnectionsPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  const { data: connections = [], isLoading } = useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: () => fetch('/api/connections').then(r => r.json())
  })

  const createMutation = useMutation({
    mutationFn: (data: Record<string, string>) =>
      fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      setShowForm(false)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/connections/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] })
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--dc-text)' }}>Database Connections</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--dc-text-secondary)', fontSize: 14 }}>
            Manage connections to your data sources
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--dc-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500
          }}
        >
          {showForm ? 'Cancel' : 'Add Connection'}
        </button>
      </div>

      {showForm && (
        <ConnectionForm
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
        />
      )}

      {isLoading ? (
        <p style={{ color: 'var(--dc-text-secondary)' }}>Loading...</p>
      ) : connections.length === 0 ? (
        <div style={{
          padding: 40,
          textAlign: 'center',
          backgroundColor: 'var(--dc-surface)',
          borderRadius: 8,
          border: '1px solid var(--dc-border)'
        }}>
          <p style={{ color: 'var(--dc-text-secondary)', margin: 0 }}>
            No connections yet. Add a database connection to get started.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {connections.map(conn => (
            <div key={conn.id} style={{
              padding: 16,
              backgroundColor: 'var(--dc-surface)',
              borderRadius: 8,
              border: '1px solid var(--dc-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--dc-text)' }}>{conn.name}</h3>
                  <span style={{
                    fontSize: 11,
                    padding: '1px 6px',
                    borderRadius: 4,
                    backgroundColor: 'var(--dc-surface-hover)',
                    color: 'var(--dc-text-secondary)'
                  }}>
                    {conn.engineType}
                  </span>
                  <span style={{
                    fontSize: 11,
                    padding: '1px 6px',
                    borderRadius: 4,
                    backgroundColor: conn.isActive ? '#dcfce7' : '#fee2e2',
                    color: conn.isActive ? '#166534' : '#991b1b'
                  }}>
                    {conn.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {conn.description && (
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--dc-text-secondary)' }}>{conn.description}</p>
                )}
              </div>
              <button
                onClick={() => deleteMutation.mutate(conn.id)}
                style={{
                  padding: '4px 12px',
                  backgroundColor: 'transparent',
                  color: 'var(--dc-error)',
                  border: '1px solid var(--dc-error)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ConnectionForm({ onSubmit, isLoading }: {
  onSubmit: (data: Record<string, string>) => void
  isLoading: boolean
}) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    engineType: 'postgres',
    connectionString: ''
  })

  return (
    <div style={{
      padding: 20,
      backgroundColor: 'var(--dc-surface)',
      borderRadius: 8,
      border: '1px solid var(--dc-border)',
      marginBottom: 16
    }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: 'var(--dc-text)' }}>New Connection</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'var(--dc-text)' }}>Name</label>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="My Database"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'var(--dc-text)' }}>Engine Type</label>
          <select
            value={form.engineType}
            onChange={e => setForm(f => ({ ...f, engineType: e.target.value }))}
            style={inputStyle}
          >
            <option value="postgres">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="sqlite">SQLite</option>
            <option value="duckdb">DuckDB</option>
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'var(--dc-text)' }}>Description</label>
          <input
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Optional description"
            style={inputStyle}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'var(--dc-text)' }}>Connection String</label>
          <input
            value={form.connectionString}
            onChange={e => setForm(f => ({ ...f, connectionString: e.target.value }))}
            placeholder="postgresql://user:pass@host:5432/database"
            style={inputStyle}
          />
        </div>
      </div>
      <button
        onClick={() => onSubmit(form)}
        disabled={isLoading || !form.name || !form.connectionString}
        style={{
          marginTop: 12,
          padding: '8px 20px',
          backgroundColor: 'var(--dc-primary)',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 500,
          opacity: (isLoading || !form.name || !form.connectionString) ? 0.5 : 1
        }}
      >
        {isLoading ? 'Creating...' : 'Create Connection'}
      </button>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--dc-border)',
  borderRadius: 6,
  fontSize: 14,
  backgroundColor: 'var(--dc-background)',
  color: 'var(--dc-text)',
  boxSizing: 'border-box'
}
