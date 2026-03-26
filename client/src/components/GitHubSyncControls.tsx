/**
 * GitHub sync controls for the schema editor toolbar.
 * Includes Push button, Tags button, push progress modal, and tags modal with restore.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

interface SyncStatus {
  configured: boolean
  hasPendingChanges?: boolean
  repoOwner?: string
  repoName?: string
  branch?: string
  lastSyncStatus?: string
  latestTag?: string | null
}

interface LogEntry {
  step: string
  detail?: string
}

/** Hook that provides GitHub sync state and actions. */
export function useGitHubSync() {
  const queryClient = useQueryClient()
  const [pushing, setPushing] = useState(false)
  const [pushLogs, setPushLogs] = useState<LogEntry[]>([])
  const [showTagsModal, setShowTagsModal] = useState(false)

  const { data: syncStatus } = useQuery<SyncStatus>({
    queryKey: ['github-app', 'sync'],
    queryFn: async () => {
      const res = await fetch('/api/github-app/sync', { credentials: 'include' })
      if (!res.ok) return { configured: false }
      return res.json()
    },
    refetchInterval: 30000,
  })

  const handlePush = async () => {
    setPushing(true)
    setPushLogs([])
    try {
      const res = await fetch('/api/github-app/sync/push', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.body) throw new Error('No response body')
      await consumeSSE(res.body, {
        onProgress: data =>
          setPushLogs(prev => [...prev, { step: data.step, detail: data.detail }]),
        onComplete: data => {
          setPushLogs(prev => [
            ...prev,
            { step: 'Done', detail: `Commit ${data.commitSha?.slice(0, 7)}` },
          ])
          queryClient.invalidateQueries({ queryKey: ['github-app', 'sync'] })
        },
        onError: data => setPushLogs(prev => [...prev, { step: 'Error', detail: data.message }]),
      })
    } catch (err: any) {
      setPushLogs(prev => [...prev, { step: 'Error', detail: err.message }])
    } finally {
      setPushing(false)
    }
  }

  const invalidateSync = () => {
    queryClient.invalidateQueries({ queryKey: ['github-app', 'sync'] })
  }

  return {
    syncStatus,
    pushing,
    pushLogs,
    setPushLogs,
    showTagsModal,
    setShowTagsModal,
    handlePush,
    invalidateSync,
  }
}

/** Toolbar buttons for Push and Tags. Render inside the toolbar div. */
export function GitHubSyncButtons({
  syncStatus,
  pushing,
  onPush,
  onOpenTags,
  toolbarBtn,
}: {
  syncStatus: SyncStatus | undefined
  pushing: boolean
  onPush: () => void
  onOpenTags: () => void
  toolbarBtn: (disabled: boolean) => React.CSSProperties
}) {
  if (!syncStatus?.configured) return null

  const repoUrl = `https://github.com/${syncStatus.repoOwner}/${syncStatus.repoName}/tree/${syncStatus.branch}`

  const githubIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  )

  const pushIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  )

  return (
    <>
      {syncStatus.hasPendingChanges ? (
        <button
          onClick={onPush}
          disabled={pushing}
          title={`Push changes to ${syncStatus.repoOwner}/${syncStatus.repoName}:${syncStatus.branch}`}
          style={{
            ...toolbarBtn(pushing),
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            color: pushing ? 'var(--dc-text-muted)' : '#f59e0b',
            borderColor: '#f59e0b40',
          }}
        >
          {pushIcon}
          {pushing ? 'Pushing...' : 'Push'}
        </button>
      ) : (
        <a
          href={repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Up to date — view ${syncStatus.repoOwner}/${syncStatus.repoName}:${syncStatus.branch} on GitHub`}
          style={{
            ...toolbarBtn(false),
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            color: '#22c55e',
            borderColor: '#22c55e40',
            textDecoration: 'none',
          }}
        >
          {githubIcon}
          Synced
        </a>
      )}
      <button
        onClick={onOpenTags}
        style={{
          ...toolbarBtn(false),
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 12,
        }}
        title="Tags & versions"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
        {syncStatus.latestTag || 'Tags'}
      </button>
    </>
  )
}

/** Modals container — render at the top level of the page. */
export function GitHubSyncModals({
  syncStatus,
  pushLogs,
  pushing,
  showTagsModal,
  onClosePushLogs,
  onCloseTagsModal,
  onRestored,
}: {
  syncStatus: SyncStatus | undefined
  pushLogs: LogEntry[]
  pushing: boolean
  showTagsModal: boolean
  onClosePushLogs: () => void
  onCloseTagsModal: () => void
  onRestored: () => void
}) {
  const repoLabel = syncStatus?.configured
    ? `${syncStatus.repoOwner}/${syncStatus.repoName}:${syncStatus.branch}`
    : ''

  return (
    <>
      {pushLogs.length > 0 && (
        <PushLogModal
          logs={pushLogs}
          pushing={pushing}
          onClose={onClosePushLogs}
          repoLabel={repoLabel}
        />
      )}
      {showTagsModal && syncStatus?.configured && (
        <TagsModal
          onClose={onCloseTagsModal}
          onRestored={onRestored}
          repoLabel={`${syncStatus.repoOwner}/${syncStatus.repoName}`}
        />
      )}
    </>
  )
}

// ============================================================================
// Internal components
// ============================================================================

function TerminalLog({ logs }: { logs: LogEntry[] }) {
  return (
    <>
      {logs.map(log => (
        <div
          key={`${log.step}-${log.detail}`}
          style={{ color: log.step === 'Error' ? '#f87171' : '#d4d4d4' }}
        >
          <span
            style={{
              color: log.step === 'Done' ? '#4ade80' : log.step === 'Error' ? '#f87171' : '#555',
            }}
          >
            {log.step === 'Done' ? '✓' : log.step === 'Error' ? '✗' : '›'}
          </span>{' '}
          <span style={{ color: log.step === 'Done' ? '#4ade80' : '#93c5fd' }}>{log.step}</span>
          {log.detail && <span style={{ color: '#888' }}> {log.detail}</span>}
        </div>
      ))}
    </>
  )
}

function PushLogModal({
  logs,
  pushing,
  onClose,
  repoLabel,
}: {
  logs: LogEntry[]
  pushing: boolean
  onClose: () => void
  repoLabel: string
}) {
  const logsContainerRef = useRef<HTMLDivElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: logs triggers scroll on new entries
  useEffect(() => {
    const el = logsContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  const isDone = !pushing && logs.length > 0
  const hasError = logs.some(l => l.step === 'Error')

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => {
        if (isDone && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          backgroundColor: '#1e1e1e',
          borderRadius: 10,
          border: '1px solid #333',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid #333',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#e5e5e5' }}>
              {pushing ? 'Pushing to GitHub...' : hasError ? 'Push failed' : 'Push complete'}
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{repoLabel}</div>
          </div>
          {pushing && (
            <>
              <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
              <span
                style={{
                  width: 16,
                  height: 16,
                  border: '2px solid #444',
                  borderTopColor: '#93c5fd',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
            </>
          )}
        </div>
        <div
          ref={logsContainerRef}
          style={{
            padding: '12px 16px',
            maxHeight: 300,
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: 12,
            lineHeight: 1.7,
          }}
        >
          <TerminalLog logs={logs} />
        </div>
        {isDone && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #333', textAlign: 'right' }}>
            <button
              onClick={onClose}
              style={{
                padding: '6px 16px',
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 6,
                border: 'none',
                backgroundColor: hasError ? '#ef4444' : '#22c55e',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              {hasError ? 'Dismiss' : 'Done'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function TagsModal({
  onClose,
  onRestored,
  repoLabel,
}: {
  onClose: () => void
  onRestored: () => void
  repoLabel: string
}) {
  const queryClient = useQueryClient()
  const [restoreLogs, setRestoreLogs] = useState<LogEntry[]>([])
  const [restoring, setRestoring] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)

  const { data, isLoading } = useQuery<{
    tags: Array<{ name: string; sha: string; date: string | null; message: string | null }>
  }>({
    queryKey: ['github-app', 'tags'],
    queryFn: async () => {
      const res = await fetch('/api/github-app/sync/tags', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch tags')
      return res.json()
    },
  })

  const createTagMutation = useMutation({
    mutationFn: async (version: string) => {
      const res = await fetch('/api/github-app/sync/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ version }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Failed to create tag')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['github-app', 'tags'] })
      queryClient.invalidateQueries({ queryKey: ['github-app', 'sync'] })
    },
  })

  const handleRestore = async (tagName: string) => {
    setConfirmRestore(null)
    setRestoring(true)
    setRestoreLogs([])
    try {
      const res = await fetch('/api/github-app/sync/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ref: tagName }),
      })
      if (!res.body) throw new Error('No response body')
      await consumeSSE(res.body, {
        onProgress: d => setRestoreLogs(prev => [...prev, { step: d.step, detail: d.detail }]),
        onComplete: d => {
          setRestoreLogs(prev => [
            ...prev,
            {
              step: 'Done',
              detail: `${(d.schemasUpdated || 0) + (d.schemasCreated || 0)} schema(s), ${(d.cubesUpdated || 0) + (d.cubesCreated || 0)} cube(s)`,
            },
          ])
          onRestored()
        },
        onError: d => setRestoreLogs(prev => [...prev, { step: 'Error', detail: d.message }]),
      })
    } catch (err: any) {
      setRestoreLogs(prev => [...prev, { step: 'Error', detail: err.message }])
    } finally {
      setRestoring(false)
    }
  }

  const tags = data?.tags ?? []

  // Compute next versions from the latest tag
  const latestVersion = tags.length > 0 ? tags[0].name.replace(/^v/, '') : null
  const nextVersions = (() => {
    if (!latestVersion) {
      return { major: '1.0.0', minor: '0.1.0', patch: '0.0.1' }
    }
    const parts = latestVersion.split('.').map(Number)
    const [major, minor, patch] = [parts[0] || 0, parts[1] || 0, parts[2] || 0]
    return {
      major: `${major + 1}.0.0`,
      minor: `${major}.${minor + 1}.0`,
      patch: `${major}.${minor}.${patch + 1}`,
    }
  })()

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => {
        if (e.target === e.currentTarget && !restoring) onClose()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          backgroundColor: 'var(--dc-surface)',
          borderRadius: 10,
          border: '1px solid var(--dc-border)',
          overflow: 'hidden',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--dc-border)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)' }}>
            Tags & Versions
          </div>
          <div style={{ fontSize: 11, color: 'var(--dc-text-muted)', marginTop: 2 }}>
            {repoLabel}
          </div>
        </div>

        {/* Create tag */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--dc-border)' }}>
          <div style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginBottom: 8 }}>
            {latestVersion ? `Current: v${latestVersion}` : 'No tags yet'}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['patch', 'minor', 'major'] as const).map(bump => (
              <button
                key={bump}
                onClick={() => createTagMutation.mutate(nextVersions[bump])}
                disabled={createTagMutation.isPending}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 6,
                  border: '1px solid var(--dc-border)',
                  backgroundColor: 'var(--dc-surface)',
                  color: 'var(--dc-text)',
                  cursor: 'pointer',
                  opacity: createTagMutation.isPending ? 0.5 : 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <span style={{ textTransform: 'capitalize' }}>{bump}</span>
                <span
                  style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--dc-text-muted)' }}
                >
                  v{nextVersions[bump]}
                </span>
              </button>
            ))}
          </div>
          {createTagMutation.isPending && (
            <div style={{ fontSize: 11, color: 'var(--dc-text-muted)', marginTop: 6 }}>
              Creating tag...
            </div>
          )}
          {createTagMutation.isError && (
            <div style={{ fontSize: 11, color: 'var(--dc-error)', marginTop: 6 }}>
              {(createTagMutation.error as Error).message}
            </div>
          )}
        </div>

        {/* Tag list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {isLoading ? (
            <div style={{ padding: '16px 20px', fontSize: 12, color: 'var(--dc-text-muted)' }}>
              Loading tags...
            </div>
          ) : tags.length === 0 ? (
            <div style={{ padding: '16px 20px', fontSize: 12, color: 'var(--dc-text-muted)' }}>
              No tags yet. Create one above after pushing.
            </div>
          ) : (
            tags.map(tag => (
              <div
                key={tag.name}
                style={{
                  padding: '8px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--dc-text)',
                      fontFamily: 'monospace',
                    }}
                  >
                    {tag.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--dc-text-muted)', marginTop: 1 }}>
                    {tag.sha.slice(0, 7)}
                    {tag.date && <> &middot; {new Date(tag.date).toLocaleDateString()}</>}
                  </div>
                </div>
                <button
                  onClick={() => setConfirmRestore(tag.name)}
                  disabled={restoring}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 500,
                    borderRadius: 5,
                    border: '1px solid var(--dc-border)',
                    backgroundColor: 'var(--dc-surface)',
                    color: 'var(--dc-text)',
                    cursor: 'pointer',
                    flexShrink: 0,
                    opacity: restoring ? 0.5 : 1,
                  }}
                >
                  Restore
                </button>
              </div>
            ))
          )}
        </div>

        {/* Restore progress */}
        {restoreLogs.length > 0 && (
          <div
            style={{
              padding: '10px 16px',
              backgroundColor: '#1e1e1e',
              borderTop: '1px solid #333',
              maxHeight: 160,
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: 11,
              lineHeight: 1.7,
            }}
          >
            <TerminalLog logs={restoreLogs} />
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--dc-border)',
            textAlign: 'right',
          }}
        >
          <button
            onClick={onClose}
            disabled={restoring}
            style={{
              padding: '6px 16px',
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 6,
              border: '1px solid var(--dc-border)',
              backgroundColor: 'var(--dc-surface)',
              color: 'var(--dc-text)',
              cursor: 'pointer',
              opacity: restoring ? 0.5 : 1,
            }}
          >
            Close
          </button>
        </div>

        {/* Confirm restore dialog */}
        {confirmRestore && (
          <div
            className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
            onClick={e => {
              if (e.target === e.currentTarget) setConfirmRestore(null)
            }}
          >
            <div
              style={{
                backgroundColor: 'var(--dc-surface)',
                borderRadius: 10,
                border: '1px solid var(--dc-border)',
                padding: 24,
                maxWidth: 380,
                width: '100%',
              }}
            >
              <div
                style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)', marginBottom: 8 }}
              >
                Restore {confirmRestore}?
              </div>
              <p style={{ fontSize: 13, color: 'var(--dc-text-muted)', margin: '0 0 16px' }}>
                This will overwrite current schema files and cube definitions with the versions from
                this tag. Existing files with matching names will be updated; new files will be
                created.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setConfirmRestore(null)}
                  style={{
                    padding: '6px 14px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid var(--dc-border)',
                    backgroundColor: 'var(--dc-surface)',
                    color: 'var(--dc-text)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleRestore(confirmRestore)}
                  style={{
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 6,
                    border: 'none',
                    backgroundColor: '#f59e0b',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Restore
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// SSE helper
// ============================================================================

async function consumeSSE(
  body: ReadableStream<Uint8Array>,
  handlers: {
    onProgress?: (data: any) => void
    onComplete?: (data: any) => void
    onError?: (data: any) => void
  }
) {
  const reader = body.getReader()
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
        if (currentEvent === 'progress') handlers.onProgress?.(data)
        else if (currentEvent === 'complete') handlers.onComplete?.(data)
        else if (currentEvent === 'error') handlers.onError?.(data)
      }
    }
  }
}
