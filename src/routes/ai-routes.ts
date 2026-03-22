/**
 * AI routes for analysis builder features:
 * - POST /generate — Generate cube queries from natural language
 * - POST /explain/analyze — Analyze EXPLAIN plans with AI recommendations
 */

import type { DrizzleDatabase, ExplainResult } from 'drizzle-cube/server'
import {
  buildExplainAnalysisPrompt,
  createDatabaseExecutor,
  formatCubeSchemaForExplain,
  formatExistingIndexes,
} from 'drizzle-cube/server'
import { Hono } from 'hono'
import { getAISettings } from '../services/ai-settings'
import { connectionManager } from '../services/connection-manager'

interface Variables {
  db: DrizzleDatabase
  auth?: { userId: number; user: any }
}

const app = new Hono<{ Variables: Variables }>()

// ── Shared AI call helper ──────────────────────────────────────────────

async function callAI(
  ai: { provider?: string; apiKey?: string; model?: string; baseUrl?: string },
  prompt: string
): Promise<string> {
  if (ai.provider === 'anthropic') {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: ai.apiKey })
    const stream = await client.messages.stream({
      model: ai.model || 'claude-sonnet-4-6',
      max_tokens: 16384,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    })
    const response = await stream.finalMessage()
    const textBlock = response.content.find((b: any) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from AI')
    return textBlock.text
  }

  if (ai.provider === 'openai') {
    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey: ai.apiKey, ...(ai.baseUrl && { baseURL: ai.baseUrl }) })
    const response = await client.chat.completions.create({
      model: ai.model || 'gpt-4.1-mini',
      max_tokens: 16384,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.choices[0]?.message?.content
    if (!text) throw new Error('No text response from AI')
    return text
  }

  if (ai.provider === 'google') {
    const model = ai.model || 'gemini-3.1-flash-lite-preview'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${ai.apiKey}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 16384, temperature: 0 },
      }),
    })
    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`AI API error (${response.status}): ${errText.substring(0, 200)}`)
    }
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text)
      .join('\n')
    if (!text) throw new Error('No text response from AI')
    return text
  }

  throw new Error(`Unsupported AI provider: ${ai.provider}`)
}

function extractCodeBlock(text: string): string {
  const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  return match ? match[1].trim() : text.trim()
}

// ── Helper: resolve connection ID ────────────────────────────────────
// The drizzle-cube client doesn't send X-Connection-Id for AI endpoints,
// so we check the header first, then fall back to the first available connection.

function getConnectionId(c: any): number | null {
  const header = c.req.header('X-Connection-Id')
  return header ? Number.parseInt(header) : null
}

// ── Helper: get cube schema for AI prompt ────────────────────────────

function getCubeSchemaForAI(connectionId: number): string {
  const managed = connectionManager.get(connectionId)
  if (!managed) return '{}'

  const metadata = managed.semanticLayer.getMetadata()
  const cubes: Record<string, any> = {}

  for (const cube of metadata) {
    cubes[cube.name] = {
      title: cube.title,
      description: cube.description,
      measures: cube.measures.reduce(
        (acc, m) => {
          acc[m.name] = { type: m.type, title: m.title, description: m.description }
          return acc
        },
        {} as Record<string, any>
      ),
      dimensions: {},
      timeDimensions: {},
    }

    for (const dim of cube.dimensions) {
      if (dim.type === 'time') {
        cubes[cube.name].timeDimensions[dim.name] = {
          type: dim.type,
          title: dim.title,
          description: dim.description,
        }
      } else {
        cubes[cube.name].dimensions[dim.name] = {
          type: dim.type,
          title: dim.title,
          description: dim.description,
        }
      }
    }

    if (Object.keys(cubes[cube.name].timeDimensions).length === 0) {
      cubes[cube.name].timeDimensions = undefined
    }
  }

  return JSON.stringify({ cubes }, null, 2)
}

// ── Helper: extract table names from SQL ─────────────────────────────

function extractTableNames(sqlQuery: string): string[] {
  const tablePattern = /(?:FROM|JOIN)\s+["']?(\w+)["']?/gi
  const tables = new Set<string>()
  for (const m of sqlQuery.matchAll(tablePattern)) {
    tables.add(m[1].toLowerCase())
  }
  return Array.from(tables)
}

// ── System prompt for query generation ───────────────────────────────

const GENERATE_SYSTEM_PROMPT = `You are a helpful AI assistant for analyzing business data using a Cube.js/Drizzle-Cube semantic layer.

Given the following cube schema and user query, generate a valid JSON response containing a query AND chart configuration.

CUBE SCHEMA:
{CUBE_SCHEMA}

RESPONSE FORMAT:
Return a JSON object with these fields:
{
  "query": { /* Cube.js query object */ },
  "chartType": "line"|"bar"|"area"|"pie"|"scatter"|"bubble"|"table",
  "chartConfig": {
    "xAxis": string[],
    "yAxis": string[],
    "series": string[],
    "sizeField": string,
    "colorField": string
  }
}

QUERY STRUCTURE:
{
  dimensions?: string[],
  measures?: string[],
  timeDimensions?: [{ dimension: string, granularity?: 'day'|'week'|'month'|'quarter'|'year', dateRange?: [string, string] | string }],
  filters?: [{ member: string, operator: 'equals'|'notEquals'|'contains'|'notContains'|'gt'|'gte'|'lt'|'lte'|'set'|'notSet', values?: any[] }],
  order?: {[member: string]: 'asc'|'desc'},
  limit?: number
}

Valid dateRange strings (MUST be lower case): 'today'|'yesterday'|'last 7 days'|'last 30 days'|'last week'|'last month'|'last quarter'|'last year'|'this week'|'this month'|'this quarter'|'this year'

CHART TYPE SELECTION:
- "line": For trends over time (requires timeDimensions)
- "bar": For comparing categories or values across groups
- "area": For cumulative trends over time
- "pie": For showing proportions of a whole
- "scatter": For correlation between two numeric values
- "table": For detailed data inspection

SORTING & LIMITING:
- For "top N" or "bottom N" queries, ALWAYS use \`order\` + \`limit\`
- Example "top 10 customers by revenue": order: {"Customers.totalRevenue": "desc"}, limit: 10
- Example "least active users": order: {"Users.loginCount": "asc"}, limit: 10
- The \`order\` object keys must be valid measure or dimension names from the schema
- When the user says "top", "highest", "best", "most" → order desc + limit
- When the user says "bottom", "lowest", "worst", "least", "fewest" → order asc + limit
- Default to limit: 10 for "top/bottom" queries unless the user specifies a number
- For time-series data, order by the time dimension ascending unless asked otherwise

RULES:
1. Only use measures, dimensions, and time dimensions that exist in the schema
2. Return ONLY valid JSON - no explanations or markdown
3. For time-based queries, always specify appropriate granularity
4. Prefer .name fields over .id fields as dimensions
5. At least one measure or dimension is required
6. For ranking/top/bottom queries, always include order and limit

USER QUERY:
{USER_PROMPT}

Return the JSON response:`

// ── POST /generate — AI query generation ─────────────────────────────

app.post('/generate', async c => {
  const db = c.get('db') as any
  const connectionId = getConnectionId(c)
  if (!connectionId) return c.json({ error: 'X-Connection-Id header required' }, 400)

  const ai = await getAISettings(db)
  if (!ai.apiKey || !ai.provider) {
    return c.json({ error: 'AI is not configured' }, 400)
  }

  const body = await c.req.json()
  const { text } = body as { text?: string }
  if (!text?.trim()) {
    return c.json({ error: 'Please provide "text" field with your prompt.' }, 400)
  }

  try {
    const cubeSchema = getCubeSchemaForAI(connectionId)
    const prompt = GENERATE_SYSTEM_PROMPT.replace('{CUBE_SCHEMA}', cubeSchema).replace(
      '{USER_PROMPT}',
      text.trim()
    )

    const response = await callAI(ai, prompt)
    const cleaned = extractCodeBlock(response)

    return c.json({ query: cleaned })
  } catch (error: any) {
    return c.json({ error: 'AI generation failed', details: error.message }, 500)
  }
})

// ── POST /explain/analyze — EXPLAIN plan analysis ────────────────────

app.post('/explain/analyze', async c => {
  const db = c.get('db') as any
  const connectionId = getConnectionId(c)
  if (!connectionId) return c.json({ error: 'X-Connection-Id header required' }, 400)

  const ai = await getAISettings(db)
  if (!ai.apiKey || !ai.provider) {
    return c.json({ error: 'AI is not configured' }, 400)
  }

  const body = await c.req.json()
  const { explainResult, query } = body as { explainResult?: ExplainResult; query?: any }

  if (!explainResult || !query) {
    return c.json({ error: 'Please provide "explainResult" and "query" fields.' }, 400)
  }

  const managed = connectionManager.get(connectionId)
  if (!managed) return c.json({ error: 'Connection not found' }, 400)

  try {
    // Get cube metadata for context
    const metadata = managed.semanticLayer.getMetadata()
    const cubeSchema = formatCubeSchemaForExplain(metadata)

    // Get existing indexes for tables in the query
    const executor = createDatabaseExecutor(
      managed.drizzle,
      managed.schemaExports,
      managed.engineType as any
    )
    const tableNames = extractTableNames(explainResult.sql.sql)
    const existingIndexes = await executor.getTableIndexes(tableNames)
    const formattedIndexes = formatExistingIndexes(existingIndexes)

    // Map unsupported database types
    const supportedDbTypes = ['postgres', 'mysql', 'sqlite'] as const
    const rawDbType = managed.engineType === 'duckdb' ? 'postgres' : managed.engineType
    const dbType = supportedDbTypes.includes(rawDbType as any)
      ? (rawDbType as 'postgres' | 'mysql' | 'sqlite')
      : ('postgres' as const)

    const prompt = buildExplainAnalysisPrompt(
      dbType,
      cubeSchema,
      JSON.stringify(query, null, 2),
      explainResult.sql.sql,
      JSON.stringify(explainResult.operations, null, 2),
      explainResult.raw,
      formattedIndexes
    )

    const response = await callAI(ai, prompt)
    const cleaned = extractCodeBlock(response)
    const analysis = JSON.parse(cleaned)

    return c.json({
      ...analysis,
      _meta: {
        model: ai.model || 'default',
        provider: ai.provider,
      },
    })
  } catch (error: any) {
    console.error('[AI] EXPLAIN analysis error:', error)
    return c.json({ error: 'Failed to analyze EXPLAIN plan', details: error.message }, 500)
  }
})

// ── GET /health — AI health check ────────────────────────────────────

app.get('/health', async c => {
  const db = c.get('db') as any
  const ai = await getAISettings(db)

  return c.json({
    status: 'ok',
    provider: ai.provider || 'none',
    model: ai.model || 'default',
    configured: !!(ai.provider && ai.apiKey),
  })
})

export default app
