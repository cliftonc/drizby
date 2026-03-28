import { useConnections } from '../hooks/useConnections'

interface ConnectionSelectorProps {
  value: number | undefined
  onChange: (connectionId: number) => void
  className?: string
  compact?: boolean
}

export default function ConnectionSelector({
  value,
  onChange,
  className,
  compact,
}: ConnectionSelectorProps) {
  const { data: connections = [], isLoading } = useConnections()

  if (isLoading || connections.length <= 1) return null

  const selectClass =
    className ??
    (compact
      ? 'pl-5 pr-1 py-0.5 text-[11px] border border-dc-border rounded-md bg-transparent text-dc-text-muted cursor-pointer outline-none'
      : 'pl-6 pr-3 py-1.5 text-sm border border-dc-border rounded-md bg-dc-surface text-dc-text')

  return (
    <div className="relative inline-flex items-center">
      <svg
        className={`absolute pointer-events-none text-dc-accent ${compact ? 'left-1 w-3 h-3' : 'left-1.5 w-3.5 h-3.5'}`}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375"
        />
      </svg>
      <select
        value={value ?? ''}
        onChange={e => onChange(Number.parseInt(e.target.value))}
        className={selectClass}
      >
        {connections.map(conn => (
          <option key={conn.id} value={conn.id}>
            {conn.name}
          </option>
        ))}
      </select>
    </div>
  )
}
