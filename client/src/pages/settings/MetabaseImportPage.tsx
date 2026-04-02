import { useCallback, useRef, useState } from 'react'
import type { MappedDatabase } from './metabase-types'

// --- Types ---

interface MetabaseDashboardSummary {
  id: number
  name: string
  description?: string | null
  collection?: string | null
}

interface ConnectionEntry {
  metabaseId: number
  name: string
  engineType: string
  provider: string
  connectionString: string
  tested: 'untested' | 'testing' | 'success' | 'failed'
}

interface SSEEvent {
  event: string
  data: any
}

interface ImportResult {
  connections: Array<{ metabaseId: number; drizbyId: number; name: string }>
  dashboards: Array<{ metabaseId: number; drizbyId: number; name: string; portletCount: number }>
}

type Step = 'connect' | 'databases' | 'credentials' | 'dashboards' | 'importing' | 'done'

// --- Styles ---

const h2Style = {
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--dc-text)',
  margin: '0 0 8px',
} as const
const subtitleStyle = {
  fontSize: 13,
  color: 'var(--dc-text-muted)',
  marginTop: 0,
  marginBottom: 24,
} as const
const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--dc-text)',
  marginBottom: 6,
} as const
const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 13,
  border: '1px solid var(--dc-border)',
  borderRadius: 6,
  backgroundColor: 'var(--dc-surface)',
  color: 'var(--dc-text)',
  outline: 'none',
  boxSizing: 'border-box' as const,
}
const btnPrimary = {
  padding: '8px 20px',
  fontSize: 13,
  fontWeight: 500,
  border: 'none',
  borderRadius: 6,
  backgroundColor: 'var(--dc-primary)',
  color: '#fff',
  cursor: 'pointer',
}
const btnSecondary = {
  padding: '8px 20px',
  fontSize: 13,
  fontWeight: 500,
  border: '1px solid var(--dc-border)',
  borderRadius: 6,
  backgroundColor: 'transparent',
  color: 'var(--dc-text)',
  cursor: 'pointer',
}
const cardStyle = {
  padding: 16,
  border: '1px solid var(--dc-border)',
  borderRadius: 8,
  backgroundColor: 'var(--dc-surface)',
}

// --- Component ---

export default function MetabaseImportPage() {
  const [step, setStep] = useState<Step>('connect')

  // Step 1: Connect
  const [metabaseUrl, setMetabaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [connectedUser, setConnectedUser] = useState<{ name: string; email: string } | null>(null)
  const [connectError, setConnectError] = useState('')
  const [connecting, setConnecting] = useState(false)

  // Step 2: Databases
  const [databases, setDatabases] = useState<MappedDatabase[]>([])
  const [selectedDbIds, setSelectedDbIds] = useState<Set<number>>(new Set())
  const [loadingDbs, setLoadingDbs] = useState(false)

  // Step 3: Credentials
  const [connectionEntries, setConnectionEntries] = useState<ConnectionEntry[]>([])

  // Step 4: Dashboards
  const [dashboards, setDashboards] = useState<MetabaseDashboardSummary[]>([])
  const [selectedDashIds, setSelectedDashIds] = useState<Set<number>>(new Set())
  const [loadingDash, setLoadingDash] = useState(false)

  // Step 5: Import progress
  const [importLogs, setImportLogs] = useState<SSEEvent[]>([])
  const [importPhase, setImportPhase] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [, setImportDone] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // --- Step 1: Connect ---

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    setConnectError('')
    try {
      const resp = await fetch('/api/metabase-import/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: metabaseUrl, sessionToken: apiKey }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Connection failed')

      setConnectedUser(data.user)

      // Immediately fetch databases
      setLoadingDbs(true)
      const dbResp = await fetch('/api/metabase-import/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: metabaseUrl, sessionToken: apiKey }),
      })
      const dbData = await dbResp.json()
      if (!dbResp.ok) throw new Error(dbData.error || 'Failed to fetch databases')

      const dbs: MappedDatabase[] = dbData.databases
      setDatabases(dbs)
      // Auto-select supported databases (excluding h2)
      setSelectedDbIds(new Set(dbs.filter(d => d.supported).map(d => d.metabaseId)))
      setLoadingDbs(false)
      setStep('databases')
    } catch (err: any) {
      setConnectError(err.message)
    } finally {
      setConnecting(false)
    }
  }, [metabaseUrl, apiKey])

  // --- Step 2 → 3: Databases → Credentials ---

  const handleDatabasesNext = useCallback(() => {
    const entries = databases
      .filter(d => selectedDbIds.has(d.metabaseId))
      .map(d => ({
        metabaseId: d.metabaseId,
        name: d.name,
        engineType: d.drizbyEngineType!,
        provider: d.drizbyProvider!,
        connectionString: d.connectionStringTemplate?.replace('__PASSWORD__', '') || '',
        tested: 'untested' as const,
      }))
    setConnectionEntries(entries)
    setStep('credentials')
  }, [databases, selectedDbIds])

  // --- Step 3: Test connection ---

  const handleTestConnection = useCallback(
    async (index: number) => {
      const entries = [...connectionEntries]
      entries[index] = { ...entries[index], tested: 'testing' }
      setConnectionEntries(entries)

      try {
        const entry = entries[index]
        const resp = await fetch('/api/connections/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            engineType: entry.engineType,
            connectionString: entry.connectionString,
            provider: entry.provider,
          }),
        })
        const data = await resp.json()
        entries[index] = { ...entries[index], tested: data.success ? 'success' : 'failed' }
      } catch {
        entries[index] = { ...entries[index], tested: 'failed' }
      }
      setConnectionEntries([...entries])
    },
    [connectionEntries]
  )

  // --- Step 3 → 4: Credentials → Dashboards ---

  const handleCredentialsNext = useCallback(async () => {
    setLoadingDash(true)
    try {
      const resp = await fetch('/api/metabase-import/dashboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: metabaseUrl, sessionToken: apiKey }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to fetch dashboards')

      setDashboards(data.dashboards)
      setSelectedDashIds(new Set(data.dashboards.map((d: any) => d.id)))
      setStep('dashboards')
    } catch (err: any) {
      setConnectError(err.message)
    } finally {
      setLoadingDash(false)
    }
  }, [metabaseUrl, apiKey])

  // --- Step 4 → 5: Execute import ---

  const handleExecute = useCallback(async () => {
    setStep('importing')
    setImportLogs([])
    setImportPhase('')
    setImportMessage('')
    setImportResult(null)
    setImportDone(false)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const resp = await fetch('/api/metabase-import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: metabaseUrl,
          sessionToken: apiKey,
          databases: connectionEntries.map(e => ({
            metabaseId: e.metabaseId,
            name: e.name,
            engineType: e.engineType,
            provider: e.provider,
            connectionString: e.connectionString,
          })),
          dashboardIds: [...selectedDashIds],
        }),
        signal: controller.signal,
      })

      if (!resp.ok || !resp.body) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data.error || `Request failed: ${resp.status}`)
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let currentEvent = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              const evt: SSEEvent = { event: currentEvent, data }
              setImportLogs(prev => [...prev, evt])

              if (currentEvent === 'phase') {
                setImportPhase(`${data.phase}: ${data.status}`)
              }
              if (currentEvent === 'progress') {
                setImportMessage(data.message || '')
              }
              if (currentEvent === 'warning') {
                setImportMessage(`Warning: ${data.message}`)
              }
              if (currentEvent === 'error') {
                setImportMessage(`Error: ${data.message}`)
              }
              if (currentEvent === 'complete') {
                setImportResult(data)
                setImportDone(true)
                setStep('done')
              }
            } catch {
              // Skip malformed data
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setImportMessage(`Import failed: ${err.message}`)
      }
    }
  }, [metabaseUrl, apiKey, connectionEntries, selectedDashIds])

  // --- Render ---

  return (
    <div style={{ maxWidth: 800 }}>
      <h2 style={h2Style}>Migrate from Metabase</h2>
      <p style={subtitleStyle}>
        Import database connections, schemas, cubes, and dashboards from a Metabase instance.
      </p>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 32, flexWrap: 'wrap' }}>
        {(['connect', 'databases', 'credentials', 'dashboards', 'importing', 'done'] as Step[]).map(
          (s, i) => {
            const labels = ['Connect', 'Databases', 'Credentials', 'Dashboards', 'Import', 'Done']
            const isActive = s === step
            const isPast =
              ['connect', 'databases', 'credentials', 'dashboards', 'importing', 'done'].indexOf(
                step
              ) > i
            return (
              <div
                key={s}
                style={{
                  padding: '4px 12px',
                  borderRadius: 9999,
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  backgroundColor: isActive
                    ? 'var(--dc-primary)'
                    : isPast
                      ? 'rgba(var(--dc-primary-rgb), 0.15)'
                      : 'var(--dc-surface-hover)',
                  color: isActive ? '#fff' : isPast ? 'var(--dc-primary)' : 'var(--dc-text-muted)',
                }}
              >
                {i + 1}. {labels[i]}
              </div>
            )
          }
        )}
      </div>

      {/* Step 1: Connect */}
      {step === 'connect' && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)', marginTop: 0 }}>
            Connect to Metabase
          </h3>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Metabase URL</label>
            <input
              style={inputStyle}
              placeholder="https://metabase.example.com or http://localhost:3000"
              value={metabaseUrl}
              onChange={e => setMetabaseUrl(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>API Key</label>
            <input
              style={inputStyle}
              placeholder="mb_xxxx..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
            <p
              style={{ fontSize: 11, color: 'var(--dc-text-muted)', marginTop: 4, marginBottom: 0 }}
            >
              Create an API key in Metabase under Admin &gt; Settings &gt; Authentication &gt; API
              Keys
            </p>
          </div>

          {connectError && (
            <p style={{ color: 'var(--dc-danger)', fontSize: 13, marginBottom: 12 }}>
              {connectError}
            </p>
          )}

          <button
            style={{ ...btnPrimary, opacity: connecting ? 0.7 : 1 }}
            onClick={handleConnect}
            disabled={connecting || !metabaseUrl || !apiKey}
          >
            {connecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      )}

      {/* Step 2: Databases */}
      {step === 'databases' && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)', marginTop: 0 }}>
            Select Databases to Import
          </h3>
          {connectedUser && (
            <p
              style={{
                fontSize: 12,
                color: 'var(--dc-text-muted)',
                marginTop: 0,
                marginBottom: 16,
              }}
            >
              Connected as {connectedUser.name} ({connectedUser.email})
            </p>
          )}

          {loadingDbs ? (
            <p style={{ fontSize: 13, color: 'var(--dc-text-muted)' }}>Loading databases...</p>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--dc-border)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 500 }} />
                    <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 500 }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 500 }}>
                      Engine
                    </th>
                    <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 500 }}>
                      Drizby Type
                    </th>
                    <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 500 }}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {databases.map(db => (
                    <tr
                      key={db.metabaseId}
                      style={{
                        borderBottom: '1px solid var(--dc-border)',
                        opacity: db.supported ? 1 : 0.5,
                      }}
                    >
                      <td style={{ padding: '8px 4px' }}>
                        <input
                          type="checkbox"
                          disabled={!db.supported}
                          checked={selectedDbIds.has(db.metabaseId)}
                          onChange={e => {
                            const next = new Set(selectedDbIds)
                            e.target.checked ? next.add(db.metabaseId) : next.delete(db.metabaseId)
                            setSelectedDbIds(next)
                          }}
                        />
                      </td>
                      <td style={{ padding: '8px 4px' }}>{db.name}</td>
                      <td style={{ padding: '8px 4px', color: 'var(--dc-text-muted)' }}>
                        {db.engine}
                      </td>
                      <td style={{ padding: '8px 4px' }}>{db.drizbyEngineType || '—'}</td>
                      <td style={{ padding: '8px 4px' }}>
                        {db.supported ? (
                          <span style={{ color: 'var(--dc-success)' }}>Supported</span>
                        ) : (
                          <span style={{ color: 'var(--dc-danger)', fontSize: 12 }}>
                            {db.unsupportedReason}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button style={btnSecondary} onClick={() => setStep('connect')}>
                  Back
                </button>
                <button
                  style={{ ...btnPrimary, opacity: selectedDbIds.size === 0 ? 0.5 : 1 }}
                  onClick={handleDatabasesNext}
                  disabled={selectedDbIds.size === 0}
                >
                  Next: Enter Credentials
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 3: Credentials */}
      {step === 'credentials' && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)', marginTop: 0 }}>
            Enter Connection Credentials
          </h3>
          <p
            style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginTop: 0, marginBottom: 16 }}
          >
            Metabase redacts passwords — you&apos;ll need to enter the connection string for each
            database.
          </p>

          {connectionEntries.map((entry, i) => (
            <div
              key={entry.metabaseId}
              style={{
                ...cardStyle,
                marginBottom: 12,
                border: '1px solid var(--dc-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <strong style={{ fontSize: 14 }}>{entry.name}</strong>
                <span
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 4,
                    backgroundColor: 'var(--dc-surface-hover)',
                    color: 'var(--dc-text-muted)',
                  }}
                >
                  {entry.engineType}
                </span>
                {entry.tested === 'success' && (
                  <span style={{ color: 'var(--dc-success)', fontSize: 12 }}>Connected</span>
                )}
                {entry.tested === 'failed' && (
                  <span style={{ color: 'var(--dc-danger)', fontSize: 12 }}>Failed</span>
                )}
                {entry.tested === 'testing' && (
                  <span style={{ color: 'var(--dc-text-muted)', fontSize: 12 }}>Testing...</span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder={'Connection string (e.g. postgresql://user:pass@host:5432/db)'}
                  value={entry.connectionString}
                  onChange={e => {
                    const next = [...connectionEntries]
                    next[i] = { ...next[i], connectionString: e.target.value, tested: 'untested' }
                    setConnectionEntries(next)
                  }}
                />
                <button
                  style={btnSecondary}
                  onClick={() => handleTestConnection(i)}
                  disabled={entry.tested === 'testing' || !entry.connectionString}
                >
                  Test
                </button>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button style={btnSecondary} onClick={() => setStep('databases')}>
              Back
            </button>
            <button
              style={{
                ...btnPrimary,
                opacity: connectionEntries.every(e => e.connectionString) ? 1 : 0.5,
              }}
              onClick={handleCredentialsNext}
              disabled={!connectionEntries.every(e => e.connectionString) || loadingDash}
            >
              {loadingDash ? 'Loading dashboards...' : 'Next: Select Dashboards'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Dashboards */}
      {step === 'dashboards' && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)', marginTop: 0 }}>
            Select Dashboards to Import
          </h3>

          {dashboards.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--dc-text-muted)' }}>
              No dashboards found in Metabase.
            </p>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <label
                  style={{
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedDashIds.size === dashboards.length}
                    onChange={e =>
                      setSelectedDashIds(
                        e.target.checked ? new Set(dashboards.map(d => d.id)) : new Set()
                      )
                    }
                  />
                  Select All
                </label>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--dc-border)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 500 }} />
                    <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 500 }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 500 }}>
                      Collection
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dashboards.map(d => (
                    <tr key={d.id} style={{ borderBottom: '1px solid var(--dc-border)' }}>
                      <td style={{ padding: '8px 4px' }}>
                        <input
                          type="checkbox"
                          checked={selectedDashIds.has(d.id)}
                          onChange={e => {
                            const next = new Set(selectedDashIds)
                            e.target.checked ? next.add(d.id) : next.delete(d.id)
                            setSelectedDashIds(next)
                          }}
                        />
                      </td>
                      <td style={{ padding: '8px 4px' }}>{d.name}</td>
                      <td style={{ padding: '8px 4px', color: 'var(--dc-text-muted)' }}>
                        {d.collection || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button style={btnSecondary} onClick={() => setStep('credentials')}>
              Back
            </button>
            <button style={btnPrimary} onClick={handleExecute}>
              Start Import ({connectionEntries.length} connection
              {connectionEntries.length !== 1 ? 's' : ''}
              {selectedDashIds.size > 0
                ? `, ${selectedDashIds.size} dashboard${selectedDashIds.size !== 1 ? 's' : ''}`
                : ''}
              )
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Importing */}
      {step === 'importing' && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)', marginTop: 0 }}>
            Importing from Metabase...
          </h3>

          <div
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 6,
              backgroundColor: 'var(--dc-surface-hover)',
            }}
          >
            <div
              style={{ fontSize: 13, fontWeight: 500, color: 'var(--dc-text)', marginBottom: 4 }}
            >
              {importPhase || 'Starting...'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--dc-text-muted)' }}>
              {importMessage || 'Preparing import...'}
            </div>
          </div>

          {/* Scrollable log */}
          <div
            style={{
              maxHeight: 300,
              overflowY: 'auto',
              fontSize: 12,
              fontFamily: 'monospace',
              padding: 12,
              borderRadius: 6,
              backgroundColor: 'var(--dc-bg)',
              border: '1px solid var(--dc-border)',
            }}
          >
            {importLogs.map((log, i) => (
              <div
                key={i}
                style={{
                  color:
                    log.event === 'error'
                      ? 'var(--dc-danger)'
                      : log.event === 'warning'
                        ? '#c59000'
                        : 'var(--dc-text-muted)',
                  marginBottom: 2,
                }}
              >
                [{log.event}] {log.data.message || log.data.phase || JSON.stringify(log.data)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 6: Done */}
      {step === 'done' && importResult && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-success)', marginTop: 0 }}>
            Import Complete
          </h3>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
              Connections ({importResult.connections.length})
            </div>
            {importResult.connections.map(c => (
              <div
                key={c.drizbyId}
                style={{ fontSize: 13, color: 'var(--dc-text-muted)', marginBottom: 4 }}
              >
                {c.name}
              </div>
            ))}
          </div>

          {importResult.dashboards.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                Dashboards ({importResult.dashboards.length})
              </div>
              {importResult.dashboards.map(d => (
                <div key={d.drizbyId} style={{ fontSize: 13, marginBottom: 4 }}>
                  <a
                    href={`/dashboards/${d.drizbyId}`}
                    style={{ color: 'var(--dc-primary)', textDecoration: 'none' }}
                  >
                    {d.name}
                  </a>
                  <span style={{ color: 'var(--dc-text-muted)', marginLeft: 8, fontSize: 12 }}>
                    ({d.portletCount} portlets)
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <a
              href="/dashboards"
              style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-block' }}
            >
              Go to Dashboards
            </a>
            <a
              href="/settings/connections"
              style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}
            >
              View Connections
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
