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
import { callAI } from '../services/ai-caller'
import { getAISettings } from '../services/ai-settings'
import { connectionManager } from '../services/connection-manager'
import { compileSchema, generateSchemaTypes } from '../services/cube-compiler'
import {
  CUBE_APPLY_JOINS_SYSTEM_PROMPT,
  CUBE_GENERATE_ONE_SYSTEM_PROMPT,
  CUBE_JOINS_SYSTEM_PROMPT,
  CUBE_PLAN_SYSTEM_PROMPT,
} from '../services/cube-prompts'
import { sanitizeFileName } from '../services/filename'
import {
  autoName,
  filterSchema,
  fixArrayColumns,
  runDrizzleKitPull,
} from '../services/schema-introspection'

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
      name: sanitizeFileName(body.name),
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
      name: body.name ? sanitizeFileName(body.name) : undefined,
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
    let { source, tables } = await runDrizzleKitPull(
      conn[0].connectionString,
      conn[0].engineType,
      conn[0].provider
    )

    // Fix drizzle-kit bug: some array columns (e.g. uuid[]) don't get .array()
    if (managed) {
      source = await fixArrayColumns(source, managed.drizzle, conn[0].engineType)
    }

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

  // If user deselected some tables, programmatically filter the schema
  let finalSource = sourceCode
  if (selectedTables && Array.isArray(selectedTables)) {
    finalSource = filterSchema(sourceCode, selectedTables)
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

export default app
