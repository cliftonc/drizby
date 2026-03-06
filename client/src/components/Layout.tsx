import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import ThemeToggle from './ThemeToggle'

const SIDEBAR_WIDTH_KEY = 'dc-sidebar-width'
const MIN_WIDTH = 48
const MAX_WIDTH = 400
const DEFAULT_WIDTH = 200
const COLLAPSE_THRESHOLD = 80

// Heroicons (outline, 24x24)
const icons = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  ),
  notebook: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  ),
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
    </svg>
  ),
  analysis: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  ),
  semanticLayer: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  ),
  logout: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
    </svg>
  ),
}

interface NavItem {
  path: string
  label: string
  icon: React.ReactNode
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { path: '/', label: 'Home', icon: icons.home },
  { path: '/notebooks', label: 'Notebooks', icon: icons.notebook },
  { path: '/dashboards', label: 'Dashboards', icon: icons.dashboard },
  { path: '/analysis-builder', label: 'Analysis Builder', icon: icons.analysis },
  { path: '/schema-editor', label: 'Semantic Layer', icon: icons.semanticLayer, adminOnly: true },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH
  })
  const isDragging = useRef(false)
  const collapsed = sidebarWidth < COLLAPSE_THRESHOLD

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, e.clientX))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = (e: MouseEvent) => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      const finalWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, e.clientX))
      const w = finalWidth < COLLAPSE_THRESHOLD ? MIN_WIDTH : finalWidth
      setSidebarWidth(w)
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w))
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  const handleDoubleClick = useCallback(() => {
    const newWidth = collapsed ? DEFAULT_WIDTH : MIN_WIDTH
    setSidebarWidth(newWidth)
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(newWidth))
  }, [collapsed])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <nav style={{
        width: sidebarWidth,
        minWidth: MIN_WIDTH,
        backgroundColor: 'var(--dc-sidebar-bg)',
        color: 'var(--dc-sidebar-text)',
        padding: '12px 0',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: isDragging.current ? 'none' : 'width 0.15s ease'
      }}>
        <div style={{
          padding: collapsed ? '0 0 12px' : '0 12px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8,
          whiteSpace: 'nowrap',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <img src="/logo.png" alt="Drizby" style={{ width: 24, height: 24, flexShrink: 0, filter: 'brightness(0) invert(1)', opacity: 0.9 }} />
            {!collapsed && <span style={{ fontSize: 18, fontWeight: 700 }}>Drizby</span>}
          </div>
          {!collapsed && <ThemeToggle />}
        </div>

        <div style={{ padding: '8px 0', flex: 1, overflow: 'auto' }}>
          {navItems.filter(item => !item.adminOnly || user?.role === 'admin').map(item => {
            const isActive = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path))

            return (
              <Link
                key={item.path}
                to={item.path}
                title={collapsed ? item.label : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: collapsed ? 0 : 10,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  padding: collapsed ? '8px 0' : '7px 12px',
                  color: isActive ? '#fff' : 'var(--dc-sidebar-text)',
                  backgroundColor: isActive ? 'var(--dc-sidebar-active)' : 'transparent',
                  textDecoration: 'none',
                  fontSize: 13,
                  transition: 'background-color 0.15s',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden'
                }}
              >
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  opacity: isActive ? 1 : 0.7
                }}>
                  {item.icon}
                </span>
                {!collapsed && item.label}
              </Link>
            )
          })}
        </div>

        {/* Settings link */}
        {(() => {
          const isActive = location.pathname.startsWith('/settings')
          return (
            <Link
              to="/settings"
              title={collapsed ? 'Settings' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: collapsed ? 0 : 10,
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? '8px 0' : '7px 12px',
                color: isActive ? '#fff' : 'var(--dc-sidebar-text)',
                backgroundColor: isActive ? 'var(--dc-sidebar-active)' : 'transparent',
                textDecoration: 'none',
                fontSize: 13,
                transition: 'background-color 0.15s',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                borderTop: '1px solid rgba(255,255,255,0.1)'
              }}
            >
              <span style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                opacity: isActive ? 1 : 0.7
              }}>
                {icons.settings}
              </span>
              {!collapsed && 'Settings'}
            </Link>
          )
        })()}

        {/* User row */}
        <div style={{
          padding: collapsed ? '6px 0' : '6px 12px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8
        }}>
          {!collapsed && user && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
              {user.name}
            </span>
          )}
          <button
            onClick={async () => { await logout(); navigate('/login') }}
            title="Sign out"
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
              cursor: 'pointer', padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center'
            }}
          >
            {collapsed ? icons.logout : <span style={{ fontSize: 11 }}>Sign out</span>}
          </button>
        </div>
      </nav>

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        style={{
          width: 4,
          cursor: 'col-resize',
          backgroundColor: 'transparent',
          flexShrink: 0,
          position: 'relative',
          zIndex: 10
        }}
      >
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 4,
          backgroundColor: isDragging.current ? 'var(--dc-primary)' : 'transparent',
          transition: 'background-color 0.15s'
        }} />
      </div>

      {/* Main content */}
      <main style={{
        flex: 1,
        padding: 24,
        backgroundColor: 'var(--dc-background)',
        overflow: 'auto',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column'
      }}>
        {children}
      </main>
    </div>
  )
}
