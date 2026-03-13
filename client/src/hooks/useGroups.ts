import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface GroupType {
  id: number
  name: string
  description: string | null
  organisationId: number
  createdAt: string
  updatedAt: string
}

export interface Group {
  id: number
  name: string
  description: string | null
  groupTypeId: number
  parentId: number | null
  organisationId: number
  typeName: string
  memberCount: number
  createdAt: string
  updatedAt: string
}

export interface GroupMember {
  userId: number
  userName: string
  userEmail: string
  createdAt?: string
}

export interface GroupDetail extends Group {
  members: GroupMember[]
}

export interface ContentGroupInfo {
  groupId: number
  groupName: string
  typeName: string
}

export interface MyGroup {
  groupId: number
  groupName: string
  groupTypeId: number
  typeName: string
}

// Group Types
export function useGroupTypes() {
  return useQuery<GroupType[]>({
    queryKey: ['groupTypes'],
    queryFn: async () => {
      const res = await fetch('/api/groups/types', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch group types')
      const json = await res.json()
      return json.data
    },
  })
}

export function useCreateGroupType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await fetch('/api/groups/types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      return (await res.json()).data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groupTypes'] }),
  })
}

export function useUpdateGroupType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; name?: string; description?: string }) => {
      const res = await fetch(`/api/groups/types/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      return (await res.json()).data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groupTypes'] }),
  })
}

export function useDeleteGroupType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/groups/types/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groupTypes'] })
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}

// Groups
export function useGroups(typeId?: number) {
  return useQuery<Group[]>({
    queryKey: ['groups', typeId],
    queryFn: async () => {
      const url = typeId ? `/api/groups?typeId=${typeId}` : '/api/groups'
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch groups')
      const json = await res.json()
      return json.data
    },
  })
}

export function useGroup(id: number) {
  return useQuery<GroupDetail>({
    queryKey: ['groups', id],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${id}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch group')
      return (await res.json()).data
    },
    enabled: id > 0,
  })
}

export function useCreateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      name: string
      description?: string
      groupTypeId: number
      parentId?: number
    }) => {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      return (await res.json()).data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  })
}

export function useUpdateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: number
      name?: string
      description?: string
      parentId?: number | null
    }) => {
      const res = await fetch(`/api/groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      return (await res.json()).data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  })
}

export function useDeleteGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/groups/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  })
}

// Membership
export function useGroupMembers(groupId: number) {
  return useQuery<GroupMember[]>({
    queryKey: ['groups', groupId, 'members'],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/members`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch members')
      return (await res.json()).data
    },
    enabled: groupId > 0,
  })
}

export function useAddGroupMembers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ groupId, userIds }: { groupId: number; userIds: number[] }) => {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userIds }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
    },
    onSuccess: (_, { groupId }) => {
      qc.invalidateQueries({ queryKey: ['groups', groupId, 'members'] })
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}

export function useRemoveGroupMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ groupId, userId }: { groupId: number; userId: number }) => {
      const res = await fetch(`/api/groups/${groupId}/members/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
    },
    onSuccess: (_, { groupId }) => {
      qc.invalidateQueries({ queryKey: ['groups', groupId, 'members'] })
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}

// Current user's groups
export function useMyGroups() {
  return useQuery<MyGroup[]>({
    queryKey: ['myGroups'],
    queryFn: async () => {
      const res = await fetch('/api/groups/mine', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch my groups')
      return (await res.json()).data
    },
  })
}

// Content visibility
export function useContentGroups(contentType: string, contentId: number) {
  return useQuery<ContentGroupInfo[]>({
    queryKey: ['contentGroups', contentType, contentId],
    queryFn: async () => {
      const res = await fetch(`/api/groups/content/${contentType}/${contentId}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to fetch content groups')
      return (await res.json()).data
    },
    enabled: contentId > 0,
  })
}

export function useSetContentGroups() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      contentType,
      contentId,
      groupIds,
    }: {
      contentType: string
      contentId: number
      groupIds: number[]
    }) => {
      const res = await fetch(`/api/groups/content/${contentType}/${contentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ groupIds }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
    },
    onSuccess: (_, { contentType, contentId }) => {
      qc.invalidateQueries({ queryKey: ['contentGroups', contentType, contentId] })
    },
  })
}
