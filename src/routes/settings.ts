/**
 * Settings API routes
 * Manages AI provider configuration
 */

import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { invalidateCubeAppCache } from '../../app'
import {
  analyticsPages,
  connections,
  cubeDefinitions,
  notebooks,
  oauthAccounts,
  schemaFiles,
  settings,
  userSessions,
  users,
} from '../../schema'
import { guardPermission } from '../permissions/guard'
import { getAISettings } from '../services/ai-settings'
import { connectionManager } from '../services/connection-manager'

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
app.get('/ai', async c => {
  const db = c.get('db') as any
  const ai = await getAISettings(db)

  return c.json({
    provider: ai.provider || '',
    model: ai.model || '',
    baseUrl: ai.baseUrl || '',
    hasApiKey: !!ai.apiKey,
    apiKeyHint: ai.apiKey ? `****${ai.apiKey.slice(-4)}` : '',
  })
})

// PUT /api/settings/ai — upsert AI config
app.put('/ai', async c => {
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
      await db.delete(settings).where(and(eq(settings.key, key), eq(settings.organisationId, 1)))
    } else {
      // Upsert
      const existing = await db
        .select()
        .from(settings)
        .where(and(eq(settings.key, key), eq(settings.organisationId, 1)))
      if (existing.length > 0) {
        await db
          .update(settings)
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

// POST /api/settings/reseed-demo — delete and recreate demo data only
app.post('/reseed-demo', async c => {
  const db = c.get('db') as any

  // Find the demo connection
  const [demoConn] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.name, 'Demo SQLite'), eq(connections.organisationId, 1)))
    .limit(1)

  if (demoConn) {
    // Remove from connection manager
    await connectionManager.remove(demoConn.id)
    invalidateCubeAppCache()

    // Delete associated rows
    await db.delete(cubeDefinitions).where(eq(cubeDefinitions.connectionId, demoConn.id))
    await db.delete(schemaFiles).where(eq(schemaFiles.connectionId, demoConn.id))
    await db.delete(analyticsPages).where(eq(analyticsPages.connectionId, demoConn.id))
    await db.delete(notebooks).where(eq(notebooks.connectionId, demoConn.id))
    await db.delete(connections).where(eq(connections.id, demoConn.id))
  }

  // Delete demo.sqlite file
  const { unlinkSync } = await import('node:fs')
  try {
    unlinkSync('data/demo.sqlite')
    unlinkSync('data/demo.sqlite-wal')
    unlinkSync('data/demo.sqlite-shm')
  } catch {}

  // Re-run the full demo seed
  const { seedDemo } = await import('../../scripts/seed-demo')
  const DEMO_DB_PATH = 'data/demo.sqlite'
  seedDemo(DEMO_DB_PATH)

  // Re-register connection and rebuild cubes (inline same logic as seed.ts)
  const { DEMO_SCHEMA_SOURCE, DEMO_CUBES_SOURCE, DEMO_PORTLETS } = await import('./seed-demo-config')

  const [newConn] = await db
    .insert(connections)
    .values({
      name: 'Demo SQLite',
      description: 'Built-in demo database with sample employee data',
      engineType: 'sqlite',
      connectionString: `file:${DEMO_DB_PATH}`,
      organisationId: 1,
    })
    .returning()

  const [newSchema] = await db
    .insert(schemaFiles)
    .values({
      name: 'demo-schema.ts',
      sourceCode: DEMO_SCHEMA_SOURCE,
      connectionId: newConn.id,
      organisationId: 1,
    })
    .returning()

  await db.insert(cubeDefinitions).values({
    name: 'Demo Cubes',
    title: 'Employee Analytics Cubes',
    description: 'Employees, Departments, Productivity, and PR Events cubes for the demo dataset',
    sourceCode: DEMO_CUBES_SOURCE,
    schemaFileId: newSchema.id,
    connectionId: newConn.id,
    organisationId: 1,
  })

  await db.insert(analyticsPages).values({
    name: 'Overview Dashboard',
    description: 'Employee and productivity overview',
    connectionId: newConn.id,
    config: { portlets: DEMO_PORTLETS, filters: [] },
    organisationId: 1,
  })

  await connectionManager.createConnection(newConn.id, newConn.connectionString, newConn.engineType)
  await connectionManager.compileAll(db)

  return c.json({ success: true, message: 'Demo data reseeded successfully.' })
})

// POST /api/settings/factory-reset — wipe all data, delete demo.sqlite, restart auto-seed on next boot
app.post('/factory-reset', async c => {
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
      try {
        unlinkSync(join(dataDir, file))
      } catch {}
    }
  } catch {}

  return c.json({
    success: true,
    message: 'Factory reset complete. Restart the server to re-seed demo data.',
  })
})

export default app
