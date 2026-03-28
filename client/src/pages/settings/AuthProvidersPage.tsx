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

interface SamlConfig {
  enabled: boolean
  idpMetadataUrl: string
  hasIdpMetadataXml: boolean
  spEntityId: string
  hasCertificate: boolean
  certificateHint: string
  attributeMapping: { email: string; name: string; groups: string }
  metadataUrl: string
  callbackUrl: string
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
  saml?: SamlConfig
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

// Navigation item types
type NavSection =
  | 'password'
  | 'magic_link'
  | 'saml'
  | 'scim'
  | 'auto_accept'
  | (typeof PROVIDERS)[number]['id']

interface NavItem {
  id: NavSection
  label: string
  icon: React.ReactNode
  category: 'credentials' | 'enterprise' | 'oauth' | 'policies'
}

const LockIcon = (
  <svg
    style={{ width: 16, height: 16 }}
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
)

const LinkIcon = (
  <svg
    style={{ width: 16, height: 16 }}
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
)

const ShieldIcon = (
  <svg
    style={{ width: 16, height: 16 }}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

const UsersIcon = (
  <svg
    style={{ width: 16, height: 16 }}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const CheckIcon = (
  <svg
    style={{ width: 16, height: 16 }}
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
)

const NAV_ITEMS: NavItem[] = [
  { id: 'password', label: 'Password', icon: LockIcon, category: 'credentials' },
  { id: 'magic_link', label: 'Magic Link', icon: LinkIcon, category: 'credentials' },
  ...PROVIDERS.map(p => ({
    id: p.id as NavSection,
    label: p.label,
    icon: <img src={p.icon} alt="" style={{ width: 16, height: 16 }} />,
    category: 'oauth' as const,
  })),
  { id: 'saml', label: 'SAML 2.0 SSO', icon: ShieldIcon, category: 'enterprise' },
  { id: 'scim', label: 'SCIM Provisioning', icon: UsersIcon, category: 'enterprise' },
  { id: 'auto_accept', label: 'Auto-accept Domains', icon: CheckIcon, category: 'policies' },
]

const CATEGORIES = [
  { id: 'credentials', label: 'Credentials' },
  { id: 'oauth', label: 'OAuth Providers' },
  { id: 'enterprise', label: 'Enterprise' },
  { id: 'policies', label: 'Policies' },
]

export default function AuthProvidersPage() {
  const queryClient = useQueryClient()
  const [activeSection, setActiveSection] = useState<NavSection>('password')

  const { data, isLoading } = useQuery<OAuthConfig>({
    queryKey: ['settings', 'oauth'],
    queryFn: async () => {
      const res = await fetch('/api/settings/oauth', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch OAuth settings')
      return res.json()
    },
  })

  const { data: scimData } = useQuery<{
    enabled: boolean
    endpointUrl: string
    tokens: Array<{ id: string; name: string; createdAt: string; lastUsedAt: string | null }>
    provisionedUserCount: number
  }>({
    queryKey: ['settings', 'scim'],
    queryFn: async () => {
      const res = await fetch('/api/settings/scim', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch SCIM settings')
      return res.json()
    },
  })
  const [scimEnabled, setScimEnabled] = useState(false)
  const [newTokenName, setNewTokenName] = useState('')
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)

  const [state, setState] = useState<
    Record<string, { enabled: boolean; clientId: string; clientSecret: string; tenantId?: string }>
  >({})
  const [passwordEnabled, setPasswordEnabled] = useState(true)
  const [magicLinkEnabled, setMagicLinkEnabled] = useState(false)
  const [autoAcceptDomains, setAutoAcceptDomains] = useState('')
  const [samlState, setSamlState] = useState({
    enabled: false,
    idpMetadataUrl: '',
    idpMetadataXml: '',
    spEntityId: '',
    certificate: '',
    attributeMapping: { email: 'email', name: 'name', groups: 'groups' },
  })
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
    if (data.saml) {
      setSamlState(prev => ({
        ...prev,
        enabled: data.saml?.enabled ?? false,
        idpMetadataUrl: data.saml?.idpMetadataUrl ?? '',
        spEntityId: data.saml?.spEntityId ?? '',
        attributeMapping: data.saml?.attributeMapping ?? prev.attributeMapping,
      }))
    }
  }, [data])

  useEffect(() => {
    if (scimData) setScimEnabled(scimData.enabled)
  }, [scimData])

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
    const payload: any = { [providerId]: { enabled: s.enabled, clientId: s.clientId } }
    if (s.clientSecret !== '') payload[providerId].clientSecret = s.clientSecret
    if (providerId === 'microsoft' && s.tenantId !== undefined)
      payload[providerId].tenantId = s.tenantId
    saveMutation.mutate(payload)
  }

  const updateField = (provider: string, field: string, value: string | boolean) => {
    setState(prev => ({ ...prev, [provider]: { ...prev[provider], [field]: value } }))
  }

  // Compute enabled status for nav indicators
  const isEnabled = (id: NavSection): boolean => {
    if (id === 'password') return passwordEnabled
    if (id === 'magic_link') return magicLinkEnabled
    if (id === 'saml') return samlState.enabled
    if (id === 'scim') return scimEnabled
    if (id === 'auto_accept') return !!autoAcceptDomains.trim()
    return state[id]?.enabled ?? false
  }

  if (isLoading) return <div style={{ color: 'var(--dc-text-muted)' }}>Loading...</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
        <div style={{ width: 200, flexShrink: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--dc-text)', margin: 0 }}>
            Authentication
          </h2>
        </div>
        <div
          style={{
            flex: 1,
            maxWidth: 520,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <p style={{ fontSize: 13, color: 'var(--dc-text-muted)', margin: 0 }}>
            Configure sign-in methods for your users.
          </p>
          <a
            href="https://drizby.com/docs/users/authentication/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              fontSize: 12,
              color: 'var(--dc-text-muted)',
              textDecoration: 'none',
              borderRadius: 6,
              border: '1px solid var(--dc-border)',
              whiteSpace: 'nowrap',
              height: 'fit-content',
            }}
          >
            <svg
              style={{ width: 14, height: 14 }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Help
          </a>
        </div>
      </div>

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

      <div style={{ display: 'flex', gap: 24 }}>
        {/* Left nav */}
        <nav
          style={{
            width: 200,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {CATEGORIES.map(cat => {
            const items = NAV_ITEMS.filter(n => n.category === cat.id)
            if (items.length === 0) return null
            return (
              <div key={cat.id} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--dc-text-muted)',
                    padding: '0 8px',
                    marginBottom: 4,
                  }}
                >
                  {cat.label}
                </div>
                {items.map(item => {
                  const active = activeSection === item.id
                  const enabled = isEnabled(item.id)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSection(item.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: 'none',
                        backgroundColor: active
                          ? 'var(--dc-surface-raised, var(--dc-bg))'
                          : 'transparent',
                        color: active ? 'var(--dc-text)' : 'var(--dc-text-secondary)',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: active ? 500 : 400,
                        textAlign: 'left',
                      }}
                    >
                      {item.icon}
                      <span style={{ flex: 1 }}>{item.label}</span>
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          backgroundColor: enabled
                            ? 'var(--dc-success, #22c55e)'
                            : 'var(--dc-input-border)',
                          flexShrink: 0,
                        }}
                      />
                    </button>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Content panel */}
        <div style={{ flex: 1, maxWidth: 520 }}>
          {activeSection === 'password' && (
            <SectionCard
              title="Password"
              description="Allow users to sign in with email and password."
            >
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span style={{ fontSize: 13, color: 'var(--dc-text)' }}>
                  Enable password sign-in
                </span>
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
                <div style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginTop: 8 }}>
                  Users sign in with their email and a password they set during registration.
                </div>
              )}
            </SectionCard>
          )}

          {activeSection === 'magic_link' && (
            <SectionCard
              title="Magic Link"
              description="Allow users to sign in via email link. Replaces password sign-in."
            >
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span style={{ fontSize: 13, color: 'var(--dc-text)' }}>
                  Enable magic link sign-in
                </span>
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
                <div style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginTop: 8 }}>
                  Users receive a one-time sign-in link by email instead of using a password.
                  Requires email delivery (RESEND_API_KEY).
                </div>
              )}
            </SectionCard>
          )}

          {PROVIDERS.map(p => {
            if (activeSection !== p.id) return null
            const s = state[p.id]
            if (!s) return null
            const providerData = data ? ((data as any)[p.id] as ProviderConfig) : null

            return (
              <SectionCard key={p.id} title={p.label} description={p.description}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 12,
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--dc-text)' }}>
                    Enable {p.label} sign-in
                  </span>
                  <Toggle checked={s.enabled} onChange={v => updateField(p.id, 'enabled', v)} />
                </div>

                {s.enabled && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <FieldLabel label="Client ID">
                      <input
                        type="text"
                        value={s.clientId}
                        onChange={e => updateField(p.id, 'clientId', e.target.value)}
                        placeholder="Enter client ID"
                        style={inputStyle}
                      />
                    </FieldLabel>
                    <FieldLabel label="Client Secret">
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
                    </FieldLabel>
                    {p.id === 'microsoft' && (
                      <FieldLabel
                        label="Tenant ID"
                        hint={'Use "common" for any Microsoft account, or a specific tenant ID.'}
                      >
                        <input
                          type="text"
                          value={s.tenantId || ''}
                          onChange={e => updateField(p.id, 'tenantId', e.target.value)}
                          placeholder="common"
                          style={inputStyle}
                        />
                      </FieldLabel>
                    )}
                    <FieldLabel
                      label="Redirect URI"
                      hint={`Add this URI to your ${p.label} app configuration.`}
                    >
                      <input
                        type="text"
                        value={providerData?.redirectUri || ''}
                        readOnly
                        onClick={e => (e.target as HTMLInputElement).select()}
                        style={{ ...inputStyle, cursor: 'default', opacity: 0.8 }}
                      />
                    </FieldLabel>
                    {p.requiredScopes && (
                      <InfoBox>
                        <strong style={{ color: 'var(--dc-text)' }}>Required scopes:</strong>{' '}
                        <code style={{ fontSize: 11 }}>{p.requiredScopes}</code>
                        <div style={{ marginTop: 2, fontSize: 11 }}>
                          Enable these scopes/permissions in your {p.label} app configuration.
                        </div>
                      </InfoBox>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <SaveButton
                        onClick={() => saveProvider(p.id)}
                        isPending={saveMutation.isPending}
                      />
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
                  <SaveButton
                    onClick={() => saveProvider(p.id)}
                    isPending={saveMutation.isPending}
                  />
                )}
              </SectionCard>
            )
          })}

          {activeSection === 'saml' && (
            <SectionCard
              title="SAML 2.0 SSO"
              description="Enterprise single sign-on via SAML identity providers (Okta, Azure AD, OneLogin, etc.)"
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--dc-text)' }}>Enable SAML SSO</span>
                <Toggle
                  checked={samlState.enabled}
                  onChange={v => setSamlState(prev => ({ ...prev, enabled: v }))}
                />
              </div>

              {samlState.enabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <FieldLabel
                    label="IdP Metadata URL"
                    hint="URL to your IdP's SAML metadata XML. Alternatively, paste the XML below."
                  >
                    <input
                      type="text"
                      value={samlState.idpMetadataUrl}
                      onChange={e =>
                        setSamlState(prev => ({ ...prev, idpMetadataUrl: e.target.value }))
                      }
                      placeholder="https://your-idp.example.com/app/.../sso/saml/metadata"
                      style={inputStyle}
                    />
                  </FieldLabel>
                  <FieldLabel
                    label={`IdP Metadata XML ${data?.saml?.hasIdpMetadataXml ? '(configured)' : ''}`}
                  >
                    <textarea
                      value={samlState.idpMetadataXml}
                      onChange={e =>
                        setSamlState(prev => ({ ...prev, idpMetadataXml: e.target.value }))
                      }
                      placeholder={
                        data?.saml?.hasIdpMetadataXml
                          ? 'Leave empty to keep existing metadata XML'
                          : 'Paste IdP metadata XML here (optional if URL is provided)'
                      }
                      rows={4}
                      style={{
                        ...inputStyle,
                        resize: 'vertical',
                        fontFamily: 'monospace',
                        fontSize: 11,
                      }}
                    />
                  </FieldLabel>
                  <FieldLabel label="SP Entity ID">
                    <input
                      type="text"
                      value={samlState.spEntityId}
                      onChange={e =>
                        setSamlState(prev => ({ ...prev, spEntityId: e.target.value }))
                      }
                      placeholder={data?.saml?.metadataUrl || 'Auto-generated from app URL'}
                      style={inputStyle}
                    />
                  </FieldLabel>
                  <FieldLabel
                    label={`IdP Signing Certificate ${data?.saml?.hasCertificate ? `(${data.saml.certificateHint})` : ''}`}
                  >
                    <textarea
                      value={samlState.certificate}
                      onChange={e =>
                        setSamlState(prev => ({ ...prev, certificate: e.target.value }))
                      }
                      placeholder={
                        data?.saml?.hasCertificate
                          ? 'Leave empty to keep existing certificate'
                          : 'Paste X.509 certificate (PEM format)'
                      }
                      rows={3}
                      style={{
                        ...inputStyle,
                        resize: 'vertical',
                        fontFamily: 'monospace',
                        fontSize: 11,
                      }}
                    />
                  </FieldLabel>

                  <InfoBox>
                    <strong style={{ color: 'var(--dc-text)' }}>Attribute Mapping</strong>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      {(['email', 'name', 'groups'] as const).map(field => (
                        <div key={field} style={{ flex: 1 }}>
                          <label
                            style={{
                              display: 'block',
                              fontSize: 11,
                              marginBottom: 2,
                              textTransform: 'capitalize',
                            }}
                          >
                            {field}
                          </label>
                          <input
                            type="text"
                            value={samlState.attributeMapping[field]}
                            onChange={e =>
                              setSamlState(prev => ({
                                ...prev,
                                attributeMapping: {
                                  ...prev.attributeMapping,
                                  [field]: e.target.value,
                                },
                              }))
                            }
                            style={{ ...inputStyle, fontSize: 11 }}
                          />
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11 }}>
                      SAML attribute names used to extract user information from assertions.
                    </div>
                  </InfoBox>

                  {data?.saml && (
                    <InfoBox>
                      <strong style={{ color: 'var(--dc-text)' }}>Service Provider URLs</strong>
                      <div style={{ marginTop: 4, fontSize: 11 }}>
                        Add these to your identity provider configuration:
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <div style={{ fontSize: 11 }}>ACS URL (Callback):</div>
                        <input
                          type="text"
                          value={data.saml.callbackUrl}
                          readOnly
                          onClick={e => (e.target as HTMLInputElement).select()}
                          style={{
                            ...inputStyle,
                            fontSize: 11,
                            cursor: 'default',
                            opacity: 0.8,
                            marginTop: 2,
                          }}
                        />
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 11 }}>SP Metadata URL:</div>
                        <input
                          type="text"
                          value={data.saml.metadataUrl}
                          readOnly
                          onClick={e => (e.target as HTMLInputElement).select()}
                          style={{
                            ...inputStyle,
                            fontSize: 11,
                            cursor: 'default',
                            opacity: 0.8,
                            marginTop: 2,
                          }}
                        />
                      </div>
                    </InfoBox>
                  )}

                  <SaveButton
                    onClick={() => {
                      const payload: any = {
                        saml: {
                          enabled: samlState.enabled,
                          idpMetadataUrl: samlState.idpMetadataUrl,
                          spEntityId: samlState.spEntityId,
                          attributeMapping: samlState.attributeMapping,
                        },
                      }
                      if (samlState.idpMetadataXml)
                        payload.saml.idpMetadataXml = samlState.idpMetadataXml
                      if (samlState.certificate) payload.saml.certificate = samlState.certificate
                      saveMutation.mutate(payload)
                    }}
                    isPending={saveMutation.isPending}
                  />
                </div>
              )}

              {!samlState.enabled && data?.saml?.enabled && (
                <SaveButton
                  onClick={() => saveMutation.mutate({ saml: { enabled: false } })}
                  isPending={saveMutation.isPending}
                />
              )}
            </SectionCard>
          )}

          {activeSection === 'scim' && (
            <SectionCard
              title="SCIM 2.0 Provisioning"
              description="Automatic user and group provisioning from your identity provider."
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--dc-text)' }}>
                  Enable SCIM provisioning
                </span>
                <Toggle
                  checked={scimEnabled}
                  onChange={async v => {
                    setScimEnabled(v)
                    await fetch('/api/settings/scim', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ enabled: v }),
                    })
                    queryClient.invalidateQueries({ queryKey: ['settings', 'scim'] })
                  }}
                />
              </div>

              {scimEnabled && scimData && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <FieldLabel
                    label="SCIM Endpoint URL"
                    hint="Configure this URL in your identity provider's SCIM settings."
                  >
                    <input
                      type="text"
                      value={scimData.endpointUrl}
                      readOnly
                      onClick={e => (e.target as HTMLInputElement).select()}
                      style={{ ...inputStyle, cursor: 'default', opacity: 0.8 }}
                    />
                  </FieldLabel>

                  <div style={{ fontSize: 12, color: 'var(--dc-text-muted)' }}>
                    {scimData.provisionedUserCount} SCIM-provisioned user
                    {scimData.provisionedUserCount !== 1 ? 's' : ''}
                  </div>

                  <InfoBox>
                    <strong style={{ fontSize: 12, color: 'var(--dc-text)' }}>API Tokens</strong>
                    <div style={{ fontSize: 11, color: 'var(--dc-text-muted)', marginTop: 2 }}>
                      Generate bearer tokens for your IdP to authenticate SCIM requests.
                    </div>

                    {scimData.tokens.length > 0 && (
                      <div
                        style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}
                      >
                        {scimData.tokens.map(t => (
                          <div
                            key={t.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '4px 8px',
                              backgroundColor: 'var(--dc-surface)',
                              borderRadius: 4,
                              fontSize: 12,
                            }}
                          >
                            <div>
                              <span style={{ color: 'var(--dc-text)', fontWeight: 500 }}>
                                {t.name}
                              </span>
                              <span style={{ color: 'var(--dc-text-muted)', marginLeft: 8 }}>
                                {t.lastUsedAt
                                  ? `Last used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                                  : 'Never used'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                await fetch(`/api/settings/scim/tokens/${t.id}`, {
                                  method: 'DELETE',
                                  credentials: 'include',
                                })
                                queryClient.invalidateQueries({ queryKey: ['settings', 'scim'] })
                              }}
                              style={{
                                padding: '2px 8px',
                                fontSize: 11,
                                borderRadius: 4,
                                border: '1px solid var(--dc-error-border, #fca5a5)',
                                backgroundColor: 'transparent',
                                color: 'var(--dc-error, #ef4444)',
                                cursor: 'pointer',
                              }}
                            >
                              Revoke
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {generatedToken && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: '8px 10px',
                          backgroundColor: 'var(--dc-success-bg, #dcfce7)',
                          border: '1px solid var(--dc-success, #22c55e)',
                          borderRadius: 6,
                          fontSize: 11,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 500,
                            color: 'var(--dc-success, #16a34a)',
                            marginBottom: 4,
                          }}
                        >
                          Token generated — copy it now, it won't be shown again:
                        </div>
                        <input
                          type="text"
                          value={generatedToken}
                          readOnly
                          onClick={e => {
                            ;(e.target as HTMLInputElement).select()
                            navigator.clipboard?.writeText(generatedToken)
                          }}
                          style={{
                            ...inputStyle,
                            fontFamily: 'monospace',
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        />
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <input
                        type="text"
                        value={newTokenName}
                        onChange={e => setNewTokenName(e.target.value)}
                        placeholder="Token name (e.g. Okta)"
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        type="button"
                        disabled={!newTokenName.trim()}
                        onClick={async () => {
                          const res = await fetch('/api/settings/scim/tokens', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ name: newTokenName.trim() }),
                          })
                          if (res.ok) {
                            const result = await res.json()
                            setGeneratedToken(result.token)
                            setNewTokenName('')
                            queryClient.invalidateQueries({ queryKey: ['settings', 'scim'] })
                          }
                        }}
                        style={{
                          padding: '6px 14px',
                          fontSize: 12,
                          fontWeight: 500,
                          borderRadius: 6,
                          border: 'none',
                          backgroundColor: 'var(--dc-primary)',
                          color: 'var(--dc-primary-content)',
                          cursor: newTokenName.trim() ? 'pointer' : 'not-allowed',
                          opacity: newTokenName.trim() ? 1 : 0.5,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Generate Token
                      </button>
                    </div>
                  </InfoBox>
                </div>
              )}
            </SectionCard>
          )}

          {activeSection === 'auto_accept' && (
            <SectionCard
              title="Auto-accept Email Domains"
              description="Users with verified emails from these domains are automatically approved as members instead of requiring admin approval."
            >
              <div style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginBottom: 10 }}>
                Only applies to OAuth and magic link sign-ins (not password registration, since the
                email is unverified).
              </div>
              <textarea
                value={autoAcceptDomains}
                onChange={e => setAutoAcceptDomains(e.target.value)}
                placeholder="example.com, acme.org"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ fontSize: 11, color: 'var(--dc-text-muted)', marginTop: 4 }}>
                Separate domains with commas, semicolons, or newlines.
              </div>
              <SaveButton
                onClick={() => saveMutation.mutate({ autoAcceptEmailDomains: autoAcceptDomains })}
                isPending={saveMutation.isPending}
                style={{ marginTop: 8 }}
              />
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div style={{ border: '1px solid var(--dc-border)', borderRadius: 8, padding: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)', margin: '0 0 4px' }}>
        {title}
      </h3>
      <p style={{ fontSize: 12, color: 'var(--dc-text-muted)', margin: '0 0 16px' }}>
        {description}
      </p>
      {children}
    </div>
  )
}

function FieldLabel({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        style={{ display: 'block', fontSize: 12, color: 'var(--dc-text-muted)', marginBottom: 4 }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--dc-text-muted)', marginTop: 4 }}>{hint}</div>
      )}
    </div>
  )
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </div>
  )
}

function SaveButton({
  onClick,
  isPending,
  style: extraStyle,
}: {
  onClick: () => void
  isPending: boolean
  style?: React.CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      style={{
        padding: '6px 14px',
        fontSize: 12,
        fontWeight: 500,
        borderRadius: 6,
        border: 'none',
        backgroundColor: 'var(--dc-primary)',
        color: 'var(--dc-primary-content)',
        cursor: 'pointer',
        opacity: isPending ? 0.5 : 1,
        ...extraStyle,
      }}
    >
      {isPending ? 'Saving...' : 'Save'}
    </button>
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
