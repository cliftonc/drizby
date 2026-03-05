/**
 * Database connections management API
 * CRUD for managing connections to different data sources
 */

import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { connections } from '../../schema'

interface Variables {
  db: DrizzleDatabase
}

const app = new Hono<{ Variables: Variables }>()

// List all connections
app.get('/', async (c) => {
  const db = c.get('db') as any
  const result = await db.select({
    id: connections.id,
    name: connections.name,
    description: connections.description,
    engineType: connections.engineType,
    isActive: connections.isActive,
    createdAt: connections.createdAt,
    updatedAt: connections.updatedAt
  }).from(connections)
    .where(eq(connections.organisationId, 1))

  return c.json(result)
})

// Get single connection
app.get('/:id', async (c) => {
  const db = c.get('db') as any
  const id = parseInt(c.req.param('id'))
  const result = await db.select({
    id: connections.id,
    name: connections.name,
    description: connections.description,
    engineType: connections.engineType,
    connectionString: connections.connectionString,
    isActive: connections.isActive,
    createdAt: connections.createdAt,
    updatedAt: connections.updatedAt
  }).from(connections)
    .where(and(eq(connections.id, id), eq(connections.organisationId, 1)))

  if (result.length === 0) {
    return c.json({ error: 'Connection not found' }, 404)
  }

  return c.json(result[0])
})

// Create connection
app.post('/', async (c) => {
  const db = c.get('db') as any
  const body = await c.req.json()

  const result = await db.insert(connections).values({
    name: body.name,
    description: body.description,
    engineType: body.engineType,
    connectionString: body.connectionString,
    organisationId: 1
  }).returning()

  return c.json(result[0], 201)
})

// Update connection
app.put('/:id', async (c) => {
  const db = c.get('db') as any
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()

  const result = await db.update(connections)
    .set({
      name: body.name,
      description: body.description,
      engineType: body.engineType,
      connectionString: body.connectionString,
      isActive: body.isActive,
      updatedAt: new Date()
    })
    .where(and(eq(connections.id, id), eq(connections.organisationId, 1)))
    .returning()

  if (result.length === 0) {
    return c.json({ error: 'Connection not found' }, 404)
  }

  return c.json(result[0])
})

// Delete connection
app.delete('/:id', async (c) => {
  const db = c.get('db') as any
  const id = parseInt(c.req.param('id'))

  const result = await db.delete(connections)
    .where(and(eq(connections.id, id), eq(connections.organisationId, 1)))
    .returning()

  if (result.length === 0) {
    return c.json({ error: 'Connection not found' }, 404)
  }

  return c.json({ success: true })
})

// Test connection
app.post('/:id/test', async (c) => {
  const db = c.get('db') as any
  const id = parseInt(c.req.param('id'))

  const result = await db.select().from(connections)
    .where(and(eq(connections.id, id), eq(connections.organisationId, 1)))

  if (result.length === 0) {
    return c.json({ error: 'Connection not found' }, 404)
  }

  // TODO: Actually test the connection by trying to connect
  // For now, return a placeholder
  return c.json({
    success: true,
    message: 'Connection test not yet implemented - will validate connectivity'
  })
})

export default app
