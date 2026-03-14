/**
 * Drizby Hono application
 * Configurable BI platform powered by drizzle-cube
 */

import { serveStatic } from '@hono/node-server/serve-static'
import { createCubeApp } from 'drizzle-cube/adapters/hono'
import type { DrizzleDatabase, SecurityContext } from 'drizzle-cube/server'
import { and, count, eq, gt } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { groupTypes, groups, oauthTokens, settings, userGroups, users } from './schema'
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
import groupsApp from './src/routes/groups'
import notebooksApp from './src/routes/notebooks'
import oauthApp, {
  authorizationServerMetadata,
  protectedResourceMetadata,
} from './src/routes/oauth'
import schemaFilesApp from './src/routes/schema-files'
import seedDemoApp from './src/routes/seed-demo'
import settingsApp from './src/routes/settings'
import usersApp from './src/routes/users'
import { getAIAgentConfig } from './src/services/ai-settings'
import { connectionManager } from './src/services/connection-manager'

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

/** Extract the opaque token ID from a JWT access token, or return as-is if opaque. */
function extractTokenId(token: string): string {
  // JWTs have 3 dot-separated base64 segments
  if (token.includes('.')) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
      if (payload.jti) return payload.jti
    } catch {}
  }
  return token
}

/** Look up a Bearer token in oauth_tokens, return userId if valid. */
async function validateOAuthBearer(token: string): Promise<number | null> {
  const tokenId = extractTokenId(token)
  const [row] = await db
    .select({
      userId: oauthTokens.userId,
      isRevoked: oauthTokens.isRevoked,
      expiresAt: oauthTokens.accessTokenExpiresAt,
    })
    .from(oauthTokens)
    .where(
      and(eq(oauthTokens.accessToken, tokenId), gt(oauthTokens.accessTokenExpiresAt, new Date()))
    )
  if (!row || row.isRevoked) return null
  return row.userId
}

async function extractSecurityContext(c: any): Promise<SecurityContext> {
  // Resolve userId directly from the request (headers/cookies),
  // since the cube app is a separate Hono instance without shared context.
  let userId: number | null = null

  try {
    // Dev mode: check Bearer token
    const isDev = process.env.NODE_ENV !== 'production'
    const devApiKey = process.env.DEV_API_KEY || 'dc-bi-dev-key'
    const authHeader = c.req?.header?.('Authorization') ?? c?.headers?.get?.('Authorization')
    if (isDev && authHeader === `Bearer ${devApiKey}`) {
      userId = 1
    }

    // OAuth Bearer token
    if (!userId && authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      userId = await validateOAuthBearer(token)
    }

    // Session cookie
    if (!userId) {
      const sessionId = getSessionCookie(c)
      if (sessionId) {
        const result = await validateSession(db as any, sessionId)
        if (result) userId = result.user.id
      }
    }
  } catch (err) {
    console.error('[security-context] Error resolving user:', err)
  }

  if (!userId) {
    console.warn('[security-context] No authenticated user, returning empty context')
    return { organisationId: 1, userId: 0, groups: {}, groupIds: [] }
  }

  // Look up the user's role
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId))
  const role = user?.role || 'user'

  // Resolve group memberships for the authenticated user
  const groupRows = await db
    .select({
      groupId: userGroups.groupId,
      groupName: groups.name,
      typeName: groupTypes.name,
    })
    .from(userGroups)
    .innerJoin(groups, eq(userGroups.groupId, groups.id))
    .innerJoin(groupTypes, eq(groups.groupTypeId, groupTypes.id))
    .where(eq(userGroups.userId, userId))

  const groupsByType: Record<string, string[]> = {}
  const groupIds: number[] = []
  for (const row of groupRows) {
    groupIds.push(row.groupId)
    if (!groupsByType[row.typeName]) groupsByType[row.typeName] = []
    groupsByType[row.typeName].push(row.groupName)
  }

  return { organisationId: 1, userId, role, groups: groupsByType, groupIds }
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
app.get('/health', async c => {
  const [{ value: userCount }] = await db.select({ value: count() }).from(users)
  let setupStatus = 'ready'
  if (userCount === 0) {
    setupStatus = 'needs_setup'
  } else {
    const [row] = await db.select().from(settings).where(eq(settings.key, 'setup_status'))
    if (row) setupStatus = row.value
  }
  return c.json({ status: 'ok', setupStatus, timestamp: new Date().toISOString() })
})

// OAuth 2.1 / MCP routes — gated by mcp_enabled setting
app.get(
  '/.well-known/oauth-protected-resource',
  async (c, next) => {
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
  },
  protectedResourceMetadata
)
app.get(
  '/.well-known/oauth-authorization-server',
  async (c, next) => {
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
  },
  authorizationServerMetadata
)

app.use('/oauth/*', async (c, next) => {
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
})
app.route('/oauth', oauthApp)

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

  // OAuth Bearer token
  const bearerHeader = c.req.header('Authorization')
  if (bearerHeader?.startsWith('Bearer ')) {
    const oauthUserId = await validateOAuthBearer(bearerHeader.slice(7))
    if (oauthUserId) {
      const [user] = await db.select().from(users).where(eq(users.id, oauthUserId))
      if (user && !user.isBlocked) {
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
    mcp: { enabled: true },
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

// MCP endpoint — forward to the cube app's built-in /mcp handler (gated by setting)
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
