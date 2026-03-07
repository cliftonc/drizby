import { DashboardThumbnailPlaceholder } from 'drizzle-cube/client'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import ConnectionSelector from '../components/ConnectionSelector'
import { useAuth } from '../contexts/AuthContext'
import {
  useAnalyticsPages,
  useCreateAnalyticsPage,
  useCreateExamplePage,
  useDeleteAnalyticsPage,
} from '../hooks/useAnalyticsPages'
import { useConfirm } from '../hooks/useConfirm'
import { useConnections } from '../hooks/useConnections'

export default function DashboardListPage() {
  const { data: pages = [], isLoading, error } = useAnalyticsPages()
  const createExample = useCreateExamplePage()
  const deletePage = useDeleteAnalyticsPage()
  const createPage = useCreateAnalyticsPage()
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newConnectionId, setNewConnectionId] = useState<number | undefined>()
  const [confirm, ConfirmDialog] = useConfirm()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const thumbnailEnabled = true
  const { data: connections = [] } = useConnections()

  const connectionMap = new Map(connections.map(c => [c.id, c.name]))

  const handleCreateExample = async () => {
    try {
      await createExample.mutateAsync()
    } catch (error) {
      console.error('Failed to create example dashboard:', error)
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (
      await confirm({
        title: 'Delete dashboard',
        message: `Are you sure you want to delete "${name}"?`,
        confirmText: 'Delete',
        variant: 'danger',
      })
    ) {
      try {
        await deletePage.mutateAsync(id)
      } catch (error) {
        console.error('Failed to delete dashboard:', error)
      }
    }
  }

  const handleCreateDashboard = async () => {
    if (!newName.trim()) return
    try {
      await createPage.mutateAsync({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        connectionId: newConnectionId || connections[0]?.id,
        config: { portlets: [] },
      })
      setIsNewModalOpen(false)
      setNewName('')
      setNewDescription('')
      setNewConnectionId(undefined)
    } catch (error) {
      console.error('Failed to create dashboard:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <img
          src="/logo.png"
          alt="Loading..."
          className="inline-block animate-spin"
          style={{ width: 32, height: 32, animationDuration: '1.5s' }}
        />
        <p className="mt-2 text-dc-text-muted">Loading dashboards...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-dc-error">Failed to load dashboards</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-dc-text">Analytics Dashboards</h1>
        <p className="mt-1 text-sm text-dc-text-muted">
          Manage your analytics dashboards and visualizations
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={handleCreateExample}
            disabled={createExample.isPending}
            className="inline-flex items-center justify-center rounded-md border border-dc-accent-border bg-dc-accent-bg px-4 py-2 text-sm font-medium text-dc-accent hover:bg-dc-accent/10 hover:border-dc-accent disabled:opacity-50 whitespace-nowrap"
          >
            {createExample.isPending ? 'Creating...' : 'Create Example'}
          </button>
          <button
            onClick={() => setIsNewModalOpen(true)}
            className="inline-flex items-center justify-center rounded-md border border-dc-border-secondary bg-dc-surface px-4 py-2 text-sm font-medium text-dc-text-secondary shadow-xs hover:bg-dc-surface-hover disabled:opacity-50 whitespace-nowrap"
          >
            New Dashboard
          </button>
        </div>
      </div>

      {pages.length === 0 ? (
        <div className="text-center py-12 px-4">
          <h3 className="mt-2 text-lg font-medium text-dc-text">No dashboards</h3>
          <p className="mt-1 text-sm text-dc-text-muted">
            Get started by creating a new dashboard or example dashboard.
          </p>
          <div className="mt-6 flex gap-3 justify-center">
            <button
              onClick={handleCreateExample}
              disabled={createExample.isPending}
              className="inline-flex items-center justify-center rounded-md border border-dc-border-secondary bg-dc-surface px-4 py-2 text-sm font-medium text-dc-text-secondary shadow-xs hover:bg-dc-surface-hover disabled:opacity-50"
            >
              Create Example Dashboard
            </button>
            <button
              onClick={() => setIsNewModalOpen(true)}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-dc-primary px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-dc-primary-hover disabled:opacity-50"
            >
              Create New Dashboard
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map(page => (
            <div
              key={page.id}
              className="relative group bg-dc-surface rounded-lg shadow-xs hover:shadow-md transition-shadow border border-transparent dark:border-dc-border overflow-hidden"
            >
              {thumbnailEnabled && (
                <Link to={`/dashboards/${page.id}`} className="block">
                  <div className="relative aspect-video bg-dc-bg-secondary p-2 rounded-t-lg">
                    {page.config.thumbnailData ? (
                      <img
                        src={page.config.thumbnailData}
                        alt={`${page.name} preview`}
                        className="w-full h-full object-cover object-top rounded-md"
                      />
                    ) : (
                      <DashboardThumbnailPlaceholder className="w-full h-full" />
                    )}
                  </div>
                </Link>
              )}
              <div className="p-6 relative">
                <div className="absolute top-4 right-4 flex items-center gap-1.5">
                  {page.connectionId && connectionMap.get(page.connectionId) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-dc-surface-secondary text-dc-text-muted border border-dc-border">
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
                          d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375"
                        />
                      </svg>
                      {connectionMap.get(page.connectionId)}
                    </span>
                  )}
                  {(isAdmin || page.createdBy === user?.id) && (
                    <button
                      onClick={() => handleDelete(page.id, page.name)}
                      disabled={deletePage.isPending}
                      className="opacity-60 sm:opacity-0 sm:group-hover:opacity-100 text-dc-text-disabled hover:text-dc-danger transition-opacity disabled:opacity-50 p-1 -m-1"
                      title="Delete dashboard"
                    >
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  )}
                </div>

                <h3 className="text-lg font-medium text-dc-text leading-tight pr-28">
                  {page.name}
                </h3>

                {page.description && (
                  <p className="text-sm text-dc-text-muted line-clamp-2 mt-1 mb-2">
                    {page.description}
                  </p>
                )}

                <div className="flex items-center flex-wrap text-xs text-dc-text-muted mt-2 gap-x-3 gap-y-1 mb-3">
                  <span>
                    {page.config.portlets.length} portlet
                    {page.config.portlets.length !== 1 ? 's' : ''}
                  </span>
                  <span>Updated {new Date(page.updatedAt).toLocaleDateString()}</span>
                  {page.createdByName && (
                    <span className="inline-flex items-center gap-1">
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
                          d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0"
                        />
                      </svg>
                      {page.createdByName}
                    </span>
                  )}
                </div>

                <Link
                  to={`/dashboards/${page.id}`}
                  className="block w-full text-center bg-dc-accent-bg text-dc-accent hover:bg-dc-accent/10 border border-dc-accent-border hover:border-dc-accent px-3 py-3 rounded-md text-base font-semibold transition-colors"
                >
                  View Dashboard
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {isNewModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-dc-surface rounded-xl shadow-xl max-w-md w-full p-6 border border-dc-border">
            <h2 className="text-lg font-semibold text-dc-text mb-4">Create New Dashboard</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dc-text mb-1">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Dashboard name"
                  className="w-full px-3 py-2 border border-dc-border rounded-lg bg-dc-surface text-dc-text placeholder:text-dc-text-muted focus:outline-none focus:ring-2 focus:ring-dc-primary"
                  onKeyDown={e => e.key === 'Enter' && handleCreateDashboard()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dc-text mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="What this dashboard shows"
                  className="w-full px-3 py-2 border border-dc-border rounded-lg bg-dc-surface text-dc-text placeholder:text-dc-text-muted focus:outline-none focus:ring-2 focus:ring-dc-primary"
                />
              </div>
              {connections.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-dc-text mb-1">Connection</label>
                  <ConnectionSelector
                    value={newConnectionId || connections[0]?.id}
                    onChange={setNewConnectionId}
                    className="w-full px-3 py-2 text-sm border border-dc-border rounded-lg bg-dc-surface text-dc-text"
                  />
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setIsNewModalOpen(false)
                    setNewName('')
                    setNewDescription('')
                    setNewConnectionId(undefined)
                  }}
                  className="px-4 py-2 text-sm text-dc-text-secondary hover:text-dc-text transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateDashboard}
                  disabled={!newName.trim() || createPage.isPending}
                  className="px-4 py-2 bg-dc-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 text-sm font-medium"
                >
                  {createPage.isPending ? 'Creating...' : 'Create Dashboard'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog />
    </div>
  )
}
