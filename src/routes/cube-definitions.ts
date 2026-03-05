/**
 * Cube definitions management API
 * CRUD + compile for cube definitions with TypeScript source
 */

import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { cubeDefinitions, connections } from '../../schema'
import { connectionManager } from '../services/connection-manager'

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
    sourceCode: cubeDefinitions.sourceCode,
    schemaFileId: cubeDefinitions.schemaFileId,
    connectionId: cubeDefinitions.connectionId,
    compiledAt: cubeDefinitions.compiledAt,
    compilationErrors: cubeDefinitions.compilationErrors,
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
    sourceCode: body.sourceCode,
    schemaFileId: body.schemaFileId,
    connectionId: body.connectionId,
    definition: body.definition || null,
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
      sourceCode: body.sourceCode,
      schemaFileId: body.schemaFileId,
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

// Compile a cube definition (save + register on semantic layer)
app.post('/:id/compile', async (c) => {
  const db = c.get('db') as any
  const id = parseInt(c.req.param('id'))

  const rows = await db.select().from(cubeDefinitions)
    .where(and(eq(cubeDefinitions.id, id), eq(cubeDefinitions.organisationId, 1)))

  if (rows.length === 0) {
    return c.json({ error: 'Cube definition not found' }, 404)
  }

  const cubeDef = rows[0]
  if (!cubeDef.sourceCode) {
    return c.json({ error: 'No source code to compile' }, 400)
  }

  const result = connectionManager.compileCubeDefinition(cubeDef.connectionId, cubeDef.sourceCode)

  if (result.errors.length === 0) {
    await db.update(cubeDefinitions)
      .set({
        compiledAt: new Date(),
        compilationErrors: null,
        definition: { cubes: result.cubes }
      })
      .where(eq(cubeDefinitions.id, id))
  } else {
    await db.update(cubeDefinitions)
      .set({ compilationErrors: result.errors })
      .where(eq(cubeDefinitions.id, id))
  }

  return c.json({
    success: result.errors.length === 0,
    cubes: result.cubes,
    errors: result.errors,
  })
})

// Validate a cube definition (dry run, no save)
app.post('/validate', async (c) => {
  const body = await c.req.json()
  const { sourceCode, connectionId } = body

  if (!sourceCode || !connectionId) {
    return c.json({ error: 'sourceCode and connectionId are required' }, 400)
  }

  const managed = connectionManager.get(connectionId)
  if (!managed) {
    return c.json({ error: 'Connection not found or not initialized' }, 400)
  }

  // Compile without registering - just check for errors
  const { compileCube } = await import('../services/cube-compiler')
  const result = compileCube(sourceCode, managed.schemaExports)

  return c.json({
    valid: result.errors.length === 0,
    errors: result.errors,
    exports: Object.keys(result.exports),
  })
})

export default app
