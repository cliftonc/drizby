import { DataBrowser } from 'drizzle-cube/client'
import ConnectionCubeProvider from '../components/ConnectionCubeProvider'
import ConnectionSelector from '../components/ConnectionSelector'
import { useLastConnectionId } from '../hooks/useLastConnectionId'

export default function DataBrowserPage() {
  const [connectionId, setConnectionId] = useLastConnectionId()

  if (!connectionId) {
    return (
      <div className="text-center py-8">
        <img
          src="/logo.png"
          alt="Loading..."
          className="inline-block animate-spin"
          style={{ width: 32, height: 32, animationDuration: '1.5s' }}
        />
        <p className="mt-2 text-dc-text-muted">Loading connections...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-dc-text">Data Browser</h1>
            <p className="mt-1 text-sm text-dc-text-secondary leading-relaxed">
              Browse raw data across your cubes with filtering, sorting, and pagination.
            </p>
          </div>
          <ConnectionSelector value={connectionId} onChange={setConnectionId} />
        </div>
      </div>

      <div className="flex-1 min-h-0 border border-dc-border rounded-xl overflow-hidden">
        <ConnectionCubeProvider key={connectionId} connectionId={connectionId}>
          <DataBrowser maxHeight="100%" />
        </ConnectionCubeProvider>
      </div>
    </div>
  )
}
