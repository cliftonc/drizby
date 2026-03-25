/**
 * Database connections management API
 * CRUD for managing connections to different data sources
 */

import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { connections, cubeDefinitions, schemaFiles } from '../../schema'
import { maybeDecrypt, maybeEncrypt } from '../auth/encryption'
import { guardPermission } from '../permissions/guard'
import { connectionManager } from '../services/connection-manager'
import { maskConnectionString } from '../services/connection-masking'
import { testDriver } from '../services/driver-factory'
import { PROVIDERS } from '../services/provider-registry'

interface Variables {
  db: DrizzleDatabase
}

const app = new Hono<{ Variables: Variables }>()

// Write operations require admin (manage Connection)
const adminGuard = async (c: any, next: any) => {
  const denied = guardPermission(c, 'manage', 'Connection')
  if (denied) return denied
  await next()
}

// List all connections (readable by members too)
app.get('/', async c => {
  const db = c.get('db') as any
  const result = await db
    .select({
      id: connections.id,
      name: connections.name,
      description: connections.description,
      engineType: connections.engineType,
      provider: connections.provider,
      connectionString: connections.connectionString,
      isActive: connections.isActive,
      createdAt: connections.createdAt,
      updatedAt: connections.updatedAt,
    })
    .from(connections)
    .where(eq(connections.organisationId, 1))

  const masked = await Promise.all(
    result.map(async (conn: any) => {
      const decrypted = await maybeDecrypt(conn.connectionString)
      const { connectionString: _, ...rest } = conn
      return {
        ...rest,
        maskedConnectionString: maskConnectionString(decrypted, conn.provider),
      }
    })
  )

  return c.json(masked)
})

// Connection status — schema/cube compilation status per connection
app.get('/status', async c => {
  const db = c.get('db') as any

  const allConns = await db
    .select({
      id: connections.id,
      name: connections.name,
    })
    .from(connections)
    .where(eq(connections.organisationId, 1))

  const allSchemas = await db
    .select({
      connectionId: schemaFiles.connectionId,
      compiledAt: schemaFiles.compiledAt,
    })
    .from(schemaFiles)
    .where(eq(schemaFiles.organisationId, 1))

  const allCubes = await db
    .select({
      connectionId: cubeDefinitions.connectionId,
      compiledAt: cubeDefinitions.compiledAt,
      definition: cubeDefinitions.definition,
      isActive: cubeDefinitions.isActive,
    })
    .from(cubeDefinitions)
    .where(eq(cubeDefinitions.organisationId, 1))

  const result = allConns.map((conn: any) => {
    const schemas = allSchemas.filter((s: any) => s.connectionId === conn.id)
    const cubes = allCubes.filter((c: any) => c.connectionId === conn.id && c.isActive)
    const compiledCubes = cubes.filter((c: any) => c.compiledAt && c.definition?.cubes?.length > 0)
    const cubeNames = compiledCubes.flatMap((c: any) => c.definition.cubes || [])

    return {
      id: conn.id,
      name: conn.name,
      schemaCount: schemas.length,
      schemasCompiled: schemas.filter((s: any) => s.compiledAt).length,
      cubeDefCount: cubes.length,
      cubeDefsCompiled: compiledCubes.length,
      cubeCount: cubeNames.length,
      ready: cubeNames.length > 0,
    }
  })

  return c.json(result)
})

// GET /api/connections/providers — return provider registry for the UI
app.get('/providers', c => {
  return c.json(PROVIDERS)
})

// Get single connection
app.get('/:id', async c => {
  const db = c.get('db') as any
  const id = Number.parseInt(c.req.param('id'))
  const result = await db
    .select({
      id: connections.id,
      name: connections.name,
      description: connections.description,
      engineType: connections.engineType,
      provider: connections.provider,
      connectionString: connections.connectionString,
      isActive: connections.isActive,
      createdAt: connections.createdAt,
      updatedAt: connections.updatedAt,
    })
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.organisationId, 1)))

  if (result.length === 0) {
    return c.json({ error: 'Connection not found' }, 404)
  }

  const conn = result[0]
  const decrypted = await maybeDecrypt(conn.connectionString)
  const ability = (c as any).get('ability') as any
  const isAdmin = ability?.can('manage', 'Connection')

  if (isAdmin) {
    return c.json({ ...conn, connectionString: decrypted })
  }

  const { connectionString: _, ...rest } = conn
  return c.json({ ...rest, maskedConnectionString: maskConnectionString(decrypted, conn.provider) })
})

// Create connection (admin only)
app.post('/', adminGuard, async c => {
  const db = c.get('db') as any
  const body = await c.req.json()

  const encryptedConnStr = await maybeEncrypt(body.connectionString)
  const result = await db
    .insert(connections)
    .values({
      name: body.name,
      description: body.description,
      engineType: body.engineType,
      provider: body.provider || null,
      connectionString: encryptedConnStr,
      organisationId: 1,
    })
    .returning()

  // Initialize in connection manager so it's immediately available
  const created = result[0]
  try {
    await connectionManager.createConnection(
      created.id,
      created.connectionString,
      created.engineType,
      created.provider
    )
  } catch (err) {
    console.error(`Failed to initialize new connection ${created.id}:`, err)
  }

  return c.json(created, 201)
})

// Test arbitrary connection (admin only)
app.post('/test', adminGuard, async c => {
  const body = await c.req.json()
  const { engineType, connectionString, provider } = body as {
    engineType?: string
    connectionString?: string
    provider?: string
  }

  if (!engineType || !connectionString) {
    return c.json({ success: false, message: 'engineType and connectionString are required' })
  }

  const result = await testDriver(engineType, connectionString, provider)
  return c.json(result)
})

// Update connection (admin only)
app.put('/:id', adminGuard, async c => {
  const db = c.get('db') as any
  const id = Number.parseInt(c.req.param('id'))
  const body = await c.req.json()

  const encryptedConnStr = body.connectionString
    ? await maybeEncrypt(body.connectionString)
    : body.connectionString
  const result = await db
    .update(connections)
    .set({
      name: body.name,
      description: body.description,
      engineType: body.engineType,
      provider: body.provider || null,
      connectionString: encryptedConnStr,
      isActive: body.isActive,
      updatedAt: new Date(),
    })
    .where(and(eq(connections.id, id), eq(connections.organisationId, 1)))
    .returning()

  if (result.length === 0) {
    return c.json({ error: 'Connection not found' }, 404)
  }

  return c.json(result[0])
})

// Delete connection (admin only)
app.delete('/:id', adminGuard, async c => {
  const db = c.get('db') as any
  const id = Number.parseInt(c.req.param('id'))

  const result = await db
    .delete(connections)
    .where(and(eq(connections.id, id), eq(connections.organisationId, 1)))
    .returning()

  if (result.length === 0) {
    return c.json({ error: 'Connection not found' }, 404)
  }

  await connectionManager.remove(id)

  return c.json({ success: true })
})

// Test connection by ID (admin only)
app.post('/:id/test', adminGuard, async c => {
  const db = c.get('db') as any
  const id = Number.parseInt(c.req.param('id'))

  const result = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.organisationId, 1)))

  if (result.length === 0) {
    return c.json({ error: 'Connection not found' }, 404)
  }

  const conn = result[0]
  const decryptedConnStr = await maybeDecrypt(conn.connectionString)
  const testResult = await testDriver(conn.engineType, decryptedConnStr, conn.provider)
  return c.json(testResult)
})

export default app
