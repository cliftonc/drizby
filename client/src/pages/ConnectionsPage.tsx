import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useConfirm } from '../hooks/useConfirm'

interface Connection {
  id: number
  name: string
  description: string | null
  engineType: string
  provider: string | null
  connectionString?: string
  isActive: boolean
  createdAt: string
}

interface ConnectionFormData {
  name: string
  description: string
  engineType: string
  provider: string
  connectionString: string
}

interface ProviderDef {
  id: string
  label: string
  engineType: string
  connectionMode: 'connection-string' | 'structured'
  npmPackage: string
  placeholder?: string
  example?: string
  docUrl?: string
  helpText?: string
  structuredFields?: Array<{
    key: string
    label: string
    placeholder: string
    required: boolean
    secret?: boolean
  }>
}

const ENGINE_TYPES = [
  { id: 'postgres', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'singlestore', label: 'SingleStore' },
  { id: 'databend', label: 'Databend' },
  { id: 'duckdb', label: 'DuckDB' },
]

export default function ConnectionsPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [confirm, ConfirmDialog] = useConfirm()

  const { data: connections = [], isLoading } = useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: () => fetch('/api/connections').then(r => r.json()),
  })

  const { data: providers = [] } = useQuery<ProviderDef[]>({
    queryKey: ['providers'],
    queryFn: () => fetch('/api/connections/providers').then(r => r.json()),
  })

  // Fetch full connection details (with connectionString) when editing
  const { data: editingConnection } = useQuery<Connection>({
    queryKey: ['connections', editingId],
    queryFn: () => fetch(`/api/connections/${editingId}`).then(r => r.json()),
    enabled: editingId !== null,
  })

  const createMutation = useMutation({
    mutationFn: (data: ConnectionFormData) =>
      fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      setShowForm(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ConnectionFormData }) =>
      fetch(`/api/connections/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/connections/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] }),
  })

  const [testResult, setTestResult] = useState<
    Record<number, { success: boolean; message: string } | 'loading'>
  >({})

  const testConnection = async (id: number) => {
    setTestResult(prev => ({ ...prev, [id]: 'loading' }))
    try {
      const res = await fetch(`/api/connections/${id}/test`, { method: 'POST' })
      const data = await res.json()
      setTestResult(prev => ({ ...prev, [id]: data }))
      setTimeout(
        () =>
          setTestResult(prev => {
            const next = { ...prev }
            delete next[id]
            return next
          }),
        5000
      )
    } catch {
      setTestResult(prev => ({ ...prev, [id]: { success: false, message: 'Request failed' } }))
    }
  }

  const handleDelete = async (conn: Connection) => {
    const confirmed = await confirm({
      title: 'Delete Connection',
      message: `Are you sure you want to delete "${conn.name}"? Any schemas and cubes using this connection will stop working.`,
      confirmText: 'Delete',
      variant: 'danger',
    })
    if (confirmed) deleteMutation.mutate(conn.id)
  }

  const handleEdit = (conn: Connection) => {
    setShowForm(false)
    setEditingId(conn.id)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
  }

  const getProviderLabel = (conn: Connection) => {
    if (conn.provider) {
      const p = providers.find(p => p.id === conn.provider)
      if (p) return p.label
    }
    return conn.engineType
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--dc-text)' }}>
            Database Connections
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--dc-text-secondary)', fontSize: 14 }}>
            Manage connections to your data sources
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(!showForm)
            setEditingId(null)
          }}
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--dc-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {showForm ? 'Cancel' : 'Add Connection'}
        </button>
      </div>

      {showForm && (
        <ConnectionForm
          providers={providers}
          onSubmit={data => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
          onCancel={() => setShowForm(false)}
          showTest
        />
      )}

      {isLoading ? (
        <p style={{ color: 'var(--dc-text-secondary)' }}>Loading...</p>
      ) : connections.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            backgroundColor: 'var(--dc-surface)',
            borderRadius: 8,
            border: '1px solid var(--dc-border)',
          }}
        >
          <p style={{ color: 'var(--dc-text-secondary)', margin: 0 }}>
            No connections yet. Add a database connection to get started.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {connections.map(conn => (
            <div key={conn.id}>
              {editingId === conn.id && editingConnection ? (
                <ConnectionForm
                  providers={providers}
                  initial={{
                    name: editingConnection.name,
                    description: editingConnection.description || '',
                    engineType: editingConnection.engineType,
                    provider: editingConnection.provider || '',
                    connectionString: editingConnection.connectionString || '',
                  }}
                  onSubmit={data => updateMutation.mutate({ id: conn.id, data })}
                  isLoading={updateMutation.isPending}
                  onCancel={handleCancelEdit}
                  showTest
                  submitLabel="Save Changes"
                  title="Edit Connection"
                />
              ) : (
                <div
                  style={{
                    padding: 16,
                    backgroundColor: 'var(--dc-surface)',
                    borderRadius: 8,
                    border: '1px solid var(--dc-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 15,
                          fontWeight: 600,
                          color: 'var(--dc-text)',
                        }}
                      >
                        {conn.name}
                      </h3>
                      <span
                        style={{
                          fontSize: 11,
                          padding: '1px 6px',
                          borderRadius: 4,
                          backgroundColor: 'var(--dc-surface-hover)',
                          color: 'var(--dc-text-secondary)',
                        }}
                      >
                        {getProviderLabel(conn)}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          padding: '1px 6px',
                          borderRadius: 4,
                          backgroundColor: conn.isActive ? '#dcfce7' : '#fee2e2',
                          color: conn.isActive ? '#166534' : '#991b1b',
                        }}
                      >
                        {conn.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {conn.description && (
                      <p
                        style={{
                          margin: '4px 0 0',
                          fontSize: 13,
                          color: 'var(--dc-text-secondary)',
                        }}
                      >
                        {conn.description}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {testResult[conn.id] && testResult[conn.id] !== 'loading' && (
                      <span
                        style={{
                          fontSize: 11,
                          color: (testResult[conn.id] as { success: boolean; message: string })
                            .success
                            ? 'var(--dc-success, #22c55e)'
                            : 'var(--dc-error)',
                          marginRight: 4,
                        }}
                      >
                        {(testResult[conn.id] as { success: boolean; message: string }).message}
                      </span>
                    )}
                    <button
                      onClick={() => testConnection(conn.id)}
                      disabled={testResult[conn.id] === 'loading'}
                      style={{
                        padding: '4px 12px',
                        backgroundColor: 'transparent',
                        color: 'var(--dc-primary)',
                        border: '1px solid var(--dc-primary)',
                        borderRadius: 4,
                        cursor: testResult[conn.id] === 'loading' ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                        opacity: testResult[conn.id] === 'loading' ? 0.5 : 1,
                      }}
                    >
                      {testResult[conn.id] === 'loading' ? 'Testing...' : 'Test'}
                    </button>
                    <button
                      onClick={() => handleEdit(conn)}
                      style={{
                        padding: '4px 12px',
                        backgroundColor: 'transparent',
                        color: 'var(--dc-text-secondary)',
                        border: '1px solid var(--dc-border)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(conn)}
                      style={{
                        padding: '4px 12px',
                        backgroundColor: 'transparent',
                        color: 'var(--dc-error)',
                        border: '1px solid var(--dc-error)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog />
    </div>
  )
}

function ConnectionForm({
  providers,
  onSubmit,
  isLoading,
  onCancel,
  showTest,
  initial,
  submitLabel = 'Create Connection',
  title = 'New Connection',
}: {
  providers: ProviderDef[]
  onSubmit: (data: ConnectionFormData) => void
  isLoading: boolean
  onCancel: () => void
  showTest?: boolean
  initial?: ConnectionFormData
  submitLabel?: string
  title?: string
}) {
  const [form, setForm] = useState<ConnectionFormData>(
    initial ?? {
      name: '',
      description: '',
      engineType: 'postgres',
      provider: 'postgres-js',
      connectionString: '',
    }
  )
  const [structuredConfig, setStructuredConfig] = useState<Record<string, string>>(() => {
    // If editing a structured provider, parse the JSON connection string
    if (initial?.connectionString) {
      try {
        const parsed = JSON.parse(initial.connectionString)
        if (typeof parsed === 'object' && parsed !== null) return parsed
      } catch {}
    }
    return {}
  })
  const [testResult, setTestResult] = useState<
    { success: boolean; message: string } | 'loading' | null
  >(null)

  const selectedProvider = providers.find(p => p.id === form.provider)
  const engineProviders = providers.filter(p => p.engineType === form.engineType)
  const isStructured = selectedProvider?.connectionMode === 'structured'

  // When engine type changes, select the first provider for that engine
  useEffect(() => {
    if (!initial) {
      const firstProvider = providers.find(p => p.engineType === form.engineType)
      if (
        firstProvider &&
        !providers.some(p => p.id === form.provider && p.engineType === form.engineType)
      ) {
        setForm(f => ({ ...f, provider: firstProvider.id, connectionString: '' }))
        setStructuredConfig({})
      }
    }
  }, [form.engineType, form.provider, providers, initial])

  const getConnectionStringForSubmit = (): string => {
    if (isStructured) {
      return JSON.stringify(structuredConfig)
    }
    return form.connectionString
  }

  const handleTest = async () => {
    setTestResult('loading')
    try {
      const res = await fetch('/api/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engineType: form.engineType,
          provider: form.provider,
          connectionString: getConnectionStringForSubmit(),
        }),
      })
      const data = await res.json()
      setTestResult(data)
    } catch {
      setTestResult({ success: false, message: 'Request failed' })
    }
  }

  const handleSubmit = () => {
    onSubmit({
      ...form,
      connectionString: getConnectionStringForSubmit(),
    })
  }

  const hasRequiredFields = (): boolean => {
    if (!form.name) return false
    if (isStructured) {
      return (selectedProvider?.structuredFields || [])
        .filter(f => f.required)
        .every(f => structuredConfig[f.key])
    }
    return !!form.connectionString
  }

  return (
    <div
      style={{
        padding: 20,
        backgroundColor: 'var(--dc-surface)',
        borderRadius: 8,
        border: '1px solid var(--dc-border)',
        marginBottom: 16,
      }}
    >
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: 'var(--dc-text)' }}>
        {title}
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Name</label>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="My Database"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Engine Type</label>
          <select
            value={form.engineType}
            onChange={e => {
              const engineType = e.target.value
              const firstProvider = providers.find(p => p.engineType === engineType)
              setForm(f => ({
                ...f,
                engineType,
                provider: firstProvider?.id || engineType,
                connectionString: '',
              }))
              setStructuredConfig({})
            }}
            style={inputStyle}
          >
            {ENGINE_TYPES.map(e => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </div>

        {/* Provider selector */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Provider</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            {engineProviders.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setForm(f => ({ ...f, provider: p.id, connectionString: '' }))
                  setStructuredConfig({})
                  setTestResult(null)
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  borderRadius: 6,
                  cursor: 'pointer',
                  border:
                    form.provider === p.id
                      ? '1.5px solid var(--dc-primary)'
                      : '1px solid var(--dc-border)',
                  backgroundColor:
                    form.provider === p.id
                      ? 'var(--dc-primary-bg, rgba(59,130,246,0.08))'
                      : 'var(--dc-background)',
                  color: form.provider === p.id ? 'var(--dc-primary)' : 'var(--dc-text)',
                  fontWeight: form.provider === p.id ? 500 : 400,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Provider help text + doc link */}
        {selectedProvider && (
          <div style={{ gridColumn: '1 / -1' }}>
            <div
              style={{
                fontSize: 12,
                color: 'var(--dc-text-muted)',
                backgroundColor: 'var(--dc-background)',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--dc-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <span>
                {selectedProvider.helpText}
                {selectedProvider.npmPackage && (
                  <span style={{ color: 'var(--dc-text-muted)', opacity: 0.7 }}>
                    {' '}
                    (npm: <code style={{ fontSize: 11 }}>{selectedProvider.npmPackage}</code>)
                  </span>
                )}
              </span>
              {selectedProvider.docUrl && (
                <a
                  href={selectedProvider.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 11,
                    color: 'var(--dc-primary)',
                    whiteSpace: 'nowrap',
                    textDecoration: 'none',
                    flexShrink: 0,
                  }}
                >
                  Docs &rarr;
                </a>
              )}
            </div>
          </div>
        )}

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Description</label>
          <input
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Optional description"
            style={inputStyle}
          />
        </div>

        {/* Connection fields — structured or connection string */}
        {isStructured && selectedProvider?.structuredFields ? (
          selectedProvider.structuredFields.map(field => (
            <div key={field.key} style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>
                {field.label}
                {!field.required && (
                  <span style={{ fontWeight: 400, color: 'var(--dc-text-muted)', marginLeft: 4 }}>
                    (optional)
                  </span>
                )}
              </label>
              <input
                type={field.secret ? 'password' : 'text'}
                value={structuredConfig[field.key] || ''}
                onChange={e => setStructuredConfig(c => ({ ...c, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                style={inputStyle}
              />
            </div>
          ))
        ) : (
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>
              Connection String
              {selectedProvider?.example && (
                <span style={{ fontWeight: 400, color: 'var(--dc-text-muted)', marginLeft: 6 }}>
                  ({selectedProvider.example})
                </span>
              )}
            </label>
            <input
              value={form.connectionString}
              onChange={e => setForm(f => ({ ...f, connectionString: e.target.value }))}
              placeholder={selectedProvider?.placeholder || ''}
              style={inputStyle}
            />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <button
          onClick={handleSubmit}
          disabled={isLoading || !hasRequiredFields()}
          style={{
            padding: '8px 20px',
            backgroundColor: 'var(--dc-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
            opacity: isLoading || !hasRequiredFields() ? 0.5 : 1,
          }}
        >
          {isLoading ? 'Saving...' : submitLabel}
        </button>
        {showTest && (
          <button
            onClick={handleTest}
            disabled={testResult === 'loading' || !hasRequiredFields()}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              color: 'var(--dc-primary)',
              border: '1px solid var(--dc-primary)',
              borderRadius: 6,
              cursor: testResult === 'loading' || !hasRequiredFields() ? 'not-allowed' : 'pointer',
              fontSize: 14,
              opacity: testResult === 'loading' || !hasRequiredFields() ? 0.5 : 1,
            }}
          >
            {testResult === 'loading' ? 'Testing...' : 'Test Connection'}
          </button>
        )}
        <button
          onClick={onCancel}
          style={{
            padding: '8px 16px',
            backgroundColor: 'transparent',
            color: 'var(--dc-text-secondary)',
            border: '1px solid var(--dc-border)',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Cancel
        </button>
        {testResult && testResult !== 'loading' && (
          <span
            style={{
              fontSize: 12,
              color: testResult.success ? 'var(--dc-success, #22c55e)' : 'var(--dc-error)',
              maxWidth: 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {testResult.message}
          </span>
        )}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 4,
  color: 'var(--dc-text)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--dc-border)',
  borderRadius: 6,
  fontSize: 14,
  backgroundColor: 'var(--dc-background)',
  color: 'var(--dc-text)',
  boxSizing: 'border-box',
}
