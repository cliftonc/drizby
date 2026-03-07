import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useAnalyticsPages } from '../hooks/useAnalyticsPages'
import { useConnections } from '../hooks/useConnections'
import { useCreateNotebook, useNotebooks } from '../hooks/useNotebooks'

const heroTitles = [
  'What are you curious about today?',
  'What story is hiding in your data?',
  'What would you like to explore?',
  'What question keeps you up at night?',
  'What trend have you been wondering about?',
  'What do the numbers have to say?',
  'What insight are you chasing?',
  'What pattern are you looking for?',
  'What should we dig into?',
  'What metric is on your mind?',
  "What does your data know that you don't?",
  'What would surprise you in your data?',
]

const suggestions = [
  'What are the top performing departments?',
  'Show me salary distribution by region',
  'How has productivity changed over time?',
  'Which employees have the highest happiness index?',
]

// Subtle animated gradient divider
function Divider() {
  return (
    <div className="relative h-px my-5 md:my-8 overflow-hidden">
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, transparent, var(--dc-border), transparent)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '40%',
          height: '100%',
          background:
            'linear-gradient(90deg, transparent, rgba(var(--dc-primary-rgb), 0.4), transparent)',
          animation: 'divider-shimmer 4s ease-in-out infinite',
        }}
      />
    </div>
  )
}

interface UnreadyConnection {
  id: number
  name: string
  schemaCount: number
  cubeDefCount: number
  cubeCount: number
}

function SetupChecklist({
  hasAI,
  hasOwnConnection,
  unreadyConnections = [],
  aiRef,
}: {
  hasAI: boolean
  hasOwnConnection: boolean
  unreadyConnections?: UnreadyConnection[]
  aiRef?: React.RefObject<HTMLAnchorElement | null>
}) {
  const schemaIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
    </svg>
  )

  type Step = {
    done: boolean
    label: string
    doneLabel: string
    link: string
    cta: string
    isAI: boolean
    icon: React.ReactNode
  }

  const steps: Step[] = [
    {
      done: hasAI,
      label: 'Add an AI key to power notebooks',
      doneLabel: 'AI configured',
      link: '/settings/ai',
      cta: 'Configure AI',
      isAI: true,
      icon: (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
        </svg>
      ),
    },
    {
      done: hasOwnConnection,
      label: 'Add your own database connection',
      doneLabel: 'Own database connected',
      link: '/settings/connections',
      cta: 'Add Connection',
      isAI: false,
      icon: (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
      ),
    },
    ...unreadyConnections.map(conn => {
      const noSchema = conn.schemaCount === 0
      const noCubeDefs = conn.cubeDefCount === 0
      return {
        done: false,
        label: noSchema
          ? `"${conn.name}" needs a schema definition`
          : noCubeDefs
            ? `"${conn.name}" needs cube definitions`
            : `"${conn.name}" has cube compilation errors`,
        doneLabel: '',
        link: `/schema-editor/${conn.id}`,
        cta: noSchema ? 'Add Schema' : 'Open Editor',
        isAI: false,
        icon: schemaIcon,
      }
    }),
  ]

  return (
    <>
      {steps.map(step => (
        <Link
          key={step.link}
          ref={step.isAI ? (aiRef as React.Ref<HTMLAnchorElement>) : undefined}
          to={step.done ? '#' : step.link}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid var(--dc-border)',
            backgroundColor: 'var(--dc-surface)',
            color: 'var(--dc-text-secondary)',
            fontSize: 13,
            textDecoration: 'none',
            transition: 'border-color 0.15s',
            opacity: step.done ? 0.6 : 1,
            cursor: step.done ? 'default' : 'pointer',
          }}
          onClick={step.done ? e => e.preventDefault() : undefined}
          onMouseEnter={e => {
            if (!step.done) e.currentTarget.style.borderColor = 'var(--dc-primary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--dc-border)'
          }}
        >
          {step.done ? (
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                flexShrink: 0,
                backgroundColor: 'var(--dc-success, #22c55e)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
          ) : (
            <div style={{ color: 'var(--dc-text-muted)', flexShrink: 0 }}>{step.icon}</div>
          )}
          <span
            style={{
              flex: 1,
              textDecoration: step.done ? 'line-through' : 'none',
              color: step.done ? 'var(--dc-text-muted)' : 'var(--dc-text)',
            }}
          >
            {step.done ? step.doneLabel : step.label}
          </span>
          {!step.done && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--dc-primary)',
                padding: '2px 10px',
                borderRadius: 6,
                border: '1px solid var(--dc-primary)',
                whiteSpace: 'nowrap',
              }}
            >
              {step.cta}
            </span>
          )}
        </Link>
      ))}
    </>
  )
}

export default function HomePage() {
  const [value, setValue] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const navigate = useNavigate()
  const createNotebook = useCreateNotebook()
  const { data: dashboards = [] } = useAnalyticsPages()
  const { data: notebooks = [] } = useNotebooks()
  const { data: connections = [] } = useConnections()
  const { user } = useAuth()
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | undefined>()

  const { data: aiConfig } = useQuery<{ provider: string; hasApiKey: boolean }>({
    queryKey: ['settings', 'ai'],
    queryFn: async () => {
      const res = await fetch('/api/settings/ai', { credentials: 'include' })
      if (!res.ok) return { provider: '', hasApiKey: false }
      return res.json()
    },
    enabled: user?.role === 'admin',
  })

  const hasAI = !!(aiConfig?.provider && aiConfig?.hasApiKey)
  const aiTaskRef = useRef<HTMLAnchorElement>(null)

  interface ConnectionStatus {
    id: number
    name: string
    schemaCount: number
    schemasCompiled: number
    cubeDefCount: number
    cubeDefsCompiled: number
    cubeCount: number
    ready: boolean
  }

  const { data: connectionStatuses = [] } = useQuery<ConnectionStatus[]>({
    queryKey: ['connections', 'status'],
    queryFn: async () => {
      const res = await fetch('/api/connections/status', { credentials: 'include' })
      if (!res.ok) return []
      return res.json()
    },
  })

  useEffect(() => {
    if (!selectedConnectionId && connections.length > 0) {
      setSelectedConnectionId(connections[0].id)
    }
  }, [connections, selectedConnectionId])

  const handleAsk = useCallback(
    async (prompt?: string) => {
      const text = (prompt || value).trim()
      if (!text || isCreating) return
      if (user?.role === 'admin' && !hasAI && aiTaskRef.current) {
        aiTaskRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        aiTaskRef.current.classList.remove('setup-flash')
        void aiTaskRef.current.offsetWidth
        aiTaskRef.current.classList.add('setup-flash')
        return
      }
      setIsCreating(true)
      try {
        const notebook = await createNotebook.mutateAsync({
          name: text.slice(0, 100),
          connectionId: selectedConnectionId,
        })
        navigate(`/notebooks/${notebook.id}`, { state: { initialPrompt: text } })
      } catch {
        setIsCreating(false)
      }
    },
    [value, isCreating, createNotebook, navigate, selectedConnectionId, user, hasAI]
  )

  const handleNewNotebook = useCallback(async () => {
    if (isCreating) return
    setIsCreating(true)
    try {
      const notebook = await createNotebook.mutateAsync({
        name: `Notebook ${new Date().toLocaleDateString()}`,
        connectionId: selectedConnectionId,
      })
      navigate(`/notebooks/${notebook.id}`)
    } catch {
      setIsCreating(false)
    }
  }, [isCreating, createNotebook, navigate, selectedConnectionId])

  const heroTitle = useMemo(() => heroTitles[Math.floor(Math.random() * heroTitles.length)], [])
  const recentNotebooks = notebooks.slice(0, 5)

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      {/* Keyframes injected once */}
      <style>{`
        @keyframes divider-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        @keyframes gradient-shift {
          0%, 100% { background-position: 0% center; }
          50% { background-position: 200% center; }
        }
        @keyframes hero-glow {
          0%, 100% { text-shadow: 0 0 20px rgba(var(--dc-primary-rgb), 0.3), 0 0 60px rgba(var(--dc-primary-rgb), 0.1); }
          50% { text-shadow: 0 0 30px rgba(var(--dc-primary-rgb), 0.5), 0 0 80px rgba(var(--dc-primary-rgb), 0.2); }
        }
        @keyframes sparkle {
          0%, 100% { opacity: 1; transform: scale(1) rotate(0deg); }
          50% { opacity: 0.6; transform: scale(1.3) rotate(15deg); }
        }
        @keyframes setup-attention {
          0% { box-shadow: 0 0 0 0 rgba(var(--dc-primary-rgb), 0); }
          15% { box-shadow: 0 0 20px 4px rgba(var(--dc-primary-rgb), 0.5); }
          30% { box-shadow: 0 0 4px 1px rgba(var(--dc-primary-rgb), 0.1); }
          45% { box-shadow: 0 0 20px 4px rgba(var(--dc-primary-rgb), 0.5); }
          60% { box-shadow: 0 0 4px 1px rgba(var(--dc-primary-rgb), 0.1); }
          75% { box-shadow: 0 0 20px 4px rgba(var(--dc-primary-rgb), 0.4); }
          100% { box-shadow: 0 0 0 0 rgba(var(--dc-primary-rgb), 0); }
        }
        .setup-flash { animation: setup-attention 1.5s ease-out; }
      `}</style>

      <div style={{ position: 'relative' }}>
        {/* Hero input */}
        <div className="pt-4 md:pt-8 pb-2">
          <h2 className="text-xl md:text-[28px] font-extrabold text-center mb-5 md:mb-7 flex items-center justify-center gap-2.5">
            <span
              style={{
                background:
                  'linear-gradient(90deg, var(--dc-primary), var(--dc-accent), var(--dc-primary))',
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation:
                  'gradient-shift 6s ease-in-out infinite, hero-glow 3s ease-in-out infinite',
              }}
            >
              {heroTitle}
            </span>
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              style={{ animation: 'sparkle 2s ease-in-out infinite', flexShrink: 0 }}
            >
              <path
                d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z"
                fill="url(#sparkle-grad)"
              />
              <defs>
                <linearGradient id="sparkle-grad" x1="2" y1="2" x2="22" y2="22">
                  <stop stopColor="var(--dc-primary)" />
                  <stop offset="1" stopColor="var(--dc-accent)" />
                </linearGradient>
              </defs>
            </svg>
          </h2>

          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <div
              style={{
                position: 'relative',
                borderRadius: 16,
                border: '1px solid rgba(var(--dc-primary-rgb), 0.3)',
                backgroundColor: 'var(--dc-surface)',
                boxShadow: '0 0 30px -5px rgba(var(--dc-primary-rgb), 0.15)',
                transition: 'box-shadow 0.2s, border-color 0.2s',
              }}
            >
              <textarea
                ref={textareaRef}
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleAsk()
                  }
                }}
                placeholder="Ask about your data — metrics, trends, comparisons..."
                rows={3}
                disabled={isCreating}
                style={{
                  width: '100%',
                  backgroundColor: 'transparent',
                  resize: 'none',
                  borderRadius: 16,
                  padding: '12px 16px 52px',
                  fontSize: 14,
                  lineHeight: 1.6,
                  border: 'none',
                  outline: 'none',
                  color: 'var(--dc-text)',
                  boxSizing: 'border-box',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: 12,
                  right: 12,
                  bottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {connections.length > 1 && (
                    <select
                      value={selectedConnectionId ?? ''}
                      onChange={e => setSelectedConnectionId(Number.parseInt(e.target.value))}
                      style={{
                        background: 'none',
                        border: '1px solid var(--dc-border)',
                        cursor: 'pointer',
                        color: 'var(--dc-text-muted)',
                        fontSize: 12,
                        padding: '3px 6px',
                        borderRadius: 6,
                        outline: 'none',
                      }}
                    >
                      {connections.map(conn => (
                        <option key={conn.id} value={conn.id}>
                          {conn.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={handleNewNotebook}
                    disabled={isCreating}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--dc-text-muted)',
                      fontSize: 13,
                      padding: '4px 8px',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      opacity: isCreating ? 0.4 : 1,
                    }}
                  >
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
                      <path d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <span className="hidden md:inline">New Notebook</span>
                  </button>
                </div>
                <button
                  onClick={() => handleAsk()}
                  disabled={!value.trim() || isCreating}
                  style={{
                    backgroundColor: 'var(--dc-primary)',
                    color: 'var(--dc-primary-content)',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                    padding: '6px 16px',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    opacity: !value.trim() || isCreating ? 0.4 : 1,
                  }}
                >
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
                    <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                  </svg>
                  Ask
                </button>
              </div>
            </div>

            {/* Suggestion chips */}
            <div className="flex flex-wrap justify-center gap-1.5 md:gap-2 mt-3 md:mt-4">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => handleAsk(s)}
                  disabled={isCreating}
                  className="text-[11px] md:text-xs"
                  style={{
                    padding: '4px 12px',
                    borderRadius: 20,
                    border: '1px solid var(--dc-border)',
                    backgroundColor: 'var(--dc-surface)',
                    color: 'var(--dc-text-muted)',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, color 0.15s',
                    opacity: isCreating ? 0.4 : 1,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--dc-primary)'
                    e.currentTarget.style.color = 'var(--dc-primary)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--dc-border)'
                    e.currentTarget.style.color = 'var(--dc-text-muted)'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Setup Tasks */}
        {user?.role === 'admin' &&
          aiConfig &&
          (() => {
            const hasOwnConn = connections.some(c => c.name !== 'Demo SQLite')
            const aiDone = !!(aiConfig.provider && aiConfig.hasApiKey)
            const unready = connectionStatuses.filter(c => !c.ready)
            const totalTasks = 2 + connectionStatuses.length
            const doneCount =
              (aiDone ? 1 : 0) + (hasOwnConn ? 1 : 0) + (connectionStatuses.length - unready.length)
            if (doneCount === totalTasks) return null
            return (
              <>
                <Divider />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <h3
                      style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)', margin: 0 }}
                    >
                      Setup Tasks
                    </h3>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        padding: '1px 8px',
                        borderRadius: 10,
                        backgroundColor: 'rgba(var(--dc-primary-rgb), 0.1)',
                        color: 'var(--dc-primary)',
                      }}
                    >
                      {doneCount}/{totalTasks}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <SetupChecklist
                      hasAI={aiDone}
                      hasOwnConnection={hasOwnConn}
                      unreadyConnections={unready}
                      aiRef={aiTaskRef}
                    />
                  </div>
                </div>
              </>
            )
          })()}

        {/* Recent Notebooks */}
        {recentNotebooks.length > 0 && (
          <>
            <Divider />
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}
              >
                <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)', margin: 0 }}>
                  Recent Notebooks
                </h3>
                <Link
                  to="/notebooks"
                  style={{ fontSize: 13, color: 'var(--dc-primary)', textDecoration: 'none' }}
                >
                  View all
                </Link>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {recentNotebooks.map(nb => (
                  <Link
                    key={nb.id}
                    to={`/notebooks/${nb.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--dc-border)',
                      backgroundColor: 'var(--dc-surface)',
                      color: 'var(--dc-text-secondary)',
                      fontSize: 13,
                      textDecoration: 'none',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--dc-primary)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--dc-border)'
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                      />
                    </svg>
                    {nb.name}
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Your Dashboards */}
        <Divider />
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)', margin: 0 }}>
              Your Dashboards
            </h3>
            <Link
              to="/dashboards"
              style={{ fontSize: 13, color: 'var(--dc-primary)', textDecoration: 'none' }}
            >
              View all
            </Link>
          </div>
          {dashboards.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: 'center',
                backgroundColor: 'var(--dc-surface)',
                borderRadius: 8,
                border: '1px solid var(--dc-border)',
              }}
            >
              <p style={{ color: 'var(--dc-text-muted)', fontSize: 14, margin: '0 0 16px' }}>
                No dashboards yet
              </p>
              <Link
                to="/dashboards"
                style={{
                  display: 'inline-block',
                  padding: '8px 16px',
                  backgroundColor: 'var(--dc-primary)',
                  color: 'var(--dc-primary-content)',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                Create a Dashboard
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {dashboards.map(d => (
                <Link key={d.id} to={`/dashboards/${d.id}`} style={{ textDecoration: 'none' }}>
                  <div
                    style={{
                      padding: 16,
                      backgroundColor: 'var(--dc-surface)',
                      borderRadius: 8,
                      border: '1px solid var(--dc-border)',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--dc-primary)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--dc-border)'
                    }}
                  >
                    <h4
                      style={{
                        margin: '0 0 4px',
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--dc-text)',
                      }}
                    >
                      {d.name}
                    </h4>
                    {d.description && (
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--dc-text-muted)' }}>
                        {d.description}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Explore */}
        <Divider />
        <div style={{ paddingBottom: 32 }}>
          <h3
            style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)', margin: '0 0 12px' }}
          >
            Explore
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
            }}
          >
            <Link to="/dashboards" style={{ textDecoration: 'none' }}>
              <div
                style={{
                  padding: 16,
                  backgroundColor: 'var(--dc-surface)',
                  borderRadius: 8,
                  border: '1px solid var(--dc-border)',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--dc-primary)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--dc-border)'
                }}
              >
                <h4
                  style={{
                    margin: '0 0 4px',
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--dc-text)',
                  }}
                >
                  Dashboards
                </h4>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--dc-text-muted)' }}>
                  View and create analytics dashboards with charts and filters
                </p>
              </div>
            </Link>
            <Link to="/analysis-builder" style={{ textDecoration: 'none' }}>
              <div
                style={{
                  padding: 16,
                  backgroundColor: 'var(--dc-surface)',
                  borderRadius: 8,
                  border: '1px solid var(--dc-border)',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--dc-primary)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--dc-border)'
                }}
              >
                <h4
                  style={{
                    margin: '0 0 4px',
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--dc-text)',
                  }}
                >
                  Analysis Builder
                </h4>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--dc-text-muted)' }}>
                  Build ad-hoc queries with the visual analysis builder
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
