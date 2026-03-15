interface Props {
  enabledProviders: string[]
  mode: 'login' | 'register'
  hideDivider?: boolean
}

const PROVIDERS: {
  id: string
  label: string
  icon: React.ReactNode
}[] = [
  {
    id: 'google',
    label: 'Google',
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
  },
  {
    id: 'github',
    label: 'GitHub',
    icon: (
      <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
      </svg>
    ),
  },
  {
    id: 'gitlab',
    label: 'GitLab',
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
  },
  {
    id: 'microsoft',
    label: 'Microsoft',
    icon: (
      <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24">
        <rect fill="#F25022" x="2" y="2" width="9.5" height="9.5" />
        <rect fill="#7FBA00" x="12.5" y="2" width="9.5" height="9.5" />
        <rect fill="#00A4EF" x="2" y="12.5" width="9.5" height="9.5" />
        <rect fill="#FFB900" x="12.5" y="12.5" width="9.5" height="9.5" />
      </svg>
    ),
  },
  {
    id: 'slack',
    label: 'Slack',
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
  },
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
            {p.icon}
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
