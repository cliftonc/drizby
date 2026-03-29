import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'

interface McpConfig {
  mcpEnabled: boolean
  mcpAppEnabled: boolean
  appUrl: string
  brandName: string
}

export default function McpServerPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const { data, isLoading } = useQuery<McpConfig>({
    queryKey: ['settings', 'features'],
    queryFn: async () => {
      const res = await fetch('/api/settings/features', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch MCP settings')
      return res.json()
    },
  })

  const [mcpEnabled, setMcpEnabled] = useState(false)
  const [mcpAppEnabled, setMcpAppEnabled] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  useEffect(() => {
    if (data) {
      setMcpEnabled(data.mcpEnabled)
      setMcpAppEnabled(data.mcpAppEnabled)
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
      setFeedback({ type: 'success', message: 'Settings saved.' })
      setTimeout(() => setFeedback(null), 3000)
    },
    onError: (err: Error) => {
      setFeedback({ type: 'error', message: err.message })
    },
  })

  const handleSave = () => {
    saveMutation.mutate({ mcpEnabled, mcpAppEnabled })
  }

  if (isLoading) return <div style={{ color: 'var(--dc-text-muted)' }}>Loading...</div>

  const appUrl = data?.appUrl || ''
  const mcpUrl = appUrl ? `${appUrl.replace(/\/$/, '')}/mcp` : ''
  const hasAppUrl = !!mcpUrl
  const brandName = data?.brandName || 'Drizby'
  const enabled = data?.mcpEnabled ?? false

  // Non-admin: show read-only view
  if (!isAdmin) {
    if (!enabled) {
      return (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--dc-text)', margin: '0 0 8px' }}>
            MCP Server
          </h2>
          <p
            style={{ fontSize: 13, color: 'var(--dc-text-muted)', marginTop: 0, marginBottom: 24 }}
          >
            Connect your AI assistants to {brandName} via the Model Context Protocol.
          </p>
          <div
            style={{
              maxWidth: 560,
              padding: '16px 20px',
              borderRadius: 8,
              border: '1px solid var(--dc-border)',
              fontSize: 13,
              color: 'var(--dc-text-muted)',
            }}
          >
            The MCP server is not currently enabled. Ask an admin to enable it in Settings.
          </div>
        </div>
      )
    }

    return (
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--dc-text)', margin: '0 0 8px' }}>
          MCP Server
        </h2>
        <p style={{ fontSize: 13, color: 'var(--dc-text-muted)', marginTop: 0, marginBottom: 24 }}>
          Connect your AI assistants to {brandName} via the Model Context Protocol.
        </p>
        <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <McpSetupInstructions mcpUrl={mcpUrl} hasAppUrl={hasAppUrl} brandName={brandName} />
        </div>
      </div>
    )
  }

  // Admin: full toggle + save + instructions
  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--dc-text)', margin: '0 0 8px' }}>
        MCP Server
      </h2>
      <p style={{ fontSize: 13, color: 'var(--dc-text-muted)', marginTop: 0, marginBottom: 24 }}>
        Expose your semantic layer to AI assistants via the Model Context Protocol.
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
        {/* Enable / Disable */}
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
                Enable MCP Server
              </div>
              <div style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginTop: 2 }}>
                Allow AI assistants to query your cubes and dashboards.
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
        </div>

        {/* MCP App mode — shown when MCP is enabled */}
        {mcpEnabled && (
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
                  Enable MCP App
                </div>
                <div style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginTop: 2 }}>
                  Serve the MCP server as a web app, allowing browser-based MCP clients to connect.
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
                  checked={mcpAppEnabled}
                  onChange={e => setMcpAppEnabled(e.target.checked)}
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
                    backgroundColor: mcpAppEnabled ? 'var(--dc-primary)' : 'var(--dc-input-border)',
                    borderRadius: 12,
                    transition: 'background-color 0.2s',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      height: 18,
                      width: 18,
                      left: mcpAppEnabled ? 22 : 3,
                      bottom: 3,
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      transition: 'left 0.2s',
                    }}
                  />
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Setup instructions — shown when enabled */}
        {mcpEnabled && (
          <McpSetupInstructions mcpUrl={mcpUrl} hasAppUrl={hasAppUrl} brandName={brandName} />
        )}

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

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const codeStyle: React.CSSProperties = {
  backgroundColor: 'var(--dc-input-bg)',
  border: '1px solid var(--dc-input-border)',
  borderRadius: 6,
  padding: 12,
  fontSize: 11,
  color: 'var(--dc-text)',
  overflow: 'auto',
  margin: 0,
  lineHeight: 1.5,
}

const olStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  fontSize: 12,
  color: 'var(--dc-text-muted)',
  lineHeight: 1.7,
}

const platformCardStyle: React.CSSProperties = {
  borderLeft: '3px solid var(--dc-primary)',
  backgroundColor: 'var(--dc-surface)',
  borderRadius: '0 6px 6px 0',
  padding: '12px 16px',
}

const platformTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--dc-text)',
  marginBottom: 8,
}

// ---------------------------------------------------------------------------
// Copyable URL
// ---------------------------------------------------------------------------

function CopyableUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [url])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'var(--dc-input-bg)',
        border: '1px solid var(--dc-input-border)',
        borderRadius: 6,
        padding: '8px 12px',
      }}
    >
      <code style={{ fontSize: 12, color: 'var(--dc-text)', flex: 1, wordBreak: 'break-all' }}>
        {url}
      </code>
      <button
        type="button"
        onClick={copy}
        style={{
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 500,
          borderRadius: 4,
          border: '1px solid var(--dc-border)',
          backgroundColor: copied ? 'var(--dc-success-bg, #dcfce7)' : 'var(--dc-surface)',
          color: copied ? 'var(--dc-success, #16a34a)' : 'var(--dc-text-muted)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Setup instructions (shared by admin + member views)
// ---------------------------------------------------------------------------

function McpSetupInstructions({
  mcpUrl,
  hasAppUrl,
  brandName,
}: {
  mcpUrl: string
  hasAppUrl: boolean
  brandName: string
}) {
  return (
    <div
      style={{
        border: '1px solid var(--dc-border)',
        borderRadius: 8,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dc-text)', marginBottom: 4 }}>
          Connect to AI Assistants
        </div>
        <p style={{ fontSize: 12, color: 'var(--dc-text-muted)', margin: 0 }}>
          Each person connects from their own AI assistant and will be asked to log in with their{' '}
          {brandName} account to authorize access.
        </p>
      </div>

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
          server's public HTTPS URL so users can connect.
        </div>
      )}

      {hasAppUrl && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginBottom: 6 }}>
            Your MCP server URL:
          </div>
          <CopyableUrl url={mcpUrl} />
        </div>
      )}

      <McpPlatformInstructions mcpUrl={mcpUrl} brandName={brandName} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Platform-specific setup instructions
// ---------------------------------------------------------------------------

function McpPlatformInstructions({
  mcpUrl,
  brandName,
}: {
  mcpUrl: string
  brandName: string
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const displayUrl = mcpUrl || 'https://your-server.com/mcp'
  const serverName = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'drizby'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Claude.ai */}
      <div style={platformCardStyle}>
        <div style={platformTitleStyle}>Claude (claude.ai or Desktop app)</div>
        <ol style={olStyle}>
          <li>
            Go to <strong>Settings</strong> &gt; <strong>Connectors</strong>
          </li>
          <li>
            Click <strong>Add custom connector</strong> and paste the MCP URL above
          </li>
          <li>Log in with your {brandName} account when prompted to authorize</li>
          <li>
            In any chat, click <strong>+</strong> &gt; <strong>Connectors</strong> to enable it
          </li>
        </ol>
      </div>

      {/* ChatGPT */}
      <div style={platformCardStyle}>
        <div style={platformTitleStyle}>ChatGPT</div>
        <ol style={olStyle}>
          <li>
            Go to <strong>Settings</strong> &gt; <strong>Apps &amp; Connectors</strong> &gt;{' '}
            <strong>Advanced settings</strong> and enable <strong>Developer mode</strong>
          </li>
          <li>
            Go to <strong>Settings</strong> &gt; <strong>Connectors</strong> &gt;{' '}
            <strong>Create</strong>
          </li>
          <li>Enter a name (e.g. &quot;{brandName}&quot;) and paste the MCP URL above</li>
          <li>Log in with your {brandName} account when prompted to authorize</li>
          <li>
            In a conversation, click <strong>+</strong> &gt; <strong>More</strong> to select it
          </li>
        </ol>
      </div>

      {/* Claude Code */}
      <div style={platformCardStyle}>
        <div style={platformTitleStyle}>Claude Code (CLI)</div>
        <p style={{ fontSize: 12, color: 'var(--dc-text-muted)', margin: '0 0 6px' }}>
          Run this command, then type <code style={{ fontSize: 11 }}>/mcp</code> to log in with your{' '}
          {brandName} account:
        </p>
        <pre style={codeStyle}>{`claude mcp add --transport http ${serverName} ${displayUrl}`}</pre>
      </div>

      {/* Advanced: JSON configs */}
      <div style={{ marginTop: 4 }}>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            fontSize: 12,
            color: 'var(--dc-text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s',
              fontSize: 10,
            }}
          >
            {'\u25B6'}
          </span>
          Advanced: JSON configuration for VS Code, Cursor, and Claude Desktop
        </button>

        {showAdvanced && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            <div style={platformCardStyle}>
              <div style={platformTitleStyle}>VS Code / Cursor</div>
              <p style={{ fontSize: 12, color: 'var(--dc-text-muted)', margin: '0 0 8px' }}>
                Add to <code style={{ fontSize: 11 }}>.vscode/mcp.json</code> — you'll be prompted
                to log in on first use:
              </p>
              <pre style={codeStyle}>
                {JSON.stringify(
                  { servers: { [serverName]: { type: 'http', url: displayUrl } } },
                  null,
                  2
                )}
              </pre>
            </div>

            <div style={platformCardStyle}>
              <div style={platformTitleStyle}>Claude Desktop (manual config)</div>
              <p style={{ fontSize: 12, color: 'var(--dc-text-muted)', margin: '0 0 8px' }}>
                Add to <code style={{ fontSize: 11 }}>claude_desktop_config.json</code> — you'll be
                prompted to log in on first use:
              </p>
              <pre style={codeStyle}>
                {JSON.stringify(
                  { mcpServers: { [serverName]: { type: 'http', url: displayUrl } } },
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
