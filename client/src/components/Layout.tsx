import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useBranding } from '../hooks/useBranding'
import ThemeToggle from './ThemeToggle'

const SIDEBAR_WIDTH_KEY = 'dc-sidebar-width'
const MIN_WIDTH = 48
const MAX_WIDTH = 400
const DEFAULT_WIDTH = 200
const COLLAPSE_THRESHOLD = 80

// Heroicons (outline, 24x24)
const icons = {
  home: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  ),
  notebook: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  ),
  dashboard: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
    </svg>
  ),
  analysis: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  ),
  schemaExplorer: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
    </svg>
  ),
  dataBrowser: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12h-7.5m8.625 0h7.5m-8.625 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125m0 0h-7.5m8.625 0c.621 0 1.125.504 1.125 1.125" />
    </svg>
  ),
  semanticLayer: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  ),
  settings: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  ),
  logout: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
    </svg>
  ),
  hamburger: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
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
  { path: '/schema-explorer', label: 'Schema Explorer', icon: icons.schemaExplorer },
  { path: '/data-browser', label: 'Data Browser', icon: icons.dataBrowser },
  { path: '/schema-editor', label: 'Semantic Layer', icon: icons.semanticLayer, adminOnly: true },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const branding = useBranding()
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    return saved ? Number.parseInt(saved, 10) : DEFAULT_WIDTH
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isDragging = useRef(false)
  const collapsed = sidebarWidth < COLLAPSE_THRESHOLD

  // Close mobile menu on route change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally triggers on pathname change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

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

  const renderNavItems = (isMobile: boolean) => {
    const items = navItems.filter(item => !item.adminOnly || user?.role === 'admin')
    return items.map(item => {
      const isActive =
        location.pathname === item.path ||
        (item.path !== '/' && location.pathname.startsWith(item.path))

      return (
        <Link
          key={item.path}
          to={item.path}
          title={!isMobile && collapsed ? item.label : undefined}
          className="flex items-center no-underline whitespace-nowrap overflow-hidden transition-colors"
          style={{
            gap: !isMobile && collapsed ? 0 : 10,
            justifyContent: !isMobile && collapsed ? 'center' : 'flex-start',
            padding: !isMobile && collapsed ? '8px 0' : '7px 12px',
            color: isActive ? '#fff' : 'var(--dc-sidebar-text)',
            backgroundColor: isActive ? 'var(--dc-sidebar-active)' : 'transparent',
            fontSize: 13,
          }}
        >
          <span
            className="flex items-center justify-center shrink-0"
            style={{ opacity: isActive ? 1 : 0.7 }}
          >
            {item.icon}
          </span>
          {(isMobile || !collapsed) && item.label}
        </Link>
      )
    })
  }

  const renderDocsLink = (isMobile: boolean) => (
    <a
      href="https://www.drizby.com/docs/"
      target="_blank"
      rel="noopener noreferrer"
      title={!isMobile && collapsed ? 'Documentation' : undefined}
      className="flex items-center no-underline whitespace-nowrap overflow-hidden transition-colors"
      style={{
        gap: !isMobile && collapsed ? 0 : 10,
        justifyContent: !isMobile && collapsed ? 'center' : 'flex-start',
        padding: !isMobile && collapsed ? '8px 0' : '7px 12px',
        color: 'var(--dc-sidebar-text)',
        fontSize: 13,
        borderTop: '1px solid rgba(255,255,255,0.1)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.backgroundColor = 'var(--dc-sidebar-hover)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      <span className="flex items-center justify-center shrink-0" style={{ opacity: 0.7 }}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
      </span>
      {(isMobile || !collapsed) && 'Documentation'}
    </a>
  )

  const renderSettingsLink = (isMobile: boolean) => {
    const isActive = location.pathname.startsWith('/settings')
    return (
      <Link
        to="/settings"
        title={!isMobile && collapsed ? 'Settings' : undefined}
        className="flex items-center no-underline whitespace-nowrap overflow-hidden transition-colors"
        style={{
          gap: !isMobile && collapsed ? 0 : 10,
          justifyContent: !isMobile && collapsed ? 'center' : 'flex-start',
          padding: !isMobile && collapsed ? '8px 0' : '7px 12px',
          color: isActive ? '#fff' : 'var(--dc-sidebar-text)',
          backgroundColor: isActive ? 'var(--dc-sidebar-active)' : 'transparent',
          fontSize: 13,
        }}
      >
        <span
          className="flex items-center justify-center shrink-0"
          style={{ opacity: isActive ? 1 : 0.7 }}
        >
          {icons.settings}
        </span>
        {(isMobile || !collapsed) && 'Settings'}
        {(isMobile || !collapsed) && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              opacity: 0.4,
              fontFamily: 'monospace',
            }}
          >
            v{__APP_VERSION__}
          </span>
        )}
      </Link>
    )
  }

  const renderUserRow = (isMobile: boolean) => (
    <div
      className="flex items-center gap-2"
      style={{
        padding: !isMobile && collapsed ? '6px 0' : '6px 12px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        justifyContent: !isMobile && collapsed ? 'center' : 'space-between',
      }}
    >
      {(isMobile || !collapsed) && user && (
        <span
          className="text-[11px] whitespace-nowrap overflow-hidden text-ellipsis min-w-0"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          {user.name}
        </span>
      )}
      <button
        onClick={async () => {
          await logout()
          navigate('/login')
        }}
        title="Sign out"
        className="shrink-0 flex items-center bg-transparent border-none cursor-pointer p-0"
        style={{ color: 'rgba(255,255,255,0.35)' }}
      >
        {!isMobile && collapsed ? icons.logout : <span className="text-[11px]">Sign out</span>}
      </button>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile top bar */}
      <div
        className="flex md:hidden items-center justify-between h-12 px-3 shrink-0 fixed top-0 left-0 right-0 z-30"
        style={{ backgroundColor: 'var(--dc-sidebar-bg)', color: 'var(--dc-sidebar-text)' }}
      >
        <button
          onClick={() => setMobileMenuOpen(o => !o)}
          className="bg-transparent border-none cursor-pointer p-1 flex items-center"
          style={{ color: 'var(--dc-sidebar-text)' }}
        >
          {icons.hamburger}
        </button>
        <div className="flex items-center gap-1.5">
          <img
            src={branding.logoUrl}
            alt={branding.name}
            className="w-5 h-5"
            style={{ opacity: 1 }}
          />
          <span className="text-base font-bold">{branding.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CompilationIndicator />
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 top-12 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <nav
        className={`fixed inset-y-0 left-0 top-12 w-[280px] z-50 flex flex-col overflow-hidden md:hidden transform transition-transform duration-200 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          backgroundColor: 'var(--dc-sidebar-bg)',
          color: 'var(--dc-sidebar-text)',
          paddingTop: 12,
          paddingBottom: 12,
        }}
      >
        <div className="py-2 flex-1 overflow-auto">{renderNavItems(true)}</div>
        {renderDocsLink(true)}
        {renderSettingsLink(true)}
        {renderUserRow(true)}
      </nav>

      {/* Desktop sidebar */}
      <nav
        className="hidden md:flex flex-col overflow-hidden shrink-0"
        style={{
          width: sidebarWidth,
          minWidth: MIN_WIDTH,
          backgroundColor: 'var(--dc-sidebar-bg)',
          color: 'var(--dc-sidebar-text)',
          padding: '12px 0',
          transition: isDragging.current ? 'none' : 'width 0.15s ease',
        }}
      >
        <div
          className="flex items-center whitespace-nowrap overflow-hidden"
          style={{
            padding: collapsed ? '0 0 12px' : '0 12px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            justifyContent: collapsed ? 'center' : 'space-between',
            gap: 8,
          }}
        >
          <div className="flex items-center gap-1.5">
            <img
              src={branding.logoUrl}
              alt={branding.name}
              className="w-6 h-6 shrink-0"
              style={{ opacity: 1 }}
            />
            {!collapsed && <span className="text-lg font-bold">{branding.name}</span>}
          </div>
          {!collapsed && (
            <div className="flex items-center gap-1.5">
              <CompilationIndicator />
              <ThemeToggle />
            </div>
          )}
          {collapsed && <CompilationIndicator />}
        </div>

        <div className="py-2 flex-1 overflow-auto">{renderNavItems(false)}</div>
        {renderDocsLink(false)}
        {renderSettingsLink(false)}
        {renderUserRow(false)}
      </nav>

      {/* Resize handle — desktop only */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        className="hidden md:block w-1 cursor-col-resize shrink-0 relative z-10"
      >
        <div
          className="absolute inset-y-0 left-0 w-1 transition-colors"
          style={{
            backgroundColor: isDragging.current ? 'var(--dc-primary)' : 'transparent',
          }}
        />
      </div>

      {/* Main content */}
      <main
        className="flex-1 p-3 md:p-6 overflow-auto min-w-0 flex flex-col mt-12 md:mt-0"
        style={{ backgroundColor: 'var(--dc-background)' }}
      >
        {children}
      </main>
    </div>
  )
}

function CompilationIndicator() {
  const { compiling, compilationProgress } = useAuth()
  if (!compiling) return null

  const title = compilationProgress
    ? `Compiling: ${compilationProgress.label} (${compilationProgress.current}/${compilationProgress.total})`
    : 'Compiling semantic layer...'

  return (
    <div title={title} style={{ display: 'flex', alignItems: 'center', cursor: 'default' }}>
      <style>{'@keyframes comp-spin { to { transform: rotate(360deg); } }'}</style>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--dc-primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ animation: 'comp-spin 2s linear infinite' }}
      >
        <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    </div>
  )
}
