import { Link, useLocation } from 'react-router-dom'

const sections = [
  {
    label: 'Account',
    items: [
      { path: '/settings', label: 'General' },
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
    <nav className="w-56 shrink-0 border-r border-gray-800 pr-6">
      <h2 className="text-lg font-semibold text-white mb-6">Settings</h2>
      {sections.map(section => (
        <div key={section.label} className="mb-6">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{section.label}</h3>
          <div className="space-y-1">
            {section.items.map(item => {
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`block px-3 py-1.5 rounded text-sm transition-colors ${
                    isActive
                      ? 'bg-gray-800 text-white font-medium'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  }`}
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
