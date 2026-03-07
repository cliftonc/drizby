/**
 * Drizby Hono application
 * Configurable BI platform powered by drizzle-cube
 */

import { serveStatic } from '@hono/node-server/serve-static'
import { createCubeApp } from 'drizzle-cube/adapters/hono'
import type { DrizzleDatabase, SecurityContext } from 'drizzle-cube/server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authMiddleware } from './src/auth/middleware'
import { getSessionCookie, validateSession } from './src/auth/session'
import { db } from './src/db/index'
import { defineAbilitiesFor } from './src/permissions/abilities'
import type { AppAbility } from './src/permissions/abilities'
import analyticsApp from './src/routes/analytics-pages'
import authApp from './src/routes/auth'
import connectionsApp from './src/routes/connections'
import cubeDefsApp from './src/routes/cube-definitions'
import editorTypesApp from './src/routes/editor-types'
import notebooksApp from './src/routes/notebooks'
import schemaFilesApp from './src/routes/schema-files'
import settingsApp from './src/routes/settings'
import usersApp from './src/routes/users'
import { getAIAgentConfig } from './src/services/ai-settings'
import { connectionManager } from './src/services/connection-manager'

interface Variables {
  db: DrizzleDatabase
  auth?: { userId: number; user: any }
  ability?: AppAbility
}

async function extractSecurityContext(c: any): Promise<SecurityContext> {
  try {
    const auth = c.get('auth')
    if (auth) {
      return { organisationId: 1, userId: auth.userId }
    }
  } catch {}
  return { organisationId: 1, userId: 1 }
}

const app = new Hono<{ Variables: Variables }>()

// Middleware
app.use('*', logger())
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

// Serve built client assets in production (before API routes so / serves index.html)
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }))
}

// Health check
app.get('/health', c => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Inject db into all API routes
app.use('/api/*', async (c, next) => {
  c.set('db', db as DrizzleDatabase)
  await next()
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
app.use('/cubejs-api/*', async (c, next) => {
  c.set('db', db as DrizzleDatabase)

  // Dev mode: accept fixed API key
  const isDev = process.env.NODE_ENV !== 'production'
  const devApiKey = process.env.DEV_API_KEY || 'dc-bi-dev-key'
  if (isDev && c.req.header('Authorization') === `Bearer ${devApiKey}`) {
    c.set('auth', {
      userId: 1,
      user: { id: 1, name: 'Dev User', email: 'dev@localhost', role: 'admin' },
    })
    c.set('ability', defineAbilitiesFor('admin'))
    return next()
  }

  const sessionId = getSessionCookie(c)
  if (sessionId) {
    const result = await validateSession(db as any, sessionId)
    if (result) {
      c.set('auth', { userId: result.user.id, user: result.user })
      c.set('ability', defineAbilitiesFor(result.user.role))
      return next()
    }
  }
  return c.json({ error: 'Unauthorized' }, 401)
})

// Cube API dispatch: resolves connection from header or query, then delegates to drizzle-cube
// Cache cube apps per connection to avoid re-creating on every request
const cubeAppCache = new Map<number, ReturnType<typeof createCubeApp>>()

async function getCubeApp(connectionId: number) {
  if (cubeAppCache.has(connectionId)) return cubeAppCache.get(connectionId)!

  const managed = connectionManager.get(connectionId)
  if (!managed) return null

  const agentConfig = await getAIAgentConfig(db)

  const cubeApp = createCubeApp({
    semanticLayer: managed.semanticLayer,
    extractSecurityContext,
    cors: {
      origin: ['http://localhost:3460', 'http://localhost:3461'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
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
    },
    agent: agentConfig,
  })

  cubeAppCache.set(connectionId, cubeApp)
  return cubeApp
}

// Invalidate cached cube app when connections are recompiled
export function invalidateCubeAppCache(connectionId?: number) {
  if (connectionId !== undefined) cubeAppCache.delete(connectionId)
  else cubeAppCache.clear()
}

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

// Mount platform API routes (protected by authMiddleware above)
app.route('/api/connections', connectionsApp)
app.route('/api/cube-definitions', cubeDefsApp)
app.route('/api/schema-files', schemaFilesApp)
app.route('/api/editor/types', editorTypesApp)
app.route('/api/analytics-pages', analyticsApp)
app.route('/api/notebooks', notebooksApp)
app.route('/api/users', usersApp)
app.route('/api/settings', settingsApp)

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

// SPA fallback: serve index.html for non-API routes in production
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist', path: 'index.html' }))
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
