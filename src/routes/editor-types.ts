/**
 * Editor types API
 * Serves .d.ts files from node_modules for Monaco editor autocomplete
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { groupTypes, schemaFiles } from '../../schema'
import { generateSchemaTypes } from '../services/cube-compiler'

const esmRequire = createRequire(import.meta.url)

interface Variables {
  db: DrizzleDatabase
}

const app = new Hono<{ Variables: Variables }>()

/**
 * Recursively collect all .d.ts files from a directory.
 * Returns a map of relative path -> file content.
 */
function collectDtsFiles(dir: string, base: string = dir): Record<string, string> {
  const result: Record<string, string> = {}
  if (!existsSync(dir)) return result

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      // Skip known heavy/unnecessary directories
      if (entry === 'node_modules' || entry === 'test' || entry === 'tests') continue
      Object.assign(result, collectDtsFiles(full, base))
    } else if (entry.endsWith('.d.ts') || entry.endsWith('.d.mts')) {
      result[relative(base, full)] = readFileSync(full, 'utf-8')
    }
  }
  return result
}

// Cache the collected type files (they don't change at runtime)
let drizzleOrmCache: Record<string, string> | null = null
let drizzleCubeCache: Record<string, string> | null = null

function getDrizzleOrmTypes(): Record<string, string> {
  if (drizzleOrmCache) return drizzleOrmCache

  const packageDir = dirname(esmRequire.resolve('drizzle-orm'))
  const result: Record<string, string> = {}
  const files = collectDtsFiles(packageDir)
  for (const [path, content] of Object.entries(files)) {
    result[`drizzle-orm/${path}`] = content
  }

  drizzleOrmCache = result
  return result
}

function getDrizzleCubeTypes(): Record<string, string> {
  if (drizzleCubeCache) return drizzleCubeCache

  // drizzle-cube/server types: read package.json to find the types path
  const pkgPath = join(
    dirname(esmRequire.resolve('drizzle-cube/server')),
    '..',
    '..',
    'package.json'
  )
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  const serverTypesRel = pkg.exports?.['./server']?.types || 'dist/server/index.d.ts'
  const pkgDir = dirname(pkgPath)
  const serverDtsPath = join(pkgDir, serverTypesRel)
  const serverDir = dirname(serverDtsPath)
  const result: Record<string, string> = {}

  const files = collectDtsFiles(serverDir)
  for (const [path, content] of Object.entries(files)) {
    result[`drizzle-cube/server/${path}`] = content
  }

  drizzleCubeCache = result
  return result
}

// Serve all .d.ts files as JSON maps { path: content }
app.get('/drizzle-orm', c => {
  return c.json(getDrizzleOrmTypes())
})

app.get('/drizzle-cube', async c => {
  const db = c.get('db') as any
  const types = getDrizzleCubeTypes()

  // Build dynamic SecurityContext with actual group type names
  const gtRows = await db
    .select({ name: groupTypes.name })
    .from(groupTypes)
    .where(eq(groupTypes.organisationId, 1))
  const typeNames = gtRows.map((r: any) => r.name as string)

  let groupsType: string
  if (typeNames.length > 0) {
    const fields = typeNames.map((n: string) => `'${n}'?: string[]`).join('; ')
    groupsType = `{ ${fields}; [key: string]: string[] | undefined }`
  } else {
    groupsType = 'Record<string, string[]>'
  }

  const patchedSecurityContext = `export declare interface SecurityContext {
    organisationId?: number | string;
    userId?: number | string;
    role?: string;
    groups?: ${groupsType};
    groupIds?: number[];
    [key: string]: any;
}`

  // Patch the index.d.ts to replace the generic SecurityContext
  const result = { ...types }
  for (const [path, content] of Object.entries(result)) {
    if (path.endsWith('index.d.ts') && content.includes('interface SecurityContext')) {
      result[path] = content.replace(
        /export declare interface SecurityContext\s*\{[^}]*\}/,
        patchedSecurityContext
      )
    }
  }

  return c.json(result)
})

// Serve generated schema .d.ts for a specific schema file
app.get('/schema/:id', async c => {
  const db = c.get('db') as any
  const id = Number.parseInt(c.req.param('id'))

  const rows = await db
    .select()
    .from(schemaFiles)
    .where(and(eq(schemaFiles.id, id), eq(schemaFiles.organisationId, 1)))

  if (rows.length === 0) {
    return c.text('// Schema file not found', 404)
  }

  const dts = generateSchemaTypes(rows[0].sourceCode)
  return c.text(dts, 200, { 'Content-Type': 'application/typescript' })
})

export default app
