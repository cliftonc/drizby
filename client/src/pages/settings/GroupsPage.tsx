import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Modal } from '../../components/Modal'
import { useConfirm } from '../../hooks/useConfirm'
import {
  type Group,
  type GroupMember,
  type GroupType,
  useAddGroupMembers,
  useCreateGroup,
  useCreateGroupType,
  useDeleteGroup,
  useDeleteGroupType,
  useGroupMembers,
  useGroupTypes,
  useGroups,
  useRemoveGroupMember,
  useUpdateGroup,
  useUpdateGroupType,
} from '../../hooks/useGroups'

interface UserRow {
  id: number
  email: string
  name: string
  role: string
}

// ── Modals ────────────────────────────────────────────────────────────────

function CreateTypeModal({
  isOpen,
  onClose,
  onCreate,
  isPending,
}: {
  isOpen: boolean
  onClose: () => void
  onCreate: (data: { name: string; description?: string }) => void
  isPending: boolean
}) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const submit = () => {
    if (!name.trim()) return
    onCreate({ name: name.trim(), description: desc.trim() || undefined })
    setName('')
    setDesc('')
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <h3 className="text-lg font-semibold text-dc-text mb-1">New Group Type</h3>
        <p className="text-sm text-dc-text-muted mb-5">
          A group type is a taxonomy like "Department", "Role", or "Team".
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-dc-text mb-1">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Department"
              onKeyDown={e => e.key === 'Enter' && submit()}
              className="w-full px-3 py-2 border border-dc-border rounded-lg bg-dc-surface text-dc-text placeholder:text-dc-text-muted focus:outline-none focus:ring-2 focus:ring-dc-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dc-text mb-1">
              Description <span className="text-dc-text-muted font-normal">(optional)</span>
            </label>
            <input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Organizational departments"
              onKeyDown={e => e.key === 'Enter' && submit()}
              className="w-full px-3 py-2 border border-dc-border rounded-lg bg-dc-surface text-dc-text placeholder:text-dc-text-muted focus:outline-none focus:ring-2 focus:ring-dc-primary"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-dc-text-secondary hover:text-dc-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || isPending}
            className="px-4 py-2 bg-dc-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 text-sm font-medium"
          >
            {isPending ? 'Creating...' : 'Create Type'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function EditTypeModal({
  groupType,
  onClose,
  onSave,
  isPending,
}: {
  groupType: GroupType
  onClose: () => void
  onSave: (data: { id: number; name: string; description?: string }) => void
  isPending: boolean
}) {
  const [name, setName] = useState(groupType.name)
  const [desc, setDesc] = useState(groupType.description || '')
  const submit = () => {
    if (!name.trim()) return
    onSave({ id: groupType.id, name: name.trim(), description: desc.trim() || undefined })
  }
  return (
    <Modal isOpen onClose={onClose}>
      <div className="p-6">
        <h3 className="text-lg font-semibold text-dc-text mb-4">Edit Group Type</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-dc-text mb-1">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              className="w-full px-3 py-2 border border-dc-border rounded-lg bg-dc-surface text-dc-text focus:outline-none focus:ring-2 focus:ring-dc-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dc-text mb-1">Description</label>
            <input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              className="w-full px-3 py-2 border border-dc-border rounded-lg bg-dc-surface text-dc-text focus:outline-none focus:ring-2 focus:ring-dc-primary"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-dc-text-secondary hover:text-dc-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || isPending}
            className="px-4 py-2 bg-dc-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 text-sm font-medium"
          >
            {isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function EditGroupModal({
  group,
  onClose,
  onSave,
  isPending,
}: {
  group: Group
  onClose: () => void
  onSave: (data: { id: number; name: string; description?: string }) => void
  isPending: boolean
}) {
  const [name, setName] = useState(group.name)
  const [desc, setDesc] = useState(group.description || '')
  const submit = () => {
    if (!name.trim()) return
    onSave({ id: group.id, name: name.trim(), description: desc.trim() || undefined })
  }
  return (
    <Modal isOpen onClose={onClose}>
      <div className="p-6">
        <h3 className="text-lg font-semibold text-dc-text mb-4">Edit Group</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-dc-text mb-1">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              className="w-full px-3 py-2 border border-dc-border rounded-lg bg-dc-surface text-dc-text focus:outline-none focus:ring-2 focus:ring-dc-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dc-text mb-1">Description</label>
            <input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              className="w-full px-3 py-2 border border-dc-border rounded-lg bg-dc-surface text-dc-text focus:outline-none focus:ring-2 focus:ring-dc-primary"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-dc-text-secondary hover:text-dc-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || isPending}
            className="px-4 py-2 bg-dc-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 text-sm font-medium"
          >
            {isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function CreateGroupModal({
  isOpen,
  onClose,
  onCreate,
  isPending,
  typeName,
  groupTypeId,
  parentGroup,
}: {
  isOpen: boolean
  onClose: () => void
  onCreate: (data: {
    name: string
    description?: string
    groupTypeId: number
    parentId?: number
  }) => void
  isPending: boolean
  typeName: string
  groupTypeId: number
  parentGroup?: Group | null
}) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const submit = () => {
    if (!name.trim()) return
    onCreate({
      name: name.trim(),
      description: desc.trim() || undefined,
      groupTypeId,
      parentId: parentGroup?.id,
    })
    setName('')
    setDesc('')
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <h3 className="text-lg font-semibold text-dc-text mb-1">
          {parentGroup ? 'New Sub-group' : 'New Group'}
        </h3>
        <p className="text-sm text-dc-text-muted mb-5">
          {parentGroup ? (
            <>
              Add a sub-group under <strong>{parentGroup.name}</strong> ({typeName}).
            </>
          ) : (
            <>
              Add a new group under <strong>{typeName}</strong>.
            </>
          )}
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-dc-text mb-1">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Engineering"
              onKeyDown={e => e.key === 'Enter' && submit()}
              className="w-full px-3 py-2 border border-dc-border rounded-lg bg-dc-surface text-dc-text placeholder:text-dc-text-muted focus:outline-none focus:ring-2 focus:ring-dc-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dc-text mb-1">
              Description <span className="text-dc-text-muted font-normal">(optional)</span>
            </label>
            <input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="What this group represents"
              onKeyDown={e => e.key === 'Enter' && submit()}
              className="w-full px-3 py-2 border border-dc-border rounded-lg bg-dc-surface text-dc-text placeholder:text-dc-text-muted focus:outline-none focus:ring-2 focus:ring-dc-primary"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-dc-text-secondary hover:text-dc-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || isPending}
            className="px-4 py-2 bg-dc-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 text-sm font-medium"
          >
            {isPending ? 'Creating...' : parentGroup ? 'Create Sub-group' : 'Create Group'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Draggable user pill (drag source) ────────────────────────────────────

function DraggableUser({ user }: { user: UserRow }) {
  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('application/x-user-id', String(user.id))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-dc-border bg-dc-surface hover:border-dc-primary/40 cursor-grab active:cursor-grabbing transition-colors select-none"
    >
      <div className="w-6 h-6 rounded-full bg-dc-primary/15 flex items-center justify-center text-[10px] font-medium text-dc-primary shrink-0">
        {user.name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-dc-text truncate">{user.name}</div>
        <div className="text-[10px] text-dc-text-muted truncate leading-tight">{user.email}</div>
      </div>
      <svg
        className="w-3.5 h-3.5 text-dc-text-disabled shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
      </svg>
    </div>
  )
}

// ── Member pill (draggable, removable) ───────────────────────────────────

function MemberPill({
  member,
  onRemove,
}: {
  member: GroupMember
  onRemove: () => void
}) {
  return (
    <span
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('application/x-user-id', String(member.userId))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-full bg-dc-surface-secondary border border-dc-border text-xs cursor-grab active:cursor-grabbing"
    >
      <span className="w-5 h-5 rounded-full bg-dc-primary/15 flex items-center justify-center text-[10px] font-medium text-dc-primary">
        {member.userName.charAt(0).toUpperCase()}
      </span>
      <span className="text-dc-text px-1">{member.userName}</span>
      <button
        onClick={e => {
          e.stopPropagation()
          onRemove()
        }}
        className="w-4 h-4 rounded-full flex items-center justify-center text-dc-text-disabled hover:text-dc-error hover:bg-dc-error/10 transition-colors"
      >
        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </span>
  )
}

// ── Root-level drop zone (between groups, for un-nesting) ───────────────

function RootDropZone({ onDrop }: { onDrop: (e: React.DragEvent) => void }) {
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={e => {
        if (e.dataTransfer.types.includes('application/x-group-id')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        setOver(false)
        onDrop(e)
      }}
      className={`transition-all rounded ${
        over
          ? 'h-10 border-2 border-dashed border-dc-primary/50 bg-dc-primary/5 flex items-center justify-center'
          : 'h-0'
      }`}
      style={over ? undefined : { padding: '6px 0', margin: '-6px 0' }}
    >
      {over && (
        <span className="text-[11px] text-dc-primary font-medium animate-pulse">
          Drop to move to root level
        </span>
      )}
    </div>
  )
}

// ── Recursive group tree node ────────────────────────────────────────────

function GroupTreeNode({
  group,
  allGroups,
  depth,
  onEdit,
  onDelete,
  onDropUser,
  onRemoveMember,
  onDropGroup,
  onAddSubgroup,
  expandSignal,
}: {
  group: Group
  allGroups: Group[]
  depth: number
  onEdit: (g: Group) => void
  onDelete: (g: Group) => void
  onDropUser: (groupId: number, userId: number) => void
  onRemoveMember: (groupId: number, userId: number) => void
  onDropGroup: (groupId: number, newParentId: number | null) => void
  onAddSubgroup: (parent: Group) => void
  expandSignal: { gen: number; expanded: boolean }
}) {
  const [expanded, setExpanded] = useState(false)
  const lastSignal = useRef(expandSignal.gen)
  useEffect(() => {
    if (expandSignal.gen !== lastSignal.current) {
      lastSignal.current = expandSignal.gen
      setExpanded(expandSignal.expanded)
    }
  }, [expandSignal])
  const [dragOver, setDragOver] = useState(false)
  const { data: members = [] } = useGroupMembers(group.id)
  const children = allGroups
    .filter(g => g.parentId === group.id)
    .sort((a, b) => a.name.localeCompare(b.name))

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const hasGroup = e.dataTransfer.types.includes('application/x-group-id')
    e.dataTransfer.dropEffect = hasGroup ? 'move' : 'copy'
    setDragOver(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation()
    setDragOver(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const userId = e.dataTransfer.getData('application/x-user-id')
    const groupId = e.dataTransfer.getData('application/x-group-id')
    if (userId) {
      onDropUser(group.id, Number(userId))
      setExpanded(true)
    } else if (groupId && Number(groupId) !== group.id) {
      onDropGroup(Number(groupId), group.id)
    }
  }

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div
        draggable
        onDragStart={e => {
          e.dataTransfer.setData('application/x-group-id', String(group.id))
          e.dataTransfer.effectAllowed = 'move'
          e.stopPropagation()
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-lg border transition-all mb-1.5 group/card ${
          dragOver
            ? 'border-dc-primary bg-dc-primary/5 ring-2 ring-dc-primary/20'
            : 'border-dc-border bg-dc-surface hover:border-dc-border-hover'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2">
          {/* Drag handle */}
          <svg
            className="w-3.5 h-3.5 text-dc-text-disabled shrink-0 cursor-grab active:cursor-grabbing"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
          </svg>
          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-dc-text-muted hover:text-dc-text transition-colors p-0.5"
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(!expanded)}>
            <div className="text-sm font-medium text-dc-text">{group.name}</div>
            {group.description && (
              <div className="text-xs text-dc-text-muted truncate">{group.description}</div>
            )}
          </div>
          {/* Actions (visible on hover) */}
          <div className="flex gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity">
            <button
              onClick={() => onAddSubgroup(group)}
              className="p-1 rounded text-dc-text-muted hover:text-dc-primary hover:bg-dc-surface-hover transition-colors"
              title="Add sub-group"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
            <button
              onClick={() => onEdit(group)}
              className="p-1 rounded text-dc-text-muted hover:text-dc-primary hover:bg-dc-surface-hover transition-colors"
              title="Edit group"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"
                />
              </svg>
            </button>
            <button
              onClick={() => onDelete(group)}
              className="p-1 rounded text-dc-text-muted hover:text-dc-error hover:bg-dc-error/10 transition-colors"
              title="Delete group"
            >
              <svg
                className="w-3.5 h-3.5"
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
          </div>
        </div>

        {/* Members (expanded) */}
        {expanded && (
          <div className="px-3 pb-2.5 pt-0">
            <div className="border-t border-dc-border pt-2.5">
              {members.length === 0 ? (
                <p className="text-[11px] text-dc-text-muted italic py-0.5">
                  Drag people here to add members
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {members.map(m => (
                    <MemberPill
                      key={m.userId}
                      member={m}
                      onRemove={() => onRemoveMember(group.id, m.userId)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {dragOver && !expanded && (
          <div className="px-3 pb-2 text-[11px] text-dc-primary font-medium text-center animate-pulse">
            Drop to add
          </div>
        )}
      </div>

      {/* Render children recursively */}
      {children.map(child => (
        <GroupTreeNode
          key={child.id}
          group={child}
          allGroups={allGroups}
          depth={depth + 1}
          onEdit={onEdit}
          onDelete={onDelete}
          onDropUser={onDropUser}
          onRemoveMember={onRemoveMember}
          onDropGroup={onDropGroup}
          onAddSubgroup={onAddSubgroup}
          expandSignal={expandSignal}
        />
      ))}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────

export default function GroupsPage() {
  const { data: groupTypes = [], isLoading: typesLoading } = useGroupTypes()
  const { data: allGroups = [], isLoading: groupsLoading } = useGroups()
  const createGroupType = useCreateGroupType()
  const updateGroupType = useUpdateGroupType()
  const deleteGroupType = useDeleteGroupType()
  const createGroup = useCreateGroup()
  const updateGroup = useUpdateGroup()
  const deleteGroup = useDeleteGroup()
  const addMembers = useAddGroupMembers()
  const removeMember = useRemoveGroupMember()
  const [confirm, ConfirmDialog] = useConfirm()

  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null)
  const [showCreateType, setShowCreateType] = useState(false)
  const [editingType, setEditingType] = useState<GroupType | null>(null)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [createGroupParent, setCreateGroupParent] = useState<Group | null>(null)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [expandSignal, setExpandSignal] = useState({ gen: 0, expanded: false })
  const [peopleSearch, setPeopleSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  // Debounce people search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(peopleSearch), 300)
    return () => clearTimeout(t)
  }, [peopleSearch])

  // Server-side people search, max 20
  const { data: users = [] } = useQuery<UserRow[]>({
    queryKey: ['users', 'search', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' })
      if (debouncedSearch) params.set('search', debouncedSearch)
      const res = await fetch(`/api/users?${params}`, { credentials: 'include' })
      if (res.status === 403) return []
      if (!res.ok) throw new Error('Failed to fetch users')
      return res.json()
    },
  })

  const isLoading = typesLoading || groupsLoading

  // Auto-select first type
  const activeTypeId = selectedTypeId ?? groupTypes[0]?.id ?? null
  const activeType = groupTypes.find(t => t.id === activeTypeId) || null
  const typeGroups = allGroups
    .filter(g => g.groupTypeId === activeTypeId)
    .sort((a, b) => a.name.localeCompare(b.name))
  const rootGroups = typeGroups.filter(g => !g.parentId)
  const approvedUsers = users.filter(u => u.role !== 'user')

  const handleDeleteGroup = async (g: Group) => {
    if (
      await confirm({
        title: 'Delete group',
        message: `Delete "${g.name}"? Members will lose access to content restricted to this group.`,
        confirmText: 'Delete',
        variant: 'danger',
      })
    ) {
      deleteGroup.mutate(g.id)
    }
  }

  const handleDropGroupOnRoot = (e: React.DragEvent) => {
    e.preventDefault()
    const groupId = e.dataTransfer.getData('application/x-group-id')
    if (groupId) {
      updateGroup.mutate({ id: Number(groupId), parentId: null })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-dc-text-muted py-8">
        <img
          src="/logo.png"
          alt=""
          className="w-5 h-5 animate-spin"
          style={{ animationDuration: '1.5s' }}
        />
        Loading...
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-dc-text">Groups</h2>
        <p className="text-sm text-dc-text-muted mt-0.5">
          Organize users into groups and control content visibility.
        </p>
      </div>

      {groupTypes.length === 0 ? (
        <div className="text-center py-16 bg-dc-surface rounded-xl border border-dc-border">
          <svg
            className="w-12 h-12 mx-auto text-dc-text-disabled mb-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
            />
          </svg>
          <h3 className="text-base font-semibold text-dc-text mb-1">No group types yet</h3>
          <p className="text-sm text-dc-text-muted mb-5 max-w-sm mx-auto">
            Start by creating a group type like "Department" or "Team", then add groups and members.
          </p>
          <button
            onClick={() => setShowCreateType(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-dc-primary text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
          >
            Create Your First Type
          </button>
        </div>
      ) : (
        <div className="flex gap-5" style={{ minHeight: 400 }}>
          {/* ── Left: Group Types (narrow) ─────────────────────── */}
          <div className="shrink-0" style={{ width: 150 }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-medium text-dc-text-muted uppercase tracking-wider">
                Types
              </div>
              <button
                onClick={() => setShowCreateType(true)}
                className="p-1 rounded text-dc-text-muted hover:text-dc-primary hover:bg-dc-surface-hover transition-colors"
                title="New group type"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>
            <div className="space-y-0.5">
              {groupTypes.map(gt => {
                const isActive = gt.id === activeTypeId
                return (
                  <div key={gt.id} className="group/type">
                    <button
                      onClick={() => setSelectedTypeId(gt.id)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors flex items-center gap-1 ${
                        isActive
                          ? 'bg-dc-primary/10 text-dc-primary font-medium'
                          : 'text-dc-text-secondary hover:bg-dc-surface-hover'
                      }`}
                    >
                      <span className="truncate flex-1">{gt.name}</span>
                      <span className="hidden group-hover/type:flex gap-0.5 shrink-0">
                        <span
                          onClick={e => {
                            e.stopPropagation()
                            setEditingType(gt)
                          }}
                          className="p-1 rounded text-dc-text-muted hover:text-dc-primary hover:bg-dc-surface-hover transition-colors"
                          title="Edit type"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"
                            />
                          </svg>
                        </span>
                        <span
                          onClick={async e => {
                            e.stopPropagation()
                            if (
                              await confirm({
                                title: 'Delete group type',
                                message: `Delete "${gt.name}" and all its groups? This cannot be undone.`,
                                confirmText: 'Delete',
                                variant: 'danger',
                              })
                            ) {
                              if (activeTypeId === gt.id) setSelectedTypeId(null)
                              deleteGroupType.mutate(gt.id)
                            }
                          }}
                          className="p-1 rounded text-dc-text-muted hover:text-dc-error hover:bg-dc-error/10 transition-colors"
                          title="Delete type"
                        >
                          <svg
                            className="w-3.5 h-3.5"
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
                        </span>
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Center: Group tree ─────────────────────────────── */}
          <div className="flex-1 min-w-0">
            {activeType && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="text-[11px] font-medium text-dc-text-muted uppercase tracking-wider">
                      {activeType.name}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setExpandSignal(s => ({ gen: s.gen + 1, expanded: true }))}
                        className="text-[11px] text-dc-text-muted hover:text-dc-text transition-colors"
                      >
                        Expand all
                      </button>
                      <span className="text-[11px] text-dc-text-disabled">·</span>
                      <button
                        onClick={() => setExpandSignal(s => ({ gen: s.gen + 1, expanded: false }))}
                        className="text-[11px] text-dc-text-muted hover:text-dc-text transition-colors"
                      >
                        Collapse all
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setCreateGroupParent(null)
                      setShowCreateGroup(true)
                    }}
                    className="inline-flex items-center gap-1 text-sm text-dc-primary hover:opacity-80 transition-opacity font-medium"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 4.5v15m7.5-7.5h-15"
                      />
                    </svg>
                    Add Group
                  </button>
                </div>

                {typeGroups.length === 0 ? (
                  <div className="border-2 border-dashed border-dc-border rounded-xl py-12 text-center">
                    <p className="text-sm text-dc-text-muted mb-3">
                      No groups in {activeType.name} yet
                    </p>
                    <button
                      onClick={() => {
                        setCreateGroupParent(null)
                        setShowCreateGroup(true)
                      }}
                      className="text-sm text-dc-primary font-medium hover:opacity-80"
                    >
                      Create first group
                    </button>
                  </div>
                ) : (
                  <div>
                    <RootDropZone onDrop={handleDropGroupOnRoot} />
                    {rootGroups.map(g => (
                      <div key={g.id}>
                        <GroupTreeNode
                          group={g}
                          allGroups={typeGroups}
                          depth={0}
                          onEdit={setEditingGroup}
                          onDelete={handleDeleteGroup}
                          onDropUser={(groupId, userId) => {
                            addMembers.mutate({ groupId, userIds: [userId] })
                          }}
                          onRemoveMember={(groupId, userId) => {
                            removeMember.mutate({ groupId, userId })
                          }}
                          onDropGroup={(groupId, newParentId) => {
                            updateGroup.mutate({ id: groupId, parentId: newParentId })
                          }}
                          onAddSubgroup={parent => {
                            setCreateGroupParent(parent)
                            setShowCreateGroup(true)
                          }}
                          expandSignal={expandSignal}
                        />
                        <RootDropZone onDrop={handleDropGroupOnRoot} />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Right: People panel (drag source) ─────────────── */}
          <div className="shrink-0 border-l border-dc-border pl-5" style={{ width: 210 }}>
            <div className="text-[11px] font-medium text-dc-text-muted uppercase tracking-wider mb-2">
              People
            </div>
            <div className="relative mb-2">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dc-text-disabled pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
              <input
                value={peopleSearch}
                onChange={e => setPeopleSearch(e.target.value)}
                placeholder="Search people..."
                className="w-full pl-7 pr-3 py-1.5 text-xs border border-dc-border rounded-lg bg-dc-surface text-dc-text placeholder:text-dc-text-muted focus:outline-none focus:ring-2 focus:ring-dc-primary"
              />
            </div>
            <p className="text-[10px] text-dc-text-disabled mb-2 leading-snug">
              Drag onto a group to add as member
            </p>
            <div
              className="space-y-1 overflow-y-auto pr-1"
              style={{ maxHeight: 'calc(100vh - 320px)' }}
            >
              {approvedUsers.map(u => (
                <DraggableUser key={u.id} user={u} />
              ))}
              {approvedUsers.length === 0 && (
                <p className="text-xs text-dc-text-muted italic py-2">
                  {peopleSearch ? 'No matches' : 'No users'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────── */}
      <CreateTypeModal
        isOpen={showCreateType}
        onClose={() => setShowCreateType(false)}
        onCreate={data => {
          createGroupType.mutate(data, { onSuccess: () => setShowCreateType(false) })
        }}
        isPending={createGroupType.isPending}
      />

      {editingType && (
        <EditTypeModal
          groupType={editingType}
          onClose={() => setEditingType(null)}
          onSave={data => {
            updateGroupType.mutate(data, { onSuccess: () => setEditingType(null) })
          }}
          isPending={updateGroupType.isPending}
        />
      )}

      {editingGroup && (
        <EditGroupModal
          group={editingGroup}
          onClose={() => setEditingGroup(null)}
          onSave={data => {
            updateGroup.mutate(data, { onSuccess: () => setEditingGroup(null) })
          }}
          isPending={updateGroup.isPending}
        />
      )}

      {activeType && (
        <CreateGroupModal
          isOpen={showCreateGroup}
          onClose={() => {
            setShowCreateGroup(false)
            setCreateGroupParent(null)
          }}
          onCreate={data => {
            createGroup.mutate(data, {
              onSuccess: () => {
                setShowCreateGroup(false)
                setCreateGroupParent(null)
              },
            })
          }}
          isPending={createGroup.isPending}
          typeName={activeType.name}
          groupTypeId={activeType.id}
          parentGroup={createGroupParent}
        />
      )}

      <ConfirmDialog />
    </div>
  )
}
