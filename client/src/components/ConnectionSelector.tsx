import { useConnections } from '../hooks/useConnections'

interface ConnectionSelectorProps {
  value: number | undefined
  onChange: (connectionId: number) => void
  className?: string
}

export default function ConnectionSelector({
  value,
  onChange,
  className,
}: ConnectionSelectorProps) {
  const { data: connections = [], isLoading } = useConnections()

  if (isLoading || connections.length <= 1) return null

  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(Number.parseInt(e.target.value))}
      className={
        className ??
        'px-3 py-1.5 text-sm border border-dc-border rounded-md bg-dc-surface text-dc-text'
      }
    >
      {connections.map(conn => (
        <option key={conn.id} value={conn.id}>
          {conn.name}
        </option>
      ))}
    </select>
  )
}
