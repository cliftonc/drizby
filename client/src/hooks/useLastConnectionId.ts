import { useEffect, useState } from 'react'
import { useConnections } from './useConnections'

const STORAGE_KEY = 'dc-last-connection-id'

/**
 * Returns the last-selected connection ID, persisted across pages via localStorage.
 * Falls back to the first available connection. If an override is provided (e.g. from
 * an existing notebook/dashboard), that value is used instead and does not update storage.
 */
export function useLastConnectionId(override?: number | null) {
  const { data: connections = [] } = useConnections()

  const [connectionId, setConnectionId] = useState<number | undefined>(() => {
    if (override) return override
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? Number.parseInt(stored) : undefined
  })

  // Sync override changes (e.g. navigating to a notebook with a specific connection)
  useEffect(() => {
    if (override) setConnectionId(override)
  }, [override])

  // Fall back to first connection if stored value is missing or stale
  useEffect(() => {
    if (override) return
    if (connections.length > 0) {
      if (!connectionId || !connections.some(c => c.id === connectionId)) {
        setConnectionId(connections[0].id)
      }
    }
  }, [connections, connectionId, override])

  const setAndPersist = (id: number) => {
    setConnectionId(id)
    localStorage.setItem(STORAGE_KEY, String(id))
  }

  return [connectionId, setAndPersist] as const
}
