import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ConfirmModal, Modal } from '../../components/Modal'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  fontSize: 13,
  borderRadius: 6,
  border: '1px solid var(--dc-input-border)',
  backgroundColor: 'var(--dc-input-bg)',
  color: 'var(--dc-text)',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: 'var(--dc-text-muted)',
  marginBottom: 4,
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--dc-border)',
  borderRadius: 8,
  padding: 20,
}

const btnPrimary: React.CSSProperties = {
  padding: '8px 20px',
  backgroundColor: 'var(--dc-primary)',
  color: 'var(--dc-primary-content)',
  fontWeight: 500,
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
}

const btnSecondary: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 6,
  border: '1px solid var(--dc-border)',
  backgroundColor: 'var(--dc-surface)',
  color: 'var(--dc-text)',
  cursor: 'pointer',
}

interface ConfigData {
  configured: boolean
  appId?: string
  appName?: string
  appSlug?: string
  clientId?: string
  hasPrivateKey?: boolean
  privateKeyHint?: string
  hasClientSecret?: boolean
  clientSecretHint?: string
  hasWebhookSecret?: boolean
  setupUrl: string
}

interface Installation {
  id: number
  installationId: number
  accountLogin: string
  accountType: string
}

interface SyncData {
  configured: boolean
  id?: number
  installationId?: number
  repoOwner?: string
  repoName?: string
  branch?: string
  lastSyncAt?: string | null
  lastSyncStatus?: string | null
  lastSyncError?: string | null
  lastSyncCommitSha?: string | null
}

interface Repo {
  id: number
  name: string
  fullName: string
  private: boolean
  defaultBranch: string
}

interface Branch {
  name: string
  sha: string
}

export default function GitHubAppPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  // Show feedback from callback redirects
  useEffect(() => {
    if (searchParams.get('installed') === 'true') {
      setFeedback({ type: 'success', message: 'GitHub App installed successfully!' })
      setSearchParams({}, { replace: true })
    }
    if (searchParams.get('error')) {
      setFeedback({ type: 'error', message: `Installation error: ${searchParams.get('error')}` })
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Config query
  const configQuery = useQuery<ConfigData>({
    queryKey: ['github-app', 'config'],
    queryFn: async () => {
      const res = await fetch('/api/github-app/config', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch config')
      return res.json()
    },
  })

  // Installations query
  const installationsQuery = useQuery<{ installations: Installation[]; appName?: string }>({
    queryKey: ['github-app', 'installations'],
    queryFn: async () => {
      const res = await fetch('/api/github-app/installations', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch installations')
      return res.json()
    },
    enabled: !!configQuery.data?.configured,
  })

  // Sync config query
  const syncQuery = useQuery<SyncData>({
    queryKey: ['github-app', 'sync'],
    queryFn: async () => {
      const res = await fetch('/api/github-app/sync', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch sync config')
      return res.json()
    },
    enabled: !!configQuery.data?.configured,
  })

  const config = configQuery.data
  const installations = installationsQuery.data?.installations ?? []
  const syncConfig = syncQuery.data

  if (configQuery.isLoading) {
    return <div style={{ color: 'var(--dc-text-muted)' }}>Loading...</div>
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--dc-text)', margin: '0 0 8px' }}>
        GitHub App
      </h2>
      <p style={{ fontSize: 13, color: 'var(--dc-text-muted)', marginTop: 0, marginBottom: 24 }}>
        Connect a GitHub App to sync your schema files and cube definitions to a repository.
      </p>

      {feedback && <FeedbackBanner feedback={feedback} onDismiss={() => setFeedback(null)} />}

      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {!config?.configured ? (
          <ConfigForm
            setupUrl={config?.setupUrl ?? ''}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['github-app'] })
              setFeedback({ type: 'success', message: 'GitHub App configured successfully!' })
            }}
            onError={msg => setFeedback({ type: 'error', message: msg })}
          />
        ) : (
          <>
            <ConfigSummary
              config={config}
              onDeleted={() => {
                queryClient.invalidateQueries({ queryKey: ['github-app'] })
                setFeedback({ type: 'success', message: 'GitHub App configuration removed.' })
              }}
              onUpdated={() => {
                queryClient.invalidateQueries({ queryKey: ['github-app'] })
                setFeedback({ type: 'success', message: 'GitHub App configuration updated.' })
              }}
            />
            <InstallationsCard installations={installations} appSlug={config.appSlug} />
            {installations.length > 0 && (
              <SyncCard
                syncConfig={syncConfig}
                installations={installations}
                onUpdated={() => {
                  queryClient.invalidateQueries({ queryKey: ['github-app', 'sync'] })
                  setFeedback({ type: 'success', message: 'Sync configuration saved.' })
                }}
                onSynced={result => {
                  queryClient.invalidateQueries({ queryKey: ['github-app', 'sync'] })
                  if (result.success) {
                    setFeedback({
                      type: 'success',
                      message: `Synced ${result.filesCount} file(s) — commit ${result.commitSha?.slice(0, 7)}`,
                    })
                  } else {
                    setFeedback({ type: 'error', message: result.error ?? 'Sync failed' })
                  }
                }}
                onError={msg => setFeedback({ type: 'error', message: msg })}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function FeedbackBanner({
  feedback,
  onDismiss,
}: {
  feedback: { type: 'success' | 'error'; message: string }
  onDismiss: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div
      style={{
        padding: '8px 12px',
        borderRadius: 6,
        fontSize: 12,
        marginBottom: 16,
        backgroundColor:
          feedback.type === 'success' ? 'var(--dc-success-bg, #dcfce7)' : 'var(--dc-error-bg)',
        border: `1px solid ${feedback.type === 'success' ? 'var(--dc-success, #22c55e)' : 'var(--dc-error-border)'}`,
        color: feedback.type === 'success' ? 'var(--dc-success, #16a34a)' : 'var(--dc-error)',
      }}
    >
      {feedback.message}
    </div>
  )
}

function LoadingField({ message }: { message: string }) {
  return (
    <>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          fontSize: 12,
          color: 'var(--dc-text-muted)',
          border: '1px solid var(--dc-input-border)',
          borderRadius: 6,
          backgroundColor: 'var(--dc-input-bg)',
        }}
      >
        <span
          style={{
            width: 14,
            height: 14,
            border: '2px solid var(--dc-border)',
            borderTopColor: 'var(--dc-primary)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            flexShrink: 0,
          }}
        />
        {message}
      </div>
    </>
  )
}

function CopyableUrl({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <div
          style={{
            ...inputStyle,
            flex: 1,
            backgroundColor: 'var(--dc-surface-hover)',
            userSelect: 'all',
            cursor: 'text',
            fontFamily: 'monospace',
            fontSize: 11,
          }}
        >
          {value}
        </div>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
          style={{ ...btnSecondary, fontSize: 11, whiteSpace: 'nowrap' }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

function ConfigForm({
  setupUrl,
  initialValues,
  onSuccess,
  onError,
  onCancel,
}: {
  setupUrl: string
  initialValues?: { appId?: string; clientId?: string }
  onSuccess: () => void
  onError: (msg: string) => void
  onCancel?: () => void
}) {
  const [appId, setAppId] = useState(initialValues?.appId ?? '')
  const [privateKey, setPrivateKey] = useState('')
  const [clientId, setClientId] = useState(initialValues?.clientId ?? '')
  const [clientSecret, setClientSecret] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/github-app/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          appId,
          privateKey,
          clientId,
          clientSecret,
          webhookSecret: webhookSecret || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }
    },
    onSuccess,
    onError: (err: Error) => onError(err.message),
  })

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dc-text)', marginBottom: 4 }}>
        Configure GitHub App
      </div>
      <p style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginTop: 0, marginBottom: 16 }}>
        Create a GitHub App at{' '}
        <a
          href="https://github.com/settings/apps/new"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--dc-primary)' }}
        >
          github.com/settings/apps/new
        </a>{' '}
        with <strong>Repository contents (Read & write)</strong> and{' '}
        <strong>Metadata (Read-only)</strong> permissions.
      </p>

      {setupUrl && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <CopyableUrl
            label="Setup URL — paste into your GitHub App's 'Setup URL (optional)' field"
            value={setupUrl}
          />
          <div style={{ fontSize: 11, color: 'var(--dc-text-muted)' }}>
            The Callback URL field in GitHub can be set to your Drizby homepage URL — it is not used
            by this integration.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={labelStyle}>App ID</label>
          <input
            type="text"
            value={appId}
            onChange={e => setAppId(e.target.value)}
            placeholder="123456"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Client ID</label>
          <input
            type="text"
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            placeholder="Iv1.abc123..."
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Client Secret</label>
          <input
            type="password"
            value={clientSecret}
            onChange={e => setClientSecret(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Private Key (.pem)</label>
          <textarea
            value={privateKey}
            onChange={e => setPrivateKey(e.target.value)}
            placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;..."
            rows={4}
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
          />
          <div style={{ fontSize: 11, color: 'var(--dc-text-muted)', marginTop: 4 }}>
            Generate a private key in your GitHub App settings and paste the .pem contents here.
          </div>
        </div>
        <div>
          <label style={labelStyle}>Webhook Secret (optional)</label>
          <input
            type="password"
            value={webhookSecret}
            onChange={e => setWebhookSecret(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ marginTop: 4, display: 'flex', gap: 8 }}>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !appId || !privateKey || !clientId || !clientSecret}
            style={{
              ...btnPrimary,
              opacity:
                saveMutation.isPending || !appId || !privateKey || !clientId || !clientSecret
                  ? 0.5
                  : 1,
            }}
          >
            {saveMutation.isPending ? 'Validating...' : 'Save & Validate'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} style={btnSecondary}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ConfigSummary({
  config,
  onDeleted,
  onUpdated,
}: {
  config: ConfigData
  onDeleted: () => void
  onUpdated: () => void
}) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [editing, setEditing] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/github-app/config', {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to delete')
    },
    onSuccess: onDeleted,
  })

  if (editing) {
    return (
      <ConfigForm
        setupUrl={config.setupUrl}
        initialValues={{
          appId: config.appId ?? '',
          clientId: config.clientId ?? '',
        }}
        onSuccess={() => {
          setEditing(false)
          onUpdated()
        }}
        onError={() => {}}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dc-text)' }}>
            {config.appName || 'GitHub App'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginTop: 4 }}>
            App ID: {config.appId} &middot; Client ID: {config.clientId}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setEditing(true)} style={btnSecondary}>
            Edit
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            style={{ ...btnSecondary, color: 'var(--dc-error)' }}
          >
            Remove
          </button>
        </div>
      </div>
      <ConfirmModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => {
          deleteMutation.mutate()
          setShowConfirm(false)
        }}
        title="Remove GitHub App"
        message="Remove GitHub App configuration? This will also delete all installations and sync settings."
      />
    </div>
  )
}

function InstallationsCard({
  installations,
  appSlug,
}: {
  installations: Installation[]
  appSlug?: string | null
}) {
  const installUrl = appSlug
    ? `https://github.com/apps/${appSlug}/installations/new`
    : 'https://github.com/settings/apps'

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dc-text)', marginBottom: 12 }}>
        Installations
      </div>
      {installations.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--dc-text-muted)', margin: '0 0 12px' }}>
          No installations found. Install the app on a GitHub organization to get started.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {installations.map(inst => (
            <div
              key={inst.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                borderRadius: 6,
                backgroundColor: 'var(--dc-surface-hover)',
                fontSize: 13,
                color: 'var(--dc-text)',
              }}
            >
              <span style={{ fontWeight: 500 }}>{inst.accountLogin}</span>
              <span style={{ fontSize: 11, color: 'var(--dc-text-muted)' }}>
                ({inst.accountType})
              </span>
            </div>
          ))}
        </div>
      )}
      <a
        href={installUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: 'none' }}
      >
        <button type="button" style={btnSecondary}>
          Install on GitHub...
        </button>
      </a>
    </div>
  )
}

function SyncCard({
  syncConfig,
  installations,
  onUpdated,
  onSynced,
  onError,
}: {
  syncConfig?: SyncData
  installations: Installation[]
  onUpdated: () => void
  onSynced: (result: {
    success: boolean
    commitSha?: string
    filesCount?: number
    error?: string
  }) => void
  onError: (msg: string) => void
}) {
  const [showSetup, setShowSetup] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncLogs, setSyncLogs] = useState<Array<{ step: string; detail?: string }>>([])
  const logsContainerRef = useRef<HTMLDivElement>(null)

  const startSync = async () => {
    setSyncing(true)
    setSyncLogs([])
    try {
      const res = await fetch('/api/github-app/sync/push', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.body) throw new Error('No response body')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        let currentEvent = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7)
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))
            if (currentEvent === 'progress') {
              setSyncLogs(prev => [...prev, { step: data.step, detail: data.detail }])
            } else if (currentEvent === 'complete') {
              onSynced({ success: true, commitSha: data.commitSha, filesCount: data.filesCount })
            } else if (currentEvent === 'error') {
              setSyncLogs(prev => [...prev, { step: 'Error', detail: data.message }])
              onError(data.message)
            }
          }
        }
      }
    } catch (err: any) {
      onError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: syncLogs triggers scroll on new entries
  useEffect(() => {
    const el = logsContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [syncLogs])

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/github-app/sync', {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to disconnect')
    },
    onSuccess: onUpdated,
  })

  if (!syncConfig?.configured) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dc-text)', marginBottom: 8 }}>
          Repository Sync
        </div>
        <p style={{ fontSize: 12, color: 'var(--dc-text-muted)', margin: '0 0 12px' }}>
          Connect to a GitHub repository to push your schemas and cube definitions.
        </p>
        <button type="button" onClick={() => setShowSetup(true)} style={btnPrimary}>
          Set Up Sync
        </button>
        {showSetup && (
          <SyncSetupModal
            installations={installations}
            onClose={() => setShowSetup(false)}
            onSaved={() => {
              setShowSetup(false)
              onUpdated()
            }}
            onError={onError}
          />
        )}
      </div>
    )
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dc-text)' }}>
            Repository Sync
          </div>
          <div style={{ fontSize: 13, color: 'var(--dc-text)', marginTop: 6 }}>
            <a
              href={`https://github.com/${syncConfig.repoOwner}/${syncConfig.repoName}/tree/${syncConfig.branch}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--dc-primary)' }}
            >
              {syncConfig.repoOwner}/{syncConfig.repoName}
            </a>
            <span style={{ color: 'var(--dc-text-muted)', fontSize: 12 }}> on branch </span>
            <code style={{ fontSize: 12 }}>{syncConfig.branch}</code>
          </div>
        </div>
        <button
          onClick={() => disconnectMutation.mutate()}
          style={{ ...btnSecondary, color: 'var(--dc-error)', fontSize: 11 }}
        >
          Disconnect
        </button>
      </div>

      {syncConfig.lastSyncAt && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--dc-text-muted)' }}>
          Last sync: {new Date(syncConfig.lastSyncAt).toLocaleString()}
          {syncConfig.lastSyncStatus && (
            <span
              style={{
                marginLeft: 8,
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                backgroundColor:
                  syncConfig.lastSyncStatus === 'success'
                    ? 'var(--dc-success-bg, #dcfce7)'
                    : syncConfig.lastSyncStatus === 'error'
                      ? 'var(--dc-error-bg)'
                      : 'var(--dc-warning-bg, #fef3c7)',
                color:
                  syncConfig.lastSyncStatus === 'success'
                    ? 'var(--dc-success, #16a34a)'
                    : syncConfig.lastSyncStatus === 'error'
                      ? 'var(--dc-error)'
                      : 'var(--dc-warning, #b45309)',
              }}
            >
              {syncConfig.lastSyncStatus}
            </span>
          )}
          {syncConfig.lastSyncCommitSha && (
            <a
              href={`https://github.com/${syncConfig.repoOwner}/${syncConfig.repoName}/commit/${syncConfig.lastSyncCommitSha}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                marginLeft: 8,
                fontSize: 11,
                color: 'var(--dc-primary)',
                fontFamily: 'monospace',
              }}
            >
              {syncConfig.lastSyncCommitSha.slice(0, 7)}
            </a>
          )}
        </div>
      )}

      {syncConfig.lastSyncError && (
        <div
          style={{
            marginTop: 8,
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 11,
            backgroundColor: 'var(--dc-error-bg)',
            border: '1px solid var(--dc-error-border)',
            color: 'var(--dc-error)',
          }}
        >
          {syncConfig.lastSyncError}
        </div>
      )}

      {syncLogs.length > 0 && (
        <div
          ref={logsContainerRef}
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 6,
            backgroundColor: '#1e1e1e',
            border: '1px solid #333',
            maxHeight: 200,
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: 11,
            lineHeight: 1.7,
          }}
        >
          {syncLogs.map(log => (
            <div
              key={`${log.step}-${log.detail}`}
              style={{ color: log.step === 'Error' ? '#f87171' : '#d4d4d4' }}
            >
              <span
                style={{
                  color:
                    log.step === 'Done' ? '#4ade80' : log.step === 'Error' ? '#f87171' : '#888',
                }}
              >
                {log.step === 'Done' ? '✓' : log.step === 'Error' ? '✗' : '›'}
              </span>{' '}
              <span style={{ color: log.step === 'Done' ? '#4ade80' : '#93c5fd' }}>{log.step}</span>
              {log.detail && <span style={{ color: '#888' }}> {log.detail}</span>}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <button
          onClick={startSync}
          disabled={syncing}
          style={{
            ...btnPrimary,
            opacity: syncing ? 0.5 : 1,
          }}
        >
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>
    </div>
  )
}

function SearchableRepoSelect({
  repos,
  selectedRepo,
  onSelect,
}: {
  repos: Repo[]
  selectedRepo: Repo | null
  onSelect: (repo: Repo | null) => void
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const sorted = [...repos].sort((a, b) => a.name.localeCompare(b.name))
  const filtered = sorted.filter(
    r => !search || r.fullName.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={open ? search : selectedRepo ? selectedRepo.fullName : ''}
        onChange={e => {
          setSearch(e.target.value)
          if (!open) setOpen(true)
        }}
        onFocus={() => {
          setOpen(true)
          setSearch('')
        }}
        placeholder="Search repositories..."
        style={inputStyle}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            maxHeight: 200,
            overflowY: 'auto',
            backgroundColor: 'var(--dc-surface)',
            border: '1px solid var(--dc-border)',
            borderRadius: 6,
            marginTop: 2,
            zIndex: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--dc-text-muted)' }}>
              No matching repositories
            </div>
          ) : (
            filtered.map(repo => (
              <div
                key={repo.id}
                onClick={() => {
                  onSelect(repo)
                  setSearch('')
                  setOpen(false)
                }}
                style={{
                  padding: '6px 10px',
                  fontSize: 13,
                  cursor: 'pointer',
                  backgroundColor:
                    selectedRepo?.id === repo.id ? 'var(--dc-surface-hover)' : 'transparent',
                  color: 'var(--dc-text)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onMouseEnter={e => {
                  ;(e.currentTarget as HTMLDivElement).style.backgroundColor =
                    'var(--dc-surface-hover)'
                }}
                onMouseLeave={e => {
                  ;(e.currentTarget as HTMLDivElement).style.backgroundColor =
                    selectedRepo?.id === repo.id ? 'var(--dc-surface-hover)' : 'transparent'
                }}
              >
                <span>{repo.fullName}</span>
                <span style={{ fontSize: 11, color: 'var(--dc-text-muted)' }}>
                  {repo.private ? 'private' : 'public'}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function SyncSetupModal({
  installations,
  onClose,
  onSaved,
  onError,
}: {
  installations: Installation[]
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [selectedInstallation, setSelectedInstallation] = useState<Installation | null>(
    installations.length === 1 ? installations[0] : null
  )
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null)
  const [branch, setBranch] = useState('main')
  const [showCreateRepo, setShowCreateRepo] = useState(false)
  const [newRepoName, setNewRepoName] = useState('')
  const [newRepoPrivate, setNewRepoPrivate] = useState(true)

  // Fetch repos for selected installation
  const reposQuery = useQuery<{ repos: Repo[] }>({
    queryKey: ['github-app', 'repos', selectedInstallation?.installationId],
    queryFn: async () => {
      const res = await fetch(
        `/api/github-app/installations/${selectedInstallation!.installationId}/repos`,
        { credentials: 'include' }
      )
      if (!res.ok) throw new Error('Failed to fetch repos')
      return res.json()
    },
    enabled: !!selectedInstallation,
  })

  // Fetch branches for selected repo
  const branchesQuery = useQuery<{ branches: Branch[] }>({
    queryKey: [
      'github-app',
      'branches',
      selectedInstallation?.installationId,
      selectedRepo?.fullName,
    ],
    queryFn: async () => {
      const [owner, repo] = selectedRepo!.fullName.split('/')
      const res = await fetch(
        `/api/github-app/installations/${selectedInstallation!.installationId}/repos/${owner}/${repo}/branches`,
        { credentials: 'include' }
      )
      if (!res.ok) throw new Error('Failed to fetch branches')
      return res.json()
    },
    enabled: !!selectedInstallation && !!selectedRepo,
  })

  const createRepoMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/github-app/installations/${selectedInstallation!.installationId}/repos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            org: selectedInstallation!.accountLogin,
            name: newRepoName,
            isPrivate: newRepoPrivate,
          }),
        }
      )
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create repo')
      }
      return res.json()
    },
    onSuccess: data => {
      setSelectedRepo(data.repo)
      setBranch(data.repo.defaultBranch || 'main')
      setShowCreateRepo(false)
      setNewRepoName('')
    },
    onError: (err: Error) => onError(err.message),
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const [owner, repo] = selectedRepo!.fullName.split('/')
      const res = await fetch('/api/github-app/sync', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          installationId: selectedInstallation!.installationId,
          repoOwner: owner,
          repoName: repo,
          branch,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save sync config')
      }
    },
    onSuccess: onSaved,
    onError: (err: Error) => onError(err.message),
  })

  const repos = reposQuery.data?.repos ?? []
  const branches = branchesQuery.data?.branches ?? []

  return (
    <Modal isOpen onClose={onClose} maxWidth="max-w-md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--dc-text)', margin: 0 }}>
          Set Up Repository Sync
        </h3>

        {/* Installation selector */}
        {installations.length > 1 && (
          <div>
            <label style={labelStyle}>Installation</label>
            <select
              value={selectedInstallation?.installationId ?? ''}
              onChange={e => {
                const inst = installations.find(i => i.installationId === Number(e.target.value))
                setSelectedInstallation(inst ?? null)
                setSelectedRepo(null)
              }}
              style={inputStyle}
            >
              <option value="">Select installation...</option>
              {installations.map(inst => (
                <option key={inst.installationId} value={inst.installationId}>
                  {inst.accountLogin} ({inst.accountType})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Repo selector */}
        {selectedInstallation && (
          <div>
            <label style={labelStyle}>Repository</label>
            {reposQuery.isLoading ? (
              <LoadingField message="Fetching repositories..." />
            ) : (
              <>
                <SearchableRepoSelect
                  repos={repos}
                  selectedRepo={selectedRepo}
                  onSelect={repo => {
                    setSelectedRepo(repo)
                    if (repo) setBranch(repo.defaultBranch || 'main')
                  }}
                />
                <div style={{ marginTop: 8 }}>
                  {selectedInstallation?.accountType !== 'Organization' ? (
                    <div style={{ fontSize: 11, color: 'var(--dc-text-muted)' }}>
                      To create a new repo, create it on GitHub first then select it above.
                    </div>
                  ) : !showCreateRepo ? (
                    <button
                      type="button"
                      onClick={() => setShowCreateRepo(true)}
                      style={{ ...btnSecondary, fontSize: 11 }}
                    >
                      Create new repository...
                    </button>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'flex-end',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <label style={labelStyle}>{selectedInstallation.accountLogin}/</label>
                        <input
                          type="text"
                          value={newRepoName}
                          onChange={e => setNewRepoName(e.target.value)}
                          placeholder="drizby-schemas"
                          style={inputStyle}
                        />
                      </div>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 12,
                          color: 'var(--dc-text-muted)',
                          marginBottom: 6,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={newRepoPrivate}
                          onChange={e => setNewRepoPrivate(e.target.checked)}
                        />
                        Private
                      </label>
                      <button
                        type="button"
                        onClick={() => createRepoMutation.mutate()}
                        disabled={!newRepoName || createRepoMutation.isPending}
                        style={{
                          ...btnPrimary,
                          fontSize: 12,
                          padding: '6px 12px',
                          opacity: !newRepoName || createRepoMutation.isPending ? 0.5 : 1,
                          marginBottom: 0,
                        }}
                      >
                        {createRepoMutation.isPending ? 'Creating...' : 'Create'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreateRepo(false)}
                        style={{ ...btnSecondary, fontSize: 11, marginBottom: 0 }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Branch selector */}
        {selectedRepo && (
          <div>
            <label style={labelStyle}>Branch</label>
            {branchesQuery.isLoading ? (
              <LoadingField message="Fetching branches..." />
            ) : branches.length > 0 ? (
              <select value={branch} onChange={e => setBranch(e.target.value)} style={inputStyle}>
                {branches.map(b => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={branch}
                onChange={e => setBranch(e.target.value)}
                placeholder="main"
                style={inputStyle}
              />
            )}
          </div>
        )}

        {/* Save */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!selectedRepo || !branch || saveMutation.isPending}
            style={{
              ...btnPrimary,
              opacity: !selectedRepo || !branch || saveMutation.isPending ? 0.5 : 1,
            }}
          >
            {saveMutation.isPending ? 'Saving...' : 'Connect'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
