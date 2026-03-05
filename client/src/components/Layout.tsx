import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import ThemeToggle from './ThemeToggle'

const SIDEBAR_WIDTH_KEY = 'dc-sidebar-width'
const MIN_WIDTH = 48
const MAX_WIDTH = 400
const DEFAULT_WIDTH = 240
const COLLAPSE_THRESHOLD = 100

const navItems = [
  { path: '/', label: 'Home', icon: 'H' },
  { path: '/notebooks', label: 'Notebooks', icon: 'N' },
  { path: '/dashboards', label: 'Dashboards', icon: 'D' },
  { path: '/analysis-builder', label: 'Analysis Builder', icon: 'A' }
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
        padding: '16px 0',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: isDragging.current ? 'none' : 'width 0.15s ease'
      }}>
        <div style={{
          padding: collapsed ? '0 0 24px' : '0 16px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8,
          whiteSpace: 'nowrap',
          overflow: 'hidden'
        }}>
          <span style={{ fontSize: 20, fontWeight: 700 }}>
            {collapsed ? 'DC' : 'DC-BI'}
          </span>
          {!collapsed && <ThemeToggle />}
        </div>

        <div style={{ padding: '16px 0', flex: 1, overflow: 'auto' }}>
          {navItems.map(item => {
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
                  gap: collapsed ? 0 : 12,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  padding: collapsed ? '10px 0' : '10px 16px',
                  color: isActive ? '#fff' : 'var(--dc-sidebar-text)',
                  backgroundColor: isActive ? 'var(--dc-sidebar-active)' : 'transparent',
                  textDecoration: 'none',
                  fontSize: 14,
                  transition: 'background-color 0.15s',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden'
                }}
              >
                <span style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  flexShrink: 0
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
                gap: collapsed ? 0 : 12,
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? '10px 0' : '10px 16px',
                color: isActive ? '#fff' : 'var(--dc-sidebar-text)',
                backgroundColor: isActive ? 'var(--dc-sidebar-active)' : 'transparent',
                textDecoration: 'none',
                fontSize: 14,
                transition: 'background-color 0.15s',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                borderTop: '1px solid rgba(255,255,255,0.1)'
              }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: 6,
                backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600, flexShrink: 0
              }}>S</span>
              {!collapsed && 'Settings'}
            </Link>
          )
        })()}

        {/* User row */}
        <div style={{
          padding: collapsed ? '8px 0' : '8px 16px',
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
            title={collapsed ? 'Sign out' : 'Sign out'}
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
              cursor: 'pointer', fontSize: 11, padding: 0, flexShrink: 0, whiteSpace: 'nowrap'
            }}
          >
            {collapsed ? 'X' : 'Sign out'}
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
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40L40 0M-10 10L10-10M30 50L50 30' stroke='%239C92AC' stroke-opacity='0.07' stroke-width='1'/%3E%3C/svg%3E")`,
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
