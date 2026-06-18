/**
 * Drizby Hono application
 * Configurable BI platform powered by drizzle-cube
 */

import { serveStatic } from '@hono/node-server/serve-static'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, count, eq, max } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { settings, users } from './schema'
import { authMiddleware } from './src/auth/middleware'
import { getSessionCookie, validateSession } from './src/auth/session'
import { db } from './src/db/index'
import { defineAbilitiesFor } from './src/permissions/abilities'
import type { AppAbility } from './src/permissions/abilities'
import aiApp from './src/routes/ai-routes'
import analyticsApp from './src/routes/analytics-pages'
import authApp from './src/routes/auth'
import connectionsApp from './src/routes/connections'
import cubeDefsApp from './src/routes/cube-definitions'
import editorTypesApp from './src/routes/editor-types'
import githubAppApp from './src/routes/github-app'
import groupsApp from './src/routes/groups'
import metabaseImportApp from './src/routes/metabase-import'
import notebooksApp from './src/routes/notebooks'
import oauthApp, {
  authorizationServerMetadata,
  protectedResourceMetadata,
} from './src/routes/oauth'
import { createPublicDashboardApp } from './src/routes/public-dashboard'
import schemaFilesApp from './src/routes/schema-files'
import scimApp from './src/routes/scim'
import seedDemoApp from './src/routes/seed-demo'
import settingsApp from './src/routes/settings'
import usersApp from './src/routes/users'
import { connectionManager } from './src/services/connection-manager'
import {
  getCubeApp,
  invalidateCubeAppCache,
  validateOAuthBearer,
} from './src/services/cube-app-cache'

interface Variables {
  db: DrizzleDatabase
  auth?: { userId: number; user: any }
  ability?: AppAbility
}

/** Check if MCP is enabled in settings. */
async function isMcpEnabled(): Promise<boolean> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.key, 'mcp_enabled'), eq(settings.organisationId, 1)))
  return row?.value === 'true'
}

const app = new Hono<{ Variables: Variables }>()

// Middleware — skip logging for health checks to reduce noise
app.use('*', async (c, next) => {
  if (c.req.path === '/health') return next()
  return logger()(c, next)
})
app.use(
  '*',
  secureHeaders({
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    strictTransportSecurity: 'max-age=31536000; includeSubDomains',
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: [
        "'self'",
        'ws://localhost:3460',
        'ws://localhost:3461',
        'http://localhost:3460',
        'http://localhost:3461',
      ],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  })
)
app.use(
  '*',
  cors({
    origin: ['http://localhost:3460', 'http://localhost:3461'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Agent-Api-Key',
      'X-Agent-Provider',
      'X-Agent-Model',
      'X-Agent-Base-URL',
      'X-Connection-Id',
    ],
    credentials: true,
  })
)

// Serve built client assets in production (skip when Caddy handles static files)
if (process.env.NODE_ENV === 'production' && !process.env.NODE_PORT) {
  // Hashed assets (JS, CSS, fonts) — cache forever (filename changes on rebuild)
  app.use(
    '/assets/*',
    async (c, next) => {
      await next()
      if (c.res.status === 200) {
        c.res.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      }
    },
    serveStatic({ root: './dist' })
  )
  // Other static files (images, favicon) — cache with revalidation
  app.use(
    '/*',
    async (c, next) => {
      await next()
      if (c.res.status === 200 && !c.res.headers.has('Cache-Control')) {
        c.res.headers.set('Cache-Control', 'public, max-age=3600, must-revalidate')
      }
    },
    serveStatic({ root: './dist' })
  )
}

// Health check
app.get('/health', async c => {
  const [{ value: userCount }] = await db.select({ value: count() }).from(users)
  let setupStatus = 'ready'
  if (userCount === 0) {
    setupStatus = 'needs_setup'
  } else {
    const [row] = await db.select().from(settings).where(eq(settings.key, 'setup_status'))
    if (row) setupStatus = row.value
  }
  const [{ value: lastActivity }] = await db.select({ value: max(users.lastActiveAt) }).from(users)
  return c.json({
    status: 'ok',
    setupStatus,
    lastActivityAt: lastActivity?.toISOString() ?? null,
    timestamp: new Date().toISOString(),
  })
})

// OAuth 2.1 / MCP routes — gated by mcp_enabled setting
const mcpEnabledGuard = async (c: any, next: any) => {
  if (!(await isMcpEnabled()))
    return c.json(
      {
        error: 'MCP is not enabled',
        message:
          'The MCP server is disabled. An admin can enable it in Settings > Server Features.',
      },
      404
    )
  return next()
}

app.get('/.well-known/oauth-protected-resource', mcpEnabledGuard, protectedResourceMetadata)
app.get('/.well-known/oauth-protected-resource/mcp', mcpEnabledGuard, protectedResourceMetadata)
app.get('/.well-known/oauth-authorization-server', mcpEnabledGuard, authorizationServerMetadata)

app.use('/oauth/*', mcpEnabledGuard)
app.route('/oauth', oauthApp)

// SCIM 2.0 provisioning (has its own bearer token auth, separate from session/OAuth)
app.route('/scim/v2', scimApp)

// Public dashboard routes — unauthenticated, no authMiddleware
// Must be mounted BEFORE auth middleware so they don't get blocked.

// Inject db into public routes
app.use('/public/*', async (c, next) => {
  c.set('db', db as DrizzleDatabase)
  await next()
})

// CORS for public routes — no credentials needed, open to all origins
app.use('/public/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'] }))

// Override CSP/frame headers for public dashboard routes — allow iframe embedding
app.use('/public/*', async (c, next) => {
  await next()
  c.res.headers.delete('X-Frame-Options')
  c.res.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors *; object-src 'none'; base-uri 'self'"
  )
})

app.route('/public', createPublicDashboardApp({ getCubeApp }))

// Inject db into all API routes
app.use('/api/*', async (c, next) => {
  c.set('db', db as DrizzleDatabase)
  await next()
})

// Public branding endpoint (no auth required — used on login/setup pages)
app.get('/api/branding', async c => {
  const rows = await db.select().from(settings).where(eq(settings.organisationId, 1))
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value
  return c.json({
    name: map.brand_name || 'Drizby',
    logoUrl: map.brand_logo_url || '/logo.png',
  })
})

// Mount auth routes BEFORE auth middleware (these handle their own auth)
app.route('/api/auth', authApp)

// Apply auth middleware to remaining /api/* and /cubejs-api/* routes
app.use('/api/*', authMiddleware)
// Block pending users (role === 'user') from all API routes
app.use('/api/*', async (c, next) => {
  const auth = c.get('auth') as any
  if (auth?.user?.role === 'user') {
    return c.json({ error: 'Account pending approval' }, 403)
  }
  await next()
})
/**
 * Shared auth middleware for routes outside /api/* (cubejs-api, mcp).
 * Checks dev key, OAuth bearer, and session cookie — rejects if none succeed.
 */
async function requireBearerOrSessionAuth(c: any, next: any) {
  c.set('db', db as DrizzleDatabase)

  // Dev mode: accept fixed API key
  const isDev = process.env.NODE_ENV !== 'production'
  const devApiKey = process.env.DEV_API_KEY
  if (isDev && devApiKey && c.req.header('Authorization') === `Bearer ${devApiKey}`) {
    c.set('auth', {
      userId: 1,
      user: { id: 1, name: 'Dev User', email: 'dev@localhost', role: 'admin' },
    })
    c.set('ability', defineAbilitiesFor('admin'))
    return next()
  }

  // OAuth Bearer token
  const bearerHeader = c.req.header('Authorization')
  if (bearerHeader?.startsWith('Bearer ')) {
    const oauthUserId = await validateOAuthBearer(bearerHeader.slice(7))
    if (oauthUserId) {
      const [user] = await db.select().from(users).where(eq(users.id, oauthUserId))
      if (user && !user.isBlocked) {
        if (user.role === 'user') return c.json({ error: 'Account pending approval' }, 403)
        c.set('auth', { userId: user.id, user })
        c.set('ability', defineAbilitiesFor(user.role))
        return next()
      }
    }
  }

  const sessionId = getSessionCookie(c)
  if (sessionId) {
    const result = await validateSession(db as any, sessionId)
    if (result) {
      if (result.user.role === 'user') return c.json({ error: 'Account pending approval' }, 403)
      c.set('auth', { userId: result.user.id, user: result.user })
      c.set('ability', defineAbilitiesFor(result.user.role))
      return next()
    }
  }
  return c.json({ error: 'Unauthorized' }, 401)
}

app.use('/cubejs-api/*', requireBearerOrSessionAuth)

// Cube API dispatch: resolves connection from header or query, then delegates to drizzle-cube
// getCubeApp and invalidateCubeAppCache are imported from src/services/cube-app-cache
export { invalidateCubeAppCache }

// GET /cubejs-api/v1/meta — return metadata for a single connection
app.get('/cubejs-api/v1/meta', async c => {
  const connectionIdHeader = c.req.header('X-Connection-Id')
  let connectionId: number | undefined

  if (connectionIdHeader) {
    connectionId = Number.parseInt(connectionIdHeader)
  } else {
    const ids = connectionManager.getConnectionIds()
    if (ids.length > 0) connectionId = ids[0]
  }

  if (!connectionId) {
    return c.json({ cubes: [] })
  }

  const sl = connectionManager.getSemanticLayer(connectionId)
  if (!sl) {
    return c.json({ cubes: [] })
  }

  const meta = sl.getMetadata()
  return c.json({
    cubes: meta.map(cube => ({
      name: cube.name,
      title: cube.title || cube.name,
      description: cube.description || '',
      measures: cube.measures || [],
      dimensions: cube.dimensions || [],
      segments: cube.segments || [],
      relationships: cube.relationships || [],
    })),
  })
})

// All other cube API routes — resolve connection from header and forward
app.all('/cubejs-api/v1/*', async c => {
  const connectionIdHeader = c.req.header('X-Connection-Id')
  let connectionId: number | undefined

  if (connectionIdHeader) {
    connectionId = Number.parseInt(connectionIdHeader)
  } else {
    const ids = connectionManager.getConnectionIds()
    if (ids.length > 0) connectionId = ids[0]
  }

  if (!connectionId) {
    return c.json(
      { error: 'No connection available. Please set up a connection and compile cubes.' },
      400
    )
  }

  const cubeApp = await getCubeApp(connectionId)
  if (!cubeApp) {
    return c.json({ error: `Connection ${connectionId} not found` }, 400)
  }

  return cubeApp.fetch(c.req.raw)
})

// MCP endpoint — forward to the cube app's built-in /mcp handler (gated by setting + auth)
app.use('/mcp', requireBearerOrSessionAuth)
app.all('/mcp', async c => {
  if (!(await isMcpEnabled())) {
    return c.json(
      {
        error: 'MCP is not enabled',
        message:
          'The MCP server is disabled. An admin can enable it in Settings > Server Features.',
      },
      404
    )
  }
  const connectionIdHeader = c.req.header('X-Connection-Id')
  let connectionId: number | undefined

  if (connectionIdHeader) {
    connectionId = Number.parseInt(connectionIdHeader)
  } else {
    const ids = connectionManager.getConnectionIds()
    if (ids.length > 0) connectionId = ids[0]
  }

  if (!connectionId) {
    return c.json({ error: 'No connection available' }, 400)
  }

  const cubeApp = await getCubeApp(connectionId)
  if (!cubeApp) {
    return c.json({ error: `Connection ${connectionId} not found` }, 400)
  }

  return cubeApp.fetch(c.req.raw)
})

// Mount platform API routes (protected by authMiddleware above)
app.route('/api/seed-demo', seedDemoApp)
app.route('/api/connections', connectionsApp)
app.route('/api/cube-definitions', cubeDefsApp)
app.route('/api/schema-files', schemaFilesApp)
app.route('/api/editor/types', editorTypesApp)
app.route('/api/analytics-pages', analyticsApp)
app.route('/api/notebooks', notebooksApp)
app.route('/api/groups', groupsApp)
app.route('/api/users', usersApp)
app.route('/api/settings', settingsApp)
app.route('/api/github-app', githubAppApp)
app.route('/api/ai', aiApp)
app.route('/api/metabase-import', metabaseImportApp)

// Error handling
app.onError((err, c) => {
  console.error('Application error:', err)
  return c.json(
    {
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    },
    500
  )
})

// SPA fallback: serve index.html for non-API routes in production (skip when Caddy handles it)
if (process.env.NODE_ENV === 'production' && !process.env.NODE_PORT) {
  app.use(
    '/*',
    async (c, next) => {
      await next()
      if (c.res.status === 200) {
        c.res.headers.set('Cache-Control', 'no-cache')
      }
    },
    serveStatic({ root: './dist', path: 'index.html' })
  )
}

app.notFound(c => {
  return c.json({ error: 'Not found' }, 404)
})

export default app
export { db }

/**
 * Initialize the connection manager on startup.
 * Called from src/index.ts after the app is created.
 */
export async function initializeConnections(): Promise<void> {
  console.log('Initializing connection manager...')
  await connectionManager.initialize(db)
  const ids = connectionManager.getConnectionIds()
  console.log(`Connection manager initialized with ${ids.length} connection(s)`)
}
