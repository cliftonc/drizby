import { useEffect, useState } from 'react'
import { useContentGroups, useGroups, useSetContentGroups } from '../hooks/useGroups'

interface GroupPickerProps {
  contentType: 'dashboard' | 'notebook'
  contentId: number
}

export default function GroupPicker({ contentType, contentId }: GroupPickerProps) {
  const { data: allGroups = [] } = useGroups()
  const { data: assignedGroups = [] } = useContentGroups(contentType, contentId)
  const setContentGroups = useSetContentGroups()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    setSelectedIds(new Set(assignedGroups.map(g => g.groupId)))
    setIsDirty(false)
  }, [assignedGroups])

  const toggle = (groupId: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
    setIsDirty(true)
  }

  const save = () => {
    setContentGroups.mutate({
      contentType,
      contentId,
      groupIds: Array.from(selectedIds),
    })
    setIsDirty(false)
  }

  if (allGroups.length === 0) {
    return (
      <p className="text-xs text-dc-text-muted italic">
        No groups configured. Create groups in Settings to control visibility.
      </p>
    )
  }

  // Group by type
  const byType = new Map<string, typeof allGroups>()
  for (const g of allGroups) {
    const list = byType.get(g.typeName) || []
    list.push(g)
    byType.set(g.typeName, list)
  }

  return (
    <div>
      <label className="block text-sm font-medium text-dc-text mb-2">
        Visible to groups
        <span className="text-xs font-normal text-dc-text-muted ml-1">
          (none selected = visible to all)
        </span>
      </label>
      <div className="space-y-3 max-h-48 overflow-y-auto">
        {Array.from(byType.entries()).map(([typeName, typeGroups]) => (
          <div key={typeName}>
            <div className="text-[11px] font-medium text-dc-text-muted uppercase tracking-wider mb-1">
              {typeName}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {typeGroups.map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggle(g.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors border"
                  style={{
                    backgroundColor: selectedIds.has(g.id)
                      ? 'rgba(var(--dc-primary-rgb), 0.15)'
                      : 'transparent',
                    borderColor: selectedIds.has(g.id) ? 'var(--dc-primary)' : 'var(--dc-border)',
                    color: selectedIds.has(g.id) ? 'var(--dc-primary)' : 'var(--dc-text-muted)',
                    fontWeight: selectedIds.has(g.id) ? 500 : 400,
                  }}
                >
                  {selectedIds.has(g.id) && (
                    <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {isDirty && (
        <button
          onClick={save}
          disabled={setContentGroups.isPending}
          className="mt-2 px-3 py-1.5 bg-dc-primary text-white rounded-md text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          {setContentGroups.isPending ? 'Saving...' : 'Save visibility'}
        </button>
      )}
    </div>
  )
}
