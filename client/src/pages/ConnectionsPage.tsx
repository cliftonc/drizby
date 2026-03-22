import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ConnectionForm,
  type ConnectionFormData,
  type ProviderDef,
} from '../components/ConnectionForm'
import { QuickSetupWizard } from '../components/QuickSetupWizard'
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

export default function ConnectionsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showQuickSetup, setShowQuickSetup] = useState(false)
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              setShowForm(!showForm)
              setEditingId(null)
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              color: 'var(--dc-primary)',
              border: '1px solid var(--dc-primary)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {showForm ? 'Cancel' : 'Add Connection'}
          </button>
          <button
            onClick={() => setShowQuickSetup(true)}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--dc-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Setup Connection & Semantic Layer
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
          </button>
        </div>
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
                    <button
                      onClick={() => navigate(`/schema-editor/${conn.id}`)}
                      style={{
                        padding: '4px 10px',
                        backgroundColor: 'transparent',
                        color: 'var(--dc-primary)',
                        border: '1px solid var(--dc-primary)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                      </svg>
                      Semantic Layer
                    </button>
                    <div
                      style={{
                        width: 1,
                        height: 20,
                        backgroundColor: 'var(--dc-border)',
                        marginLeft: 2,
                        marginRight: 2,
                      }}
                    />
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
      <QuickSetupWizard
        isOpen={showQuickSetup}
        onClose={() => setShowQuickSetup(false)}
        onComplete={connId => {
          setShowQuickSetup(false)
          queryClient.invalidateQueries({ queryKey: ['connections'] })
          navigate(`/schema-editor/${connId}`)
        }}
      />
    </div>
  )
}
