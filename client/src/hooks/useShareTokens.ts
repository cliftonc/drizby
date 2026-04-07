import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateShareTokenRequest, ShareToken } from '../types'

function shareTokensKey(dashboardId: number) {
  return ['share-tokens', dashboardId]
}

export function useShareTokens(dashboardId: number) {
  return useQuery({
    queryKey: shareTokensKey(dashboardId),
    queryFn: async (): Promise<ShareToken[]> => {
      const res = await fetch(`/api/analytics-pages/${dashboardId}/share-tokens`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to fetch share tokens')
      const data = await res.json()
      return data.data
    },
  })
}

export function useCreateShareToken(dashboardId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: CreateShareTokenRequest): Promise<ShareToken> => {
      const res = await fetch(`/api/analytics-pages/${dashboardId}/share-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to create share token')
      const data = await res.json()
      return data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shareTokensKey(dashboardId) })
    },
  })
}

export function useRevokeShareToken(dashboardId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (tokenId: string): Promise<void> => {
      const res = await fetch(`/api/analytics-pages/${dashboardId}/share-tokens/${tokenId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok && res.status !== 204) throw new Error('Failed to revoke share token')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shareTokensKey(dashboardId) })
    },
  })
}
