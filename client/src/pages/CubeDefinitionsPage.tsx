import { useQuery } from '@tanstack/react-query'

interface CubeDefinition {
  id: number
  name: string
  title: string | null
  description: string | null
  connectionId: number
  isActive: boolean
  createdAt: string
}

export default function CubeDefinitionsPage() {
  const { data: cubeDefs = [], isLoading } = useQuery<CubeDefinition[]>({
    queryKey: ['cube-definitions'],
    queryFn: () => fetch('/api/cube-definitions').then(r => r.json())
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--dc-text)' }}>Cube Definitions</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--dc-text-secondary)', fontSize: 14 }}>
            Define and manage your semantic layer cubes
          </p>
        </div>
        <button
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--dc-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500
          }}
          onClick={() => alert('Cube editor coming soon! This will use registerCube/unregisterCube from the compiler.')}
        >
          New Cube
        </button>
      </div>

      {/* Built-in cubes info */}
      <div style={{
        padding: 16,
        backgroundColor: 'var(--dc-surface)',
        borderRadius: 8,
        border: '1px solid var(--dc-border)',
        marginBottom: 16
      }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--dc-text)' }}>
          Built-in Demo Cubes
        </h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--dc-text-secondary)' }}>
          These cubes are loaded from the demo data source on startup:
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['Employees', 'Departments', 'Productivity'].map(name => (
            <span key={name} style={{
              padding: '4px 10px',
              fontSize: 12,
              borderRadius: 4,
              backgroundColor: 'var(--dc-surface-hover)',
              color: 'var(--dc-text)',
              border: '1px solid var(--dc-border)'
            }}>
              {name}
            </span>
          ))}
        </div>
      </div>

      {/* User-defined cubes */}
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '24px 0 12px', color: 'var(--dc-text)' }}>
        Custom Cube Definitions
      </h2>

      {isLoading ? (
        <p style={{ color: 'var(--dc-text-secondary)' }}>Loading...</p>
      ) : cubeDefs.length === 0 ? (
        <div style={{
          padding: 40,
          textAlign: 'center',
          backgroundColor: 'var(--dc-surface)',
          borderRadius: 8,
          border: '1px dashed var(--dc-border)'
        }}>
          <p style={{ color: 'var(--dc-text-secondary)', margin: '0 0 8px' }}>
            No custom cube definitions yet.
          </p>
          <p style={{ color: 'var(--dc-text-secondary)', margin: 0, fontSize: 13 }}>
            Create cube definitions to extend your semantic layer beyond the built-in demo cubes.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cubeDefs.map(cube => (
            <div key={cube.id} style={{
              padding: 16,
              backgroundColor: 'var(--dc-surface)',
              borderRadius: 8,
              border: '1px solid var(--dc-border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--dc-text)' }}>{cube.name}</h3>
                {cube.title && (
                  <span style={{ fontSize: 13, color: 'var(--dc-text-secondary)' }}>- {cube.title}</span>
                )}
              </div>
              {cube.description && (
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--dc-text-secondary)' }}>{cube.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Future features note */}
      <div style={{
        marginTop: 24,
        padding: 16,
        backgroundColor: '#eff6ff',
        borderRadius: 8,
        border: '1px solid #bfdbfe'
      }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#1e40af' }}>
          Planned Features
        </h3>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#1e40af', lineHeight: 1.8 }}>
          <li>Visual cube definition editor with dimension/measure configuration</li>
          <li>Live compilation and validation using SemanticLayerCompiler</li>
          <li>registerCube / unregisterCube lifecycle management</li>
          <li>Schema introspection from connected databases</li>
          <li>Join configuration between cubes</li>
        </ul>
      </div>
    </div>
  )
}
