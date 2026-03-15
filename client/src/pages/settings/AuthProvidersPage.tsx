import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

interface ProviderConfig {
  enabled: boolean
  clientId: string
  hasClientSecret: boolean
  clientSecretHint: string
  redirectUri: string
  tenantId?: string
}

interface OAuthConfig {
  google: ProviderConfig
  github: ProviderConfig
  gitlab: ProviderConfig
  microsoft: ProviderConfig & { tenantId: string }
  slack: ProviderConfig
  magicLink: { enabled: boolean }
  password: { enabled: boolean }
  autoAcceptEmailDomains: string
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

const PROVIDERS: {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  hasCredentials: boolean
  setupUrl?: string
  setupLabel?: string
  requiredScopes?: string
}[] = [
  {
    id: 'github',
    label: 'GitHub',
    description: 'Allow users to sign in with their GitHub account.',
    icon: (
      <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
      </svg>
    ),
    hasCredentials: true,
    setupUrl: 'https://github.com/settings/developers',
    setupLabel: 'GitHub Developer Settings',
    requiredScopes: 'read:user, user:email',
  },
  {
    id: 'gitlab',
    label: 'GitLab',
    description: 'Allow users to sign in with their GitLab account.',
    icon: (
      <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24">
        <path fill="#E24329" d="M12 21.042L15.19 10.855H8.81L12 21.042z" />
        <path fill="#FC6D26" d="M12 21.042L8.81 10.855H3.101L12 21.042z" />
        <path
          fill="#FCA326"
          d="M3.101 10.855L1.917 14.497c-.108.331.013.693.303.882L12 21.042 3.101 10.855z"
        />
        <path
          fill="#E24329"
          d="M3.101 10.855h5.709L6.619 3.891c-.12-.37-.641-.37-.762 0L3.101 10.855z"
        />
        <path fill="#FC6D26" d="M12 21.042l3.19-10.187h5.709L12 21.042z" />
        <path
          fill="#FCA326"
          d="M20.899 10.855l1.184 3.642c.108.331-.013.693-.303.882L12 21.042l8.899-10.187z"
        />
        <path
          fill="#E24329"
          d="M20.899 10.855H15.19l2.191-6.964c.12-.37.641-.37.762 0l2.756 6.964z"
        />
      </svg>
    ),
    hasCredentials: true,
    setupUrl: 'https://gitlab.com/-/user_settings/applications',
    setupLabel: 'GitLab Applications',
    requiredScopes: 'openid, profile, email',
  },
  {
    id: 'google',
    label: 'Google',
    description: 'Allow users to sign in with their Google account.',
    icon: (
      <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    ),
    hasCredentials: true,
    setupUrl: 'https://console.cloud.google.com/apis/credentials',
    setupLabel: 'Google Cloud Console',
    requiredScopes: 'openid, email, profile',
  },
  {
    id: 'microsoft',
    label: 'Microsoft',
    description: 'Allow users to sign in with their Microsoft account.',
    icon: (
      <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24">
        <rect fill="#F25022" x="2" y="2" width="9.5" height="9.5" />
        <rect fill="#7FBA00" x="12.5" y="2" width="9.5" height="9.5" />
        <rect fill="#00A4EF" x="2" y="12.5" width="9.5" height="9.5" />
        <rect fill="#FFB900" x="12.5" y="12.5" width="9.5" height="9.5" />
      </svg>
    ),
    hasCredentials: true,
    setupUrl: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps',
    setupLabel: 'Azure App Registrations',
    requiredScopes: 'openid, profile, email, User.Read',
  },
  {
    id: 'slack',
    label: 'Slack',
    description: 'Allow users to sign in with their Slack account.',
    icon: (
      <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24">
        <path
          fill="#E01E5A"
          d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"
        />
        <path
          fill="#36C5F0"
          d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"
        />
        <path
          fill="#2EB67D"
          d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"
        />
        <path
          fill="#ECB22E"
          d="M15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z"
        />
      </svg>
    ),
    hasCredentials: true,
    setupUrl: 'https://api.slack.com/apps',
    setupLabel: 'Slack API Apps',
    requiredScopes: 'openid, profile, email',
  },
]

export default function AuthProvidersPage() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<OAuthConfig>({
    queryKey: ['settings', 'oauth'],
    queryFn: async () => {
      const res = await fetch('/api/settings/oauth', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch OAuth settings')
      return res.json()
    },
  })

  // Per-provider local state
  const [state, setState] = useState<
    Record<
      string,
      {
        enabled: boolean
        clientId: string
        clientSecret: string
        tenantId?: string
      }
    >
  >({})
  const [passwordEnabled, setPasswordEnabled] = useState(true)
  const [magicLinkEnabled, setMagicLinkEnabled] = useState(false)
  const [autoAcceptDomains, setAutoAcceptDomains] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  useEffect(() => {
    if (!data) return
    const s: typeof state = {}
    for (const p of PROVIDERS) {
      const cfg = (data as any)[p.id] as ProviderConfig
      s[p.id] = {
        enabled: cfg?.enabled ?? false,
        clientId: cfg?.clientId ?? '',
        clientSecret: '',
        ...(p.id === 'microsoft'
          ? { tenantId: (data.microsoft as any)?.tenantId ?? 'common' }
          : {}),
      }
    }
    setState(s)
    setPasswordEnabled(data.password?.enabled ?? true)
    setMagicLinkEnabled(data.magicLink?.enabled ?? false)
    setAutoAcceptDomains(data.autoAcceptEmailDomains ?? '')
  }, [data])

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
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
      setFeedback({ type: 'success', message: 'Settings saved.' })
      setTimeout(() => setFeedback(null), 3000)
    },
    onError: (err: Error) => {
      setFeedback({ type: 'error', message: err.message })
    },
  })

  const saveProvider = (providerId: string) => {
    const s = state[providerId]
    if (!s) return
    const payload: any = {
      [providerId]: {
        enabled: s.enabled,
        clientId: s.clientId,
      },
    }
    if (s.clientSecret !== '') {
      payload[providerId].clientSecret = s.clientSecret
    }
    if (providerId === 'microsoft' && s.tenantId !== undefined) {
      payload[providerId].tenantId = s.tenantId
    }
    saveMutation.mutate(payload)
  }

  const updateField = (provider: string, field: string, value: string | boolean) => {
    setState(prev => ({
      ...prev,
      [provider]: { ...prev[provider], [field]: value },
    }))
  }

  if (isLoading) return <div style={{ color: 'var(--dc-text-muted)' }}>Loading...</div>

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--dc-text)', margin: '0 0 8px' }}>
        Authentication
      </h2>
      <p style={{ fontSize: 13, color: 'var(--dc-text-muted)', marginTop: 0, marginBottom: 24 }}>
        Configure sign-in methods for your users.
      </p>

      {feedback && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            marginBottom: 16,
            maxWidth: 560,
            backgroundColor:
              feedback.type === 'success' ? 'var(--dc-success-bg, #dcfce7)' : 'var(--dc-error-bg)',
            border: `1px solid ${feedback.type === 'success' ? 'var(--dc-success, #22c55e)' : 'var(--dc-error-border)'}`,
            color: feedback.type === 'success' ? 'var(--dc-success, #16a34a)' : 'var(--dc-error)',
          }}
        >
          {feedback.message}
        </div>
      )}

      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Password */}
        <div
          style={{
            border: '1px solid var(--dc-border)',
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--dc-text)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg
                  style={{ width: 18, height: 18 }}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Password
              </div>
              <div style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginTop: 2 }}>
                Allow users to sign in with email and password.
              </div>
            </div>
            <Toggle
              checked={passwordEnabled}
              onChange={v => {
                setPasswordEnabled(v)
                const payload: Record<string, unknown> = { password: { enabled: v } }
                if (v && magicLinkEnabled) {
                  setMagicLinkEnabled(false)
                  payload.magicLink = { enabled: false }
                }
                saveMutation.mutate(payload)
              }}
            />
          </div>
          {passwordEnabled && (
            <div style={{ fontSize: 11, color: 'var(--dc-text-muted)', marginTop: 8 }}>
              Users sign in with their email and a password they set during registration.
            </div>
          )}
        </div>

        {/* Magic Link */}
        <div
          style={{
            border: '1px solid var(--dc-border)',
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--dc-text)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg
                  style={{ width: 18, height: 18 }}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                Magic Link
              </div>
              <div style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginTop: 2 }}>
                Allow users to sign in via email link. Replaces password sign-in.
              </div>
            </div>
            <Toggle
              checked={magicLinkEnabled}
              onChange={v => {
                setMagicLinkEnabled(v)
                const payload: Record<string, unknown> = { magicLink: { enabled: v } }
                if (v && passwordEnabled) {
                  setPasswordEnabled(false)
                  payload.password = { enabled: false }
                }
                saveMutation.mutate(payload)
              }}
            />
          </div>
          {magicLinkEnabled && (
            <div style={{ fontSize: 11, color: 'var(--dc-text-muted)', marginTop: 8 }}>
              Users receive a one-time sign-in link by email instead of using a password. Requires
              email delivery (RESEND_API_KEY).
            </div>
          )}
        </div>

        {PROVIDERS.map(p => {
          const s = state[p.id]
          if (!s) return null
          const providerData = data ? ((data as any)[p.id] as ProviderConfig) : null

          return (
            <div
              key={p.id}
              style={{
                border: '1px solid var(--dc-border)',
                borderRadius: 8,
                padding: 16,
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--dc-text)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {p.icon}
                    {p.label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginTop: 2 }}>
                    {p.description}
                  </div>
                </div>
                <Toggle checked={s.enabled} onChange={v => updateField(p.id, 'enabled', v)} />
              </div>

              {s.enabled && (
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
                      value={s.clientId}
                      onChange={e => updateField(p.id, 'clientId', e.target.value)}
                      placeholder="Enter client ID"
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
                      value={s.clientSecret}
                      onChange={e => updateField(p.id, 'clientSecret', e.target.value)}
                      placeholder={
                        providerData?.hasClientSecret
                          ? providerData.clientSecretHint
                          : 'Enter client secret'
                      }
                      style={inputStyle}
                    />
                  </div>
                  {p.id === 'microsoft' && (
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 12,
                          color: 'var(--dc-text-muted)',
                          marginBottom: 4,
                        }}
                      >
                        Tenant ID
                      </label>
                      <input
                        type="text"
                        value={s.tenantId || ''}
                        onChange={e => updateField(p.id, 'tenantId', e.target.value)}
                        placeholder="common"
                        style={inputStyle}
                      />
                      <div style={{ fontSize: 11, color: 'var(--dc-text-muted)', marginTop: 4 }}>
                        Use "common" for any Microsoft account, or a specific tenant ID.
                      </div>
                    </div>
                  )}
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
                      value={providerData?.redirectUri || ''}
                      readOnly
                      onClick={e => (e.target as HTMLInputElement).select()}
                      style={{ ...inputStyle, cursor: 'default', opacity: 0.8 }}
                    />
                    <div style={{ fontSize: 11, color: 'var(--dc-text-muted)', marginTop: 4 }}>
                      Add this URI to your {p.label} app configuration.
                    </div>
                  </div>
                  {p.requiredScopes && (
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--dc-text-muted)',
                        backgroundColor: 'var(--dc-surface-raised, var(--dc-bg))',
                        border: '1px solid var(--dc-border)',
                        borderRadius: 6,
                        padding: '8px 10px',
                      }}
                    >
                      <strong style={{ color: 'var(--dc-text)' }}>Required scopes:</strong>{' '}
                      <code style={{ fontSize: 11 }}>{p.requiredScopes}</code>
                      <div style={{ marginTop: 2, fontSize: 11 }}>
                        Enable these scopes/permissions in your {p.label} app configuration.
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => saveProvider(p.id)}
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
                    {p.setupUrl && (
                      <a
                        href={p.setupUrl}
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
                    )}
                  </div>
                </div>
              )}

              {!s.enabled && providerData?.hasClientSecret && (
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => saveProvider(p.id)}
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
          )
        })}

        {/* Auto-accept email domains */}
        <div
          style={{
            border: '1px solid var(--dc-border)',
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--dc-text)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 4,
            }}
          >
            <svg
              style={{ width: 18, height: 18 }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            Auto-accept email domains
          </div>
          <div style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginBottom: 10 }}>
            Users with verified emails from these domains are automatically approved as members
            instead of requiring admin approval. Only applies to OAuth and magic link sign-ins (not
            password registration, since the email is unverified).
          </div>
          <textarea
            value={autoAcceptDomains}
            onChange={e => setAutoAcceptDomains(e.target.value)}
            placeholder="example.com, acme.org"
            rows={3}
            style={{
              ...inputStyle,
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ fontSize: 11, color: 'var(--dc-text-muted)', marginTop: 4 }}>
            Separate domains with commas, semicolons, or newlines.
          </div>
          <button
            type="button"
            onClick={() => saveMutation.mutate({ autoAcceptEmailDomains: autoAcceptDomains })}
            disabled={saveMutation.isPending}
            style={{
              marginTop: 8,
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
      </div>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
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
        checked={checked}
        onChange={e => onChange(e.target.checked)}
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
          backgroundColor: checked ? 'var(--dc-primary)' : 'var(--dc-input-border)',
          borderRadius: 12,
          transition: 'background-color 0.2s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            height: 18,
            width: 18,
            left: checked ? 22 : 3,
            bottom: 3,
            backgroundColor: 'white',
            borderRadius: '50%',
            transition: 'left 0.2s',
          }}
        />
      </span>
    </label>
  )
}
