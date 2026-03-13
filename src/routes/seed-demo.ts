/**
 * Demo data seeding API — SSE endpoint for seeding demo data with progress.
 * Called from the setup page after admin account creation.
 */

import type { DrizzleDatabase } from 'drizzle-cube/server'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { connections, settings } from '../../schema'
import { guardPermission } from '../permissions/guard'
import { seedDemoInternalData } from './seed-demo-config'

interface Variables {
  db: DrizzleDatabase
  auth?: { userId: number; user: any }
}

const app = new Hono<{ Variables: Variables }>()

/**
 * GET /api/seed-demo — SSE stream that seeds demo data and reports progress.
 * Admin only. Called from the setup page after admin account creation.
 */
app.get('/', async c => {
  const denied = guardPermission(c, 'manage', 'Connection')
  if (denied) return denied

  const db = c.get('db') as any

  // Check if demo data already exists
  const existing = await db.select({ id: connections.id }).from(connections).limit(1)
  if (existing.length > 0) {
    return c.json({ status: 'already_seeded' })
  }

  return streamSSE(c, async stream => {
    let id = 0
    const send = async (step: string, progress: number, detail?: string) => {
      await stream.writeSSE({
        id: String(id++),
        event: 'progress',
        data: JSON.stringify({ step, progress, detail }),
      })
    }

    try {
      await send('Creating demo database and seeding data', 10)
      const auth = c.get('auth') as any
      await seedDemoInternalData(db, auth?.userId)
      await send('Demo seeded successfully', 95)

      // Mark setup as complete
      const [statusRow] = await db.select().from(settings).where(eq(settings.key, 'setup_status'))
      if (statusRow) {
        await db
          .update(settings)
          .set({ value: 'complete', updatedAt: new Date() })
          .where(eq(settings.key, 'setup_status'))
      }

      await stream.writeSSE({
        id: String(id++),
        event: 'complete',
        data: JSON.stringify({ status: 'ok' }),
      })
    } catch (err: any) {
      await stream.writeSSE({
        id: String(id++),
        event: 'error',
        data: JSON.stringify({ message: err.message }),
      })
    }
  })
})

export default app
