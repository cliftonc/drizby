/**
 * Cube definitions management API
 * CRUD for managing cube definitions that can be compiled and registered
 */

import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { cubeDefinitions, connections } from '../../schema'

interface Variables {
  db: DrizzleDatabase
}

const app = new Hono<{ Variables: Variables }>()

// List all cube definitions
app.get('/', async (c) => {
  const db = c.get('db') as any
  const result = await db.select({
    id: cubeDefinitions.id,
    name: cubeDefinitions.name,
    title: cubeDefinitions.title,
    description: cubeDefinitions.description,
    connectionId: cubeDefinitions.connectionId,
    isActive: cubeDefinitions.isActive,
    createdAt: cubeDefinitions.createdAt,
    updatedAt: cubeDefinitions.updatedAt
  }).from(cubeDefinitions)
    .where(eq(cubeDefinitions.organisationId, 1))

  return c.json(result)
})

// Get single cube definition (including full definition JSON)
app.get('/:id', async (c) => {
  const db = c.get('db') as any
  const id = parseInt(c.req.param('id'))

  const result = await db.select().from(cubeDefinitions)
    .where(and(eq(cubeDefinitions.id, id), eq(cubeDefinitions.organisationId, 1)))

  if (result.length === 0) {
    return c.json({ error: 'Cube definition not found' }, 404)
  }

  return c.json(result[0])
})

// Create cube definition
app.post('/', async (c) => {
  const db = c.get('db') as any
  const body = await c.req.json()

  // Verify connection exists
  const conn = await db.select().from(connections)
    .where(and(eq(connections.id, body.connectionId), eq(connections.organisationId, 1)))

  if (conn.length === 0) {
    return c.json({ error: 'Connection not found' }, 400)
  }

  const result = await db.insert(cubeDefinitions).values({
    name: body.name,
    title: body.title,
    description: body.description,
    connectionId: body.connectionId,
    definition: body.definition,
    organisationId: 1
  }).returning()

  return c.json(result[0], 201)
})

// Update cube definition
app.put('/:id', async (c) => {
  const db = c.get('db') as any
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()

  const result = await db.update(cubeDefinitions)
    .set({
      name: body.name,
      title: body.title,
      description: body.description,
      definition: body.definition,
      isActive: body.isActive,
      updatedAt: new Date()
    })
    .where(and(eq(cubeDefinitions.id, id), eq(cubeDefinitions.organisationId, 1)))
    .returning()

  if (result.length === 0) {
    return c.json({ error: 'Cube definition not found' }, 404)
  }

  return c.json(result[0])
})

// Delete cube definition
app.delete('/:id', async (c) => {
  const db = c.get('db') as any
  const id = parseInt(c.req.param('id'))

  const result = await db.delete(cubeDefinitions)
    .where(and(eq(cubeDefinitions.id, id), eq(cubeDefinitions.organisationId, 1)))
    .returning()

  if (result.length === 0) {
    return c.json({ error: 'Cube definition not found' }, 404)
  }

  return c.json({ success: true })
})

// Compile / validate a cube definition (without saving)
app.post('/validate', async (c) => {
  const _body = await c.req.json()

  // TODO: Use the SemanticLayerCompiler to validate the cube definition
  // This will leverage registerCube/unregisterCube from the compiler
  return c.json({
    valid: true,
    message: 'Cube definition validation not yet implemented - will use SemanticLayerCompiler'
  })
})

export default app
