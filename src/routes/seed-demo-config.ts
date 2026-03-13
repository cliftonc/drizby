/**
 * Shared demo seed configuration — schema source, cube source, dashboard portlets,
 * and internal DB seeding function.
 * Used by both seed-demo.ts (SSE endpoint) and settings.ts (reseed endpoint).
 */

import { and, eq } from 'drizzle-orm'
import { invalidateCubeAppCache } from '../../app'
import {
  analyticsPages,
  connections,
  contentGroupVisibility,
  cubeDefinitions,
  groupTypes,
  groups,
  notebooks,
  schemaFiles,
  userGroups,
  users,
} from '../../schema'
import { connectionManager } from '../services/connection-manager'

const DEMO_DB_PATH = 'data/demo.sqlite'

/**
 * Removes all demo data: connection, cubes, schemas, pages, notebooks,
 * demo groups, and the demo.sqlite file.
 * Safe — only deletes demo-specific data, not user-created content.
 */
export async function clearDemoData(db: any) {
  const [existingConn] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.name, 'Demo SQLite'), eq(connections.organisationId, 1)))
    .limit(1)

  if (existingConn) {
    await connectionManager.remove(existingConn.id)
    invalidateCubeAppCache()

    await db.delete(cubeDefinitions).where(eq(cubeDefinitions.connectionId, existingConn.id))
    await db.delete(schemaFiles).where(eq(schemaFiles.connectionId, existingConn.id))
    await db.delete(analyticsPages).where(eq(analyticsPages.connectionId, existingConn.id))
    await db.delete(notebooks).where(eq(notebooks.connectionId, existingConn.id))
    await db.delete(connections).where(eq(connections.id, existingConn.id))
  }

  // Delete demo groups (only the "Department" type created by seeding)
  const [demoType] = await db
    .select()
    .from(groupTypes)
    .where(and(eq(groupTypes.name, 'Department'), eq(groupTypes.organisationId, 1)))
    .limit(1)

  if (demoType) {
    // Get group IDs for this type to clean up visibility + memberships
    const demoGroups = await db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.groupTypeId, demoType.id))
    const demoGroupIds = demoGroups.map((g: any) => g.id)

    if (demoGroupIds.length > 0) {
      const { inArray } = await import('drizzle-orm')
      await db
        .delete(contentGroupVisibility)
        .where(inArray(contentGroupVisibility.groupId, demoGroupIds))
      await db.delete(userGroups).where(inArray(userGroups.groupId, demoGroupIds))
      await db.delete(groups).where(inArray(groups.id, demoGroupIds))
    }
    await db.delete(groupTypes).where(eq(groupTypes.id, demoType.id))
  }

  // Delete demo.sqlite file
  const { unlinkSync } = await import('node:fs')
  try {
    unlinkSync(DEMO_DB_PATH)
    unlinkSync(`${DEMO_DB_PATH}-wal`)
    unlinkSync(`${DEMO_DB_PATH}-shm`)
  } catch {}
}

/**
 * Seeds the demo SQLite file, then registers the connection, schema, cubes,
 * dashboard, and groups in the internal (drizby) database.
 * Cleans up any existing demo data first.
 * Single source of truth — called from both SSE seed and reseed endpoints.
 */
export async function seedDemoInternalData(db: any, userId?: number) {
  await clearDemoData(db)

  // 1. Create and populate demo SQLite database
  const { mkdirSync } = await import('node:fs')
  const Database = (await import('better-sqlite3')).default
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const {
    departments: demoDepts,
    employees: demoEmps,
    productivity: demoProd,
    prEvents: demoPR,
  } = await import('../../schema/demo')
  const { DEMO_DDL, deptData, makeEmployeeData, makeProductivityData, makePREventsData } =
    await import('../../scripts/demo-data')

  mkdirSync('data', { recursive: true })
  const sqlite = new Database(DEMO_DB_PATH)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(DEMO_DDL)
  const localDb = drizzle(sqlite)

  const depts = localDb.insert(demoDepts).values(deptData).returning().all()
  const emps = localDb
    .insert(demoEmps)
    .values(makeEmployeeData(depts.map(d => d.id)))
    .returning()
    .all()

  const prodData = makeProductivityData(emps)
  const BATCH = 100
  for (let i = 0; i < prodData.length; i += BATCH) {
    localDb
      .insert(demoProd)
      .values(prodData.slice(i, i + BATCH))
      .run()
  }
  const prData = makePREventsData(emps)
  for (let i = 0; i < prData.length; i += BATCH) {
    localDb
      .insert(demoPR)
      .values(prData.slice(i, i + BATCH))
      .run()
  }
  sqlite.close()

  // 2. Register connection
  const [conn] = await db
    .insert(connections)
    .values({
      name: 'Demo SQLite',
      description: 'Built-in demo database with sample employee data',
      engineType: 'sqlite',
      connectionString: `file:${DEMO_DB_PATH}`,
      organisationId: 1,
    })
    .returning()

  // 3. Schema + cubes + dashboard
  const [schema] = await db
    .insert(schemaFiles)
    .values({
      name: 'demo-schema.ts',
      sourceCode: DEMO_SCHEMA_SOURCE,
      connectionId: conn.id,
      organisationId: 1,
    })
    .returning()

  await db.insert(cubeDefinitions).values({
    name: 'Demo Cubes',
    title: 'Employee Analytics Cubes',
    description: 'Employees, Departments, Productivity, and PR Events cubes for the demo dataset',
    sourceCode: DEMO_CUBES_SOURCE,
    schemaFileId: schema.id,
    connectionId: conn.id,
    organisationId: 1,
  })

  await db.insert(analyticsPages).values({
    name: 'Overview Dashboard',
    description: 'Employee and productivity overview',
    connectionId: conn.id,
    config: { portlets: DEMO_PORTLETS, filters: [] },
    organisationId: 1,
  })

  // 4. Groups: ensure Department type with Engineering, Marketing, Sales, HR
  //    Idempotent — reuses existing type/groups if they already exist.
  const [existingType] = await db
    .select()
    .from(groupTypes)
    .where(and(eq(groupTypes.name, 'Department'), eq(groupTypes.organisationId, 1)))
    .limit(1)

  const deptType = existingType
    ? existingType
    : (
        await db
          .insert(groupTypes)
          .values({
            name: 'Department',
            description: 'Organizational departments',
            organisationId: 1,
          })
          .returning()
      )[0]

  const deptNames = ['Engineering', 'Marketing', 'Sales', 'HR']
  const deptGroups: any[] = []
  for (const name of deptNames) {
    const [existing] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.name, name), eq(groups.groupTypeId, deptType.id)))
      .limit(1)
    if (existing) {
      deptGroups.push(existing)
    } else {
      const [created] = await db
        .insert(groups)
        .values({ name, groupTypeId: deptType.id, organisationId: 1 })
        .returning()
      deptGroups.push(created)
    }
  }

  // Add the current user (or first admin) to Engineering, Marketing, Sales
  let seedUserId = userId
  if (!seedUserId) {
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'))
      .limit(1)
    seedUserId = admin?.id
  }

  if (seedUserId) {
    const adminDepts = deptGroups.filter((g: any) =>
      ['Engineering', 'Marketing', 'Sales'].includes(g.name)
    )
    for (const g of adminDepts) {
      const [existing] = await db
        .select()
        .from(userGroups)
        .where(and(eq(userGroups.userId, seedUserId), eq(userGroups.groupId, g.id)))
        .limit(1)
      if (!existing) {
        await db.insert(userGroups).values({ userId: seedUserId, groupId: g.id })
      }
    }
  }

  // 5. Initialize connection and compile
  await connectionManager.createConnection(conn.id, conn.connectionString, conn.engineType)
  await connectionManager.compileAll(db)

  return conn
}

export const DEMO_SCHEMA_SOURCE = `import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core'

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

export const prEvents = sqliteTable('pr_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  prNumber: integer('pr_number').notNull(),
  eventType: text('event_type').notNull(),
  employeeId: integer('employee_id').notNull(),
  organisationId: integer('organisation_id').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
})
`

export const DEMO_CUBES_SOURCE = `import { eq, and, inArray, sql } from 'drizzle-orm'
import { defineCube } from 'drizzle-cube/server'
import type { QueryContext, BaseQueryDefinition, Cube } from 'drizzle-cube/server'
import { employees, departments, productivity, prEvents } from './demo-schema'

// Helper: build a department filter based on the user's Department groups.
// Admins see all data. Members only see departments they belong to.
function deptFilter(col: any, ctx: QueryContext) {
  const depts = ctx.securityContext.groups?.Department
  if (!depts || depts.length === 0) return undefined
  return inArray(col, sql\`(SELECT id FROM departments WHERE name IN (\${sql.join(depts.map(d => sql\`\${d}\`), sql\`,\`)}))\`)
}

let employeesCube: Cube
let departmentsCube: Cube
let productivityCube: Cube
let prEventsCube: Cube

employeesCube = defineCube('Employees', {
  title: 'Employee Analytics',
  description: 'Employee data and metrics',
  sql: (ctx: QueryContext): BaseQueryDefinition => ({
    from: employees,
    where: deptFilter(employees.departmentId, ctx)
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
    where: deptFilter(departments.id, ctx)
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
    where: deptFilter(productivity.departmentId, ctx)
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

prEventsCube = defineCube('PREvents', {
  title: 'PR Events',
  description: 'Pull request lifecycle events for funnel analysis',
  sql: (ctx: QueryContext): BaseQueryDefinition => ({
    from: prEvents
  }),
  joins: {
    Employees: { targetCube: () => employeesCube, relationship: 'belongsTo', on: [{ source: prEvents.employeeId, target: employees.id }] }
  },
  dimensions: {
    id: { name: 'id', title: 'Event ID', sql: prEvents.id, type: 'number', primaryKey: true },
    prNumber: { name: 'prNumber', title: 'PR Number', sql: prEvents.prNumber, type: 'number' },
    eventType: { name: 'eventType', title: 'Event Type', sql: prEvents.eventType, type: 'string' },
    timestamp: { name: 'timestamp', title: 'Timestamp', sql: prEvents.timestamp, type: 'time' }
  },
  measures: {
    count: { name: 'count', title: 'Total Events', type: 'count', sql: prEvents.id },
    uniquePRs: { name: 'uniquePRs', title: 'Unique PRs', type: 'countDistinct', sql: prEvents.prNumber }
  },
  meta: {
    eventStream: {
      bindingKey: 'PREvents.prNumber',
      timeDimension: 'PREvents.timestamp'
    }
  }
}) as Cube

export const allCubes = [employeesCube, departmentsCube, productivityCube, prEventsCube]
`

export const DEMO_PORTLETS = [
  {
    id: 'p1',
    title: 'Employees by Department',
    query: JSON.stringify({
      measures: ['Employees.count'],
      dimensions: ['Departments.name'],
    }),
    chartType: 'bar',
    chartConfig: { xAxis: ['Departments.name'], yAxis: ['Employees.count'] },
    w: 6,
    h: 4,
    x: 0,
    y: 0,
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
    w: 6,
    h: 4,
    x: 6,
    y: 0,
  },
  {
    id: 'p3',
    title: 'Code Output Over Time',
    query: JSON.stringify({
      measures: ['Productivity.totalLinesOfCode'],
      timeDimensions: [{ dimension: 'Productivity.date', granularity: 'week' }],
    }),
    chartType: 'line',
    chartConfig: {
      xAxis: ['Productivity.date'],
      yAxis: ['Productivity.totalLinesOfCode'],
    },
    w: 12,
    h: 4,
    x: 0,
    y: 4,
  },
  {
    id: 'p4',
    title: 'PR Lifecycle Funnel',
    analysisConfig: {
      version: 1,
      analysisType: 'funnel',
      activeView: 'chart',
      charts: {
        funnel: {
          chartType: 'funnel',
          chartConfig: {},
          displayConfig: {
            funnelOrientation: 'horizontal',
            showLegend: true,
            showTooltip: true,
          },
        },
      },
      query: {
        funnel: {
          bindingKey: 'PREvents.prNumber',
          timeDimension: 'PREvents.timestamp',
          steps: [
            {
              name: 'Created',
              filter: { member: 'PREvents.eventType', operator: 'equals', values: ['created'] },
            },
            {
              name: 'Review Requested',
              filter: {
                member: 'PREvents.eventType',
                operator: 'equals',
                values: ['review_requested'],
              },
            },
            {
              name: 'Approved',
              filter: { member: 'PREvents.eventType', operator: 'equals', values: ['approved'] },
            },
            {
              name: 'Merged',
              filter: { member: 'PREvents.eventType', operator: 'equals', values: ['merged'] },
            },
          ],
          includeTimeMetrics: true,
        },
      },
    },
    chartType: 'funnel',
    w: 12,
    h: 6,
    x: 0,
    y: 8,
  },
]
