import { SchemaVisualization } from 'drizzle-cube/client/schema'
import { useEffect, useState } from 'react'
import ConnectionCubeProvider from '../components/ConnectionCubeProvider'
import ConnectionSelector from '../components/ConnectionSelector'
import { useConnections } from '../hooks/useConnections'

const STORAGE_KEY = 'dc-schema-explorer-connection'

export default function SchemaExplorerPage() {
  const { data: connections = [] } = useConnections()

  const [connectionId, setConnectionId] = useState<number | undefined>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? Number.parseInt(stored) : undefined
  })

  useEffect(() => {
    if (connections.length > 0) {
      if (!connectionId || !connections.some(c => c.id === connectionId)) {
        setConnectionId(connections[0].id)
      }
    }
  }, [connections, connectionId])

  const handleConnectionChange = (id: number) => {
    setConnectionId(id)
    localStorage.setItem(STORAGE_KEY, String(id))
  }

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
            <h1 className="text-xl sm:text-2xl font-bold text-dc-text">Schema Explorer</h1>
            <p className="mt-1 text-sm text-dc-text-secondary leading-relaxed">
              Visualize cube schemas, dimensions, measures, and relationships.
            </p>
          </div>
          <ConnectionSelector value={connectionId} onChange={handleConnectionChange} />
        </div>
      </div>

      <div className="flex-1 min-h-0 border border-dc-border rounded-xl overflow-hidden">
        <ConnectionCubeProvider key={connectionId} connectionId={connectionId}>
          <SchemaVisualization height="100%" />
        </ConnectionCubeProvider>
      </div>
    </div>
  )
}
