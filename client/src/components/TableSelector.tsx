import { useState } from 'react'

export interface TableSelectorProps {
  tables: string[]
  selectedTables: Set<string>
  onSelectionChange: (tables: Set<string>) => void
  readOnly?: boolean
  filterThreshold?: number
  largeTableWarning?: number
}

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--dc-primary)',
  fontSize: 12,
  padding: 0,
  textDecoration: 'underline',
}

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  marginTop: 8,
  border: '1px solid var(--dc-border)',
  borderRadius: 6,
  fontSize: 13,
  backgroundColor: 'var(--dc-background)',
  color: 'var(--dc-text)',
  outline: 'none',
  boxSizing: 'border-box',
}

export function TableSelector({
  tables,
  selectedTables,
  onSelectionChange,
  readOnly = false,
  filterThreshold = 10,
  largeTableWarning = 50,
}: TableSelectorProps) {
  const [filter, setFilter] = useState('')

  const filtered = filter
    ? tables.filter(t => t.toLowerCase().includes(filter.toLowerCase()))
    : tables

  const toggleTable = (table: string) => {
    const next = new Set(selectedTables)
    if (next.has(table)) next.delete(table)
    else next.add(table)
    onSelectionChange(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ flexShrink: 0 }}>
        {!readOnly ? (
          <div
            style={{
              fontSize: 12,
              color: 'var(--dc-text-muted)',
              display: 'flex',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <span>
              {selectedTables.size} of {tables.length} selected
            </span>
            <button onClick={() => onSelectionChange(new Set(tables))} style={linkBtn}>
              Select All
            </button>
            <button onClick={() => onSelectionChange(new Set())} style={linkBtn}>
              Deselect All
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--dc-text-muted)' }}>
            {tables.length} table{tables.length !== 1 ? 's' : ''} found — all will be included
          </div>
        )}
        {tables.length >= largeTableWarning && !readOnly && (
          <div
            style={{
              marginTop: 8,
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 12,
              backgroundColor: 'rgba(234,179,8,0.1)',
              border: '1px solid rgba(234,179,8,0.3)',
              color: 'var(--dc-text-secondary)',
            }}
          >
            This database has {tables.length} tables. Consider selecting a focused subset for better
            cube generation.
          </div>
        )}
        {tables.length > filterThreshold && (
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter tables..."
            style={searchInputStyle}
          />
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', marginTop: 4 }}>
        {filtered.map(table => (
          <label
            key={table}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 0',
              fontSize: 13,
              color: 'var(--dc-text)',
              cursor: readOnly ? 'default' : 'pointer',
            }}
          >
            {!readOnly && (
              <input
                type="checkbox"
                checked={selectedTables.has(table)}
                onChange={() => toggleTable(table)}
                style={{ accentColor: 'var(--dc-primary)' }}
              />
            )}
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{table}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
