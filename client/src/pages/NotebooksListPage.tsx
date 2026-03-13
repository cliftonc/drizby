import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ConnectionSelector from '../components/ConnectionSelector'
import { useAuth } from '../contexts/AuthContext'
import { useConfirm } from '../hooks/useConfirm'
import { useConnections } from '../hooks/useConnections'
import { useCreateNotebook, useDeleteNotebook, useNotebooks } from '../hooks/useNotebooks'

export default function NotebooksListPage() {
  const { data: notebooks = [], isLoading, error } = useNotebooks()
  const createNotebook = useCreateNotebook()
  const deleteNotebook = useDeleteNotebook()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [confirm, ConfirmDialog] = useConfirm()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newConnectionId, setNewConnectionId] = useState<number | undefined>()
  const { data: connections = [] } = useConnections()

  const connectionMap = new Map(connections.map(c => [c.id, c.name]))

  const handleCreate = async () => {
    if (!newName.trim()) return

    try {
      const result = await createNotebook.mutateAsync({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        connectionId: newConnectionId || connections[0]?.id,
      })
      setShowCreateForm(false)
      setNewName('')
      setNewDescription('')
      setNewConnectionId(undefined)
      navigate(`/notebooks/${result.id}`)
    } catch (err) {
      console.error('Failed to create notebook:', err)
    }
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-dc-error text-lg">Failed to load notebooks</p>
        <p className="text-dc-text-muted text-sm mt-2">{(error as Error).message}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-dc-text">Agentic Notebooks</h1>
        <p className="mt-1 text-sm text-dc-text-muted">
          Persistent AI workspaces for analysis. Ask questions, get charts and markdown, then keep
          iterating.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="text-sm text-dc-text-muted">
          {notebooks.length} notebook{notebooks.length !== 1 ? 's' : ''}
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="inline-flex items-center px-4 py-2 bg-dc-primary text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
        >
          New Notebook
        </button>
      </div>

      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-dc-surface rounded-xl shadow-xl max-w-md w-full p-6 border border-dc-border">
            <h2 className="text-lg font-semibold text-dc-text mb-4">Create Notebook</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dc-text mb-1">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Revenue investigation"
                  className="w-full px-3 py-2 border border-dc-border rounded-lg bg-dc-surface text-dc-text placeholder:text-dc-text-muted focus:outline-none focus:ring-2 focus:ring-dc-primary"
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
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
                  placeholder="What this notebook should answer"
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
                    setShowCreateForm(false)
                    setNewName('')
                    setNewDescription('')
                    setNewConnectionId(undefined)
                  }}
                  className="px-4 py-2 text-sm text-dc-text-secondary hover:text-dc-text transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || createNotebook.isPending}
                  className="px-4 py-2 bg-dc-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 text-sm font-medium"
                >
                  {createNotebook.isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="bg-dc-surface rounded-xl border border-dc-border p-6 animate-pulse"
            >
              <div className="h-5 bg-dc-surface-secondary rounded w-2/3 mb-3" />
              <div className="h-4 bg-dc-surface-secondary rounded w-1/2 mb-4" />
              <div className="h-3 bg-dc-surface-secondary rounded w-1/3" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && notebooks.length === 0 && (
        <div className="text-center py-16 bg-dc-surface rounded-xl border border-dc-border">
          <h3 className="text-lg font-semibold text-dc-text mb-2">No notebooks yet</h3>
          <p className="text-dc-text-muted mb-6 max-w-md mx-auto">
            Start a notebook to guide AI through your dataset with persistent context and reusable
            visual blocks.
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center px-4 py-2 bg-dc-primary text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
          >
            Create Your First Notebook
          </button>
        </div>
      )}

      {!isLoading && notebooks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {notebooks.map(notebook => {
            const blockCount = notebook.config?.blocks?.length || 0
            const messageCount = notebook.config?.messages?.length || 0
            const updatedAt = notebook.updatedAt
              ? new Date(notebook.updatedAt).toLocaleDateString()
              : null

            return (
              <div
                key={notebook.id}
                className="group bg-dc-surface hover:bg-dc-surface-hover rounded-xl border border-dc-border hover:border-dc-border-hover transition-all duration-200 shadow-2xs hover:shadow-md overflow-hidden"
              >
                <div className="p-5 relative">
                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    {notebook.connectionId && connectionMap.get(notebook.connectionId) && (
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
                        {connectionMap.get(notebook.connectionId)}
                      </span>
                    )}
                    {(isAdmin || notebook.createdBy === user?.id) && (
                      <button
                        onClick={async e => {
                          e.preventDefault()
                          if (
                            await confirm({
                              title: 'Delete notebook',
                              message: `Delete "${notebook.name}"? This cannot be undone.`,
                              confirmText: 'Delete',
                              variant: 'danger',
                            })
                          ) {
                            deleteNotebook.mutate(notebook.id)
                          }
                        }}
                        className="p-1.5 rounded-md text-dc-text-muted hover:text-dc-error hover:bg-dc-danger-bg transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete notebook"
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
                            d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                          />
                        </svg>
                      </button>
                    )}
                  </div>

                  <h3 className="text-base font-semibold text-dc-text truncate pr-24">
                    {notebook.name}
                  </h3>
                  {notebook.description && (
                    <p className="text-sm text-dc-text-muted mt-1 line-clamp-2">
                      {notebook.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 mt-3 text-xs text-dc-text-muted">
                    <span>
                      {blockCount} block{blockCount !== 1 ? 's' : ''}
                    </span>
                    <span>
                      {messageCount} message{messageCount !== 1 ? 's' : ''}
                    </span>
                    {updatedAt && <span>Updated {updatedAt}</span>}
                  </div>

                  {notebook.createdByName && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-dc-text-muted">
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
                      {notebook.createdByName}
                    </div>
                  )}
                </div>

                {(notebook.visibilityGroups?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 px-5 pb-2">
                    {notebook.visibilityGroups!.map((g: any) => (
                      <span
                        key={g.groupId}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-dc-accent-bg text-dc-accent border border-dc-accent-border"
                      >
                        {g.groupName}
                      </span>
                    ))}
                  </div>
                )}

                <div className="px-5 py-3 border-t border-dc-border bg-dc-surface-secondary">
                  <Link
                    to={`/notebooks/${notebook.id}`}
                    className="text-sm font-medium text-dc-primary hover:opacity-80 transition-opacity"
                  >
                    Open Notebook
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <ConfirmDialog />
    </div>
  )
}
