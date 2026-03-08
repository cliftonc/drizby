/**
 * Database connections management API
 * CRUD for managing connections to different data sources
 */

import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { connections, cubeDefinitions, schemaFiles } from '../../schema'
import { guardPermission } from '../permissions/guard'
import { connectionManager } from '../services/connection-manager'

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
      isActive: connections.isActive,
      createdAt: connections.createdAt,
      updatedAt: connections.updatedAt,
    })
    .from(connections)
    .where(eq(connections.organisationId, 1))

  return c.json(result)
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

  return c.json(result[0])
})

// Create connection (admin only)
app.post('/', adminGuard, async c => {
  const db = c.get('db') as any
  const body = await c.req.json()

  const result = await db
    .insert(connections)
    .values({
      name: body.name,
      description: body.description,
      engineType: body.engineType,
      connectionString: body.connectionString,
      organisationId: 1,
    })
    .returning()

  // Initialize in connection manager so it's immediately available
  const created = result[0]
  try {
    await connectionManager.createConnection(
      created.id,
      created.connectionString,
      created.engineType
    )
  } catch (err) {
    console.error(`Failed to initialize new connection ${created.id}:`, err)
  }

  return c.json(created, 201)
})

// Test arbitrary connection (admin only)
app.post('/test', adminGuard, async c => {
  const body = await c.req.json()
  const { engineType, connectionString } = body as {
    engineType?: string
    connectionString?: string
  }

  if (!engineType || !connectionString) {
    return c.json({ success: false, message: 'engineType and connectionString are required' })
  }

  const start = Date.now()

  try {
    if (engineType === 'sqlite') {
      const Database = (await import('better-sqlite3')).default
      const filePath = connectionString.replace(/^file:/, '')
      const sqlite = new Database(filePath, { readonly: true })
      sqlite.prepare('SELECT 1').get()
      sqlite.close()
    } else {
      const postgres = (await import('postgres')).default
      const sql = postgres(connectionString, { max: 1, connect_timeout: 10 })
      await sql`SELECT 1`
      await sql.end()
    }

    return c.json({
      success: true,
      message: `Connected successfully (${Date.now() - start}ms)`,
    })
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Connection failed',
    })
  }
})

// Update connection (admin only)
app.put('/:id', adminGuard, async c => {
  const db = c.get('db') as any
  const id = Number.parseInt(c.req.param('id'))
  const body = await c.req.json()

  const result = await db
    .update(connections)
    .set({
      name: body.name,
      description: body.description,
      engineType: body.engineType,
      connectionString: body.connectionString,
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
  const start = Date.now()

  try {
    if (conn.engineType === 'sqlite') {
      const Database = (await import('better-sqlite3')).default
      const filePath = conn.connectionString.replace(/^file:/, '')
      const sqlite = new Database(filePath, { readonly: true })
      sqlite.prepare('SELECT 1').get()
      sqlite.close()
    } else {
      const postgres = (await import('postgres')).default
      const sql = postgres(conn.connectionString, { max: 1, connect_timeout: 10 })
      await sql`SELECT 1`
      await sql.end()
    }

    return c.json({
      success: true,
      message: `Connected successfully (${Date.now() - start}ms)`,
    })
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Connection failed',
    })
  }
})

export default app
