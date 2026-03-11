/**
 * Demo data seeding API — SSE endpoint for seeding demo data with progress.
 * Called from the setup page after admin account creation.
 */

import type { DrizzleDatabase } from 'drizzle-cube/server'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { analyticsPages, connections, cubeDefinitions, schemaFiles, settings } from '../../schema'
import { guardPermission } from '../permissions/guard'
import { connectionManager } from '../services/connection-manager'
import { DEMO_CUBES_SOURCE, DEMO_PORTLETS, DEMO_SCHEMA_SOURCE } from './seed-demo-config'

interface Variables {
  db: DrizzleDatabase
}

const app = new Hono<{ Variables: Variables }>()

const DEMO_DB_PATH = 'data/demo.sqlite'

/**
 * GET /api/seed-demo — SSE stream that seeds demo data and reports progress.
 * Admin only. Called from the setup page after admin account creation.
 */
app.get('/', async c => {
  const denied = guardPermission(c, 'manage', 'Connection')
  if (denied) return denied

  const db = c.get('db') as any

  // Check if demo data already exists
  const existing = await db.select({ id: connections.id }).from(connections).limit(1)
  if (existing.length > 0) {
    return c.json({ status: 'already_seeded' })
  }

  return streamSSE(c, async stream => {
    let id = 0
    const send = async (step: string, progress: number, detail?: string) => {
      await stream.writeSSE({
        id: String(id++),
        event: 'progress',
        data: JSON.stringify({ step, progress, detail }),
      })
    }

    try {
      // Create demo SQLite database
      await send('Creating demo database', 10)
      const { mkdirSync } = await import('node:fs')
      const Database = (await import('better-sqlite3')).default
      const { drizzle } = await import('drizzle-orm/better-sqlite3')
      const { departments, employees, productivity, prEvents } = await import('../../schema/demo')
      const { DEMO_DDL, deptData, makeEmployeeData, makeProductivityData, makePREventsData } =
        await import('../../scripts/demo-data')

      mkdirSync('data', { recursive: true })
      const sqlite = new Database(DEMO_DB_PATH)
      sqlite.pragma('journal_mode = WAL')
      sqlite.pragma('foreign_keys = ON')
      sqlite.exec(DEMO_DDL)
      const localDb = drizzle(sqlite)

      // Seed departments
      await send('Seeding departments', 20)
      const depts = localDb.insert(departments).values(deptData).returning().all()

      // Seed employees
      await send('Seeding employees', 35, `${depts.length} departments created`)
      const employeeData = makeEmployeeData(depts.map(d => d.id))
      const emps = localDb.insert(employees).values(employeeData).returning().all()

      // Seed productivity data
      await send('Seeding productivity data', 45, `${emps.length} employees created`)
      const prodData = makeProductivityData(emps)
      const BATCH_SIZE = 100
      for (let i = 0; i < prodData.length; i += BATCH_SIZE) {
        localDb
          .insert(productivity)
          .values(prodData.slice(i, i + BATCH_SIZE))
          .run()
      }

      // Seed PR events
      await send('Seeding PR events', 52, `${prodData.length} productivity records`)
      const prEventsData = makePREventsData(emps)
      for (let i = 0; i < prEventsData.length; i += BATCH_SIZE) {
        localDb
          .insert(prEvents)
          .values(prEventsData.slice(i, i + BATCH_SIZE))
          .run()
      }

      sqlite.close()
      await send('Demo data created', 60, `${prEventsData.length} PR event records`)

      // Register as a connection
      await send('Registering connection', 70)
      const [demoConnection] = await db
        .insert(connections)
        .values({
          name: 'Demo SQLite',
          description: 'Built-in demo database with sample employee data',
          engineType: 'sqlite',
          connectionString: `file:${DEMO_DB_PATH}`,
          organisationId: 1,
        })
        .returning()

      // Create schema file
      await send('Creating schema', 80)
      const [demoSchemaFile] = await db
        .insert(schemaFiles)
        .values({
          name: 'demo-schema.ts',
          sourceCode: DEMO_SCHEMA_SOURCE,
          connectionId: demoConnection.id,
          organisationId: 1,
        })
        .returning()

      // Create cube definitions
      await send('Creating cube definitions', 85)
      await db.insert(cubeDefinitions).values({
        name: 'Demo Cubes',
        title: 'Employee Analytics Cubes',
        description:
          'Employees, Departments, Productivity, and PR Events cubes for the demo dataset',
        sourceCode: DEMO_CUBES_SOURCE,
        schemaFileId: demoSchemaFile.id,
        connectionId: demoConnection.id,
        organisationId: 1,
      })

      // Create dashboard
      await send('Creating dashboard', 90)
      await db.insert(analyticsPages).values({
        name: 'Overview Dashboard',
        description: 'Employee and productivity overview',
        connectionId: demoConnection.id,
        config: { portlets: DEMO_PORTLETS, filters: [] },
        organisationId: 1,
      })

      // Initialize connection and compile cubes
      await send('Compiling cubes', 95)
      await connectionManager.createConnection(
        demoConnection.id,
        demoConnection.connectionString,
        demoConnection.engineType
      )
      await connectionManager.compileAll(db)

      // Mark setup as complete
      const [statusRow] = await db.select().from(settings).where(eq(settings.key, 'setup_status'))
      if (statusRow) {
        await db
          .update(settings)
          .set({ value: 'complete', updatedAt: new Date() })
          .where(eq(settings.key, 'setup_status'))
      }

      await stream.writeSSE({
        id: String(id++),
        event: 'complete',
        data: JSON.stringify({ status: 'ok' }),
      })
    } catch (err: any) {
      await stream.writeSSE({
        id: String(id++),
        event: 'error',
        data: JSON.stringify({ message: err.message }),
      })
    }
  })
})

export default app
