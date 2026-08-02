/**
 * Public read-only dashboard page — no auth required.
 * Accessed via /public/dashboard/:token (outside AuthGuard).
 */

import { AnalyticsDashboard } from 'drizzle-cube/client'
import { CubeProvider } from 'drizzle-cube/client'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { DashboardConfig } from '../types'

interface PublicDashboard {
  id: number
  name: string
  description?: string | null
  config: DashboardConfig
  connectionId?: number | null
}

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; dashboard: PublicDashboard; token: string }

export default function PublicDashboardPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<PageState>({ status: 'loading' })

  useEffect(() => {
    if (!token) {
      setState({ status: 'error', message: 'Invalid share link.' })
      return
    }

    fetch(`/public/dashboard/${token}`, { credentials: 'omit' })
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          const msg =
            res.status === 404
              ? 'This share link is invalid or has been revoked.'
              : res.status === 401
                ? 'This share link has expired or been revoked.'
                : (body.error ?? 'Unable to load dashboard.')
          setState({ status: 'error', message: msg })
          return
        }
        const data = await res.json()
        setState({ status: 'loaded', dashboard: data.data.dashboard, token })
      })
      .catch(() => setState({ status: 'error', message: 'Network error loading dashboard.' }))
  }, [token])

  if (state.status === 'loading') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: 'var(--dc-text-muted, #888)',
          fontSize: 14,
        }}
      >
        Loading...
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: 12,
          color: 'var(--dc-text, #111)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <img src="/logo.png" alt="Drizby" style={{ width: 32, height: 32, opacity: 0.6 }} />
        <p style={{ color: 'var(--dc-error, #d44)', fontSize: 14 }}>{state.message}</p>
      </div>
    )
  }

  const { dashboard } = state

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--dc-bg, #fff)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Minimal header */}
      <div
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid var(--dc-border, #e5e7eb)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <img src="/logo.png" alt="Drizby" style={{ width: 24, height: 24 }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--dc-text, #111)' }}>
            {dashboard.name}
          </div>
          {dashboard.description && (
            <div style={{ fontSize: 12, color: 'var(--dc-text-muted, #888)' }}>
              {dashboard.description}
            </div>
          )}
        </div>
      </div>

      {/* Dashboard content */}
      <div style={{ padding: '16px 24px' }}>
        {dashboard.connectionId ? (
          <CubeProvider
            key={`public-${token}`}
            apiOptions={{
              apiUrl: `/public/cubejs-api/${token}/v1`,
              headers: {},
              credentials: 'omit',
            }}
          >
            <AnalyticsDashboard config={dashboard.config} editable={false} />
          </CubeProvider>
        ) : (
          <AnalyticsDashboard config={dashboard.config} editable={false} />
        )}
      </div>
    </div>
  )
}
