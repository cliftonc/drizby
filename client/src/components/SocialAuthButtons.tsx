interface Props {
  enabledProviders: string[]
  mode: 'login' | 'register'
  hideDivider?: boolean
}

const PROVIDERS = [
  { id: 'google', label: 'Google', icon: '/auth-logos/google.svg' },
  { id: 'github', label: 'GitHub', icon: '/auth-logos/github.svg' },
  { id: 'gitlab', label: 'GitLab', icon: '/auth-logos/gitlab.svg' },
  { id: 'microsoft', label: 'Microsoft', icon: '/auth-logos/microsoft.svg' },
  { id: 'slack', label: 'Slack', icon: '/auth-logos/slack.svg' },
]

const buttonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  width: '100%',
  padding: '8px 16px',
  backgroundColor: 'var(--dc-surface)',
  color: 'var(--dc-text)',
  fontWeight: 500,
  borderRadius: 6,
  border: '1px solid var(--dc-border)',
  cursor: 'pointer',
  fontSize: 14,
  textDecoration: 'none',
  boxSizing: 'border-box',
}

export default function SocialAuthButtons({ enabledProviders, mode, hideDivider }: Props) {
  const oauthProviders = PROVIDERS.filter(p => enabledProviders.includes(p.id))

  if (oauthProviders.length === 0) return null

  const verb = mode === 'login' ? 'Sign in' : 'Sign up'

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {oauthProviders.map(p => (
          <a key={p.id} href={`/api/auth/${p.id}`} style={buttonStyle}>
            <img src={p.icon} alt="" style={{ width: 18, height: 18 }} />
            {verb} with {p.label}
          </a>
        ))}
      </div>

      {!hideDivider && (
        <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0' }}>
          <div style={{ flex: 1, borderTop: '1px solid var(--dc-border)' }} />
          <span style={{ padding: '0 12px', color: 'var(--dc-text-muted)', fontSize: 13 }}>or</span>
          <div style={{ flex: 1, borderTop: '1px solid var(--dc-border)' }} />
        </div>
      )}
    </>
  )
}
