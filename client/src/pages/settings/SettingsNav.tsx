import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

interface NavItem {
  path: string
  label: string
  adminOnly?: boolean
}

interface NavSection {
  label: string
  items: NavItem[]
}

const sections: NavSection[] = [
  {
    label: 'Account',
    items: [{ path: '/settings', label: 'Your Profile' }],
  },
  {
    label: 'Integrations',
    items: [
      { path: '/settings/connections', label: 'Connections', adminOnly: true },
      { path: '/settings/ai', label: 'AI Provider', adminOnly: true },
      { path: '/settings/mcp', label: 'MCP Server' },
      { path: '/settings/github-app', label: 'GitHub Sync', adminOnly: true },
    ],
  },
  {
    label: 'Team',
    items: [
      { path: '/settings/team', label: 'Members', adminOnly: true },
      { path: '/settings/groups', label: 'Groups', adminOnly: true },
      { path: '/settings/auth', label: 'Authentication', adminOnly: true },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/settings/features', label: 'Features', adminOnly: true },
      { path: '/settings/data', label: 'Reset & Backup', adminOnly: true },
    ],
  },
]

export default function SettingsNav() {
  const location = useLocation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const allItems = sections.flatMap(s => s.items).filter(item => !item.adminOnly || isAdmin)

  return (
    <>
      {/* Mobile: horizontal scrollable tabs */}
      <nav className="flex md:hidden overflow-x-auto gap-2 border-b border-dc-border pb-3 mb-0">
        {allItems.map(item => {
          const isActive = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              className="whitespace-nowrap no-underline transition-colors"
              style={{
                padding: '6px 14px',
                borderRadius: 9999,
                fontSize: 13,
                border: isActive ? '1px solid var(--dc-primary)' : '1px solid var(--dc-border)',
                color: isActive ? 'var(--dc-primary)' : 'var(--dc-text-muted)',
                backgroundColor: isActive ? 'rgba(var(--dc-primary-rgb), 0.1)' : 'transparent',
                fontWeight: isActive ? 500 : 400,
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Desktop: vertical nav with section headers */}
      <nav
        className="hidden md:block"
        style={{
          width: 200,
          flexShrink: 0,
          borderRight: '1px solid var(--dc-border)',
          paddingRight: 24,
        }}
      >
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--dc-text)',
            marginBottom: 24,
            marginTop: 0,
          }}
        >
          Settings
        </h2>
        {sections.map(section => {
          const visibleItems = section.items.filter(item => !item.adminOnly || isAdmin)
          if (visibleItems.length === 0) return null
          return (
            <div key={section.label} style={{ marginBottom: 24 }}>
              <h3
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--dc-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 8,
                  marginTop: 0,
                }}
              >
                {section.label}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {visibleItems.map(item => {
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
                        transition: 'background-color 0.15s',
                      }}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>
    </>
  )
}
