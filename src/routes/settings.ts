/**
 * Settings API routes
 * Manages AI provider configuration
 */

import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { settings, connections, schemaFiles, cubeDefinitions, analyticsPages, notebooks, users, userSessions, oauthAccounts } from '../../schema'
import { getAISettings } from '../services/ai-settings'
import { invalidateCubeAppCache } from '../../app'
import { connectionManager } from '../services/connection-manager'
import { guardPermission } from '../permissions/guard'

interface Variables {
  db: DrizzleDatabase
  auth?: { userId: number; user: any }
}

const app = new Hono<{ Variables: Variables }>()

// Admin-only guard
app.use('*', async (c, next) => {
  const denied = guardPermission(c, 'manage', 'Settings')
  if (denied) return denied
  await next()
})

// GET /api/settings/ai — return AI config with masked API key
app.get('/ai', async (c) => {
  const db = c.get('db') as any
  const ai = await getAISettings(db)

  return c.json({
    provider: ai.provider || '',
    model: ai.model || '',
    baseUrl: ai.baseUrl || '',
    hasApiKey: !!ai.apiKey,
    apiKeyHint: ai.apiKey ? '****' + ai.apiKey.slice(-4) : '',
  })
})

// PUT /api/settings/ai — upsert AI config
app.put('/ai', async (c) => {
  const db = c.get('db') as any
  const body = await c.req.json()
  const { provider, apiKey, model, baseUrl } = body as {
    provider?: string
    apiKey?: string
    model?: string
    baseUrl?: string
  }

  const pairs: [string, string | undefined][] = [
    ['ai_provider', provider],
    ['ai_api_key', apiKey],
    ['ai_model', model],
    ['ai_base_url', baseUrl],
  ]

  for (const [key, value] of pairs) {
    if (value === undefined) continue

    if (value === '') {
      // Delete the row
      await db.delete(settings).where(
        and(eq(settings.key, key), eq(settings.organisationId, 1))
      )
    } else {
      // Upsert
      const existing = await db.select().from(settings).where(
        and(eq(settings.key, key), eq(settings.organisationId, 1))
      )
      if (existing.length > 0) {
        await db.update(settings)
          .set({ value, updatedAt: new Date() })
          .where(and(eq(settings.key, key), eq(settings.organisationId, 1)))
      } else {
        await db.insert(settings).values({
          key,
          value,
          organisationId: 1,
        })
      }
    }
  }

  invalidateCubeAppCache()

  return c.json({ success: true })
})

// POST /api/settings/factory-reset — wipe all data, delete demo.sqlite, restart auto-seed on next boot
app.post('/factory-reset', async (c) => {
  const db = c.get('db') as any

  // Tear down all managed connections
  for (const id of connectionManager.getConnectionIds()) {
    await connectionManager.remove(id)
  }
  invalidateCubeAppCache()

  // Delete all rows from every table (order matters for FK constraints)
  await db.delete(userSessions)
  await db.delete(oauthAccounts)
  await db.delete(cubeDefinitions)
  await db.delete(schemaFiles)
  await db.delete(analyticsPages)
  await db.delete(notebooks)
  await db.delete(connections)
  await db.delete(settings)
  await db.delete(users)

  // Delete external data files (demo.sqlite etc.)
  const { readdirSync, unlinkSync } = await import('node:fs')
  const { join } = await import('node:path')
  try {
    const dataDir = 'data'
    for (const file of readdirSync(dataDir)) {
      if (file === 'drizby.sqlite' || file.startsWith('drizby.sqlite-')) continue
      try { unlinkSync(join(dataDir, file)) } catch {}
    }
  } catch {}

  return c.json({ success: true, message: 'Factory reset complete. Restart the server to re-seed demo data.' })
})

export default app
