import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Modal } from '../../components/Modal'

interface FeaturesConfig {
  mcpEnabled: boolean
  appUrl: string
  brandName: string
  brandLogoUrl: string
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
  const [showMcpSetup, setShowMcpSetup] = useState(false)
  const [brandName, setBrandName] = useState('')
  const [brandLogoUrl, setBrandLogoUrl] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  useEffect(() => {
    if (data) {
      setMcpEnabled(data.mcpEnabled)
      setBrandName(data.brandName)
      setBrandLogoUrl(data.brandLogoUrl)
    }
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
      queryClient.invalidateQueries({ queryKey: ['branding'] })
      setFeedback({ type: 'success', message: 'Settings saved.' })
      setTimeout(() => setFeedback(null), 3000)
    },
    onError: (err: Error) => {
      setFeedback({ type: 'error', message: err.message })
    },
  })

  const handleSave = () => {
    saveMutation.mutate({ mcpEnabled, brandName, brandLogoUrl })
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
        {/* Branding */}
        <div
          style={{
            border: '1px solid var(--dc-border)',
            borderRadius: 8,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dc-text)', marginBottom: 12 }}>
            Branding
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--dc-text-muted)',
                  marginBottom: 4,
                }}
              >
                Application Name
              </label>
              <input
                type="text"
                value={brandName}
                onChange={e => setBrandName(e.target.value)}
                placeholder="Drizby"
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  fontSize: 13,
                  borderRadius: 6,
                  border: '1px solid var(--dc-input-border)',
                  backgroundColor: 'var(--dc-input-bg)',
                  color: 'var(--dc-text)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--dc-text-muted)',
                  marginBottom: 4,
                }}
              >
                Logo URL
              </label>
              <input
                type="text"
                value={brandLogoUrl}
                onChange={e => setBrandLogoUrl(e.target.value)}
                placeholder="/logo.png"
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  fontSize: 13,
                  borderRadius: 6,
                  border: '1px solid var(--dc-input-border)',
                  backgroundColor: 'var(--dc-input-bg)',
                  color: 'var(--dc-text)',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 11, color: 'var(--dc-text-muted)', marginTop: 4 }}>
                URL for the logo shown in the sidebar and login pages. Leave blank for the default.
              </div>
            </div>
          </div>
        </div>

        {/* OAuth Providers */}
        <OAuthSection queryClient={queryClient} />

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

          {mcpEnabled && (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setShowMcpSetup(true)}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 6,
                  border: '1px solid var(--dc-border)',
                  backgroundColor: 'var(--dc-surface)',
                  color: 'var(--dc-text)',
                  cursor: 'pointer',
                }}
              >
                Connect an MCP client...
              </button>
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

      <Modal isOpen={showMcpSetup} onClose={() => setShowMcpSetup(false)} maxWidth="max-w-lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--dc-text)', margin: 0 }}>
            Connect an MCP Client
          </h3>
          {!hasAppUrl && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 12,
                backgroundColor: 'var(--dc-warning-bg, #fef3c7)',
                border: '1px solid var(--dc-warning-border, #f59e0b)',
                color: 'var(--dc-warning, #b45309)',
              }}
            >
              Set the <code style={{ fontSize: 11 }}>APP_URL</code> environment variable to your
              server's public HTTPS URL to see ready-to-use config snippets below.
            </div>
          )}

          <p style={{ fontSize: 13, color: 'var(--dc-text-muted)', margin: 0 }}>
            MCP clients connect via HTTPS with OAuth authentication. Your MCP endpoint is{' '}
            {hasAppUrl ? (
              <code style={{ fontSize: 11 }}>{mcpUrl}</code>
            ) : (
              <code style={{ fontSize: 11 }}>{'<APP_URL>/mcp'}</code>
            )}
          </p>

          <div>
            <div
              style={{ fontSize: 13, fontWeight: 500, color: 'var(--dc-text)', marginBottom: 4 }}
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
                margin: 0,
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
          </div>

          <div>
            <div
              style={{ fontSize: 13, fontWeight: 500, color: 'var(--dc-text)', marginBottom: 4 }}
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
        </div>
      </Modal>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  fontSize: 13,
  borderRadius: 6,
  border: '1px solid var(--dc-input-border)',
  backgroundColor: 'var(--dc-input-bg)',
  color: 'var(--dc-text)',
  boxSizing: 'border-box',
}

interface OAuthConfig {
  google: {
    enabled: boolean
    clientId: string
    hasClientSecret: boolean
    clientSecretHint: string
    redirectUri: string
  }
}

function OAuthSection({ queryClient }: { queryClient: QueryClient }) {
  const { data } = useQuery<OAuthConfig>({
    queryKey: ['settings', 'oauth'],
    queryFn: async () => {
      const res = await fetch('/api/settings/oauth', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch OAuth settings')
      return res.json()
    },
  })

  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [googleClientId, setGoogleClientId] = useState('')
  const [googleClientSecret, setGoogleClientSecret] = useState('')
  const [oauthFeedback, setOauthFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  useEffect(() => {
    if (data) {
      setGoogleEnabled(data.google.enabled)
      setGoogleClientId(data.google.clientId)
      setGoogleClientSecret('')
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        google: {
          enabled: googleEnabled,
          clientId: googleClientId,
        },
      }
      // Only send clientSecret if user typed something or explicitly cleared it
      if (googleClientSecret !== '') {
        payload.google.clientSecret = googleClientSecret
      }
      const res = await fetch('/api/settings/oauth', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'oauth'] })
      queryClient.invalidateQueries({ queryKey: ['auth-status'] })
      setOauthFeedback({ type: 'success', message: 'OAuth settings saved.' })
      setTimeout(() => setOauthFeedback(null), 3000)
    },
    onError: (err: Error) => {
      setOauthFeedback({ type: 'error', message: err.message })
    },
  })

  return (
    <div
      style={{
        border: '1px solid var(--dc-border)',
        borderRadius: 8,
        padding: 20,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dc-text)', marginBottom: 12 }}>
        OAuth Providers
      </div>

      {oauthFeedback && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            marginBottom: 12,
            backgroundColor:
              oauthFeedback.type === 'success'
                ? 'var(--dc-success-bg, #dcfce7)'
                : 'var(--dc-error-bg)',
            border: `1px solid ${oauthFeedback.type === 'success' ? 'var(--dc-success, #22c55e)' : 'var(--dc-error-border)'}`,
            color:
              oauthFeedback.type === 'success' ? 'var(--dc-success, #16a34a)' : 'var(--dc-error)',
          }}
        >
          {oauthFeedback.message}
        </div>
      )}

      {/* Google */}
      <div
        style={{
          border: '1px solid var(--dc-border)',
          borderRadius: 6,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dc-text)' }}>Google</div>
            <div style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginTop: 2 }}>
              Allow users to sign in with their Google account.
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
              checked={googleEnabled}
              onChange={e => setGoogleEnabled(e.target.checked)}
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
                backgroundColor: googleEnabled ? 'var(--dc-primary)' : 'var(--dc-input-border)',
                borderRadius: 12,
                transition: 'background-color 0.2s',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  height: 18,
                  width: 18,
                  left: googleEnabled ? 22 : 3,
                  bottom: 3,
                  backgroundColor: 'white',
                  borderRadius: '50%',
                  transition: 'left 0.2s',
                }}
              />
            </span>
          </label>
        </div>

        {googleEnabled && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--dc-text-muted)',
                  marginBottom: 4,
                }}
              >
                Client ID
              </label>
              <input
                type="text"
                value={googleClientId}
                onChange={e => setGoogleClientId(e.target.value)}
                placeholder="123456789.apps.googleusercontent.com"
                style={inputStyle}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--dc-text-muted)',
                  marginBottom: 4,
                }}
              >
                Client Secret
              </label>
              <input
                type="password"
                value={googleClientSecret}
                onChange={e => setGoogleClientSecret(e.target.value)}
                placeholder={
                  data?.google.hasClientSecret
                    ? data.google.clientSecretHint
                    : 'Enter client secret'
                }
                style={inputStyle}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--dc-text-muted)',
                  marginBottom: 4,
                }}
              >
                Redirect URI
              </label>
              <input
                type="text"
                value={data?.google.redirectUri || ''}
                readOnly
                onClick={e => (e.target as HTMLInputElement).select()}
                style={{ ...inputStyle, cursor: 'default', opacity: 0.8 }}
              />
              <div style={{ fontSize: 11, color: 'var(--dc-text-muted)', marginTop: 4 }}>
                Add this URI to your Google Cloud Console authorized redirect URIs.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 6,
                  border: 'none',
                  backgroundColor: 'var(--dc-primary)',
                  color: 'var(--dc-primary-content)',
                  cursor: 'pointer',
                  opacity: saveMutation.isPending ? 0.5 : 1,
                }}
              >
                {saveMutation.isPending ? 'Saving...' : 'Save'}
              </button>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 6,
                  border: '1px solid var(--dc-border)',
                  backgroundColor: 'var(--dc-surface)',
                  color: 'var(--dc-text)',
                  cursor: 'pointer',
                  textDecoration: 'none',
                }}
              >
                How to set up
              </a>
            </div>
          </div>
        )}

        {!googleEnabled && data?.google.hasClientSecret && (
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 6,
                border: 'none',
                backgroundColor: 'var(--dc-primary)',
                color: 'var(--dc-primary-content)',
                cursor: 'pointer',
                opacity: saveMutation.isPending ? 0.5 : 1,
              }}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
