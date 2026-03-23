import { useEffect, useState } from 'react'

export interface ConnectionFormData {
  name: string
  description: string
  engineType: string
  provider: string
  connectionString: string
}

export interface ProviderDef {
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

export const ENGINE_TYPES = [
  { id: 'postgres', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'singlestore', label: 'SingleStore' },
  { id: 'databend', label: 'Databend' },
  { id: 'snowflake', label: 'Snowflake' },
  { id: 'duckdb', label: 'DuckDB' },
]

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 4,
  color: 'var(--dc-text)',
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--dc-border)',
  borderRadius: 6,
  fontSize: 14,
  backgroundColor: 'var(--dc-background)',
  color: 'var(--dc-text)',
  boxSizing: 'border-box',
}

export function ConnectionForm({
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
    if (initial?.connectionString) {
      try {
        const parsed = JSON.parse(initial.connectionString)
        if (typeof parsed === 'object' && parsed !== null) return parsed
      } catch {}
    }
    return {}
  })
  const [showConnectionString, setShowConnectionString] = useState(!initial)
  const [testResult, setTestResult] = useState<
    { success: boolean; message: string } | 'loading' | null
  >(null)
  const selectedProvider = providers.find(p => p.id === form.provider)
  const engineProviders = providers.filter(p => p.engineType === form.engineType)
  const isStructured = selectedProvider?.connectionMode === 'structured'

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

  const handleTest = async (): Promise<boolean> => {
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
      return data.success === true
    } catch {
      setTestResult({ success: false, message: 'Request failed' })
      return false
    }
  }

  const handleSubmit = () => {
    onSubmit({
      ...form,
      connectionString: getConnectionStringForSubmit(),
    })
  }

  // Enter key: test first, if passes then submit
  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !hasRequiredFields() || isLoading || testResult === 'loading') return
    e.preventDefault()
    if (showTest) {
      const success = await handleTest()
      if (success) handleSubmit()
    } else {
      handleSubmit()
    }
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
      onKeyDown={handleKeyDown}
    >
      {title && (
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: 'var(--dc-text)' }}>
          {title}
        </h3>
      )}

      {/* Engine + Provider — compact row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ minWidth: 140 }}>
          <label style={labelStyle}>Engine</label>
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
        <div style={{ minWidth: 180 }}>
          <label style={labelStyle}>Provider</label>
          <select
            value={form.provider}
            onChange={e => {
              setForm(f => ({ ...f, provider: e.target.value, connectionString: '' }))
              setStructuredConfig({})
              setTestResult(null)
            }}
            style={inputStyle}
          >
            {engineProviders.map(p => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {selectedProvider && (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 11,
              color: 'var(--dc-text-muted)',
              alignSelf: 'flex-end',
              padding: '8px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedProvider.helpText}
            </span>
            {selectedProvider.docUrl && (
              <a
                href={selectedProvider.docUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--dc-primary)',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                Docs &rarr;
              </a>
            )}
          </div>
        )}
      </div>

      {/* Name + Connection String — the primary fields */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 200, flexShrink: 0 }}>
          <label style={labelStyle}>Name</label>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="My Database"
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isStructured && selectedProvider?.structuredFields ? (
            <>
              <label style={labelStyle}>Connection Details</label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 8,
                }}
              >
                {selectedProvider.structuredFields.map(field => (
                  <div key={field.key}>
                    <input
                      type={field.secret ? 'password' : 'text'}
                      value={structuredConfig[field.key] || ''}
                      onChange={e =>
                        setStructuredConfig(c => ({ ...c, [field.key]: e.target.value }))
                      }
                      placeholder={`${field.label}${field.required ? '' : ' (optional)'}`}
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <label style={labelStyle}>
                Connection String
                {selectedProvider?.example && (
                  <span style={{ fontWeight: 400, color: 'var(--dc-text-muted)', marginLeft: 6 }}>
                    ({selectedProvider.example})
                  </span>
                )}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConnectionString ? 'text' : 'password'}
                  value={form.connectionString}
                  onChange={e => setForm(f => ({ ...f, connectionString: e.target.value }))}
                  placeholder={selectedProvider?.placeholder || ''}
                  style={{ ...inputStyle, paddingRight: 36 }}
                />
                <button
                  type="button"
                  onClick={() => setShowConnectionString(v => !v)}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 2,
                    color: 'var(--dc-text-muted)',
                    fontSize: 12,
                    lineHeight: 1,
                  }}
                  title={showConnectionString ? 'Hide' : 'Show'}
                >
                  {showConnectionString ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>
          Description{' '}
          <span style={{ fontWeight: 400, color: 'var(--dc-text-muted)' }}>(optional)</span>
        </label>
        <input
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Optional description"
          style={inputStyle}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
            onClick={() => handleTest()}
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
        {showTest && hasRequiredFields() && (
          <span style={{ fontSize: 11, color: 'var(--dc-text-muted)', marginLeft: 'auto' }}>
            Press Enter to test &amp; save
          </span>
        )}
      </div>
    </div>
  )
}
