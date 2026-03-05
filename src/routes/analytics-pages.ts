/**
 * Analytics Pages API Routes
 * CRUD operations for dashboard configurations
 */

import { Hono } from 'hono'
import { eq, and, asc } from 'drizzle-orm'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { analyticsPages } from '../../schema'
import { productivityDashboardConfig } from '../dashboard-config'

interface Variables {
  db: DrizzleDatabase
  organisationId: number
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
    const pages = await db
      .select()
      .from(analyticsPages)
      .where(
        and(
          eq(analyticsPages.organisationId, organisationId),
          eq(analyticsPages.isActive, true)
        )
      )
      .orderBy(asc(analyticsPages.order), asc(analyticsPages.name))

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
    const page = await db
      .select()
      .from(analyticsPages)
      .where(
        and(
          eq(analyticsPages.id, id),
          eq(analyticsPages.organisationId, organisationId),
          eq(analyticsPages.isActive, true)
        )
      )
      .limit(1)

    if (page.length === 0) return c.json({ error: 'Analytics page not found' }, 404)
    return c.json({ data: page[0] })
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
    const { name, description, config, order = 0 } = body

    if (!name || !config || !config.portlets) {
      return c.json({ error: 'Missing required fields: name, config, or config.portlets' }, 400)
    }

    const newPage = await db
      .insert(analyticsPages)
      .values({ name, description, order, organisationId, config })
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
    const newPage = await db
      .insert(analyticsPages)
      .values({ ...productivityDashboardConfig, organisationId })
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
  const id = parseInt(c.req.param('id'))

  if (isNaN(id)) return c.json({ error: 'Invalid page ID' }, 400)

  try {
    const body = await c.req.json()
    const { name, description, config, order } = body

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (order !== undefined) updateData.order = order
    if (config !== undefined) updateData.config = config

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
  const id = parseInt(c.req.param('id'))

  if (isNaN(id)) return c.json({ error: 'Invalid page ID' }, 400)

  try {
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
  const id = parseInt(c.req.param('id'))

  if (isNaN(id)) return c.json({ error: 'Invalid page ID' }, 400)

  try {
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
