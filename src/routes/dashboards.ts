/**
 * Dashboard management API
 * CRUD for analytics dashboard pages
 */

import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { analyticsPages } from '../../schema'

interface Variables {
  db: DrizzleDatabase
}

const app = new Hono<{ Variables: Variables }>()

// List all dashboards
app.get('/', async (c) => {
  const db = c.get('db') as any
  const result = await db.select().from(analyticsPages)
    .where(eq(analyticsPages.organisationId, 1))

  return c.json(result)
})

// Get single dashboard
app.get('/:id', async (c) => {
  const db = c.get('db') as any
  const id = parseInt(c.req.param('id'))

  const result = await db.select().from(analyticsPages)
    .where(and(eq(analyticsPages.id, id), eq(analyticsPages.organisationId, 1)))

  if (result.length === 0) {
    return c.json({ error: 'Dashboard not found' }, 404)
  }

  return c.json(result[0])
})

// Create dashboard
app.post('/', async (c) => {
  const db = c.get('db') as any
  const body = await c.req.json()

  const result = await db.insert(analyticsPages).values({
    name: body.name,
    description: body.description,
    config: body.config || { portlets: [], filters: [] },
    organisationId: 1
  }).returning()

  return c.json(result[0], 201)
})

// Create example dashboard with sample portlets
app.post('/create-example', async (c) => {
  const db = c.get('db') as any

  const exampleConfig = {
    portlets: [
      {
        id: 'p1',
        title: 'Employee Count by Department',
        query: JSON.stringify({
          measures: ['Employees.count'],
          dimensions: ['Departments.name']
        }),
        chartType: 'bar',
        w: 6, h: 4, x: 0, y: 0
      },
      {
        id: 'p2',
        title: 'Average Salary by Department',
        query: JSON.stringify({
          measures: ['Employees.avgSalary'],
          dimensions: ['Departments.name']
        }),
        chartType: 'bar',
        w: 6, h: 4, x: 6, y: 0
      },
      {
        id: 'p3',
        title: 'Productivity Over Time',
        query: JSON.stringify({
          measures: ['Productivity.totalLinesOfCode'],
          timeDimensions: [{
            dimension: 'Productivity.date',
            granularity: 'month'
          }]
        }),
        chartType: 'line',
        w: 12, h: 4, x: 0, y: 4
      }
    ],
    filters: []
  }

  const result = await db.insert(analyticsPages).values({
    name: 'Example Dashboard',
    description: 'Sample dashboard with employee and productivity analytics',
    config: exampleConfig,
    organisationId: 1
  }).returning()

  return c.json(result[0], 201)
})

// Update dashboard
app.put('/:id', async (c) => {
  const db = c.get('db') as any
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()

  const result = await db.update(analyticsPages)
    .set({
      name: body.name,
      description: body.description,
      config: body.config,
      updatedAt: new Date()
    })
    .where(and(eq(analyticsPages.id, id), eq(analyticsPages.organisationId, 1)))
    .returning()

  if (result.length === 0) {
    return c.json({ error: 'Dashboard not found' }, 404)
  }

  return c.json(result[0])
})

// Delete dashboard
app.delete('/:id', async (c) => {
  const db = c.get('db') as any
  const id = parseInt(c.req.param('id'))

  const result = await db.delete(analyticsPages)
    .where(and(eq(analyticsPages.id, id), eq(analyticsPages.organisationId, 1)))
    .returning()

  if (result.length === 0) {
    return c.json({ error: 'Dashboard not found' }, 404)
  }

  return c.json({ success: true })
})

export default app
