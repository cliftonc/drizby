/**
 * Notebooks API Routes
 * CRUD operations for AI notebook configurations
 */

import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { notebooks, users } from '../../schema'

interface Variables {
  db: DrizzleDatabase
  organisationId: number
  auth: { userId: number; user: any }
}

const notebooksApp = new Hono<{ Variables: Variables }>()

notebooksApp.use('*', async (c, next) => {
  c.set('organisationId', 1)
  await next()
})

// Get all notebooks
notebooksApp.get('/', async c => {
  const db = c.get('db') as any
  const organisationId = c.get('organisationId')

  try {
    const rows = await db
      .select({
        notebook: notebooks,
        createdByName: users.name,
      })
      .from(notebooks)
      .leftJoin(users, eq(notebooks.createdBy, users.id))
      .where(and(eq(notebooks.organisationId, organisationId), eq(notebooks.isActive, true)))
      .orderBy(asc(notebooks.order), asc(notebooks.name))

    const items = rows.map((r: any) => ({ ...r.notebook, createdByName: r.createdByName }))
    return c.json({ data: items, meta: { total: items.length } })
  } catch (error) {
    console.error('Error fetching notebooks:', error)
    return c.json({ error: 'Failed to fetch notebooks' }, 500)
  }
})

// Get specific notebook
notebooksApp.get('/:id', async c => {
  const db = c.get('db') as any
  const organisationId = c.get('organisationId')
  const id = Number.parseInt(c.req.param('id'), 10)

  if (Number.isNaN(id)) return c.json({ error: 'Invalid notebook ID' }, 400)

  try {
    const rows = await db
      .select({
        notebook: notebooks,
        createdByName: users.name,
      })
      .from(notebooks)
      .leftJoin(users, eq(notebooks.createdBy, users.id))
      .where(
        and(
          eq(notebooks.id, id),
          eq(notebooks.organisationId, organisationId),
          eq(notebooks.isActive, true)
        )
      )
      .limit(1)

    if (rows.length === 0) return c.json({ error: 'Notebook not found' }, 404)
    return c.json({ data: { ...rows[0].notebook, createdByName: rows[0].createdByName } })
  } catch (error) {
    console.error('Error fetching notebook:', error)
    return c.json({ error: 'Failed to fetch notebook' }, 500)
  }
})

// Create new notebook
notebooksApp.post('/', async c => {
  const db = c.get('db') as any
  const organisationId = c.get('organisationId')

  try {
    const body = await c.req.json()
    const { name, description, config, connectionId, order = 0 } = body

    if (!name) return c.json({ error: 'Missing required field: name' }, 400)

    const auth = c.get('auth') as any
    const newItem = await db
      .insert(notebooks)
      .values({
        name,
        description,
        order,
        organisationId,
        connectionId: connectionId || null,
        config: config || { blocks: [], messages: [] },
        createdBy: auth?.userId || null,
      })
      .returning()

    return c.json({ data: newItem[0] }, 201)
  } catch (error) {
    console.error('Error creating notebook:', error)
    return c.json({ error: 'Failed to create notebook' }, 500)
  }
})

// Update notebook
notebooksApp.put('/:id', async c => {
  const db = c.get('db') as any
  const organisationId = c.get('organisationId')
  const auth = c.get('auth') as any
  const id = Number.parseInt(c.req.param('id'), 10)

  if (Number.isNaN(id)) return c.json({ error: 'Invalid notebook ID' }, 400)

  try {
    // Members can only update their own notebooks
    if (auth?.user?.role !== 'admin') {
      const [existing] = await db
        .select({ createdBy: notebooks.createdBy })
        .from(notebooks)
        .where(and(eq(notebooks.id, id), eq(notebooks.organisationId, organisationId)))
      if (!existing) return c.json({ error: 'Notebook not found' }, 404)
      if (existing.createdBy !== auth?.userId)
        return c.json({ error: 'You can only edit your own notebooks' }, 403)
    }

    const body = await c.req.json()
    const { name, description, config, connectionId, order } = body

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (order !== undefined) updateData.order = order
    if (config !== undefined) updateData.config = config
    if (connectionId !== undefined) updateData.connectionId = connectionId

    const updated = await db
      .update(notebooks)
      .set(updateData)
      .where(and(eq(notebooks.id, id), eq(notebooks.organisationId, organisationId)))
      .returning()

    if (updated.length === 0) return c.json({ error: 'Notebook not found' }, 404)
    return c.json({ data: updated[0] })
  } catch (error) {
    console.error('Error updating notebook:', error)
    return c.json({ error: 'Failed to update notebook' }, 500)
  }
})

// Delete (soft delete) notebook
notebooksApp.delete('/:id', async c => {
  const db = c.get('db') as any
  const organisationId = c.get('organisationId')
  const auth = c.get('auth') as any
  const id = Number.parseInt(c.req.param('id'), 10)

  if (Number.isNaN(id)) return c.json({ error: 'Invalid notebook ID' }, 400)

  try {
    // Members can only delete their own notebooks
    if (auth?.user?.role !== 'admin') {
      const [existing] = await db
        .select({ createdBy: notebooks.createdBy })
        .from(notebooks)
        .where(and(eq(notebooks.id, id), eq(notebooks.organisationId, organisationId)))
      if (!existing) return c.json({ error: 'Notebook not found' }, 404)
      if (existing.createdBy !== auth?.userId)
        return c.json({ error: 'You can only delete your own notebooks' }, 403)
    }

    const deleted = await db
      .update(notebooks)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(notebooks.id, id), eq(notebooks.organisationId, organisationId)))
      .returning()

    if (deleted.length === 0) return c.json({ error: 'Notebook not found' }, 404)
    return c.json({ message: 'Notebook deleted successfully' })
  } catch (error) {
    console.error('Error deleting notebook:', error)
    return c.json({ error: 'Failed to delete notebook' }, 500)
  }
})

export default notebooksApp
