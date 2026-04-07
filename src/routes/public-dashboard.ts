/**
 * Public dashboard routes — unauthenticated, token-scoped.
 * Mounted before authMiddleware in app.ts.
 *
 * GET  /public/dashboard/:token          → resolve token, return dashboard config
 * ALL  /public/cubejs-api/:token/v1/*    → proxy cube queries for that token's connection
 */

import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { analyticsPages, dashboardShareTokens } from '../../schema'

interface Variables {
  db: DrizzleDatabase
}

export function createPublicDashboardApp(opts: {
  getCubeApp: (connectionId: number) => Promise<any>
}) {
  const app = new Hono<{ Variables: Variables }>()

  /**
   * Resolve and validate a share token. Returns the token row or null.
   * Also updates lastUsedAt on valid use.
   */
  async function resolveToken(db: any, token: string) {
    const [row] = await db
      .select()
      .from(dashboardShareTokens)
      .where(eq(dashboardShareTokens.id, token))
      .limit(1)

    if (!row) return null
    if (row.revokedAt) return null
    const now = new Date()
    if (row.expiresAt && row.expiresAt < now) return null

    // Update lastUsedAt async — don't block response
    db.update(dashboardShareTokens)
      .set({ lastUsedAt: now })
      .where(eq(dashboardShareTokens.id, token))
      .catch((err: unknown) => console.error('[public-dashboard] lastUsedAt update failed:', err))

    return row
  }

  // GET /public/dashboard/:token — return dashboard config
  app.get('/dashboard/:token', async c => {
    const db = c.get('db') as any
    const token = c.req.param('token')

    const tokenRow = await resolveToken(db, token)
    if (!tokenRow) return c.json({ error: 'Not found or token invalid' }, 404)

    const [dashboard] = await db
      .select()
      .from(analyticsPages)
      .where(and(eq(analyticsPages.id, tokenRow.dashboardId), eq(analyticsPages.isActive, true)))
      .limit(1)

    if (!dashboard) return c.json({ error: 'Dashboard not found' }, 404)

    return c.json({
      data: {
        dashboard: {
          id: dashboard.id,
          name: dashboard.name,
          description: dashboard.description,
          config: dashboard.config,
          connectionId: dashboard.connectionId,
        },
        connectionId: dashboard.connectionId,
      },
    })
  })

  // ALL /public/cubejs-api/:token/v1/* — proxy cube queries
  app.all('/cubejs-api/:token/v1/*', async c => {
    const db = c.get('db') as any
    const token = c.req.param('token')

    const tokenRow = await resolveToken(db, token)
    if (!tokenRow) return c.json({ error: 'Not found or token invalid' }, 404)

    const [dashboard] = await db
      .select({ connectionId: analyticsPages.connectionId })
      .from(analyticsPages)
      .where(and(eq(analyticsPages.id, tokenRow.dashboardId), eq(analyticsPages.isActive, true)))
      .limit(1)

    if (!dashboard?.connectionId) return c.json({ error: 'No connection for this dashboard' }, 404)

    const cubeApp = await opts.getCubeApp(dashboard.connectionId)
    if (!cubeApp) return c.json({ error: 'Connection not found' }, 404)

    // Strip /public/cubejs-api/:token prefix so cube app sees /v1/...
    const url = new URL(c.req.url)
    const prefix = `/public/cubejs-api/${token}`
    const newPath = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length)
      : url.pathname
    const newUrl = new URL(newPath + url.search, url.origin)
    const forwarded = new Request(newUrl.toString(), c.req.raw)

    return cubeApp.fetch(forwarded)
  })

  return app
}
