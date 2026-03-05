/**
 * Editor types API
 * Serves .d.ts files for Monaco editor autocomplete
 */

import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { schemaFiles } from '../../schema'
import { generateSchemaTypes } from '../services/cube-compiler'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { createRequire } from 'node:module'

const esmRequire = createRequire(import.meta.url)

interface Variables {
  db: DrizzleDatabase
}

const app = new Hono<{ Variables: Variables }>()

// Cache for loaded .d.ts files
const dtsCache = new Map<string, string>()

function loadDts(packageName: string, dtsPath: string): string {
  const cacheKey = `${packageName}:${dtsPath}`
  if (dtsCache.has(cacheKey)) return dtsCache.get(cacheKey)!

  try {
    const resolved = esmRequire.resolve(packageName)
    const packageDir = dirname(dirname(resolved))
    const fullPath = join(packageDir, dtsPath)
    const content = readFileSync(fullPath, 'utf-8')
    dtsCache.set(cacheKey, content)
    return content
  } catch (err: any) {
    return `// Could not load types for ${packageName}: ${err.message}`
  }
}

// Serve drizzle-orm types
app.get('/drizzle-orm', (c) => {
  // Provide key type declarations for pg-core
  const dts = loadDts('drizzle-orm', 'pg-core/index.d.ts')
  return c.text(dts, 200, { 'Content-Type': 'application/typescript' })
})

// Serve drizzle-cube/server types
app.get('/drizzle-cube', (c) => {
  const dts = loadDts('drizzle-cube', 'dist/server/index.d.ts')
  return c.text(dts, 200, { 'Content-Type': 'application/typescript' })
})

// Serve generated schema .d.ts for a specific schema file
app.get('/schema/:id', async (c) => {
  const db = c.get('db') as any
  const id = parseInt(c.req.param('id'))

  const rows = await db.select().from(schemaFiles)
    .where(and(eq(schemaFiles.id, id), eq(schemaFiles.organisationId, 1)))

  if (rows.length === 0) {
    return c.text('// Schema file not found', 404)
  }

  const dts = generateSchemaTypes(rows[0].sourceCode)
  return c.text(dts, 200, { 'Content-Type': 'application/typescript' })
})

export default app
