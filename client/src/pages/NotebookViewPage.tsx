import { useParams, Link, useNavigate, useLocation } from 'react-router-dom'
import { useCallback, useState, useRef } from 'react'
import { AgenticNotebook } from 'drizzle-cube/client'
import type { NotebookConfig } from 'drizzle-cube/client'
import { useNotebook, useUpdateNotebook } from '../hooks/useNotebooks'
import { useCreateAnalyticsPage } from '../hooks/useAnalyticsPages'

const API_KEY_STORAGE_KEY = 'dc-notebook-api-key'
const PROVIDER_STORAGE_KEY = 'dc-notebook-provider'
const MODEL_STORAGE_KEY = 'dc-notebook-model'
const ENDPOINT_STORAGE_KEY = 'dc-notebook-endpoint'

export default function NotebookViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const initialPrompt = (location.state as { initialPrompt?: string } | null)?.initialPrompt
  const { data: notebook, isLoading, error } = useNotebook(id!)
  const updateNotebook = useUpdateNotebook()
  const createDashboard = useCreateAnalyticsPage()

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE_KEY) || '')
  const [provider, setProvider] = useState(() => localStorage.getItem(PROVIDER_STORAGE_KEY) || '')
  const [model, setModel] = useState(() => localStorage.getItem(MODEL_STORAGE_KEY) || '')
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem(ENDPOINT_STORAGE_KEY) || '')
  const [showSettings, setShowSettings] = useState(false)
  const hasApiKey = apiKey.trim().length > 0

  const handleSave = useCallback(async (config: NotebookConfig) => {
    if (!id) return

    setSaveStatus('saving')
    try {
      await updateNotebook.mutateAsync({ id: parseInt(id, 10), config })
      setSaveStatus('saved')
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (err) {
      console.error('Failed to save notebook:', err)
      setSaveStatus('idle')
    }
  }, [id, updateNotebook])

  const handleDashboardSaved = useCallback(async (data: { title: string; description?: string; dashboardConfig: any }) => {
    try {
      const page = await createDashboard.mutateAsync({
        name: data.title,
        description: data.description,
        config: data.dashboardConfig,
      })
      navigate(`/dashboards/${page.id}`)
    } catch (err) {
      console.error('Failed to create dashboard:', err)
    }
  }, [createDashboard, navigate])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-1">
        <div className="text-dc-text-muted">Loading notebook...</div>
      </div>
    )
  }

  if (error || !notebook) {
    return (
      <div className="text-center py-12">
        <p className="text-dc-error text-lg">Failed to load notebook</p>
        <Link to="/notebooks" className="text-dc-primary text-sm mt-4 inline-block hover:underline">
          Back to notebooks
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1 text-sm text-dc-text-muted min-w-0">
          <Link to="/notebooks" className="hover:text-dc-text transition-colors shrink-0">Notebooks</Link>
          <span className="mx-1">/</span>
          <span className="text-dc-text font-medium truncate">{notebook.name}</span>
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-2">
          {saveStatus === 'saving' && <span className="text-xs text-dc-text-muted">Saving...</span>}
          {saveStatus === 'saved' && <span className="text-xs text-dc-success">Saved</span>}

          <div className="relative">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                hasApiKey
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200'
                  : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-200'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              <span className="hidden sm:inline">{hasApiKey ? (provider || 'anthropic') : 'Configure LLM'}</span>
            </button>

            {showSettings && (
              <div className="absolute right-0 top-full mt-2 z-50 w-[calc(100vw-2rem)] max-w-96 bg-dc-surface rounded-lg shadow-xl border border-dc-border p-4">
                <h3 className="text-sm font-medium text-dc-text mb-3">LLM Settings</h3>

                <label className="block text-xs font-medium text-dc-text-secondary mb-1">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => { const v = e.target.value; setProvider(v); v ? localStorage.setItem(PROVIDER_STORAGE_KEY, v) : localStorage.removeItem(PROVIDER_STORAGE_KEY) }}
                  className="w-full px-3 py-2 border border-dc-border rounded-lg bg-dc-surface text-dc-text text-sm mb-3"
                >
                  <option value="">Anthropic (default)</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI</option>
                  <option value="google">Google (Gemini)</option>
                </select>

                <label className="block text-xs font-medium text-dc-text-secondary mb-1">Model</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => { const v = e.target.value; setModel(v); v ? localStorage.setItem(MODEL_STORAGE_KEY, v) : localStorage.removeItem(MODEL_STORAGE_KEY) }}
                  placeholder={provider === 'openai' ? 'gpt-4.1-mini' : provider === 'google' ? 'gemini-3-flash-preview' : 'claude-sonnet-4-6'}
                  className="w-full px-3 py-2 border border-dc-border rounded-lg bg-dc-surface text-dc-text placeholder:text-dc-text-muted text-sm font-mono mb-3"
                />

                <label className="block text-xs font-medium text-dc-text-secondary mb-1">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => { const v = e.target.value; setApiKey(v); v ? localStorage.setItem(API_KEY_STORAGE_KEY, v) : localStorage.removeItem(API_KEY_STORAGE_KEY) }}
                  placeholder={provider === 'openai' ? 'sk-...' : provider === 'google' ? 'AIza...' : 'sk-ant-...'}
                  className="w-full px-3 py-2 border border-dc-border rounded-lg bg-dc-surface text-dc-text placeholder:text-dc-text-muted text-sm font-mono mb-3"
                />

                <label className="block text-xs font-medium text-dc-text-secondary mb-1">
                  Provider Endpoint <span className="text-dc-text-muted font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={endpoint}
                  onChange={(e) => { const v = e.target.value; setEndpoint(v); v ? localStorage.setItem(ENDPOINT_STORAGE_KEY, v) : localStorage.removeItem(ENDPOINT_STORAGE_KEY) }}
                  placeholder="https://api.groq.com/openai/v1"
                  className="w-full px-3 py-2 border border-dc-border rounded-lg bg-dc-surface text-dc-text placeholder:text-dc-text-muted text-sm font-mono mb-3"
                />

                <div className="flex justify-end">
                  <button onClick={() => setShowSettings(false)} className="px-3 py-1.5 text-xs font-medium text-dc-text-secondary hover:text-dc-text">
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {!hasApiKey && (
        <div className="p-4 bg-dc-warning-bg border border-dc-warning rounded-lg shrink-0">
          <p className="text-sm font-semibold text-dc-text mb-1">Add your API key to start chatting</p>
          <p className="text-sm text-dc-text-secondary">
            Choose your provider (Anthropic, OpenAI, or Google) and paste your key. It stays in your browser only.
          </p>
        </div>
      )}

      <div className="flex-1 min-h-0 rounded-xl border border-dc-border overflow-hidden">
        <AgenticNotebook
          config={notebook.config as NotebookConfig | undefined}
          onSave={handleSave}
          agentApiKey={hasApiKey ? apiKey : undefined}
          agentProvider={provider || undefined}
          agentModel={model || undefined}
          agentProviderEndpoint={endpoint || undefined}
          onDashboardSaved={handleDashboardSaved}
          initialPrompt={initialPrompt}
        />
      </div>
    </div>
  )
}
