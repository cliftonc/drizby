/**
 * Schema files API
 * CRUD + compile + introspect for Drizzle schema files
 */

import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { invalidateCubeAppCache } from '../../app'
import { connections, cubeDefinitions, schemaFiles } from '../../schema'
import { guardPermission } from '../permissions/guard'
import { getAISettings } from '../services/ai-settings'
import { connectionManager } from '../services/connection-manager'
import { compileSchema, generateSchemaTypes } from '../services/cube-compiler'
import { buildDrizzleKitConfig } from '../services/provider-registry'

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

/**
 * Generate a unique name for a file. Queries existing names for the connection
 * and appends -2, -3, etc. if the base name is taken.
 */
async function autoName(
  db: any,
  table: typeof schemaFiles | typeof cubeDefinitions,
  baseName: string,
  connectionId: number,
  orgId = 1
): Promise<string> {
  const existing = await db
    .select({ name: table.name })
    .from(table)
    .where(and(eq(table.connectionId, connectionId), eq(table.organisationId, orgId)))
  const names = new Set(existing.map((r: any) => r.name))
  if (!names.has(baseName)) return baseName
  const dot = baseName.lastIndexOf('.')
  const [stem, ext] = dot > 0 ? [baseName.slice(0, dot), baseName.slice(dot)] : [baseName, '']
  let i = 2
  while (names.has(`${stem}-${i}${ext}`)) i++
  return `${stem}-${i}${ext}`
}

// List all schema files
app.get('/', async c => {
  const db = c.get('db') as any
  const result = await db.select().from(schemaFiles).where(eq(schemaFiles.organisationId, 1))
  return c.json(result)
})

// Plan cubes — AI analyzes schemas and proposes cubes to generate (plain JSON)
app.post('/plan-cubes', async c => {
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

  // Load existing cubes so the AI can skip them — extract cube names from source code
  const existingCubeDefs = await db
    .select({ sourceCode: cubeDefinitions.sourceCode, title: cubeDefinitions.title })
    .from(cubeDefinitions)
    .where(
      and(eq(cubeDefinitions.connectionId, connectionId), eq(cubeDefinitions.organisationId, 1))
    )

  const existingCubeNames: string[] = []
  for (const cd of existingCubeDefs) {
    if (!cd.sourceCode) continue
    // Extract cube name(s) from defineCube('CubeName', ...) calls
    const matches = cd.sourceCode.matchAll(/defineCube\(\s*['"](\w+)['"]/g)
    for (const m of matches) existingCubeNames.push(m[1])
  }

  const fileNameList = schemaContext.map((s: any) => s.fileName).join(', ')
  const existingSection =
    existingCubeNames.length > 0
      ? `\n\nExisting cubes for this connection (do NOT recreate these):\n${existingCubeNames.map(n => `- ${n}`).join('\n')}`
      : ''
  const planPrompt = `Here are the Drizzle ORM schema files:\n\n${schemaListing}\n\nAvailable schema file names (use these EXACTLY for schemaFile): ${fileNameList}${existingSection}\n\nAnalyze these schemas and propose cubes to create. The "schemaFile" field must be one of the file names listed above (without .ts extension). The "tables" field must contain only table variable names that are actually exported from that schema file.`

  try {
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
      const match = planRaw.match(/\[[\s\S]*\]/)
      if (!match) throw new Error('AI did not return valid JSON plan')
      cubes = JSON.parse(match[0])
    }

    // Validate schemaFile references
    const validFileNames = new Set(schemaContext.map((s: any) => s.fileName))
    for (const cube of cubes) {
      if (!validFileNames.has(cube.schemaFile)) {
        cube.schemaFile = schemaContext[0].fileName
      }
    }

    return c.json({ cubes })
  } catch (err: any) {
    return c.json({ error: `AI planning failed: ${err.message}` }, 500)
  }
})

// Generate selected cubes — SSE endpoint, saves each cube individually
app.post('/generate-selected-cubes', async c => {
  const db = c.get('db') as any
  const body = await c.req.json()
  const { connectionId, selectedCubes } = body

  const conn = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.organisationId, 1)))
  if (conn.length === 0) return c.json({ error: 'Connection not found' }, 400)

  const schemas = await db
    .select()
    .from(schemaFiles)
    .where(and(eq(schemaFiles.connectionId, connectionId), eq(schemaFiles.organisationId, 1)))

  const ai = await getAISettings(db)
  if (!ai.apiKey || !ai.provider) {
    return c.json({ error: 'AI is not configured' }, 400)
  }

  const schemaContext = schemas.map((sf: any) => ({
    fileName: sf.name.replace(/\.ts$/, ''),
    source: sf.sourceCode,
  }))

  const schemaListing = schemaContext
    .map((s: any) => `// File: ${s.fileName}.ts\n${s.source}`)
    .join('\n\n')

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(
          new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      try {
        for (let i = 0; i < selectedCubes.length; i++) {
          const cube = selectedCubes[i]
          send('status', {
            message: `Generating ${cube.title}...`,
            current: i + 1,
            total: selectedCubes.length,
          })

          const cubePrompt = `## Schema Files\n\n${schemaListing}\n\n## Available Schema Files\n${schemaContext.map((s: any) => `- ${s.fileName}.ts`).join('\n')}\n\n## Cube to Generate\n\nName: ${cube.name}\nVariable name: ${cube.variableName}\nTitle: ${cube.title}\nDescription: ${cube.description}\nTables: ${cube.tables.join(', ')}\nSchema file: ${cube.schemaFile}\n\nGenerate ONLY a bare assignment — no \`let\`, \`const\`, or \`var\` keyword. Start with:\n${cube.variableName} = defineCube('${cube.name}', {\n...and end with:\n}) as Cube\n\nDo NOT include any joins — joins will be added in a separate step.`

          try {
            let source = await callAI(ai, CUBE_GENERATE_ONE_SYSTEM_PROMPT, cubePrompt)
            // Strip any accidental let/const/var prefix
            source = source.replace(/^(export\s+)?(let|const|var)\s+/, '')

            // Build self-contained source file
            const tableImports = new Set(cube.tables)
            // Only import eq if the AI-generated source actually uses it (e.g. for filtered measures)
            const needsEq = source.includes('eq(')
            const importLines = [
              ...(needsEq ? [`import { eq } from 'drizzle-orm'`] : []),
              `import { defineCube } from 'drizzle-cube/server'`,
              `import type { QueryContext, BaseQueryDefinition, Cube } from 'drizzle-cube/server'`,
              `import { ${[...tableImports].join(', ')} } from './${cube.schemaFile}'`,
            ]
            const fullSource = [
              importLines.join('\n'),
              '',
              `let ${cube.variableName}: Cube`,
              '',
              source,
              '',
              `export { ${cube.variableName} }`,
            ].join('\n')

            // Auto-name and save (with .ts suffix for consistency)
            const fileName = await autoName(
              db,
              cubeDefinitions,
              `${cube.variableName}.ts`,
              connectionId
            )
            const result = await db
              .insert(cubeDefinitions)
              .values({
                name: fileName,
                title: cube.title,
                description: cube.description,
                sourceCode: fullSource,
                connectionId,
                organisationId: 1,
              })
              .returning()

            send('cube_saved', {
              index: i,
              name: cube.name,
              fileId: result[0].id,
              fileName,
            })
          } catch (err: any) {
            send('cube_error', { index: i, name: cube.name, error: err.message })
          }
        }

        send('complete', {})
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

// Plan joins — AI proposes joins between all cubes for a connection
app.post('/plan-joins', async c => {
  const db = c.get('db') as any
  const body = await c.req.json()
  const { connectionId } = body

  const ai = await getAISettings(db)
  if (!ai.apiKey || !ai.provider) {
    return c.json({ error: 'AI is not configured' }, 400)
  }

  // Gather all cube definitions for this connection
  const allCubes = await db
    .select()
    .from(cubeDefinitions)
    .where(
      and(eq(cubeDefinitions.connectionId, connectionId), eq(cubeDefinitions.organisationId, 1))
    )

  if (allCubes.length < 2) {
    return c.json({ proposals: [] })
  }

  // Gather schemas for context
  const schemas = await db
    .select()
    .from(schemaFiles)
    .where(and(eq(schemaFiles.connectionId, connectionId), eq(schemaFiles.organisationId, 1)))

  const schemaListing = schemas
    .map((sf: any) => `// File: ${sf.name.replace(/\.ts$/, '')}.ts\n${sf.sourceCode}`)
    .join('\n\n')

  const cubeListing = allCubes
    .map((cd: any) => `// Cube file: ${cd.name}\n${cd.sourceCode}`)
    .join('\n\n')

  const joinPrompt = `## Schema Files\n\n${schemaListing}\n\n## Existing Cube Definitions\n\n${cubeListing}\n\nAnalyze these cubes and schemas. Identify valid joins between cubes using string-based targetCube (e.g. targetCube: 'CubeName'). Do NOT modify existing joins that are already correct. Return ONLY cubes that need NEW joins added.\n\nThe cube variable names and cube names (from defineCube('Name', ...)) are listed above.`

  try {
    const raw = await callAI(ai, CUBE_JOINS_SYSTEM_PROMPT, joinPrompt)
    let proposals: Array<{
      variableName: string
      joins: Record<string, { targetCube: string; relationship: string; on: any }>
    }>
    try {
      proposals = JSON.parse(raw)
    } catch {
      const match = raw.match(/\[[\s\S]*\]/)
      if (!match) throw new Error('AI did not return valid JSON')
      proposals = JSON.parse(match[0])
    }

    // Map variableName to cubeDefId
    const result = proposals
      .map(p => {
        const cubeDef = allCubes.find((cd: any) => {
          // Match by variable name in source or by cube name
          return (
            cd.sourceCode?.includes(`${p.variableName} = defineCube`) || cd.name === p.variableName
          )
        })
        if (!cubeDef) return null
        return {
          cubeDefId: cubeDef.id,
          cubeName: cubeDef.name,
          joins: p.joins,
        }
      })
      .filter(Boolean)

    return c.json({ proposals: result })
  } catch (err: any) {
    return c.json({ error: `AI join planning failed: ${err.message}` }, 500)
  }
})

// Apply selected joins — use LLM to safely add joins + imports to cube source code
app.post('/apply-joins', async c => {
  const db = c.get('db') as any
  const body = await c.req.json()
  const { connectionId, selectedJoins } = body
  // selectedJoins: Array<{ cubeDefId, cubeName, joins: Record<string, JoinDef> }>

  const ai = await getAISettings(db)
  if (!ai.apiKey || !ai.provider) {
    return c.json({ error: 'AI is not configured' }, 400)
  }

  // Load schemas for context (needed so AI knows which imports to add)
  const schemas = await db
    .select()
    .from(schemaFiles)
    .where(and(eq(schemaFiles.connectionId, connectionId), eq(schemaFiles.organisationId, 1)))

  const schemaListing = schemas
    .map((sf: any) => `// File: ${sf.name.replace(/\.ts$/, '')}.ts\n${sf.sourceCode}`)
    .join('\n\n')

  const updated: Array<{ cubeDefId: number; cubeName: string }> = []

  for (const proposal of selectedJoins) {
    const rows = await db
      .select()
      .from(cubeDefinitions)
      .where(and(eq(cubeDefinitions.id, proposal.cubeDefId), eq(cubeDefinitions.organisationId, 1)))

    if (rows.length === 0) continue
    const cubeDef = rows[0]
    if (!cubeDef.sourceCode) continue

    // Build a description of joins to add
    const joinsDesc = Object.entries(proposal.joins)
      .map(([name, join]: [string, any]) => {
        const onStr = typeof join.on === 'string' ? join.on : JSON.stringify(join.on)
        let desc = `- ${name}: targetCube: '${join.targetCube}', relationship: '${join.relationship}', on: ${onStr}`
        if (join.through) {
          const throughStr =
            typeof join.through === 'string' ? join.through : JSON.stringify(join.through)
          desc += `, through: ${throughStr}`
        }
        return desc
      })
      .join('\n')

    const editPrompt = `## Schema Files (for reference — shows which tables are exported from which files)\n\n${schemaListing}\n\n## Current Cube Source Code\n\n\`\`\`typescript\n${cubeDef.sourceCode}\n\`\`\`\n\n## Joins to Add\n\n${joinsDesc}\n\nReturn the COMPLETE updated cube source code with:\n1. The joins block added (or merged with existing joins)\n2. Any new schema file imports added for tables referenced in the join \`on\` clauses and \`through.table\` (e.g. if the join references \`users.id\` or \`through: { table: timeEntries, ... }\`, ensure the file imports those tables from the correct schema file)\n3. All existing code preserved exactly as-is otherwise`

    try {
      const newSource = await callAI(ai, CUBE_APPLY_JOINS_SYSTEM_PROMPT, editPrompt)
      await db
        .update(cubeDefinitions)
        .set({ sourceCode: newSource, updatedAt: new Date() })
        .where(eq(cubeDefinitions.id, proposal.cubeDefId))
      updated.push({ cubeDefId: proposal.cubeDefId, cubeName: proposal.cubeName })
    } catch {
      // Skip this cube if AI edit fails — don't block others
    }
  }

  return c.json({ updated })
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
  const result = await compileSchema(sf.sourceCode)

  if (result.errors.length === 0) {
    await connectionManager.compileSchemaFile(sf.connectionId, sf.name, sf.sourceCode)
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

// Introspect a database connection using drizzle-kit pull — returns source + tables for review
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
    const { source, tables } = await runDrizzleKitPull(
      conn[0].connectionString,
      conn[0].engineType,
      conn[0].provider
    )
    return c.json({ source, tables })
  } catch (err: any) {
    return c.json({ error: `Introspection failed: ${err.message}` }, 500)
  }
})

// Save introspected schema after user review
app.post('/introspect/save', async c => {
  const db = c.get('db') as any
  const body = await c.req.json()
  const { connectionId, sourceCode, selectedTables } = body

  const conn = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.organisationId, 1)))
  if (conn.length === 0) return c.json({ error: 'Connection not found' }, 400)

  // If user deselected some tables, use LLM to produce a clean filtered schema
  let finalSource = sourceCode
  if (selectedTables && Array.isArray(selectedTables)) {
    const ai = await getAISettings(db)
    if (!ai.apiKey) return c.json({ error: 'AI not configured — cannot filter tables' }, 400)

    finalSource = await callAI(
      ai,
      SCHEMA_FILTER_SYSTEM_PROMPT,
      `Here is the full introspected Drizzle schema:\n\n\`\`\`typescript\n${sourceCode}\n\`\`\`\n\nKeep ONLY these tables: ${selectedTables.join(', ')}\n\nRemove all other table definitions. Keep all enum declarations, type definitions, and imports that are still used. Remove \`.references(...)\` calls that point to removed tables. Clean up unused imports. Return the complete valid TypeScript source.`
    )

    if (!finalSource.trim())
      return c.json({ error: 'AI returned empty result when filtering schema' }, 500)
  }

  const name = await autoName(db, schemaFiles, 'schema.ts', connectionId)
  const result = await db
    .insert(schemaFiles)
    .values({
      name,
      sourceCode: finalSource,
      connectionId,
      organisationId: 1,
    })
    .returning()

  return c.json({ file: result[0] })
})

/**
 * Run `drizzle-kit pull` as a subprocess to introspect a database.
 * Returns the generated schema.ts source code and table names.
 */
async function runDrizzleKitPull(
  connectionString: string,
  engineType = 'postgresql',
  provider?: string | null
): Promise<{ source: string; tables: string[] }> {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)

  const tempDir = await mkdtemp(join(tmpdir(), 'dk-pull-'))

  try {
    const dkConfig = await buildDrizzleKitConfig(
      connectionString,
      engineType,
      provider,
      `${tempDir}/out`
    )
    const configPath = join(tempDir, 'drizzle.config.js')
    const configContent = `module.exports = ${JSON.stringify(dkConfig, null, 2)};\n`
    await import('node:fs').then(fs => fs.writeFileSync(configPath, configContent))

    // Run drizzle-kit pull (large maxBuffer for big schemas with spinner output)
    const drizzleKitBin = join(process.cwd(), 'node_modules', '.bin', 'drizzle-kit')
    try {
      await execFileAsync(drizzleKitBin, ['pull', `--config=${configPath}`], {
        cwd: process.cwd(),
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024, // 10MB — drizzle-kit spinner produces lots of output
      })
    } catch (execErr: any) {
      // Filter out non-fatal warnings (SSL, deprecation) from the error message
      const stderrMsg = (execErr.stderr || '').replace(/\(node:\d+\) Warning:.*\n?/g, '').trim()
      const stdoutMsg = (execErr.stdout || '').trim()
      const msg = stderrMsg || stdoutMsg || execErr.message
      throw new Error(`drizzle-kit pull failed: ${msg}`)
    }

    // Read the generated schema file — drizzle-kit may output schema.ts or relations.ts etc.
    const { readdir } = await import('node:fs/promises')
    const outDir = join(tempDir, 'out')
    let schemaPath: string
    try {
      const files = await readdir(outDir)
      console.log('[drizzle-kit pull] output files:', files)
      const tsFile =
        files.find(f => f.endsWith('.ts') && !f.startsWith('relations')) ||
        files.find(f => f.endsWith('.ts'))
      if (!tsFile)
        throw new Error(
          `No .ts files generated by drizzle-kit pull (found: ${files.join(', ') || 'nothing'})`
        )
      schemaPath = join(outDir, tsFile)
    } catch (err: any) {
      if (err.code === 'ENOENT')
        throw new Error(
          'drizzle-kit pull produced no output — check your connection string and database access'
        )
      throw err
    }
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
      max_tokens: 32768,
      temperature: 0,
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
      max_tokens: 32768,
      temperature: 0,
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
    const model = ai.model || 'gemini-3.1-flash-lite-preview'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${ai.apiKey}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 32768, temperature: 0 },
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
  const match = text.match(/```(?:typescript|ts|json)?\s*\n([\s\S]*?)```/)
  return match ? match[1].trim() : text.trim()
}

const CUBE_PLAN_SYSTEM_PROMPT = `You are an expert at analyzing database schemas and planning analytical cube definitions for a semantic layer.

Given Drizzle ORM schema files, analyze the tables and propose cubes to create.

Include:
- Fact tables with metrics (orders, transactions, events, productivity records, etc.)
- Dimension/lookup tables that other tables reference via foreign keys (departments, categories, users, products, regions, etc.) — these are essential for grouping and filtering across cubes via joins
- Any table with analytically useful data

Skip:
- Pure junction/bridge tables that exist solely to link two other tables (e.g. order_products with only two FK columns)
- Migration tracking tables, system/config tables, session tables, and password/token tables
- Tables that already have cubes (listed as "Existing cubes" in the prompt) — do NOT propose cubes for tables that are already covered

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

## How to read Drizzle ORM schemas

Drizzle schemas define tables using \`pgTable()\`, \`sqliteTable()\`, or \`mysqlTable()\`. Each column has a type function and optional modifiers:

### Column types → Dimension types
- \`text()\`, \`varchar()\`, \`char()\` → dimension type \`'string'\`
- \`integer()\`, \`bigint()\`, \`smallint()\`, \`real()\`, \`doublePrecision()\`, \`numeric()\`, \`decimal()\`, \`serial()\` → dimension type \`'number'\`
- \`timestamp()\`, \`date()\`, \`integer('...', { mode: 'timestamp' })\` → dimension type \`'time'\`
- \`boolean()\`, \`integer('...', { mode: 'boolean' })\` → dimension type \`'boolean'\`

### Column modifiers to watch for
- \`.primaryKey()\` — mark this dimension with \`primaryKey: true\`
- \`.notNull()\` — column is required (good for measures since it won't have nulls)
- \`.default()\` / \`.$defaultFn()\` — has a default value
- \`.references(() => otherTable.column)\` — foreign key (skip as dimension, used for joins in a later step)

### Column naming → Dimension/Measure keys
Use the Drizzle JS property name (camelCase) as the dimension/measure key, NOT the SQL column name in quotes. Example:
\`\`\`
createdAt: integer('created_at', { mode: 'timestamp' })  // key is "createdAt", not "created_at"
departmentId: integer('department_id')                     // key is "departmentId"
\`\`\`

### Which columns to include
- **Include as dimensions**: All columns that are useful for grouping, filtering, or display. This means most string, number, time, and boolean columns.
- **Skip as dimensions**: Internal FK columns (like \`userId\`, \`departmentId\`) — these are used for joins, not for direct querying. Also skip internal columns like \`organisationId\`, \`tenantId\`, \`passwordHash\`, etc.
- **Include as measures**: Create aggregate measures from numeric columns (sum, avg, min, max) and always include a \`count\` measure on the primary key. For boolean columns, consider a filtered count measure.

## Output rules
- Output ONLY the cube assignment code — NO imports, NO markdown fences, NO explanation, NO \`let\`/\`const\`/\`var\` keyword
- Start directly with: \`variableName = defineCube('CubeName', {\`
- Cast as \`Cube\` at the end: \`) as Cube\`
- Every dimension MUST have a \`name\` property matching its key
- Every measure MUST have a \`name\` property matching its key
- Measures have ONLY these properties: \`name\`, \`title\`, \`type\`, \`sql\`, and optionally \`filters\` — do NOT add \`format\` or other properties
- Set \`primaryKey: true\` on the ID column dimension
- Do NOT include any \`joins\` property — joins will be added in a separate step. Never use \`eq()\` for joins.
- Do NOT add a \`where\` clause to the \`sql\` block — security context filtering is not currently supported
- Only reference table variables that exist in the schema files provided
- Reference columns using the Drizzle table variable: \`tableName.columnProperty\` (e.g. \`orders.createdAt\`, NOT \`orders.created_at\`)

## Dimension types: 'string' | 'number' | 'time' | 'boolean'
## Measure types: 'count' | 'countDistinct' | 'sum' | 'avg' | 'min' | 'max' | 'runningTotal'

Example — given this schema:
\`\`\`
export const employees = sqliteTable('employees', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  salary: real('salary'),
  active: integer('active', { mode: 'boolean' }).default(true),
  departmentId: integer('department_id'),
  createdAt: integer('created_at', { mode: 'timestamp' })
})
\`\`\`

Output (note: NO let/const, just bare assignment):
employeesCube = defineCube('Employees', {
  title: 'Employee Analytics',
  description: 'Employee data and metrics',
  sql: (): BaseQueryDefinition => ({
    from: employees
  }),
  dimensions: {
    id: { name: 'id', title: 'Employee ID', type: 'number', sql: employees.id, primaryKey: true },
    name: { name: 'name', title: 'Name', type: 'string', sql: employees.name },
    salary: { name: 'salary', title: 'Salary', type: 'number', sql: employees.salary },
    active: { name: 'active', title: 'Active', type: 'boolean', sql: employees.active },
    createdAt: { name: 'createdAt', title: 'Hire Date', type: 'time', sql: employees.createdAt }
  },
  measures: {
    count: { name: 'count', title: 'Total Employees', type: 'countDistinct', sql: employees.id },
    activeCount: { name: 'activeCount', title: 'Active Employees', type: 'countDistinct', sql: employees.id, filters: [() => eq(employees.active, true)] },
    avgSalary: { name: 'avgSalary', title: 'Average Salary', type: 'avg', sql: employees.salary },
    totalSalary: { name: 'totalSalary', title: 'Total Salary', type: 'sum', sql: employees.salary },
    maxSalary: { name: 'maxSalary', title: 'Max Salary', type: 'max', sql: employees.salary },
    minSalary: { name: 'minSalary', title: 'Min Salary', type: 'min', sql: employees.salary }
  }
}) as Cube`

const CUBE_JOINS_SYSTEM_PROMPT = `You are an expert at defining joins between Drizzle Cube semantic layer cubes.

Given cube definitions and their underlying Drizzle ORM schema files, identify valid joins between cubes.

## How to read Drizzle schemas for relationships

Drizzle ORM schemas define tables with \`pgTable()\` or \`sqliteTable()\`. Relationships between tables are expressed in two ways — you must check BOTH:

### 1. Explicit foreign keys via \`.references()\`
Columns may have \`.references(() => otherTable.column)\` which defines a direct FK relationship:
\`\`\`
export const orders = pgTable('orders', {
  id: integer('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),  // FK: orders.userId → users.id
  productId: integer('product_id').references(() => products.id),
})
\`\`\`
Here \`orders.userId\` references \`users.id\`, meaning Orders belongsTo Users, and Users hasMany Orders.

### 2. Implicit foreign keys via naming convention
Even without \`.references()\`, columns named \`fooId\` or \`foo_id\` typically reference the \`id\` column of a table named \`foo\` / \`foos\`:
\`\`\`
export const employees = sqliteTable('employees', {
  id: integer('id').primaryKey(),
  departmentId: integer('department_id'),  // implicit FK → departments.id
})
\`\`\`
Match these by comparing column names against table variable names in the schema. The Drizzle variable name (e.g. \`departments\`) is what you use in the \`on\` clause, NOT the SQL table name.

### 3. Junction / many-to-many tables
Tables with two FK columns and few other columns are typically junction tables for many-to-many relationships:
\`\`\`
export const orderProducts = pgTable('order_products', {
  orderId: integer('order_id').references(() => orders.id),
  productId: integer('product_id').references(() => products.id),
})
\`\`\`
If a cube exists for the junction table, it belongsTo both sides. The parent cubes each hasMany the junction cube.

## Determining relationship direction
- If table A has a column referencing table B's primary key → Cube A \`belongsTo\` Cube B, and Cube B \`hasMany\` Cube A
- If table A has a unique constraint on the FK column → use \`hasOne\` instead of \`hasMany\`
- Always create BOTH directions of a join (the belongsTo on one side AND the hasMany on the other)

## Join output rules
- Use string-based targetCube: \`targetCube: 'CubeName'\` (the cube name from \`defineCube('CubeName', ...)\`, NOT the variable name)
- Do NOT modify or repeat existing joins that are already correct
- Only propose joins for cubes that need NEW joins
- The "on" field uses \`{ source, target }\` object literals — NEVER use \`eq()\` calls
  - Correct: \`on: [{ source: orders.userId, target: users.id }]\`
  - WRONG: \`on: [eq(orders.userId, users.id)]\`
- The same applies to \`through.sourceKey\` and \`through.targetKey\` — use \`{ source, target }\` objects, NOT \`eq()\`
- The "on" field references Drizzle column expressions using the table VARIABLE names from the schema (e.g. \`orders.userId\`, \`users.id\`)
- The join key name should be the target cube's PascalCase name (e.g. "Users", "Departments")

## Relationship types: 'belongsTo' | 'hasOne' | 'hasMany' | 'belongsToMany'

### Direct joins (belongsTo / hasOne / hasMany)
These use an \`on\` array with source/target column pairs:
\`\`\`
{ targetCube: 'Users', relationship: 'belongsTo', on: [{ source: orders.userId, target: users.id }] }
\`\`\`

### Many-to-many joins (belongsToMany)
When two cubes are connected through a junction/pivot table, use \`belongsToMany\` with \`on: []\` (empty array, REQUIRED) and a \`through\` property. The junction table connects the two sides:
\`\`\`
{
  targetCube: 'Departments',
  relationship: 'belongsToMany',
  on: [],
  through: {
    table: timeEntries,
    sourceKey: [{ source: employees.id, target: timeEntries.employeeId }],
    targetKey: [{ source: timeEntries.departmentId, target: departments.id }]
  }
}
\`\`\`
- \`through.table\`: the junction/pivot table variable from the schema
- \`through.sourceKey\`: how the source cube's table connects to the junction table
- \`through.targetKey\`: how the junction table connects to the target cube's table
- BOTH sides of a many-to-many should get a \`belongsToMany\` join (with sourceKey/targetKey swapped)

### How to identify many-to-many relationships
If table C has FK columns pointing to both table A and table B, and cubes exist for A and B:
- Cube A belongsToMany Cube B through table C
- Cube B belongsToMany Cube A through table C
This is PREFERRED over creating hasMany joins to a junction cube when the goal is to relate the two main entities.

## Output format

Respond with ONLY a JSON array (no markdown, no explanation). Each element must have:
- "variableName": The JS variable name of the cube that needs joins added (e.g. "ordersCube")
- "joins": Object of joins to add, where each key is the join name and value has:
  - For direct joins: { targetCube, relationship, on } where \`on\` is a string of the source code
  - For belongsToMany: { targetCube, relationship, on, through } where \`through\` is a string of the source code

The "on" and "through" fields should be strings containing actual source code, e.g.:
- Direct: "on": "[{ source: orders.userId, target: users.id }]"
- Many-to-many: "on": "[]", "through": "{ table: orderProducts, sourceKey: [{ source: orders.id, target: orderProducts.orderId }], targetKey: [{ source: orderProducts.productId, target: products.id }] }"

Example — direct join with \`orders.userId → users.id\`:
[
  { "variableName": "ordersCube", "joins": { "Users": { "targetCube": "Users", "relationship": "belongsTo", "on": "[{ source: orders.userId, target: users.id }]" } } },
  { "variableName": "usersCube", "joins": { "Orders": { "targetCube": "Orders", "relationship": "hasMany", "on": "[{ source: users.id, target: orders.userId }]" } } }
]

Example — many-to-many with junction table \`studentCourses\`:
[
  { "variableName": "studentsCube", "joins": { "Courses": { "targetCube": "Courses", "relationship": "belongsToMany", "on": "[]", "through": "{ table: studentCourses, sourceKey: [{ source: students.id, target: studentCourses.studentId }], targetKey: [{ source: studentCourses.courseId, target: courses.id }] }" } } },
  { "variableName": "coursesCube", "joins": { "Students": { "targetCube": "Students", "relationship": "belongsToMany", "on": "[]", "through": "{ table: studentCourses, sourceKey: [{ source: courses.id, target: studentCourses.courseId }], targetKey: [{ source: studentCourses.studentId, target: students.id }] }" } } }
]

If no joins are needed, return an empty array: []`

const CUBE_APPLY_JOINS_SYSTEM_PROMPT = `You are an expert at editing Drizzle Cube source files. Your job is to add joins to an existing cube definition file.

## Rules
- Return ONLY the complete updated TypeScript source code — NO markdown fences, NO explanation
- Preserve ALL existing code exactly as-is (imports, dimensions, measures, etc.)
- Add or merge the requested joins into the cube's \`joins\` property
- Use string-based targetCube: \`targetCube: 'CubeName'\`
- If the cube already has a \`joins\` block, add the new joins to it without removing existing ones
- If the cube has no \`joins\` block, add one between the \`sql\` and \`dimensions\` blocks
- For \`belongsToMany\` joins, you MUST include \`on: []\` (empty array) AND the \`through\` property with \`table\`, \`sourceKey\`, and \`targetKey\`. The \`on\` property is always required even when empty.
- CRITICAL: Join \`on\`, \`sourceKey\`, and \`targetKey\` arrays use \`{ source, target }\` object literals — NEVER use \`eq()\` calls
  - Correct: \`on: [{ source: orders.userId, target: users.id }]\`
  - Correct: \`sourceKey: [{ source: teams.id, target: teamMembers.teamId }]\`
  - WRONG: \`on: [eq(orders.userId, users.id)]\`
  - WRONG: \`sourceKey: [eq(teams.id, teamMembers.teamId)]\`
- IMPORTANT: Add any missing imports for tables referenced in join \`on\` clauses AND \`through.table\` references. Check the schema files to find which file exports each table variable, and add/extend the import line accordingly
- Do not add duplicate imports — if a table is already imported, leave it as-is
- Do not change any other code besides adding joins and their required imports`

const SCHEMA_FILTER_SYSTEM_PROMPT = `You are an expert at editing Drizzle ORM schema files. Your job is to filter an introspected schema to only include specific tables while keeping the code valid.

## Rules
- Return ONLY the complete valid TypeScript source code
- CRITICAL: Keep ALL import statements for column types that are still used by remaining tables (e.g. \`integer\`, \`text\`, \`varchar\`, \`timestamp\`, \`boolean\`, \`real\`, \`serial\`, \`bigint\`, \`pgTable\`, \`sqliteTable\`, \`pgEnum\`, etc.). Scan every remaining table definition to see which column types it uses, and ensure every one of those is in the imports.
- Keep ALL enum declarations (pgEnum, sqliteEnum, etc.) that are referenced by remaining tables
- Keep ALL type declarations and other non-table exports that are still used
- ONLY remove table definitions (pgTable/sqliteTable calls) for tables NOT in the keep list
- Remove \`.references(...)\` calls that point to removed tables — replace the column definition with the same column type but without the \`.references()\` chain
- Do NOT touch the import block unless you are certain an import is not used by ANY remaining table. When in doubt, keep the import.
- Keep the same code style, formatting, and comments
- Do NOT add any new code, comments, or modifications beyond the removals
- If an enum is only used by removed tables, remove it too (and its import)`

export default app
