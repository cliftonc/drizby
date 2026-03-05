/**
 * Schema files API
 * CRUD + compile + introspect for Drizzle schema files
 */

import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { schemaFiles, connections } from '../../schema'
import { connectionManager } from '../services/connection-manager'
import { compileSchema, generateSchemaTypes } from '../services/cube-compiler'
import postgres from 'postgres'

interface Variables {
  db: DrizzleDatabase
}

const app = new Hono<{ Variables: Variables }>()

// List all schema files
app.get('/', async (c) => {
  const db = c.get('db') as any
  const result = await db.select().from(schemaFiles)
    .where(eq(schemaFiles.organisationId, 1))
  return c.json(result)
})

// Get single schema file
app.get('/:id', async (c) => {
  const db = c.get('db') as any
  const id = parseInt(c.req.param('id'))
  const result = await db.select().from(schemaFiles)
    .where(and(eq(schemaFiles.id, id), eq(schemaFiles.organisationId, 1)))
  if (result.length === 0) return c.json({ error: 'Schema file not found' }, 404)
  return c.json(result[0])
})

// Create schema file
app.post('/', async (c) => {
  const db = c.get('db') as any
  const body = await c.req.json()

  const conn = await db.select().from(connections)
    .where(and(eq(connections.id, body.connectionId), eq(connections.organisationId, 1)))
  if (conn.length === 0) return c.json({ error: 'Connection not found' }, 400)

  const result = await db.insert(schemaFiles).values({
    name: body.name,
    sourceCode: body.sourceCode,
    connectionId: body.connectionId,
    organisationId: 1,
  }).returning()

  return c.json(result[0], 201)
})

// Update schema file
app.put('/:id', async (c) => {
  const db = c.get('db') as any
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()

  const result = await db.update(schemaFiles)
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
app.delete('/:id', async (c) => {
  const db = c.get('db') as any
  const id = parseInt(c.req.param('id'))
  const result = await db.delete(schemaFiles)
    .where(and(eq(schemaFiles.id, id), eq(schemaFiles.organisationId, 1)))
    .returning()
  if (result.length === 0) return c.json({ error: 'Schema file not found' }, 404)
  return c.json({ success: true })
})

// Compile a schema file
app.post('/:id/compile', async (c) => {
  const db = c.get('db') as any
  const id = parseInt(c.req.param('id'))

  const rows = await db.select().from(schemaFiles)
    .where(and(eq(schemaFiles.id, id), eq(schemaFiles.organisationId, 1)))
  if (rows.length === 0) return c.json({ error: 'Schema file not found' }, 404)

  const sf = rows[0]
  const result = compileSchema(sf.sourceCode)

  if (result.errors.length === 0) {
    connectionManager.compileSchemaFile(sf.connectionId, sf.name, sf.sourceCode)
    await db.update(schemaFiles)
      .set({ compiledAt: new Date(), compilationErrors: null })
      .where(eq(schemaFiles.id, id))
  } else {
    await db.update(schemaFiles)
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
app.get('/:id/types', async (c) => {
  const db = c.get('db') as any
  const id = parseInt(c.req.param('id'))

  const rows = await db.select().from(schemaFiles)
    .where(and(eq(schemaFiles.id, id), eq(schemaFiles.organisationId, 1)))
  if (rows.length === 0) return c.json({ error: 'Schema file not found' }, 404)

  const dts = generateSchemaTypes(rows[0].sourceCode)
  return c.text(dts, 200, { 'Content-Type': 'application/typescript' })
})

// Introspect a database connection and generate pgTable() source
app.post('/introspect', async (c) => {
  const db = c.get('db') as any
  const body = await c.req.json()
  const { connectionId } = body

  const conn = await db.select().from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.organisationId, 1)))
  if (conn.length === 0) return c.json({ error: 'Connection not found' }, 400)

  let client: postgres.Sql | null = null
  try {
    client = postgres(conn[0].connectionString)

    // Query information_schema for tables and columns
    const tables = await client`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `

    const columns = await client`
      SELECT
        c.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length,
        tc.constraint_type
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu
        ON c.table_name = kcu.table_name AND c.column_name = kcu.column_name
        AND c.table_schema = kcu.table_schema
      LEFT JOIN information_schema.table_constraints tc
        ON kcu.constraint_name = tc.constraint_name
        AND tc.constraint_type = 'PRIMARY KEY'
      WHERE c.table_schema = 'public'
      ORDER BY c.table_name, c.ordinal_position
    `

    const source = generatePgTableSource(tables, columns)
    return c.json({ source, tables: tables.map((t: any) => t.table_name) })
  } catch (err: any) {
    return c.json({ error: `Introspection failed: ${err.message}` }, 500)
  } finally {
    if (client) await client.end()
  }
})

function generatePgTableSource(tables: any[], columns: any[]): string {
  const lines: string[] = [
    `import { pgTable, integer, text, real, boolean, timestamp, jsonb, serial, varchar, numeric, date, smallint, bigint } from 'drizzle-orm/pg-core'`,
    '',
  ]

  const columnsByTable = new Map<string, any[]>()
  for (const col of columns) {
    const list = columnsByTable.get(col.table_name) || []
    list.push(col)
    columnsByTable.set(col.table_name, list)
  }

  for (const table of tables) {
    const tableName = table.table_name
    const cols = columnsByTable.get(tableName) || []
    const camelName = toCamelCase(tableName)

    lines.push(`export const ${camelName} = pgTable('${tableName}', {`)

    for (const col of cols) {
      const colCamel = toCamelCase(col.column_name)
      const drizzleType = pgTypeToDrizzle(col.data_type, col.column_name)
      const isPk = col.constraint_type === 'PRIMARY KEY'
      const isIdentity = col.column_default?.includes('nextval') || col.column_default?.includes('identity')

      let colDef = `  ${colCamel}: ${drizzleType}('${col.column_name}')`
      if (isPk) {
        if (isIdentity) {
          colDef += '.primaryKey().generatedAlwaysAsIdentity()'
        } else {
          colDef += '.primaryKey()'
        }
      }
      if (col.is_nullable === 'NO' && !isPk) {
        colDef += '.notNull()'
      }
      colDef += ','
      lines.push(colDef)
    }

    lines.push('})')
    lines.push('')
  }

  return lines.join('\n')
}

function pgTypeToDrizzle(dataType: string, _colName: string): string {
  switch (dataType) {
    case 'integer':
    case 'int':
    case 'int4':
      return 'integer'
    case 'smallint':
    case 'int2':
      return 'smallint'
    case 'bigint':
    case 'int8':
      return 'bigint'
    case 'text':
      return 'text'
    case 'character varying':
    case 'varchar':
      return 'varchar'
    case 'boolean':
    case 'bool':
      return 'boolean'
    case 'real':
    case 'float4':
    case 'double precision':
    case 'float8':
      return 'real'
    case 'numeric':
    case 'decimal':
      return 'numeric'
    case 'timestamp without time zone':
    case 'timestamp with time zone':
    case 'timestamp':
      return 'timestamp'
    case 'date':
      return 'date'
    case 'jsonb':
      return 'jsonb'
    case 'json':
      return 'jsonb'
    default:
      return 'text'
  }
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

export default app
