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

const PROVIDERS = [
  {
    id: 'github',
    label: 'GitHub',
    description: 'Allow users to sign in with their GitHub account.',
    icon: '/auth-logos/github.svg',
    hasCredentials: true,
    setupUrl: 'https://github.com/settings/developers',
    setupLabel: 'GitHub Developer Settings',
    requiredScopes: 'read:user, user:email',
  },
  {
    id: 'gitlab',
    label: 'GitLab',
    description: 'Allow users to sign in with their GitLab account.',
    icon: '/auth-logos/gitlab.svg',
    hasCredentials: true,
    setupUrl: 'https://gitlab.com/-/user_settings/applications',
    setupLabel: 'GitLab Applications',
    requiredScopes: 'openid, profile, email',
  },
  {
    id: 'google',
    label: 'Google',
    description: 'Allow users to sign in with their Google account.',
    icon: '/auth-logos/google.svg',
    hasCredentials: true,
    setupUrl: 'https://console.cloud.google.com/apis/credentials',
    setupLabel: 'Google Cloud Console',
    requiredScopes: 'openid, email, profile',
  },
  {
    id: 'microsoft',
    label: 'Microsoft',
    description: 'Allow users to sign in with their Microsoft account.',
    icon: '/auth-logos/microsoft.svg',
    hasCredentials: true,
    setupUrl: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps',
    setupLabel: 'Azure App Registrations',
    requiredScopes: 'openid, profile, email, User.Read',
  },
  {
    id: 'slack',
    label: 'Slack',
    description: 'Allow users to sign in with their Slack account.',
    icon: '/auth-logos/slack.svg',
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
                    <img src={p.icon} alt="" style={{ width: 18, height: 18 }} />
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
