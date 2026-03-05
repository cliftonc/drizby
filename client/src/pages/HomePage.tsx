import { Link, useNavigate } from 'react-router-dom'
import { useState, useCallback, useRef, useMemo } from 'react'
import { useCreateNotebook, useNotebooks } from '../hooks/useNotebooks'
import { useAnalyticsPages } from '../hooks/useAnalyticsPages'

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
  'What does your data know that you don\'t?',
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
    <div style={{ position: 'relative', height: 1, margin: '32px 0', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(90deg, transparent, var(--dc-border), transparent)'
      }} />
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '40%', height: '100%',
        background: 'linear-gradient(90deg, transparent, rgba(var(--dc-primary-rgb), 0.4), transparent)',
        animation: 'divider-shimmer 4s ease-in-out infinite'
      }} />
    </div>
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

  const handleAsk = useCallback(async (prompt?: string) => {
    const text = (prompt || value).trim()
    if (!text || isCreating) return
    setIsCreating(true)
    try {
      const notebook = await createNotebook.mutateAsync({ name: text.slice(0, 100) })
      navigate(`/notebooks/${notebook.id}`, { state: { initialPrompt: text } })
    } catch {
      setIsCreating(false)
    }
  }, [value, isCreating, createNotebook, navigate])

  const handleNewNotebook = useCallback(async () => {
    if (isCreating) return
    setIsCreating(true)
    try {
      const notebook = await createNotebook.mutateAsync({ name: `Notebook ${new Date().toLocaleDateString()}` })
      navigate(`/notebooks/${notebook.id}`)
    } catch {
      setIsCreating(false)
    }
  }, [isCreating, createNotebook, navigate])

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
      `}</style>

      <div style={{ position: 'relative' }}>
        {/* Hero input */}
        <div style={{ paddingTop: 32, paddingBottom: 8 }}>
          <h2 style={{
            fontSize: 28, fontWeight: 800, textAlign: 'center', marginBottom: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10
          }}>
            <span style={{
              background: 'linear-gradient(90deg, var(--dc-primary), var(--dc-accent), var(--dc-primary))',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'gradient-shift 6s ease-in-out infinite, hero-glow 3s ease-in-out infinite'
            }}>
              {heroTitle}
            </span>
            <svg
              width="28" height="28" viewBox="0 0 24 24" fill="none"
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
            <div style={{
              position: 'relative',
              borderRadius: 16,
              border: '1px solid rgba(var(--dc-primary-rgb), 0.3)',
              backgroundColor: 'var(--dc-surface)',
              boxShadow: '0 0 30px -5px rgba(var(--dc-primary-rgb), 0.15)',
              transition: 'box-shadow 0.2s, border-color 0.2s'
            }}>
              <textarea
                ref={textareaRef}
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk() } }}
                placeholder="Ask about your data — metrics, trends, comparisons..."
                rows={3}
                autoFocus
                disabled={isCreating}
                style={{
                  width: '100%', backgroundColor: 'transparent', resize: 'none', borderRadius: 16,
                  padding: '16px 20px 56px', fontSize: 14, lineHeight: 1.6, border: 'none', outline: 'none',
                  color: 'var(--dc-text)', boxSizing: 'border-box'
                }}
              />
              <div style={{
                position: 'absolute', left: 12, right: 12, bottom: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <button
                  onClick={handleNewNotebook}
                  disabled={isCreating}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--dc-text-muted)', fontSize: 13, padding: '4px 8px',
                    borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6,
                    opacity: isCreating ? 0.4 : 1
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  New Notebook
                </button>
                <button
                  onClick={() => handleAsk()}
                  disabled={!value.trim() || isCreating}
                  style={{
                    backgroundColor: 'var(--dc-primary)', color: 'var(--dc-primary-content)',
                    border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                    padding: '6px 16px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6,
                    opacity: (!value.trim() || isCreating) ? 0.4 : 1
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                  </svg>
                  Ask
                </button>
              </div>
            </div>

            {/* Suggestion chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => handleAsk(s)}
                  disabled={isCreating}
                  style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: 12,
                    border: '1px solid var(--dc-border)', backgroundColor: 'var(--dc-surface)',
                    color: 'var(--dc-text-muted)', cursor: 'pointer',
                    transition: 'border-color 0.15s, color 0.15s',
                    opacity: isCreating ? 0.4 : 1
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--dc-primary)'; e.currentTarget.style.color = 'var(--dc-primary)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--dc-border)'; e.currentTarget.style.color = 'var(--dc-text-muted)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Notebooks */}
        {recentNotebooks.length > 0 && (
          <>
            <Divider />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)', margin: 0 }}>Recent Notebooks</h3>
                <Link to="/notebooks" style={{ fontSize: 13, color: 'var(--dc-primary)', textDecoration: 'none' }}>View all</Link>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {recentNotebooks.map(nb => (
                  <Link
                    key={nb.id}
                    to={`/notebooks/${nb.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                      borderRadius: 8, border: '1px solid var(--dc-border)', backgroundColor: 'var(--dc-surface)',
                      color: 'var(--dc-text-secondary)', fontSize: 13, textDecoration: 'none',
                      transition: 'border-color 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--dc-primary)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--dc-border)'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)', margin: 0 }}>Your Dashboards</h3>
            <Link to="/dashboards" style={{ fontSize: 13, color: 'var(--dc-primary)', textDecoration: 'none' }}>View all</Link>
          </div>
          {dashboards.length === 0 ? (
            <div style={{
              padding: 32, textAlign: 'center', backgroundColor: 'var(--dc-surface)',
              borderRadius: 8, border: '1px solid var(--dc-border)'
            }}>
              <p style={{ color: 'var(--dc-text-muted)', fontSize: 14, margin: '0 0 16px' }}>No dashboards yet</p>
              <Link
                to="/dashboards"
                style={{
                  display: 'inline-block', padding: '8px 16px', backgroundColor: 'var(--dc-primary)',
                  color: 'var(--dc-primary-content)', borderRadius: 6, fontSize: 13, fontWeight: 500, textDecoration: 'none'
                }}
              >
                Create a Dashboard
              </Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {dashboards.map(d => (
                <Link
                  key={d.id}
                  to={`/dashboards/${d.id}`}
                  style={{ textDecoration: 'none' }}
                >
                  <div
                    style={{
                      padding: 16, backgroundColor: 'var(--dc-surface)', borderRadius: 8,
                      border: '1px solid var(--dc-border)', transition: 'border-color 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--dc-primary)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--dc-border)'}
                  >
                    <h4 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--dc-text)' }}>{d.name}</h4>
                    {d.description && <p style={{ margin: 0, fontSize: 12, color: 'var(--dc-text-muted)' }}>{d.description}</p>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Explore */}
        <Divider />
        <div style={{ paddingBottom: 32 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)', margin: '0 0 12px' }}>Explore</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            <Link to="/dashboards" style={{ textDecoration: 'none' }}>
              <div
                style={{
                  padding: 16, backgroundColor: 'var(--dc-surface)', borderRadius: 8,
                  border: '1px solid var(--dc-border)', transition: 'border-color 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--dc-primary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--dc-border)'}
              >
                <h4 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--dc-text)' }}>Dashboards</h4>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--dc-text-muted)' }}>View and create analytics dashboards with charts and filters</p>
              </div>
            </Link>
            <Link to="/analysis-builder" style={{ textDecoration: 'none' }}>
              <div
                style={{
                  padding: 16, backgroundColor: 'var(--dc-surface)', borderRadius: 8,
                  border: '1px solid var(--dc-border)', transition: 'border-color 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--dc-primary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--dc-border)'}
              >
                <h4 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--dc-text)' }}>Analysis Builder</h4>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--dc-text-muted)' }}>Build ad-hoc queries with the visual analysis builder</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
