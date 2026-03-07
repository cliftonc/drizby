/**
 * Schema files API
 * CRUD + compile + introspect for Drizzle schema files
 */

import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { invalidateCubeAppCache } from '../../app'
import { connections, schemaFiles } from '../../schema'
import { guardPermission } from '../permissions/guard'
import { getAISettings } from '../services/ai-settings'
import { connectionManager } from '../services/connection-manager'
import { compileSchema, generateSchemaTypes } from '../services/cube-compiler'

interface Variables {
  db: DrizzleDatabase
}

const app = new Hono<{ Variables: Variables }>()

// Admin-only: all schema file management routes
app.use('*', async (c, next) => {
  const denied = guardPermission(c, 'manage', 'Schema')
  if (denied) return denied
  await next()
})

// List all schema files
app.get('/', async c => {
  const db = c.get('db') as any
  const result = await db.select().from(schemaFiles).where(eq(schemaFiles.organisationId, 1))
  return c.json(result)
})

// Generate cube definitions from schema files using AI
// SSE endpoint: plan + generate cubes one by one, streaming progress
app.post('/generate-cubes', async c => {
  const db = c.get('db') as any
  const body = await c.req.json()
  const { connectionId } = body

  const conn = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.organisationId, 1)))
  if (conn.length === 0) return c.json({ error: 'Connection not found' }, 400)

  const schemas = await db
    .select()
    .from(schemaFiles)
    .where(and(eq(schemaFiles.connectionId, connectionId), eq(schemaFiles.organisationId, 1)))

  if (schemas.length === 0) {
    return c.json({ error: 'No schema files found. Introspect or create schema files first.' }, 400)
  }

  const ai = await getAISettings(db)
  if (!ai.apiKey || !ai.provider) {
    return c.json(
      { error: 'AI is not configured. Go to Settings → AI to set up your API key.' },
      400
    )
  }

  const schemaContext = schemas.map((sf: any) => ({
    fileName: sf.name.replace(/\.ts$/, ''),
    source: sf.sourceCode,
  }))

  const schemaListing = schemaContext
    .map((s: any) => `// File: ${s.fileName}.ts\n${s.source}`)
    .join('\n\n')

  // Stream SSE events
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(
          new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      try {
        // Phase 1: Plan
        send('status', { phase: 'planning', message: 'Analyzing schema and planning cubes...' })
        const fileNameList = schemaContext.map((s: any) => s.fileName).join(', ')
        const planPrompt = `Here are the Drizzle ORM schema files:\n\n${schemaListing}\n\nAvailable schema file names (use these EXACTLY for schemaFile): ${fileNameList}\n\nAnalyze these schemas and propose cubes to create. The "schemaFile" field must be one of the file names listed above (without .ts extension). The "tables" field must contain only table variable names that are actually exported from that schema file.`
        const planRaw = await callAI(ai, CUBE_PLAN_SYSTEM_PROMPT, planPrompt)
        let cubes: Array<{
          name: string
          variableName: string
          title: string
          description: string
          tables: string[]
          schemaFile: string
        }>
        try {
          cubes = JSON.parse(planRaw)
        } catch {
          // Try to extract JSON array from response
          const match = planRaw.match(/\[[\s\S]*\]/)
          if (!match) throw new Error('AI did not return valid JSON plan')
          cubes = JSON.parse(match[0])
        }

        // Validate schemaFile references — fix any that don't match actual files
        const validFileNames = new Set(schemaContext.map((s: any) => s.fileName))
        for (const cube of cubes) {
          if (!validFileNames.has(cube.schemaFile)) {
            // Default to first schema file if AI invented a file name
            cube.schemaFile = schemaContext[0].fileName
          }
        }

        send('plan', { cubes })

        // Phase 2: Generate each cube
        const generatedParts: string[] = []
        for (let i = 0; i < cubes.length; i++) {
          const cube = cubes[i]
          send('status', {
            phase: 'generating',
            message: `Generating ${cube.title}...`,
            current: i + 1,
            total: cubes.length,
          })

          const otherCubes = cubes
            .filter(c => c.name !== cube.name)
            .map(c => `- ${c.name} (variable: ${c.variableName}, tables: ${c.tables.join(', ')})`)
            .join('\n')

          const cubePrompt = `## Schema Files\n\n${schemaListing}\n\n## Available Schema Files\n${schemaContext.map((s: any) => `- ${s.fileName}.ts`).join('\n')}\n\n## Cube to Generate\n\nName: ${cube.name}\nVariable name: ${cube.variableName}\nTitle: ${cube.title}\nDescription: ${cube.description}\nTables: ${cube.tables.join(', ')}\nSchema file: ${cube.schemaFile}\n\n## Other Cubes in This File (for joins)\n\n${otherCubes || 'None'}\n\nGenerate ONLY a bare assignment — no \`let\`, \`const\`, or \`var\` keyword. Start with:\n${cube.variableName} = defineCube('${cube.name}', {\n...and end with:\n}) as Cube`

          try {
            let source = await callAI(ai, CUBE_GENERATE_ONE_SYSTEM_PROMPT, cubePrompt)
            // Strip any accidental let/const/var prefix
            source = source.replace(/^(export\s+)?(let|const|var)\s+/, '')
            generatedParts.push(source)
            send('cube_done', { index: i, name: cube.name })
          } catch (err: any) {
            send('cube_error', { index: i, name: cube.name, error: err.message })
          }
        }

        // Phase 3: Assemble final file
        send('status', { phase: 'assembling', message: 'Assembling final cube definitions...' })

        // Build imports from schema context — collect all table names used by cubes
        const tableImports = new Map<string, Set<string>>()
        for (const cube of cubes) {
          const file = cube.schemaFile
          if (!tableImports.has(file)) tableImports.set(file, new Set())
          for (const t of cube.tables) tableImports.get(file)?.add(t)
        }

        const importLines = [
          `import { eq } from 'drizzle-orm'`,
          `import { defineCube } from 'drizzle-cube/server'`,
          `import type { QueryContext, BaseQueryDefinition, Cube } from 'drizzle-cube/server'`,
        ]
        for (const [file, tables] of tableImports) {
          importLines.push(`import { ${[...tables].join(', ')} } from './${file}'`)
        }

        // Forward declarations for lazy references
        const declarations = cubes.map(c => `let ${c.variableName}: Cube`).join('\n')

        // Export all cubes so they get registered by the compiler
        const exportLine = `export const allCubes = [${cubes.map(c => c.variableName).join(', ')}]`

        const finalSource = [
          importLines.join('\n'),
          '',
          declarations,
          '',
          generatedParts.join('\n\n'),
          '',
          exportLine,
        ].join('\n')

        send('complete', { source: finalSource })
      } catch (err: any) {
        send('error', { message: err.message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})

// Get single schema file
app.get('/:id', async c => {
  const db = c.get('db') as any
  const id = Number.parseInt(c.req.param('id'))
  const result = await db
    .select()
    .from(schemaFiles)
    .where(and(eq(schemaFiles.id, id), eq(schemaFiles.organisationId, 1)))
  if (result.length === 0) return c.json({ error: 'Schema file not found' }, 404)
  return c.json(result[0])
})

// Create schema file
app.post('/', async c => {
  const db = c.get('db') as any
  const body = await c.req.json()

  const conn = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, body.connectionId), eq(connections.organisationId, 1)))
  if (conn.length === 0) return c.json({ error: 'Connection not found' }, 400)

  const result = await db
    .insert(schemaFiles)
    .values({
      name: body.name,
      sourceCode: body.sourceCode,
      connectionId: body.connectionId,
      organisationId: 1,
    })
    .returning()

  return c.json(result[0], 201)
})

// Update schema file
app.put('/:id', async c => {
  const db = c.get('db') as any
  const id = Number.parseInt(c.req.param('id'))
  const body = await c.req.json()

  const result = await db
    .update(schemaFiles)
    .set({
      name: body.name,
      sourceCode: body.sourceCode,
      updatedAt: new Date(),
    })
    .where(and(eq(schemaFiles.id, id), eq(schemaFiles.organisationId, 1)))
    .returning()

  if (result.length === 0) return c.json({ error: 'Schema file not found' }, 404)
  return c.json(result[0])
})

// Delete schema file
app.delete('/:id', async c => {
  const db = c.get('db') as any
  const id = Number.parseInt(c.req.param('id'))
  const result = await db
    .delete(schemaFiles)
    .where(and(eq(schemaFiles.id, id), eq(schemaFiles.organisationId, 1)))
    .returning()
  if (result.length === 0) return c.json({ error: 'Schema file not found' }, 404)

  // Remove schema exports from connection manager and invalidate cube app cache
  const deleted = result[0]
  const managed = connectionManager.get(deleted.connectionId)
  if (managed) {
    const name = deleted.name.replace(/\.ts$/, '')
    delete managed.schemaExports[name]
    delete managed.schemaSources[name]
  }
  invalidateCubeAppCache(deleted.connectionId)

  return c.json({ success: true })
})

// Compile a schema file
app.post('/:id/compile', async c => {
  const db = c.get('db') as any
  const id = Number.parseInt(c.req.param('id'))

  const rows = await db
    .select()
    .from(schemaFiles)
    .where(and(eq(schemaFiles.id, id), eq(schemaFiles.organisationId, 1)))
  if (rows.length === 0) return c.json({ error: 'Schema file not found' }, 404)

  const sf = rows[0]
  const result = compileSchema(sf.sourceCode)

  if (result.errors.length === 0) {
    connectionManager.compileSchemaFile(sf.connectionId, sf.name, sf.sourceCode)
    await db
      .update(schemaFiles)
      .set({ compiledAt: new Date(), compilationErrors: null })
      .where(eq(schemaFiles.id, id))
    // Schema change may affect compiled cubes — invalidate cached cube app
    invalidateCubeAppCache(sf.connectionId)
  } else {
    await db
      .update(schemaFiles)
      .set({ compilationErrors: result.errors })
      .where(eq(schemaFiles.id, id))
  }

  return c.json({
    success: result.errors.length === 0,
    errors: result.errors,
    exports: Object.keys(result.exports),
  })
})

// Generate .d.ts types for a schema file (for Monaco autocomplete)
app.get('/:id/types', async c => {
  const db = c.get('db') as any
  const id = Number.parseInt(c.req.param('id'))

  const rows = await db
    .select()
    .from(schemaFiles)
    .where(and(eq(schemaFiles.id, id), eq(schemaFiles.organisationId, 1)))
  if (rows.length === 0) return c.json({ error: 'Schema file not found' }, 404)

  const dts = generateSchemaTypes(rows[0].sourceCode)
  return c.text(dts, 200, { 'Content-Type': 'application/typescript' })
})

// Introspect a database connection using drizzle-kit pull
app.post('/introspect', async c => {
  const db = c.get('db') as any
  const body = await c.req.json()
  const { connectionId } = body

  const conn = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.organisationId, 1)))
  if (conn.length === 0) return c.json({ error: 'Connection not found' }, 400)

  // Ensure connection is managed (initialize on-demand for new connections)
  let managed = connectionManager.get(connectionId)
  if (!managed) {
    try {
      managed = await connectionManager.createConnection(
        conn[0].id,
        conn[0].connectionString,
        conn[0].engineType
      )
    } catch (err: any) {
      return c.json({ error: `Failed to connect: ${err.message}` }, 400)
    }
  }

  try {
    const { source, tables } = await runDrizzleKitPull(conn[0].connectionString, conn[0].engineType)
    return c.json({ source, tables })
  } catch (err: any) {
    return c.json({ error: `Introspection failed: ${err.message}` }, 500)
  }
})

/**
 * Run `drizzle-kit pull` as a subprocess to introspect a database.
 * Returns the generated schema.ts source code and table names.
 */
async function runDrizzleKitPull(
  connectionString: string,
  engineType = 'postgresql'
): Promise<{ source: string; tables: string[] }> {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)

  const tempDir = await mkdtemp(join(tmpdir(), 'dk-pull-'))

  try {
    // Write a temporary drizzle config
    const dialect = engineType === 'sqlite' ? 'sqlite' : 'postgresql'
    const dbCreds =
      engineType === 'sqlite'
        ? `{ url: ${JSON.stringify(connectionString.replace(/^file:/, ''))} }`
        : `{ url: ${JSON.stringify(connectionString)} }`
    const configPath = join(tempDir, 'drizzle.config.js')
    const configContent = `module.exports = {
  dialect: '${dialect}',
  out: '${tempDir}/out',
  dbCredentials: ${dbCreds},
${dialect === 'postgresql' ? "  schemaFilter: ['public'],\n" : ''}}\n`
    await import('node:fs').then(fs => fs.writeFileSync(configPath, configContent))

    // Run drizzle-kit pull
    const drizzleKitBin = join(process.cwd(), 'node_modules', '.bin', 'drizzle-kit')
    await execFileAsync(drizzleKitBin, ['pull', `--config=${configPath}`], {
      cwd: process.cwd(),
      timeout: 30000,
    })

    // Read the generated schema file and clean it up
    const schemaPath = join(tempDir, 'out', 'schema.ts')
    const rawSource = await readFile(schemaPath, 'utf-8')
    const source = stripTableExtras(rawSource)

    // Extract table names from export statements
    const tableRegex = /export const \w+ = (?:pgTable|sqliteTable)\("(\w+)"/g
    const tables: string[] = []
    for (let match = tableRegex.exec(source); match !== null; match = tableRegex.exec(source)) {
      tables.push(match[1])
    }

    return { source, tables }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Strip index/constraint/foreignKey extras from pgTable() calls.
 * drizzle-kit generates a 3rd argument `(table) => [...]` with indexes etc.
 * that can contain complex/invalid TS for exotic index types (BM25, GIN, etc).
 * We only need columns for schema definitions, so remove the extras and
 * clean up unused imports.
 */
function stripTableExtras(source: string): string {
  let result = source
  const extraPattern = /\},\s*\(table\)\s*=>\s*\[/g
  const removals: Array<{ start: number; end: number }> = []

  for (let m = extraPattern.exec(source); m !== null; m = extraPattern.exec(source)) {
    const startOfExtras = m.index + 1 // position of the comma after `}`
    let depth = 1
    let i = m.index + m[0].length
    while (i < source.length && depth > 0) {
      if (source[i] === '[') depth++
      else if (source[i] === ']') depth--
      i++
    }
    // Skip past optional whitespace and `)`
    while (i < source.length && /\s/.test(source[i])) i++
    if (source[i] === ')') i++ // skip the closing paren of pgTable()
    removals.push({ start: startOfExtras, end: i })
  }

  // Apply removals in reverse order
  for (const { start, end } of removals.reverse()) {
    result = `${result.slice(0, start)})${result.slice(end)}`
  }

  // Clean up imports: remove unused imports that were only for indexes/constraints
  const indexOnlyImports = [
    'index',
    'uniqueIndex',
    'unique',
    'foreignKey',
    'check',
    'primaryKey',
    'pgPolicy',
  ]
  for (const imp of indexOnlyImports) {
    // Only remove if not actually used in the cleaned source (outside the import line)
    const importPattern = new RegExp(`\\b${imp}\\b`)
    const withoutImports = result.replace(/^import\s+\{[^}]+\}\s+from\s+.+$/gm, '')
    if (!importPattern.test(withoutImports)) {
      // Remove from import list
      result = result.replace(new RegExp(`,\\s*${imp}\\b|\\b${imp}\\s*,?`), '')
    }
  }

  // Also remove `import { sql } from "drizzle-orm"` if sql is no longer used
  const withoutImports = result.replace(/^import\s+\{[^}]+\}\s+from\s+.+$/gm, '')
  if (!/\bsql\b/.test(withoutImports)) {
    result = result.replace(/^import\s*\{\s*sql\s*\}\s*from\s*["']drizzle-orm["']\s*;?\s*\n?/m, '')
  }

  // Clean up empty/malformed import lines
  result = result.replace(/import\s*\{\s*\}\s*from\s*.+\n?/g, '')
  // Clean up trailing commas or spaces in import braces
  result = result.replace(/\{\s*,/g, '{').replace(/,\s*\}/g, ' }')

  return result
}

/**
 * Call configured AI provider to generate text.
 */
async function callAI(
  ai: { provider?: string; apiKey?: string; model?: string; baseUrl?: string },
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (ai.provider === 'anthropic') {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: ai.apiKey })
    const stream = await client.messages.stream({
      model: ai.model || 'claude-sonnet-4-6',
      max_tokens: 16384,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const response = await stream.finalMessage()
    const textBlock = response.content.find((b: any) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from AI')
    return extractCodeBlock(textBlock.text)
  }

  if (ai.provider === 'openai') {
    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey: ai.apiKey, ...(ai.baseUrl && { baseURL: ai.baseUrl }) })
    const response = await client.chat.completions.create({
      model: ai.model || 'gpt-4.1-mini',
      max_tokens: 65536,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })
    const text = response.choices[0]?.message?.content
    if (!text) throw new Error('No text response from AI')
    return extractCodeBlock(text)
  }

  if (ai.provider === 'google') {
    const model = ai.model || 'gemini-3-flash-preview'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${ai.apiKey}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 65536 },
      }),
    })
    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Gemini API error (${response.status}): ${errText.substring(0, 200)}`)
    }
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text)
      .join('\n')
    if (!text) throw new Error('No text response from AI')
    return extractCodeBlock(text)
  }

  throw new Error(`Unsupported AI provider: ${ai.provider}`)
}

/**
 * Extract code from markdown code blocks if present, otherwise return as-is.
 */
function extractCodeBlock(text: string): string {
  const match = text.match(/```(?:typescript|ts)?\s*\n([\s\S]*?)```/)
  return match ? match[1].trim() : text.trim()
}

const CUBE_PLAN_SYSTEM_PROMPT = `You are an expert at analyzing database schemas and planning analytical cube definitions for a semantic layer.

Given Drizzle ORM schema files, analyze the tables and propose cubes to create. Focus on analytically useful tables — skip junction tables, migration tables, system/config tables, and audit logs unless they contain valuable metrics.

Respond with ONLY a JSON array (no markdown, no explanation). Each element must have:
- "name": The cube name (PascalCase, e.g. "Users", "Orders")
- "variableName": The JS variable name (camelCase + "Cube", e.g. "usersCube", "ordersCube")
- "title": Human-readable title (e.g. "User Analytics")
- "description": One-line description of what analytics this cube enables
- "tables": Array of Drizzle table variable names this cube uses (usually just one, e.g. ["users"])
- "schemaFile": The schema file name (without .ts) where the tables are defined

Example response:
[
  { "name": "Users", "variableName": "usersCube", "title": "User Analytics", "description": "User accounts, activity, and demographics", "tables": ["users"], "schemaFile": "schema" },
  { "name": "Orders", "variableName": "ordersCube", "title": "Order Analytics", "description": "Order volume, revenue, and status tracking", "tables": ["orders"], "schemaFile": "schema" }
]`

const CUBE_GENERATE_ONE_SYSTEM_PROMPT = `You are an expert at creating Drizzle Cube semantic layer definitions. Generate a SINGLE cube definition.

## Rules
- Output ONLY the cube assignment code — NO imports, NO markdown fences, NO explanation, NO \`let\`/\`const\`/\`var\` keyword
- Start directly with: \`variableName = defineCube('CubeName', {\`
- Cast as \`Cube\` at the end: \`}) as Cube\`
- Every dimension MUST have a \`name\` property matching its key
- Every measure MUST have a \`name\` property matching its key
- Measures have ONLY these properties: \`name\`, \`title\`, \`type\`, \`sql\`, and optionally \`filters\` — do NOT add \`format\` or other properties
- Set \`primaryKey: true\` on the ID column dimension
- Use camelCase for dimension/measure keys matching the Drizzle column property names
- For joins, use lazy \`() => otherCube\` references to the variable names of other cubes listed in the prompt
- If cube A belongsTo B, the reverse join (B hasMany A) should also exist — but you only generate this cube, so just define this cube's joins
- If the table has organisationId/orgId/tenantId, add security filtering with a cast: \`where: eq(table.orgColumn, ctx.securityContext.organisationId as number)\`
- If the table has no multi-tenant column, omit the where clause
- Only reference table variables that exist in the schema files provided

## Dimension types: 'string' | 'number' | 'time' | 'boolean'
## Measure types: 'count' | 'countDistinct' | 'sum' | 'avg' | 'min' | 'max' | 'runningTotal'
## Relationship types: 'belongsTo' | 'hasOne' | 'hasMany' | 'belongsToMany'

Example output (note: NO let/const, just bare assignment):
usersCube = defineCube('Users', {
  title: 'User Analytics',
  description: 'User accounts and profiles',
  sql: (ctx: QueryContext): BaseQueryDefinition => ({
    from: users,
    where: eq(users.organisationId, ctx.securityContext.organisationId as number)
  }),
  joins: {
    Orders: { targetCube: () => ordersCube, relationship: 'hasMany', on: [{ source: users.id, target: orders.userId }] }
  },
  dimensions: {
    id: { name: 'id', title: 'User ID', type: 'number', sql: users.id, primaryKey: true },
    name: { name: 'name', title: 'Name', type: 'string', sql: users.name },
  },
  measures: {
    count: { name: 'count', title: 'Total Users', type: 'count', sql: users.id },
  }
}) as Cube`

export default app
