import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  AnalyticsPage,
  CreateAnalyticsPageRequest,
  UpdateAnalyticsPageRequest
} from '../types'

const API_BASE = '/api/analytics-pages'

interface ApiResponse<T> {
  data: T
}

export function useAnalyticsPages() {
  return useQuery({
    queryKey: ['analytics-pages'],
    queryFn: async (): Promise<AnalyticsPage[]> => {
      const response = await fetch(API_BASE)
      if (!response.ok) throw new Error('Failed to fetch analytics pages')
      const data: ApiResponse<AnalyticsPage[]> = await response.json()
      return data.data
    }
  })
}

export function useAnalyticsPage(id: number | string) {
  return useQuery({
    queryKey: ['analytics-pages', id],
    queryFn: async (): Promise<AnalyticsPage> => {
      const response = await fetch(`${API_BASE}/${id}`)
      if (!response.ok) throw new Error('Failed to fetch analytics page')
      const data: ApiResponse<AnalyticsPage> = await response.json()
      return data.data
    },
    enabled: !!id
  })
}

export function useCreateAnalyticsPage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (pageData: CreateAnalyticsPageRequest): Promise<AnalyticsPage> => {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pageData)
      })
      if (!response.ok) throw new Error('Failed to create analytics page')
      const data: ApiResponse<AnalyticsPage> = await response.json()
      return data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics-pages'] })
    }
  })
}

export function useCreateExamplePage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<AnalyticsPage> => {
      const response = await fetch(`${API_BASE}/create-example`, { method: 'POST' })
      if (!response.ok) throw new Error('Failed to create example page')
      const data: ApiResponse<AnalyticsPage> = await response.json()
      return data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics-pages'] })
    }
  })
}

export function useUpdateAnalyticsPage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...pageData
    }: UpdateAnalyticsPageRequest & { id: number }): Promise<AnalyticsPage> => {
      const response = await fetch(`${API_BASE}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pageData)
      })
      if (!response.ok) throw new Error('Failed to update analytics page')
      const data: ApiResponse<AnalyticsPage> = await response.json()
      return data.data
    },
    onSuccess: (updatedPage, variables) => {
      queryClient.setQueryData(['analytics-pages', variables.id], updatedPage)
      queryClient.setQueryData(['analytics-pages', String(variables.id)], updatedPage)
      queryClient.invalidateQueries({ queryKey: ['analytics-pages'], exact: true })
    }
  })
}

export function useResetAnalyticsPage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number): Promise<AnalyticsPage> => {
      const response = await fetch(`${API_BASE}/${id}/reset`, { method: 'POST' })
      if (!response.ok) throw new Error('Failed to reset analytics page')
      const data: ApiResponse<AnalyticsPage> = await response.json()
      return data.data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['analytics-pages'] })
      queryClient.invalidateQueries({ queryKey: ['analytics-pages', id] })
    }
  })
}

export function useDeleteAnalyticsPage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number): Promise<void> => {
      const response = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete analytics page')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics-pages'] })
    }
  })
}
