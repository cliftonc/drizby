/**
 * Analytics Pages API Routes
 * CRUD operations for dashboard configurations
 */

import { Hono } from 'hono'
import { eq, and, asc } from 'drizzle-orm'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { analyticsPages, users } from '../../schema'
import { productivityDashboardConfig } from '../dashboard-config'

interface Variables {
  db: DrizzleDatabase
  organisationId: number
  auth: { userId: number; user: any }
}

const analyticsApp = new Hono<{ Variables: Variables }>()

analyticsApp.use('*', async (c, next) => {
  c.set('organisationId', 1)
  await next()
})

// Get all analytics pages
analyticsApp.get('/', async (c) => {
  const db = c.get('db') as any
  const organisationId = c.get('organisationId')

  try {
    const rows = await db
      .select({
        page: analyticsPages,
        createdByName: users.name,
      })
      .from(analyticsPages)
      .leftJoin(users, eq(analyticsPages.createdBy, users.id))
      .where(
        and(
          eq(analyticsPages.organisationId, organisationId),
          eq(analyticsPages.isActive, true)
        )
      )
      .orderBy(asc(analyticsPages.order), asc(analyticsPages.name))

    const pages = rows.map((r: any) => ({ ...r.page, createdByName: r.createdByName }))
    return c.json({ data: pages, meta: { total: pages.length } })
  } catch (error) {
    console.error('Error fetching analytics pages:', error)
    return c.json({ error: 'Failed to fetch analytics pages' }, 500)
  }
})

// Get specific analytics page
analyticsApp.get('/:id', async (c) => {
  const db = c.get('db') as any
  const organisationId = c.get('organisationId')
  const id = parseInt(c.req.param('id'))

  if (isNaN(id)) return c.json({ error: 'Invalid page ID' }, 400)

  try {
    const rows = await db
      .select({
        page: analyticsPages,
        createdByName: users.name,
      })
      .from(analyticsPages)
      .leftJoin(users, eq(analyticsPages.createdBy, users.id))
      .where(
        and(
          eq(analyticsPages.id, id),
          eq(analyticsPages.organisationId, organisationId),
          eq(analyticsPages.isActive, true)
        )
      )
      .limit(1)

    if (rows.length === 0) return c.json({ error: 'Analytics page not found' }, 404)
    return c.json({ data: { ...rows[0].page, createdByName: rows[0].createdByName } })
  } catch (error) {
    console.error('Error fetching analytics page:', error)
    return c.json({ error: 'Failed to fetch analytics page' }, 500)
  }
})

// Create new analytics page
analyticsApp.post('/', async (c) => {
  const db = c.get('db') as any
  const organisationId = c.get('organisationId')

  try {
    const body = await c.req.json()
    const { name, description, config, connectionId, order = 0 } = body

    if (!name || !config || !config.portlets) {
      return c.json({ error: 'Missing required fields: name, config, or config.portlets' }, 400)
    }

    const auth = c.get('auth') as any
    const newPage = await db
      .insert(analyticsPages)
      .values({ name, description, order, organisationId, config, connectionId: connectionId || null, createdBy: auth?.userId || null })
      .returning()

    return c.json({ data: newPage[0] }, 201)
  } catch (error) {
    console.error('Error creating analytics page:', error)
    return c.json({ error: 'Failed to create analytics page' }, 500)
  }
})

// Create example analytics page
analyticsApp.post('/create-example', async (c) => {
  const db = c.get('db') as any
  const organisationId = c.get('organisationId')

  try {
    const auth = c.get('auth') as any
    const newPage = await db
      .insert(analyticsPages)
      .values({ ...productivityDashboardConfig, organisationId, createdBy: auth?.userId || null })
      .returning()

    return c.json({ data: newPage[0] }, 201)
  } catch (error) {
    console.error('Error creating example analytics page:', error)
    return c.json({ error: 'Failed to create example analytics page' }, 500)
  }
})

// Update analytics page
analyticsApp.put('/:id', async (c) => {
  const db = c.get('db') as any
  const organisationId = c.get('organisationId')
  const auth = c.get('auth') as any
  const id = parseInt(c.req.param('id'))

  if (isNaN(id)) return c.json({ error: 'Invalid page ID' }, 400)

  try {
    // Members can only update their own dashboards
    if (auth?.user?.role !== 'admin') {
      const [existing] = await db.select({ createdBy: analyticsPages.createdBy }).from(analyticsPages)
        .where(and(eq(analyticsPages.id, id), eq(analyticsPages.organisationId, organisationId)))
      if (!existing) return c.json({ error: 'Analytics page not found' }, 404)
      if (existing.createdBy !== auth?.userId) return c.json({ error: 'You can only edit your own dashboards' }, 403)
    }

    const body = await c.req.json()
    const { name, description, config, connectionId, order } = body

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (order !== undefined) updateData.order = order
    if (config !== undefined) updateData.config = config
    if (connectionId !== undefined) updateData.connectionId = connectionId

    const updatedPage = await db
      .update(analyticsPages)
      .set(updateData)
      .where(and(eq(analyticsPages.id, id), eq(analyticsPages.organisationId, organisationId)))
      .returning()

    if (updatedPage.length === 0) return c.json({ error: 'Analytics page not found' }, 404)
    return c.json({ data: updatedPage[0] })
  } catch (error) {
    console.error('Error updating analytics page:', error)
    return c.json({ error: 'Failed to update analytics page' }, 500)
  }
})

// Reset analytics page to default configuration
analyticsApp.post('/:id/reset', async (c) => {
  const db = c.get('db') as any
  const organisationId = c.get('organisationId')
  const auth = c.get('auth') as any
  const id = parseInt(c.req.param('id'))

  if (isNaN(id)) return c.json({ error: 'Invalid page ID' }, 400)

  try {
    // Members can only reset their own dashboards
    if (auth?.user?.role !== 'admin') {
      const [existing] = await db.select({ createdBy: analyticsPages.createdBy }).from(analyticsPages)
        .where(and(eq(analyticsPages.id, id), eq(analyticsPages.organisationId, organisationId)))
      if (!existing) return c.json({ error: 'Analytics page not found' }, 404)
      if (existing.createdBy !== auth?.userId) return c.json({ error: 'You can only reset your own dashboards' }, 403)
    }

    const resetPage = await db
      .update(analyticsPages)
      .set({ ...productivityDashboardConfig, organisationId, updatedAt: new Date() })
      .where(and(eq(analyticsPages.id, id), eq(analyticsPages.organisationId, organisationId)))
      .returning()

    if (resetPage.length === 0) return c.json({ error: 'Analytics page not found' }, 404)
    return c.json({ data: resetPage[0] })
  } catch (error) {
    console.error('Error resetting analytics page:', error)
    return c.json({ error: 'Failed to reset analytics page' }, 500)
  }
})

// Save thumbnail for analytics page (stores base64 in config for dev)
analyticsApp.post('/:id/thumbnail', async (c) => {
  const db = c.get('db') as any
  const organisationId = c.get('organisationId')
  const auth = c.get('auth') as any
  const id = parseInt(c.req.param('id'))

  if (isNaN(id)) return c.json({ error: 'Invalid page ID' }, 400)

  try {
    const body = await c.req.json()
    const { thumbnailData } = body

    if (!thumbnailData || typeof thumbnailData !== 'string') {
      return c.json({ error: 'thumbnailData (base64 string) is required' }, 400)
    }

    const existingPage = await db
      .select()
      .from(analyticsPages)
      .where(and(eq(analyticsPages.id, id), eq(analyticsPages.organisationId, organisationId), eq(analyticsPages.isActive, true)))
      .limit(1)

    if (existingPage.length === 0) return c.json({ error: 'Analytics page not found' }, 404)

    // Members can only save thumbnails for their own dashboards
    if (auth?.user?.role !== 'admin' && existingPage[0].createdBy !== auth?.userId) {
      return c.json({ error: 'You can only edit your own dashboards' }, 403)
    }

    const updatedConfig = { ...existingPage[0].config, thumbnailData }

    await db
      .update(analyticsPages)
      .set({ config: updatedConfig, updatedAt: new Date() })
      .where(and(eq(analyticsPages.id, id), eq(analyticsPages.organisationId, organisationId)))

    return c.json({ thumbnailUrl: thumbnailData })
  } catch (error) {
    console.error('Error saving thumbnail:', error)
    return c.json({ error: 'Failed to save thumbnail' }, 500)
  }
})

// Delete (soft delete) analytics page
analyticsApp.delete('/:id', async (c) => {
  const db = c.get('db') as any
  const organisationId = c.get('organisationId')
  const auth = c.get('auth') as any
  const id = parseInt(c.req.param('id'))

  if (isNaN(id)) return c.json({ error: 'Invalid page ID' }, 400)

  try {
    // Members can only delete their own dashboards
    if (auth?.user?.role !== 'admin') {
      const [existing] = await db.select({ createdBy: analyticsPages.createdBy }).from(analyticsPages)
        .where(and(eq(analyticsPages.id, id), eq(analyticsPages.organisationId, organisationId)))
      if (!existing) return c.json({ error: 'Analytics page not found' }, 404)
      if (existing.createdBy !== auth?.userId) return c.json({ error: 'You can only delete your own dashboards' }, 403)
    }

    const deletedPage = await db
      .update(analyticsPages)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(analyticsPages.id, id), eq(analyticsPages.organisationId, organisationId)))
      .returning()

    if (deletedPage.length === 0) return c.json({ error: 'Analytics page not found' }, 404)
    return c.json({ message: 'Analytics page deleted successfully' })
  } catch (error) {
    console.error('Error deleting analytics page:', error)
    return c.json({ error: 'Failed to delete analytics page' }, 500)
  }
})

export default analyticsApp
