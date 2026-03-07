/**
 * Demo data seeding API — SSE endpoint for seeding demo data with progress.
 * Called from the setup page after admin account creation.
 */

import type { DrizzleDatabase } from 'drizzle-cube/server'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { analyticsPages, connections, cubeDefinitions, schemaFiles } from '../../schema'
import { guardPermission } from '../permissions/guard'
import { connectionManager } from '../services/connection-manager'

interface Variables {
  db: DrizzleDatabase
}

const app = new Hono<{ Variables: Variables }>()

const DEMO_DB_PATH = 'data/demo.sqlite'

const DEMO_SCHEMA_SOURCE = `import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core'

export const employees = sqliteTable('employees', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email'),
  active: integer('active', { mode: 'boolean' }).default(true),
  departmentId: integer('department_id'),
  organisationId: integer('organisation_id').notNull(),
  salary: real('salary'),
  city: text('city'),
  region: text('region'),
  country: text('country'),
  createdAt: integer('created_at', { mode: 'timestamp' })
})

export const departments = sqliteTable('departments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  organisationId: integer('organisation_id').notNull(),
  budget: real('budget')
})

export const productivity = sqliteTable('productivity', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull(),
  departmentId: integer('department_id'),
  date: integer('date', { mode: 'timestamp' }).notNull(),
  linesOfCode: integer('lines_of_code').default(0),
  pullRequests: integer('pull_requests').default(0),
  happinessIndex: integer('happiness_index'),
  organisationId: integer('organisation_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
})
`

const DEMO_CUBES_SOURCE = `import { eq } from 'drizzle-orm'
import { defineCube } from 'drizzle-cube/server'
import type { QueryContext, BaseQueryDefinition, Cube } from 'drizzle-cube/server'
import { employees, departments, productivity } from './demo-schema'

let employeesCube: Cube
let departmentsCube: Cube
let productivityCube: Cube

employeesCube = defineCube('Employees', {
  title: 'Employee Analytics',
  description: 'Employee data and metrics',
  sql: (ctx: QueryContext): BaseQueryDefinition => ({
    from: employees,
    where: eq(employees.organisationId, ctx.securityContext.organisationId as number)
  }),
  joins: {
    Departments: { targetCube: () => departmentsCube, relationship: 'belongsTo', on: [{ source: employees.departmentId, target: departments.id }] },
    Productivity: { targetCube: () => productivityCube, relationship: 'hasMany', on: [{ source: employees.id, target: productivity.employeeId }] }
  },
  dimensions: {
    id: { name: 'id', title: 'Employee ID', sql: employees.id, type: 'number', primaryKey: true },
    name: { name: 'name', title: 'Employee Name', sql: employees.name, type: 'string' },
    email: { name: 'email', title: 'Email', sql: employees.email, type: 'string' },
    isActive: { name: 'isActive', title: 'Active', sql: employees.active, type: 'boolean' },
    city: { name: 'city', title: 'City', sql: employees.city, type: 'string' },
    region: { name: 'region', title: 'Region', sql: employees.region, type: 'string' },
    country: { name: 'country', title: 'Country', sql: employees.country, type: 'string' },
    salary: { name: 'salary', title: 'Salary', sql: employees.salary, type: 'number' },
    createdAt: { name: 'createdAt', title: 'Hire Date', sql: employees.createdAt, type: 'time' }
  },
  measures: {
    count: { name: 'count', title: 'Total Employees', type: 'countDistinct', sql: employees.id },
    activeCount: { name: 'activeCount', title: 'Active Employees', type: 'countDistinct', sql: employees.id, filters: [() => eq(employees.active, true)] },
    avgSalary: { name: 'avgSalary', title: 'Average Salary', sql: employees.salary, type: 'avg' },
    totalSalary: { name: 'totalSalary', title: 'Total Salary', sql: employees.salary, type: 'sum' },
    maxSalary: { name: 'maxSalary', title: 'Max Salary', sql: employees.salary, type: 'max' },
    minSalary: { name: 'minSalary', title: 'Min Salary', sql: employees.salary, type: 'min' }
  }
}) as Cube

departmentsCube = defineCube('Departments', {
  title: 'Department Analytics',
  description: 'Department information and budget analysis',
  sql: (ctx: QueryContext): BaseQueryDefinition => ({
    from: departments,
    where: eq(departments.organisationId, ctx.securityContext.organisationId as number)
  }),
  joins: {
    Employees: { targetCube: () => employeesCube, relationship: 'hasMany', on: [{ source: departments.id, target: employees.departmentId }] }
  },
  dimensions: {
    id: { name: 'id', title: 'Department ID', sql: departments.id, type: 'number', primaryKey: true },
    name: { name: 'name', title: 'Department Name', sql: departments.name, type: 'string' },
    budget: { name: 'budget', title: 'Budget', sql: departments.budget, type: 'number' }
  },
  measures: {
    count: { name: 'count', title: 'Department Count', type: 'countDistinct', sql: departments.id },
    totalBudget: { name: 'totalBudget', title: 'Total Budget', sql: departments.budget, type: 'sum' },
    avgBudget: { name: 'avgBudget', title: 'Average Budget', sql: departments.budget, type: 'avg' }
  }
}) as Cube

productivityCube = defineCube('Productivity', {
  title: 'Productivity Metrics',
  description: 'Daily productivity data per employee',
  sql: (ctx: QueryContext): BaseQueryDefinition => ({
    from: productivity,
    where: eq(productivity.organisationId, ctx.securityContext.organisationId as number)
  }),
  joins: {
    Employees: { targetCube: () => employeesCube, relationship: 'belongsTo', on: [{ source: productivity.employeeId, target: employees.id }] },
    Departments: { targetCube: () => departmentsCube, relationship: 'belongsTo', on: [{ source: productivity.departmentId, target: departments.id }] }
  },
  dimensions: {
    id: { name: 'id', title: 'Record ID', sql: productivity.id, type: 'number', primaryKey: true },
    date: { name: 'date', title: 'Date', sql: productivity.date, type: 'time' },
    linesOfCode: { name: 'linesOfCode', title: 'Lines of Code', sql: productivity.linesOfCode, type: 'number' },
    pullRequests: { name: 'pullRequests', title: 'Pull Requests', sql: productivity.pullRequests, type: 'number' },
    happinessIndex: { name: 'happinessIndex', title: 'Happiness Index', sql: productivity.happinessIndex, type: 'number' }
  },
  measures: {
    count: { name: 'count', title: 'Total Records', type: 'count', sql: productivity.id },
    totalLinesOfCode: { name: 'totalLinesOfCode', title: 'Total Lines of Code', sql: productivity.linesOfCode, type: 'sum' },
    avgLinesOfCode: { name: 'avgLinesOfCode', title: 'Average Lines of Code', sql: productivity.linesOfCode, type: 'avg' },
    totalPullRequests: { name: 'totalPullRequests', title: 'Total Pull Requests', sql: productivity.pullRequests, type: 'sum' },
    avgHappiness: { name: 'avgHappiness', title: 'Average Happiness', sql: productivity.happinessIndex, type: 'avg' }
  }
}) as Cube

export const allCubes = [employeesCube, departmentsCube, productivityCube]
`

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
      const { departments, employees, productivity } = await import('../../schema/demo')
      const { DEMO_DDL, deptData, makeEmployeeData, makeProductivityData } = await import(
        '../../scripts/demo-data'
      )

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
        localDb.insert(productivity).values(prodData.slice(i, i + BATCH_SIZE)).run()
      }

      sqlite.close()
      await send('Demo data created', 60, `${prodData.length} productivity records`)

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
        description: 'Employees, Departments, and Productivity cubes for the demo dataset',
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
        config: {
          portlets: [
            {
              id: 'p1',
              title: 'Employees by Department',
              query: JSON.stringify({
                measures: ['Employees.count'],
                dimensions: ['Departments.name'],
              }),
              chartType: 'bar',
              chartConfig: { xAxis: ['Departments.name'], yAxis: ['Employees.count'] },
              w: 6, h: 4, x: 0, y: 0,
            },
            {
              id: 'p2',
              title: 'Average Salary',
              query: JSON.stringify({
                measures: ['Employees.avgSalary'],
                dimensions: ['Departments.name'],
              }),
              chartType: 'bar',
              chartConfig: { xAxis: ['Departments.name'], yAxis: ['Employees.avgSalary'] },
              w: 6, h: 4, x: 6, y: 0,
            },
            {
              id: 'p3',
              title: 'Code Output Over Time',
              query: JSON.stringify({
                measures: ['Productivity.totalLinesOfCode'],
                timeDimensions: [{ dimension: 'Productivity.date', granularity: 'week' }],
              }),
              chartType: 'line',
              chartConfig: { xAxis: ['Productivity.date'], yAxis: ['Productivity.totalLinesOfCode'] },
              w: 12, h: 4, x: 0, y: 4,
            },
          ],
          filters: [],
        },
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
