import { useQuery } from '@tanstack/react-query'
import type { Connection } from '../types'

export function useConnections() {
  return useQuery({
    queryKey: ['connections'],
    queryFn: async (): Promise<Connection[]> => {
      const response = await fetch('/api/connections')
      if (!response.ok) throw new Error('Failed to fetch connections')
      return response.json()
    }
  })
}
