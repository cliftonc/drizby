import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: 'var(--dc-text)' }}>
        DC-BI Analytics Platform
      </h1>
      <p style={{ color: 'var(--dc-text-secondary)', marginBottom: 32 }}>
        Configurable business intelligence powered by drizzle-cube
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        <QuickCard
          title="Connections"
          description="Manage database connections to your data sources"
          link="/connections"
          count="Manage"
        />
        <QuickCard
          title="Cube Definitions"
          description="Edit and compile semantic layer cube definitions"
          link="/cube-definitions"
          count="Configure"
        />
        <QuickCard
          title="Dashboards"
          description="View and create analytics dashboards"
          link="/dashboards"
          count="Explore"
        />
        <QuickCard
          title="Analysis Builder"
          description="Build ad-hoc queries with the visual analysis builder"
          link="/analysis-builder"
          count="Query"
        />
      </div>

      <div style={{
        marginTop: 32,
        padding: 20,
        backgroundColor: 'var(--dc-surface)',
        borderRadius: 8,
        border: '1px solid var(--dc-border)'
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: 'var(--dc-text)' }}>
          Getting Started
        </h3>
        <ol style={{ margin: 0, paddingLeft: 20, color: 'var(--dc-text-secondary)', lineHeight: 1.8 }}>
          <li><strong>Connections</strong> - Add database connections to your PostgreSQL, MySQL, or other data sources</li>
          <li><strong>Cube Definitions</strong> - Define your semantic layer cubes with dimensions, measures, and joins</li>
          <li><strong>Dashboards</strong> - Create dashboards with charts and visualizations from your cubes</li>
          <li><strong>Analysis Builder</strong> - Run ad-hoc queries using the drizzle-cube analysis builder</li>
        </ol>
      </div>
    </div>
  )
}

function QuickCard({ title, description, link, count }: {
  title: string
  description: string
  link: string
  count: string
}) {
  return (
    <Link to={link} style={{ textDecoration: 'none' }}>
      <div style={{
        padding: 20,
        backgroundColor: 'var(--dc-surface)',
        borderRadius: 8,
        border: '1px solid var(--dc-border)',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s'
      }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'var(--dc-primary)'
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.1)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--dc-border)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--dc-text)' }}>{title}</h3>
          <span style={{
            fontSize: 12,
            padding: '2px 8px',
            borderRadius: 12,
            backgroundColor: 'var(--dc-primary)',
            color: '#fff'
          }}>
            {count}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--dc-text-secondary)' }}>{description}</p>
      </div>
    </Link>
  )
}
