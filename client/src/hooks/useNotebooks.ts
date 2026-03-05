import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  Notebook,
  CreateNotebookRequest,
  UpdateNotebookRequest
} from '../types'

const API_BASE = '/api/notebooks'

interface ApiResponse<T> {
  data: T
}

export function useNotebooks() {
  return useQuery({
    queryKey: ['notebooks'],
    queryFn: async (): Promise<Notebook[]> => {
      const response = await fetch(API_BASE)
      if (!response.ok) throw new Error('Failed to fetch notebooks')
      const data: ApiResponse<Notebook[]> = await response.json()
      return data.data
    }
  })
}

export function useNotebook(id: number | string) {
  return useQuery({
    queryKey: ['notebooks', id],
    queryFn: async (): Promise<Notebook> => {
      const response = await fetch(`${API_BASE}/${id}`)
      if (!response.ok) throw new Error('Failed to fetch notebook')
      const data: ApiResponse<Notebook> = await response.json()
      return data.data
    },
    enabled: !!id
  })
}

export function useCreateNotebook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (notebookData: CreateNotebookRequest): Promise<Notebook> => {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notebookData)
      })
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || 'Failed to create notebook')
      }
      const data: ApiResponse<Notebook> = await response.json()
      return data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebooks'] })
    }
  })
}

export function useUpdateNotebook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...notebookData
    }: UpdateNotebookRequest & { id: number }): Promise<Notebook> => {
      const response = await fetch(`${API_BASE}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notebookData)
      })
      if (!response.ok) throw new Error('Failed to update notebook')
      const data: ApiResponse<Notebook> = await response.json()
      return data.data
    },
    onSuccess: (updatedNotebook, variables) => {
      queryClient.setQueryData(['notebooks', variables.id], updatedNotebook)
      queryClient.setQueryData(['notebooks', String(variables.id)], updatedNotebook)
      queryClient.invalidateQueries({ queryKey: ['notebooks'], exact: true })
    }
  })
}

export function useDeleteNotebook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number): Promise<void> => {
      const response = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete notebook')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebooks'] })
    }
  })
}
