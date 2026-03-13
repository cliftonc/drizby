import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

interface FeaturesConfig {
  mcpEnabled: boolean
  appUrl: string
}

export default function ServerFeaturesPage() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<FeaturesConfig>({
    queryKey: ['settings', 'features'],
    queryFn: async () => {
      const res = await fetch('/api/settings/features', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch feature settings')
      return res.json()
    },
  })

  const [mcpEnabled, setMcpEnabled] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  useEffect(() => {
    if (data) setMcpEnabled(data.mcpEnabled)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/settings/features', {
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
      queryClient.invalidateQueries({ queryKey: ['settings', 'features'] })
      setFeedback({ type: 'success', message: 'Settings saved.' })
      setTimeout(() => setFeedback(null), 3000)
    },
    onError: (err: Error) => {
      setFeedback({ type: 'error', message: err.message })
    },
  })

  const handleSave = () => {
    saveMutation.mutate({ mcpEnabled })
  }

  if (isLoading) return <div style={{ color: 'var(--dc-text-muted)' }}>Loading...</div>

  const appUrl = data?.appUrl || ''
  const mcpUrl = appUrl ? `${appUrl.replace(/\/$/, '')}/mcp` : ''
  const hasAppUrl = !!mcpUrl

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--dc-text)', margin: '0 0 8px' }}>
        Server Features
      </h2>
      <p style={{ fontSize: 13, color: 'var(--dc-text-muted)', marginTop: 0, marginBottom: 24 }}>
        Enable or disable server-level features and integrations.
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

      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* MCP Toggle */}
        <div
          style={{
            border: '1px solid var(--dc-border)',
            borderRadius: 8,
            padding: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dc-text)' }}>
                MCP Server
              </div>
              <div style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginTop: 2 }}>
                Expose your semantic layer to AI assistants via the Model Context Protocol.
              </div>
            </div>
            <label
              style={{
                position: 'relative',
                display: 'inline-block',
                width: 44,
                height: 24,
                flexShrink: 0,
                marginLeft: 16,
              }}
            >
              <input
                type="checkbox"
                checked={mcpEnabled}
                onChange={e => setMcpEnabled(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
              />
              <span
                style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: mcpEnabled ? 'var(--dc-primary)' : 'var(--dc-input-border)',
                  borderRadius: 12,
                  transition: 'background-color 0.2s',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    height: 18,
                    width: 18,
                    left: mcpEnabled ? 22 : 3,
                    bottom: 3,
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: 'left 0.2s',
                  }}
                />
              </span>
            </label>
          </div>

          {/* Setup instructions shown when enabled */}
          {mcpEnabled && (
            <div
              style={{
                marginTop: 16,
                padding: 16,
                backgroundColor: 'var(--dc-surface)',
                borderRadius: 6,
                border: '1px solid var(--dc-border)',
              }}
            >
              <div
                style={{ fontSize: 13, fontWeight: 500, color: 'var(--dc-text)', marginBottom: 8 }}
              >
                Connect an MCP client
              </div>

              {!hasAppUrl && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    marginBottom: 12,
                    backgroundColor: 'var(--dc-warning-bg, #fef3c7)',
                    border: '1px solid var(--dc-warning-border, #f59e0b)',
                    color: 'var(--dc-warning, #b45309)',
                  }}
                >
                  Set the <code style={{ fontSize: 11 }}>APP_URL</code> environment variable to your
                  server's public HTTPS URL to see ready-to-use config snippets below.
                </div>
              )}

              <p style={{ fontSize: 12, color: 'var(--dc-text-muted)', margin: '0 0 12px' }}>
                MCP clients connect via HTTPS with OAuth authentication. Your MCP endpoint is{' '}
                {hasAppUrl ? (
                  <code style={{ fontSize: 11 }}>{mcpUrl}</code>
                ) : (
                  <code style={{ fontSize: 11 }}>{'<APP_URL>/mcp'}</code>
                )}
              </p>

              <div
                style={{ fontSize: 12, fontWeight: 500, color: 'var(--dc-text)', marginBottom: 4 }}
              >
                Claude Desktop
              </div>
              <p style={{ fontSize: 12, color: 'var(--dc-text-muted)', margin: '0 0 8px' }}>
                Add to <code style={{ fontSize: 11 }}>claude_desktop_config.json</code>:
              </p>
              <pre
                style={{
                  backgroundColor: 'var(--dc-input-bg)',
                  border: '1px solid var(--dc-input-border)',
                  borderRadius: 6,
                  padding: 12,
                  fontSize: 11,
                  color: 'var(--dc-text)',
                  overflow: 'auto',
                  margin: '0 0 12px',
                  lineHeight: 1.5,
                }}
              >
                {JSON.stringify(
                  {
                    mcpServers: {
                      drizby: {
                        type: 'http',
                        url: mcpUrl || 'https://your-drizby-server.com/mcp',
                        oauth: { callbackPort: 8080 },
                      },
                    },
                  },
                  null,
                  2
                )}
              </pre>

              <div
                style={{ fontSize: 12, fontWeight: 500, color: 'var(--dc-text)', marginBottom: 4 }}
              >
                VS Code / Cursor
              </div>
              <p style={{ fontSize: 12, color: 'var(--dc-text-muted)', margin: '0 0 8px' }}>
                Add to <code style={{ fontSize: 11 }}>.vscode/mcp.json</code>:
              </p>
              <pre
                style={{
                  backgroundColor: 'var(--dc-input-bg)',
                  border: '1px solid var(--dc-input-border)',
                  borderRadius: 6,
                  padding: 12,
                  fontSize: 11,
                  color: 'var(--dc-text)',
                  overflow: 'auto',
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {JSON.stringify(
                  {
                    servers: {
                      drizby: {
                        type: 'http',
                        url: mcpUrl || 'https://your-drizby-server.com/mcp',
                      },
                    },
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </div>

        <div>
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
