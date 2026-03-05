import { Link } from 'react-router-dom'
import { useState } from 'react'
import { DashboardEditModal, useCubeFeatures, DashboardThumbnailPlaceholder } from 'drizzle-cube/client'
import {
  useAnalyticsPages,
  useCreateExamplePage,
  useDeleteAnalyticsPage,
  useCreateAnalyticsPage
} from '../hooks/useAnalyticsPages'

export default function DashboardListPage() {
  const { data: pages = [], isLoading, error } = useAnalyticsPages()
  const createExample = useCreateExamplePage()
  const deletePage = useDeleteAnalyticsPage()
  const createPage = useCreateAnalyticsPage()
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)
  const { features } = useCubeFeatures()
  const thumbnailEnabled = features.thumbnail?.enabled ?? false

  const handleCreateExample = async () => {
    try {
      await createExample.mutateAsync()
    } catch (error) {
      console.error('Failed to create example dashboard:', error)
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
      try {
        await deletePage.mutateAsync(id)
      } catch (error) {
        console.error('Failed to delete dashboard:', error)
      }
    }
  }

  const handleCreateDashboard = async (data: { name: string; description?: string }) => {
    try {
      await createPage.mutateAsync({
        name: data.name,
        description: data.description,
        config: { portlets: [] }
      })
    } catch (error) {
      console.error('Failed to create dashboard:', error)
      throw error
    }
  }

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-dc-primary"></div>
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
        <p className="mt-1 text-sm text-dc-text-muted">Manage your analytics dashboards and visualizations</p>

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
          <p className="mt-1 text-sm text-dc-text-muted">Get started by creating a new dashboard or example dashboard.</p>
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
          {pages.map((page) => (
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
              <div className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-medium text-dc-text pr-2 leading-tight">{page.name}</h3>
                  <button
                    onClick={() => handleDelete(page.id, page.name)}
                    disabled={deletePage.isPending}
                    className="opacity-60 sm:opacity-0 sm:group-hover:opacity-100 text-dc-text-disabled hover:text-dc-danger transition-opacity disabled:opacity-50 p-1 -m-1 shrink-0"
                    title="Delete dashboard"
                  >
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>

                {page.description && (
                  <p className="text-sm text-dc-text-muted line-clamp-2 mb-3">{page.description}</p>
                )}

                <div className="flex items-center text-sm text-dc-text-muted mb-4">
                  <span>{page.config.portlets.length} portlets</span>
                  <span className="mx-2">-</span>
                  <span>Updated {new Date(page.updatedAt).toLocaleDateString()}</span>
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

      <DashboardEditModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSave={handleCreateDashboard}
        title="Create New Dashboard"
        submitText="Create Dashboard"
      />
    </div>
  )
}
