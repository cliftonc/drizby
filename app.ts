/**
 * DC-BI Hono application
 * Configurable BI platform powered by drizzle-cube
 */

import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { createCubeApp } from 'drizzle-cube/adapters/hono'
import { SemanticLayerCompiler } from 'drizzle-cube/server'
import type { SecurityContext, DrizzleDatabase } from 'drizzle-cube/server'
import { schema } from './schema'
import { connectionManager } from './src/services/connection-manager'
import connectionsApp from './src/routes/connections'
import cubeDefsApp from './src/routes/cube-definitions'
import schemaFilesApp from './src/routes/schema-files'
import editorTypesApp from './src/routes/editor-types'
import analyticsApp from './src/routes/analytics-pages'
import notebooksApp from './src/routes/notebooks'
import authApp from './src/routes/auth'
import usersApp from './src/routes/users'
import { authMiddleware } from './src/auth/middleware'
import { validateSession, getSessionCookie } from './src/auth/session'

interface Variables {
  db: DrizzleDatabase
  auth?: { userId: number; user: any }
}

const defaultConnectionString = 'postgresql://dc_bi_user:dc_bi_pass123@localhost:54930/dc_bi_db'
const client = postgres(process.env.DATABASE_URL || defaultConnectionString)
const db = drizzle(client, { schema })

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
app.use('*', cors({
  origin: ['http://localhost:3460', 'http://localhost:3461'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Agent-Api-Key', 'X-Agent-Provider', 'X-Agent-Model', 'X-Agent-Base-URL', 'X-Connection-Id'],
  credentials: true
}))

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'DC-BI Analytics Platform',
    version: '0.1.0',
    status: 'running'
  })
})

// Health check
app.get('/health', (c) => {
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
app.use('/cubejs-api/*', async (c, next) => {
  c.set('db', db as DrizzleDatabase)

  // Dev mode: accept fixed API key
  const isDev = process.env.NODE_ENV !== 'production'
  const devApiKey = process.env.DEV_API_KEY || 'dc-bi-dev-key'
  if (isDev && c.req.header('Authorization') === `Bearer ${devApiKey}`) {
    c.set('auth', { userId: 1, user: { id: 1, name: 'Dev User', email: 'dev@localhost', role: 'admin' } })
    return next()
  }

  const sessionId = getSessionCookie(c)
  if (sessionId) {
    const result = await validateSession(db as any, sessionId)
    if (result) {
      c.set('auth', { userId: result.user.id, user: result.user })
      return next()
    }
  }
  return c.json({ error: 'Unauthorized' }, 401)
})

// Cube API dispatch: resolves connection from header or query, then delegates to drizzle-cube
// Cache cube apps per connection to avoid re-creating on every request
const cubeAppCache = new Map<number, ReturnType<typeof createCubeApp>>()

function getCubeApp(connectionId: number) {
  if (cubeAppCache.has(connectionId)) return cubeAppCache.get(connectionId)!

  const managed = connectionManager.get(connectionId)
  if (!managed) return null

  const cubeApp = createCubeApp({
    semanticLayer: managed.semanticLayer,
    extractSecurityContext,
    cors: {
      origin: ['http://localhost:3460', 'http://localhost:3461'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Agent-Api-Key', 'X-Agent-Provider', 'X-Agent-Model', 'X-Agent-Base-URL', 'X-Connection-Id'],
      credentials: true
    },
    agent: {
      allowClientApiKey: true,
      maxTurns: 25
    }
  })

  cubeAppCache.set(connectionId, cubeApp)
  return cubeApp
}

// Invalidate cached cube app when connections are recompiled
export function invalidateCubeAppCache(connectionId?: number) {
  if (connectionId !== undefined) cubeAppCache.delete(connectionId)
  else cubeAppCache.clear()
}

// GET /cubejs-api/v1/meta — aggregate metadata from all connections
app.get('/cubejs-api/v1/meta', async (c) => {
  const allMetadata: any[] = []
  for (const connId of connectionManager.getConnectionIds()) {
    const sl = connectionManager.getSemanticLayer(connId)
    if (sl) {
      const meta = sl.getMetadata()
      allMetadata.push(...meta)
    }
  }
  return c.json({
    cubes: allMetadata.map(cube => ({
      name: cube.name,
      title: cube.title || cube.name,
      description: cube.description || '',
      measures: cube.measures || [],
      dimensions: cube.dimensions || [],
      segments: cube.segments || [],
      joins: cube.joins || []
    }))
  })
})

// All other cube API routes — resolve connection and forward
app.all('/cubejs-api/v1/*', async (c) => {
  const connectionIdHeader = c.req.header('X-Connection-Id')
  let connectionId: number | undefined

  if (connectionIdHeader) {
    connectionId = parseInt(connectionIdHeader)
  } else {
    // Infer from query param (works for both GET and POST since we don't consume body)
    const queryParam = c.req.query('query')
    if (queryParam) {
      try {
        const query = JSON.parse(queryParam)
        const firstMember = query.measures?.[0] || query.dimensions?.[0]
        if (firstMember) {
          const cubeName = firstMember.split('.')[0]
          const found = connectionManager.getSemanticLayerForCube(cubeName)
          if (found) connectionId = found.connectionId
        }
      } catch {}
    }

    // For POST requests, clone the request to peek at the body
    if (!connectionId && c.req.method === 'POST') {
      try {
        const cloned = c.req.raw.clone()
        const body = await cloned.json()
        const query = body.query || body
        const firstMember = query.measures?.[0] || query.dimensions?.[0]
        if (firstMember) {
          const cubeName = firstMember.split('.')[0]
          const found = connectionManager.getSemanticLayerForCube(cubeName)
          if (found) connectionId = found.connectionId
        }
      } catch {}
    }
  }

  if (!connectionId) {
    const ids = connectionManager.getConnectionIds()
    if (ids.length > 0) connectionId = ids[0]
  }

  if (!connectionId) {
    return c.json({ error: 'No connection available. Please set up a connection and compile cubes.' }, 400)
  }

  const cubeApp = getCubeApp(connectionId)
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

// Error handling
app.onError((err, c) => {
  console.error('Application error:', err)
  return c.json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  }, 500)
})

app.notFound((c) => {
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
