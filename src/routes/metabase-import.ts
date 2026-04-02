/**
 * Metabase Import API
 * Wizard endpoints for migrating connections, schemas, cubes, and dashboards from Metabase.
 */

import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { invalidateCubeAppCache } from '../../app'
import { analyticsPages, connections, cubeDefinitions, schemaFiles } from '../../schema'
import { maybeDecrypt, maybeEncrypt } from '../auth/encryption'
import { guardPermission } from '../permissions/guard'
import { callAI } from '../services/ai-caller'
import { getAISettings } from '../services/ai-settings'
import { connectionManager } from '../services/connection-manager'
import {
  CUBE_APPLY_JOINS_SYSTEM_PROMPT,
  CUBE_GENERATE_ONE_SYSTEM_PROMPT,
  CUBE_JOINS_SYSTEM_PROMPT,
  CUBE_PLAN_SYSTEM_PROMPT,
} from '../services/cube-prompts'
import {
  type MetabaseDashboard,
  type MetabaseDatabase,
  describeMetabaseQuery,
  mapMetabaseDatabases,
  translateDashboard,
} from '../services/metabase-parser'
import { autoName, fixArrayColumns, runDrizzleKitPull } from '../services/schema-introspection'

interface Variables {
  db: DrizzleDatabase
}

const app = new Hono<{ Variables: Variables }>()

// All metabase import operations require admin
app.use('*', async (c, next) => {
  const denied = guardPermission(c, 'manage', 'Connection')
  if (denied) return denied
  await next()
})

// --- Helper: Fetch from Metabase API ---

async function metabaseFetch(
  url: string,
  sessionToken: string,
  path: string,
  options?: { method?: string; body?: any }
): Promise<any> {
  const baseUrl = url.replace(/\/+$/, '')
  // Metabase API keys start with "mb_", session tokens are UUIDs
  const isApiKey = sessionToken.startsWith('mb_')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (isApiKey) {
    headers['x-api-key'] = sessionToken
  } else {
    headers['X-Metabase-Session'] = sessionToken
  }
  const resp = await fetch(`${baseUrl}${path}`, {
    method: options?.method || 'GET',
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30000),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Metabase API error (${resp.status}): ${text.substring(0, 200)}`)
  }
  return resp.json()
}

// --- Endpoints ---

/**
 * POST /api/metabase-import/connect
 * Validate connectivity to a Metabase instance.
 */
app.post('/connect', async c => {
  const body = await c.req.json()
  const { url, sessionToken } = body

  if (!url) return c.json({ error: 'Metabase URL is required' }, 400)
  if (!sessionToken) return c.json({ error: 'API key is required' }, 400)

  try {
    // Validate the API key by fetching current user
    const user = await metabaseFetch(url, sessionToken, '/api/user/current')

    return c.json({
      connected: true,
      sessionToken,
      user: { name: `${user.first_name} ${user.last_name}`, email: user.email },
    })
  } catch (err: any) {
    return c.json({ error: `Connection failed: ${err.message}` }, 400)
  }
})

/**
 * POST /api/metabase-import/databases
 * List Metabase databases with Drizby engine mapping.
 */
app.post('/databases', async c => {
  const body = await c.req.json()
  const { url, sessionToken } = body

  if (!url || !sessionToken) return c.json({ error: 'url and sessionToken required' }, 400)

  try {
    const data = await metabaseFetch(url, sessionToken, '/api/database')
    const databases: MetabaseDatabase[] = data.data || data
    return c.json({ databases: mapMetabaseDatabases(databases) })
  } catch (err: any) {
    return c.json({ error: `Failed to fetch databases: ${err.message}` }, 500)
  }
})

/**
 * POST /api/metabase-import/dashboards
 * List Metabase dashboards for selection.
 */
app.post('/dashboards', async c => {
  const body = await c.req.json()
  const { url, sessionToken } = body

  if (!url || !sessionToken) return c.json({ error: 'url and sessionToken required' }, 400)

  try {
    const data = await metabaseFetch(url, sessionToken, '/api/search?models=dashboard')
    const dashboards = (data.data || []).map((d: any) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      collection: d.collection?.name || null,
    }))
    return c.json({ dashboards })
  } catch (err: any) {
    return c.json({ error: `Failed to fetch dashboards: ${err.message}` }, 500)
  }
})

// --- SSE Helper ---

function createSSEStream(handler: (send: SSESend) => Promise<void>): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const send: SSESend = (event, data) => {
        controller.enqueue(
          new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }
      try {
        await handler(send)
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
}

type SSESend = (event: string, data: any) => void

/**
 * POST /api/metabase-import/execute
 * Full migration pipeline — SSE streaming endpoint.
 *
 * Phase 1: Import connections
 * Phase 2: Auto-generate schemas + cubes (per connection)
 * Phase 3: Import dashboards with AI query translation
 */
app.post('/execute', async c => {
  const appDb = c.get('db') as any
  const body = await c.req.json()
  const {
    url,
    sessionToken,
    databases,
    dashboardIds,
  }: {
    url: string
    sessionToken: string
    databases: Array<{
      metabaseId: number
      name: string
      engineType: string
      provider: string
      connectionString: string
    }>
    dashboardIds: number[]
  } = body

  return createSSEStream(async send => {
    const metabaseDbIdToConnectionId = new Map<number, number>()
    const createdConnections: Array<{ metabaseId: number; drizbyId: number; name: string }> = []
    const createdDashboards: Array<{
      metabaseId: number
      drizbyId: number
      name: string
      portletCount: number
    }> = []

    // ========== PHASE 1: Import Connections ==========
    send('phase', { phase: 'connections', status: 'started', total: databases.length })

    for (let i = 0; i < databases.length; i++) {
      const db = databases[i]
      send('progress', {
        phase: 'connections',
        current: i + 1,
        total: databases.length,
        message: `Creating connection: ${db.name}`,
      })

      try {
        const encryptedConnStr = await maybeEncrypt(db.connectionString)
        const result = await appDb
          .insert(connections)
          .values({
            name: db.name,
            description: 'Imported from Metabase',
            engineType: db.engineType,
            provider: db.provider || null,
            connectionString: encryptedConnStr,
            organisationId: 1,
          })
          .returning()

        const created = result[0]
        metabaseDbIdToConnectionId.set(db.metabaseId, created.id)
        createdConnections.push({ metabaseId: db.metabaseId, drizbyId: created.id, name: db.name })

        // Initialize in connection manager
        try {
          await connectionManager.createConnection(
            created.id,
            created.connectionString,
            created.engineType,
            created.provider
          )
        } catch (err: any) {
          send('warning', {
            phase: 'connections',
            message: `Connection "${db.name}" created but failed to initialize: ${err.message}`,
          })
        }
      } catch (err: any) {
        send('error', {
          phase: 'connections',
          message: `Failed to create connection "${db.name}": ${err.message}`,
        })
      }
    }

    send('phase', { phase: 'connections', status: 'completed', created: createdConnections })

    // ========== PHASE 2: Auto-generate Schemas + Cubes ==========
    const ai = await getAISettings(appDb)
    const aiConfigured = !!(ai.apiKey && ai.provider)

    if (!aiConfigured) {
      send('warning', {
        phase: 'schemas',
        message:
          'AI is not configured — skipping schema/cube generation. Configure AI in Settings to enable this.',
      })
    }

    for (const conn of createdConnections) {
      send('phase', {
        phase: 'schemas',
        status: 'started',
        connectionName: conn.name,
        connectionId: conn.drizbyId,
      })

      // Step 2.1: Introspect database
      try {
        send('progress', {
          phase: 'schemas',
          connectionName: conn.name,
          step: 'introspecting',
          message: `Introspecting database: ${conn.name}`,
        })

        const connRow = await appDb
          .select()
          .from(connections)
          .where(eq(connections.id, conn.drizbyId))
        if (connRow.length === 0) continue

        const managed = connectionManager.get(conn.drizbyId)
        const rawConnStr = await maybeDecrypt(connRow[0].connectionString)
        let { source, tables } = await runDrizzleKitPull(
          rawConnStr,
          connRow[0].engineType,
          connRow[0].provider
        )

        // Fix array columns for PG
        if (managed) {
          source = await fixArrayColumns(source, managed.drizzle, connRow[0].engineType)
        }

        if (tables.length === 0) {
          send('warning', {
            phase: 'schemas',
            connectionName: conn.name,
            message: 'No tables found in database',
          })
          continue
        }

        // Step 2.2: Save schema file
        send('progress', {
          phase: 'schemas',
          connectionName: conn.name,
          step: 'saving_schema',
          message: `Saving schema (${tables.length} tables)`,
        })

        const schemaName = await autoName(appDb, schemaFiles, 'schema.ts', conn.drizbyId)
        await appDb
          .insert(schemaFiles)
          .values({
            name: schemaName,
            sourceCode: source,
            connectionId: conn.drizbyId,
            organisationId: 1,
          })
          .returning()

        // Compile schema
        await connectionManager.compileSchemaFile(conn.drizbyId, schemaName, source)

        if (!aiConfigured) continue

        // Step 2.3: Plan cubes via AI
        send('progress', {
          phase: 'schemas',
          connectionName: conn.name,
          step: 'planning_cubes',
          message: 'AI is planning cube definitions...',
        })

        const schemaContext = [{ fileName: schemaName.replace(/\.ts$/, ''), source }]
        const schemaListing = schemaContext
          .map(s => `// File: ${s.fileName}.ts\n${s.source}`)
          .join('\n\n')
        const fileNameList = schemaContext.map(s => s.fileName).join(', ')

        const planPrompt = `Here are the Drizzle ORM schema files:\n\n${schemaListing}\n\nAvailable schema file names (use these EXACTLY for schemaFile): ${fileNameList}\n\nAnalyze these schemas and propose cubes to create. The "schemaFile" field must be one of the file names listed above (without .ts extension). The "tables" field must contain only table variable names that are actually exported from that schema file.`

        let cubePlan: Array<{
          name: string
          variableName: string
          title: string
          description: string
          tables: string[]
          schemaFile: string
        }> = []

        try {
          const planRaw = await callAI(ai, CUBE_PLAN_SYSTEM_PROMPT, planPrompt)
          try {
            cubePlan = JSON.parse(planRaw)
          } catch {
            const match = planRaw.match(/\[[\s\S]*\]/)
            if (match) cubePlan = JSON.parse(match[0])
          }
          // Validate schemaFile references
          const validFileNames = new Set(schemaContext.map(s => s.fileName))
          for (const cube of cubePlan) {
            if (!validFileNames.has(cube.schemaFile)) {
              cube.schemaFile = schemaContext[0].fileName
            }
          }
        } catch (err: any) {
          send('warning', {
            phase: 'schemas',
            connectionName: conn.name,
            message: `AI cube planning failed: ${err.message}`,
          })
        }

        if (cubePlan.length === 0) continue

        // Step 2.4: Generate cubes via AI
        send('progress', {
          phase: 'schemas',
          connectionName: conn.name,
          step: 'generating_cubes',
          message: `Generating ${cubePlan.length} cube definition(s)...`,
        })

        const generatedCubeIds: number[] = []

        for (let i = 0; i < cubePlan.length; i++) {
          const cube = cubePlan[i]
          send('progress', {
            phase: 'schemas',
            connectionName: conn.name,
            step: 'generating_cubes',
            message: `Generating cube: ${cube.title} (${i + 1}/${cubePlan.length})`,
          })

          try {
            const cubePrompt = `## Schema Files\n\n${schemaListing}\n\n## Available Schema Files\n${schemaContext.map(s => `- ${s.fileName}.ts`).join('\n')}\n\n## Cube to Generate\n\nName: ${cube.name}\nVariable name: ${cube.variableName}\nTitle: ${cube.title}\nDescription: ${cube.description}\nTables: ${cube.tables.join(', ')}\nSchema file: ${cube.schemaFile}\n\nGenerate ONLY a bare assignment — no \`let\`, \`const\`, or \`var\` keyword. Start with:\n${cube.variableName} = defineCube('${cube.name}', {\n...and end with:\n}) as Cube\n\nDo NOT include any joins — joins will be added in a separate step.`

            let cubeSource = await callAI(ai, CUBE_GENERATE_ONE_SYSTEM_PROMPT, cubePrompt)
            cubeSource = cubeSource.replace(/^(export\s+)?(let|const|var)\s+/, '')

            const tableImports = new Set(cube.tables)
            const needsEq = cubeSource.includes('eq(')
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
              cubeSource,
              '',
              `export { ${cube.variableName} }`,
            ].join('\n')

            const fileName = await autoName(
              appDb,
              cubeDefinitions,
              `${cube.variableName}.ts`,
              conn.drizbyId
            )
            const result = await appDb
              .insert(cubeDefinitions)
              .values({
                name: fileName,
                title: cube.title,
                description: cube.description,
                sourceCode: fullSource,
                connectionId: conn.drizbyId,
                organisationId: 1,
              })
              .returning()

            generatedCubeIds.push(result[0].id)
          } catch (err: any) {
            send('warning', {
              phase: 'schemas',
              connectionName: conn.name,
              message: `Failed to generate cube "${cube.name}": ${err.message}`,
            })
          }
        }

        // Step 2.5: Plan and apply joins
        if (generatedCubeIds.length >= 2) {
          send('progress', {
            phase: 'schemas',
            connectionName: conn.name,
            step: 'applying_joins',
            message: 'Planning joins between cubes...',
          })

          try {
            const allCubes = await appDb
              .select()
              .from(cubeDefinitions)
              .where(
                and(
                  eq(cubeDefinitions.connectionId, conn.drizbyId),
                  eq(cubeDefinitions.organisationId, 1)
                )
              )

            const cubeListing = allCubes
              .map((cd: any) => `// Cube file: ${cd.name}\n${cd.sourceCode}`)
              .join('\n\n')

            const joinPrompt = `## Schema Files\n\n${schemaListing}\n\n## Existing Cube Definitions\n\n${cubeListing}\n\nAnalyze these cubes and schemas. Identify valid joins between cubes using string-based targetCube (e.g. targetCube: 'CubeName'). Return ONLY cubes that need NEW joins added.`

            const raw = await callAI(ai, CUBE_JOINS_SYSTEM_PROMPT, joinPrompt)
            let proposals: Array<{
              variableName: string
              joins: Record<string, any>
            }> = []
            try {
              proposals = JSON.parse(raw)
            } catch {
              const match = raw.match(/\[[\s\S]*\]/)
              if (match) proposals = JSON.parse(match[0])
            }

            // Apply joins
            for (const proposal of proposals) {
              const cubeDef = allCubes.find(
                (cd: any) =>
                  cd.sourceCode?.includes(`${proposal.variableName} = defineCube`) ||
                  cd.name === proposal.variableName
              )
              if (!cubeDef?.sourceCode) continue

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

              const editPrompt = `## Schema Files\n\n${schemaListing}\n\n## Current Cube Source Code\n\n\`\`\`typescript\n${cubeDef.sourceCode}\n\`\`\`\n\n## Joins to Add\n\n${joinsDesc}\n\nReturn the COMPLETE updated cube source code.`

              try {
                const newSource = await callAI(ai, CUBE_APPLY_JOINS_SYSTEM_PROMPT, editPrompt)
                await appDb
                  .update(cubeDefinitions)
                  .set({ sourceCode: newSource, updatedAt: new Date() })
                  .where(eq(cubeDefinitions.id, cubeDef.id))
              } catch {
                // Skip failed join application
              }
            }
          } catch (err: any) {
            send('warning', {
              phase: 'schemas',
              connectionName: conn.name,
              message: `Join planning failed: ${err.message}`,
            })
          }
        }

        // Step 2.6: Compile all cubes
        send('progress', {
          phase: 'schemas',
          connectionName: conn.name,
          step: 'compiling',
          message: 'Compiling cube definitions...',
        })

        const allCubeDefs = await appDb
          .select()
          .from(cubeDefinitions)
          .where(
            and(
              eq(cubeDefinitions.connectionId, conn.drizbyId),
              eq(cubeDefinitions.organisationId, 1)
            )
          )

        for (const cubeDef of allCubeDefs) {
          if (!cubeDef.sourceCode) continue
          try {
            const result = await connectionManager.compileCubeDefinition(
              conn.drizbyId,
              cubeDef.sourceCode
            )
            if (result.errors.length === 0) {
              await appDb
                .update(cubeDefinitions)
                .set({
                  compiledAt: new Date(),
                  compilationErrors: null,
                  definition: { cubes: result.cubes },
                })
                .where(eq(cubeDefinitions.id, cubeDef.id))
            } else {
              await appDb
                .update(cubeDefinitions)
                .set({ compilationErrors: result.errors })
                .where(eq(cubeDefinitions.id, cubeDef.id))
            }
          } catch {
            // Continue with other cubes
          }
        }

        invalidateCubeAppCache(conn.drizbyId)

        send('phase', {
          phase: 'schemas',
          status: 'completed',
          connectionName: conn.name,
          cubeCount: generatedCubeIds.length,
        })
      } catch (err: any) {
        send('error', {
          phase: 'schemas',
          connectionName: conn.name,
          message: `Schema/cube generation failed: ${err.message}`,
        })
      }
    }

    // ========== PHASE 3: Import Dashboards ==========
    if (dashboardIds && dashboardIds.length > 0) {
      send('phase', { phase: 'dashboards', status: 'started', total: dashboardIds.length })

      // Gather cube metadata for AI query translation
      let cubeMetadataContext = ''
      if (aiConfigured) {
        for (const conn of createdConnections) {
          const managed = connectionManager.get(conn.drizbyId)
          if (!managed) continue
          try {
            const meta = managed.semanticLayer.getMetadata()
            cubeMetadataContext += `\n## Cubes for connection "${conn.name}":\n${JSON.stringify(meta, null, 2)}\n`
          } catch {
            // Skip if meta not available
          }
        }
      }

      for (let i = 0; i < dashboardIds.length; i++) {
        const dashId = dashboardIds[i]
        send('progress', {
          phase: 'dashboards',
          current: i + 1,
          total: dashboardIds.length,
          message: `Fetching dashboard ${dashId}...`,
        })

        try {
          const mbDashboard: MetabaseDashboard = await metabaseFetch(
            url,
            sessionToken,
            `/api/dashboard/${dashId}`
          )

          // Determine which Drizby connection to associate this dashboard with
          // Use the first available connection (dashboard cards may reference multiple databases)
          const firstCardDbId = mbDashboard.dashcards.find(dc => dc.card?.database_id)?.card
            ?.database_id
          const connectionId = firstCardDbId
            ? metabaseDbIdToConnectionId.get(firstCardDbId)
            : createdConnections[0]?.drizbyId
          if (!connectionId) {
            send('warning', {
              phase: 'dashboards',
              message: `No matching connection for dashboard "${mbDashboard.name}"`,
            })
            continue
          }

          send('progress', {
            phase: 'dashboards',
            current: i + 1,
            total: dashboardIds.length,
            message: `Translating dashboard: ${mbDashboard.name}`,
          })

          // Translate dashboard structure
          const translated = translateDashboard(mbDashboard, connectionId)

          // AI query translation for card portlets
          if (aiConfigured && cubeMetadataContext) {
            for (const portlet of translated.config.portlets) {
              if (!portlet.metabaseSource || portlet.chartType === 'text') continue

              const card = mbDashboard.dashcards.find(
                dc => dc.card && `mb-card-${dc.card.id}` === portlet.id
              )?.card
              if (!card) continue

              try {
                const queryDesc = describeMetabaseQuery(card)
                const translationPrompt = `You are translating a Metabase visualization query into a drizzle-cube query format.

## Available Cubes (with their measures, dimensions, and time dimensions):
${cubeMetadataContext}

## Metabase Card to Translate:
${queryDesc}

## Target Chart Type: ${portlet.chartType}

Generate a valid cube query JSON object that best represents this Metabase card's intent using the available cubes. The query should have:
- "measures": array of measure references like "CubeName.measureName"
- "dimensions": array of dimension references like "CubeName.dimensionName" (for non-time groupings)
- "timeDimensions": array of { "dimension": "CubeName.timeDim", "granularity": "month"|"week"|"day"|"year" } (for time-based groupings)
- "order": object like { "CubeName.measure": "desc" } (optional)
- "limit": number (optional)
- "filters": array of { "member": "CubeName.dim", "operator": "equals", "values": [...] } (optional)

Also provide chartConfig:
- "xAxis": array of dimension/timeDimension references for the X axis
- "yAxis": array of measure references for the Y axis

Return ONLY a JSON object with "query" and "chartConfig" keys. No explanation.`

                const raw = await callAI(
                  ai,
                  'You are a data analytics expert that translates queries between BI tools. Return only valid JSON.',
                  translationPrompt
                )
                let parsed: any
                try {
                  parsed = JSON.parse(raw)
                } catch {
                  const match = raw.match(/\{[\s\S]*\}/)
                  if (match) parsed = JSON.parse(match[0])
                }

                if (parsed?.query) {
                  portlet.query = JSON.stringify(parsed.query)
                }
                if (parsed?.chartConfig) {
                  portlet.chartConfig = parsed.chartConfig
                }
              } catch {
                // Leave portlet without a query — user can configure manually
              }
            }
          }

          // Insert dashboard
          const result = await appDb
            .insert(analyticsPages)
            .values({
              name: translated.name,
              description: translated.description,
              connectionId: translated.connectionId,
              config: translated.config,
              organisationId: 1,
            })
            .returning()

          createdDashboards.push({
            metabaseId: dashId,
            drizbyId: result[0].id,
            name: translated.name,
            portletCount: translated.config.portlets.length,
          })

          send('progress', {
            phase: 'dashboards',
            current: i + 1,
            total: dashboardIds.length,
            message: `Imported: ${translated.name} (${translated.config.portlets.length} portlets)`,
          })
        } catch (err: any) {
          send('error', {
            phase: 'dashboards',
            message: `Failed to import dashboard ${dashId}: ${err.message}`,
          })
        }
      }

      send('phase', { phase: 'dashboards', status: 'completed', created: createdDashboards })
    }

    // ========== Complete ==========
    send('complete', {
      connections: createdConnections,
      dashboards: createdDashboards,
    })
  })
})

export default app
