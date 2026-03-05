import { Link, useLocation } from 'react-router-dom'

const sections = [
  {
    label: 'Account',
    items: [
      { path: '/settings', label: 'Your Profile' },
      { path: '/settings/team', label: 'Team' },
    ]
  },
  {
    label: 'Data',
    items: [
      { path: '/settings/connections', label: 'Connections' },
      { path: '/settings/cube-definitions', label: 'Cube Definitions' },
    ]
  }
]

export default function SettingsNav() {
  const location = useLocation()

  return (
    <nav style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--dc-border)', paddingRight: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--dc-text)', marginBottom: 24, marginTop: 0 }}>Settings</h2>
      {sections.map(section => (
        <div key={section.label} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 11, fontWeight: 500, color: 'var(--dc-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, marginTop: 0 }}>
            {section.label}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {section.items.map(item => {
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  style={{
                    display: 'block',
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 13,
                    textDecoration: 'none',
                    color: isActive ? 'var(--dc-text)' : 'var(--dc-text-muted)',
                    backgroundColor: isActive ? 'var(--dc-surface-hover)' : 'transparent',
                    fontWeight: isActive ? 500 : 400,
                    transition: 'background-color 0.15s'
                  }}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}
