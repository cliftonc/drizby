import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

interface AIConfig {
  provider: string
  model: string
  baseUrl: string
  hasApiKey: boolean
  apiKeyHint: string
}

const PROVIDER_PLACEHOLDERS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4.1-mini',
  google: 'gemini-3-flash-preview',
}

export default function AISettingsPage() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<AIConfig>({
    queryKey: ['settings', 'ai'],
    queryFn: async () => {
      const res = await fetch('/api/settings/ai', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch AI settings')
      return res.json()
    },
  })

  const [provider, setProvider] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKeyEdited, setApiKeyEdited] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  useEffect(() => {
    if (data) {
      setProvider(data.provider)
      setModel(data.model)
      setBaseUrl(data.baseUrl)
      setApiKey('')
      setApiKeyEdited(false)
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const res = await fetch('/api/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'ai'] })
      setFeedback({ type: 'success', message: 'AI settings saved.' })
      setTimeout(() => setFeedback(null), 3000)
    },
    onError: (err: Error) => {
      setFeedback({ type: 'error', message: err.message })
    },
  })

  const handleSave = () => {
    const body: Record<string, string> = {
      provider,
      model,
      baseUrl,
    }
    if (apiKeyEdited) {
      body.apiKey = apiKey
    }
    saveMutation.mutate(body)
  }

  if (isLoading) return <div style={{ color: 'var(--dc-text-muted)' }}>Loading...</div>

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 12px',
    backgroundColor: 'var(--dc-input-bg)',
    border: '1px solid var(--dc-input-border)',
    borderRadius: 6,
    color: 'var(--dc-input-text)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--dc-text)', margin: '0 0 8px' }}>
        AI Configuration
      </h2>
      <p style={{ fontSize: 13, color: 'var(--dc-text-muted)', marginTop: 0, marginBottom: 24 }}>
        Configure the default AI provider for notebooks. Users can still override with their own
        key.
      </p>

      {feedback && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            marginBottom: 16,
            backgroundColor:
              feedback.type === 'success' ? 'var(--dc-success-bg, #dcfce7)' : 'var(--dc-error-bg)',
            border: `1px solid ${feedback.type === 'success' ? 'var(--dc-success, #22c55e)' : 'var(--dc-error-border)'}`,
            color: feedback.type === 'success' ? 'var(--dc-success, #16a34a)' : 'var(--dc-error)',
          }}
        >
          {feedback.message}
        </div>
      )}

      <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              color: 'var(--dc-text-muted)',
              marginBottom: 4,
              fontWeight: 500,
            }}
          >
            Provider
          </label>
          <select value={provider} onChange={e => setProvider(e.target.value)} style={inputStyle}>
            <option value="">None (client-only)</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI</option>
            <option value="google">Google (Gemini)</option>
          </select>
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              color: 'var(--dc-text-muted)',
              marginBottom: 4,
              fontWeight: 500,
            }}
          >
            API Key
          </label>
          <input
            type="password"
            value={apiKeyEdited ? apiKey : ''}
            placeholder={data?.hasApiKey ? `Current: ${data.apiKeyHint}` : 'Enter API key'}
            onChange={e => {
              setApiKey(e.target.value)
              setApiKeyEdited(true)
            }}
            style={inputStyle}
          />
          {data?.hasApiKey && !apiKeyEdited && (
            <p
              style={{ fontSize: 11, color: 'var(--dc-text-muted)', marginTop: 4, marginBottom: 0 }}
            >
              Key is set. Enter a new value to replace it, or leave blank to keep it.
            </p>
          )}
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              color: 'var(--dc-text-muted)',
              marginBottom: 4,
              fontWeight: 500,
            }}
          >
            Model
          </label>
          <input
            type="text"
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder={PROVIDER_PLACEHOLDERS[provider] || 'Default for provider'}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
          />
        </div>

        {provider === 'openai' && (
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--dc-text-muted)',
                marginBottom: 4,
                fontWeight: 500,
              }}
            >
              Base URL{' '}
              <span style={{ fontWeight: 400 }}>(optional, for OpenAI-compatible providers)</span>
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://api.groq.com/openai/v1"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />
          </div>
        )}

        <div style={{ paddingTop: 8 }}>
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            style={{
              padding: '8px 20px',
              backgroundColor: 'var(--dc-primary)',
              color: 'var(--dc-primary-content)',
              fontWeight: 500,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              opacity: saveMutation.isPending ? 0.5 : 1,
            }}
          >
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
