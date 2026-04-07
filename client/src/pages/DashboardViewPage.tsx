import { AnalyticsDashboard, DashboardEditModal } from 'drizzle-cube/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ConnectionCubeProvider from '../components/ConnectionCubeProvider'
import { DashboardLoader } from '../components/DrizzleCubeLoader'
import GroupPicker from '../components/GroupPicker'
import { useAuth } from '../contexts/AuthContext'
import {
  useAnalyticsPage,
  useResetAnalyticsPage,
  useUpdateAnalyticsPage,
} from '../hooks/useAnalyticsPages'
import { useConfirm } from '../hooks/useConfirm'
import { useConnections } from '../hooks/useConnections'
import { useGroups } from '../hooks/useGroups'
import { useCreateShareToken, useRevokeShareToken, useShareTokens } from '../hooks/useShareTokens'
import type { DashboardConfig, ShareToken } from '../types'

export default function DashboardViewPage() {
  const { id } = useParams<{ id: string }>()
  const { data: page, isLoading, error } = useAnalyticsPage(id!)
  const updatePage = useUpdateAnalyticsPage()
  const resetPage = useResetAnalyticsPage()
  const { data: connections = [] } = useConnections()
  const { user } = useAuth()
  const connectionId = page?.connectionId || connections[0]?.id
  const connectionName = connections.find(c => c.id === connectionId)?.name
  const canEdit = user?.role === 'admin' || page?.createdBy === user?.id
  const { data: allGroups = [] } = useGroups()
  const [showVisibility, setShowVisibility] = useState(false)
  const [config, setConfig] = useState<DashboardConfig>({ portlets: [] })
  const [, setLastSaved] = useState<Date | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [newTokenLabel, setNewTokenLabel] = useState('')
  const [createdToken, setCreatedToken] = useState<ShareToken | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirm, ConfirmDialog] = useConfirm()

  const numericId = id ? Number.parseInt(id) : 0
  const { data: shareTokens = [], isLoading: tokensLoading } = useShareTokens(
    showShareModal ? numericId : 0
  )
  const createToken = useCreateShareToken(numericId)
  const revokeToken = useRevokeShareToken(numericId)

  const hasInitializedRef = useRef(false)
  const lastPageIdRef = useRef<string | null>(null)
  const lastUpdatedAtRef = useRef<string | null>(null)

  useEffect(() => {
    if (page) {
      const isInitialLoad = !hasInitializedRef.current
      const isPageChange = lastPageIdRef.current !== null && lastPageIdRef.current !== id
      const isExternalUpdate =
        lastUpdatedAtRef.current !== null && lastUpdatedAtRef.current !== page.updatedAt

      if (isInitialLoad || isPageChange || isExternalUpdate) {
        setConfig(page.config)
        setLastSaved(new Date(page.updatedAt))
        hasInitializedRef.current = true
        lastPageIdRef.current = id ?? null
        lastUpdatedAtRef.current = page.updatedAt
      }
    }
  }, [page, id])

  const handleConfigChange = useCallback((newConfig: DashboardConfig) => {
    setConfig(newConfig)
  }, [])

  const handleSave = useCallback(
    async (configToSave: DashboardConfig) => {
      if (!page || !id) return

      try {
        await updatePage.mutateAsync({
          id: Number.parseInt(id),
          name: page.name,
          description: page.description || undefined,
          config: configToSave,
        })
        setLastSaved(new Date())
      } catch (error) {
        console.error('Auto-save failed:', error)
        throw error
      }
    },
    [page, id, updatePage]
  )

  const handleDirtyStateChange = useCallback((isDirty: boolean) => {
    if (!isDirty) setLastSaved(new Date())
  }, [])

  const handleSaveThumbnail = useCallback(
    async (thumbnailData: string): Promise<string | undefined> => {
      if (!id) return

      try {
        const response = await fetch(`/api/analytics-pages/${id}/thumbnail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ thumbnailData }),
        })
        if (response.ok) {
          const result = (await response.json()) as { thumbnailUrl: string }
          return result.thumbnailUrl
        }
      } catch (error) {
        console.error('Error saving thumbnail:', error)
      }
    },
    [id]
  )

  const handleEditMetadata = useCallback(
    async (data: { name: string; description?: string }) => {
      if (!page || !id) return

      try {
        await updatePage.mutateAsync({
          id: Number.parseInt(id),
          name: data.name,
          description: data.description,
          config: config,
        })
      } catch (error) {
        console.error('Failed to save metadata:', error)
        throw error
      }
    },
    [page, id, config, updatePage]
  )

  const handleResetDashboard = useCallback(async () => {
    if (!id) return

    try {
      const resetResult = await resetPage.mutateAsync(Number.parseInt(id))
      setConfig(resetResult.config)
      setLastSaved(new Date())
      setShowResetConfirm(false)
    } catch (error) {
      console.error('Failed to reset dashboard:', error)
    }
  }, [id, resetPage])

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <img
          src="/logo.png"
          alt="Loading..."
          className="inline-block animate-spin"
          style={{ width: 32, height: 32, animationDuration: '1.5s' }}
        />
        <p className="mt-2 text-dc-text-muted">Loading dashboard...</p>
      </div>
    )
  }

  if (error || !page) {
    return (
      <div className="text-center py-8">
        <p className="text-dc-error">Failed to load dashboard</p>
        <Link
          to="/dashboards"
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-dc-primary-content bg-dc-primary hover:bg-dc-primary-hover"
        >
          Back to Dashboards
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <nav className="flex" aria-label="Breadcrumb">
          <ol className="flex items-center space-x-4">
            <li>
              <Link
                to="/dashboards"
                className="text-dc-text-disabled hover:text-dc-text-muted text-sm"
              >
                Dashboards
              </Link>
            </li>
            <li>
              <svg
                className="shrink-0 h-5 w-5 text-dc-border-secondary"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
              </svg>
            </li>
            <li>
              <span className="text-dc-text-muted text-sm truncate">{page.name}</span>
            </li>
          </ol>
        </nav>

        <div className="mt-2 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-semibold text-dc-text">{page.name}</h1>
              {connectionName && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-dc-surface-secondary text-dc-text-muted border border-dc-border">
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
                    />
                  </svg>
                  {connectionName}
                </span>
              )}
            </div>
            {page.description && (
              <p className="mt-1 text-sm text-dc-text-muted">{page.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {allGroups.length > 0 && (
              <button
                onClick={() => setShowVisibility(!showVisibility)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-dc-border bg-dc-surface text-dc-text hover:bg-dc-surface-hover"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
                  />
                </svg>
                Visibility
              </button>
            )}
            {canEdit && (
              <>
                <button
                  onClick={() => setShowShareModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-dc-border bg-dc-surface text-dc-text hover:bg-dc-surface-hover"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
                    />
                  </svg>
                  Share
                </button>
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-dc-border bg-dc-surface text-dc-text hover:bg-dc-surface-hover"
                >
                  Edit
                </button>
                {connectionName === 'Demo SQLite' && (
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-dc-border bg-dc-surface text-dc-text hover:bg-dc-surface-hover"
                  >
                    Reset
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showVisibility && id && (
        <div className="mb-4 p-4 rounded-lg border border-dc-border bg-dc-surface">
          <GroupPicker contentType="dashboard" contentId={Number.parseInt(id)} />
        </div>
      )}

      {connectionId ? (
        <ConnectionCubeProvider connectionId={connectionId}>
          <AnalyticsDashboard
            config={config}
            editable={!!canEdit}
            onConfigChange={handleConfigChange}
            onSave={handleSave}
            onSaveThumbnail={handleSaveThumbnail}
            onDirtyStateChange={handleDirtyStateChange}
            loadingComponent={<DashboardLoader />}
          />
        </ConnectionCubeProvider>
      ) : (
        <AnalyticsDashboard
          config={config}
          editable={true}
          onConfigChange={handleConfigChange}
          onSave={handleSave}
          onSaveThumbnail={handleSaveThumbnail}
          onDirtyStateChange={handleDirtyStateChange}
        />
      )}

      <DashboardEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleEditMetadata}
        title="Edit Dashboard"
        submitText="Save Changes"
        initialName={page?.name}
        initialDescription={page?.description}
      />

      {showResetConfirm && (
        <div className="fixed inset-0 bg-dc-overlay flex items-center justify-center z-50 p-4">
          <div className="bg-dc-surface rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-dc-text mb-4">Reset Dashboard</h3>
            <p className="text-sm text-dc-text-muted mb-6">
              Are you sure you want to reset this dashboard to the default configuration? This
              cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 border border-dc-border-secondary rounded-md text-sm font-medium text-dc-text-secondary bg-dc-surface hover:bg-dc-surface-tertiary"
              >
                Cancel
              </button>
              <button
                onClick={handleResetDashboard}
                disabled={resetPage.isPending}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-dc-danger hover:bg-dc-danger-hover disabled:opacity-50"
              >
                {resetPage.isPending ? 'Resetting...' : 'Reset Dashboard'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="fixed inset-0 bg-dc-overlay flex items-center justify-center z-50 p-4">
          <div className="bg-dc-surface rounded-lg p-6 max-w-lg w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-dc-text">Share Dashboard</h3>
              <button
                onClick={() => {
                  setShowShareModal(false)
                  setCreatedToken(null)
                  setNewTokenLabel('')
                  setCopied(false)
                }}
                className="text-dc-text-muted hover:text-dc-text"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {createdToken && (
              <div className="mb-4 p-3 rounded-md bg-dc-surface-secondary border border-dc-border">
                <p className="text-xs text-dc-text-muted mb-1">Share link (copy now — won't be shown again):</p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={`${window.location.origin}/public/dashboard/${createdToken.id}`}
                    className="flex-1 text-xs bg-transparent border-none outline-none text-dc-text font-mono truncate"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${window.location.origin}/public/dashboard/${createdToken.id}`
                      )
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className="px-2 py-1 text-xs rounded border border-dc-border bg-dc-surface hover:bg-dc-surface-hover text-dc-text"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            <div className="mb-4">
              <p className="text-xs text-dc-text-muted mb-2">
                Share links give read-only public access without requiring login.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Label (optional)"
                  value={newTokenLabel}
                  onChange={e => setNewTokenLabel(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-sm rounded-md border border-dc-border bg-dc-surface text-dc-text placeholder:text-dc-text-disabled"
                />
                <button
                  onClick={async () => {
                    const token = await createToken.mutateAsync({
                      label: newTokenLabel || undefined,
                    })
                    setCreatedToken(token)
                    setNewTokenLabel('')
                  }}
                  disabled={createToken.isPending}
                  className="px-3 py-1.5 text-sm font-medium rounded-md border border-transparent bg-dc-primary text-dc-primary-content hover:bg-dc-primary-hover disabled:opacity-50"
                >
                  {createToken.isPending ? 'Creating...' : 'Create link'}
                </button>
              </div>
            </div>

            {tokensLoading ? (
              <p className="text-xs text-dc-text-muted">Loading...</p>
            ) : shareTokens.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-dc-text-muted mb-2">Active share links:</p>
                <ul className="space-y-2">
                  {shareTokens.map((token: ShareToken) => (
                    <li
                      key={token.id}
                      className="flex items-center justify-between text-sm gap-2 p-2 rounded border border-dc-border"
                    >
                      <div className="min-w-0">
                        <span className="font-mono text-xs text-dc-text-muted">{token.idMasked}</span>
                        {token.label && (
                          <span className="ml-2 text-dc-text">{token.label}</span>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          const ok = await confirm({
                            title: 'Revoke share link',
                            message: 'Revoke this share link? It will stop working immediately.',
                            variant: 'danger',
                          })
                          if (ok) await revokeToken.mutateAsync(token.id)
                        }}
                        className="shrink-0 text-xs text-dc-error hover:underline"
                      >
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-dc-text-muted">No active share links.</p>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog />
    </div>
  )
}
