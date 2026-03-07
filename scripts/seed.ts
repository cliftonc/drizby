/**
 * Database seeding script for Drizby
 * Creates the demo SQLite database and registers it as a connection in the internal DB.
 */

import 'dotenv/config'
import { analyticsPages, connections, cubeDefinitions, schemaFiles } from '../schema'
import { db } from '../src/db/index'
import { seedDemo } from './seed-demo'

// Demo schema source code (TypeScript) — uses sqliteTable for the demo SQLite DB
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

// Demo cube definitions source code (TypeScript)
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
    Departments: {
      targetCube: () => departmentsCube,
      relationship: 'belongsTo',
      on: [
        { source: employees.departmentId, target: departments.id }
      ]
    },
    Productivity: {
      targetCube: () => productivityCube,
      relationship: 'hasMany',
      on: [
        { source: employees.id, target: productivity.employeeId }
      ]
    }
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
    activeCount: {
      name: 'activeCount',
      title: 'Active Employees',
      type: 'countDistinct',
      sql: employees.id,
      filters: [() => eq(employees.active, true)]
    },
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
    Employees: {
      targetCube: () => employeesCube,
      relationship: 'hasMany',
      on: [
        { source: departments.id, target: employees.departmentId }
      ]
    }
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
    Employees: {
      targetCube: () => employeesCube,
      relationship: 'belongsTo',
      on: [
        { source: productivity.employeeId, target: employees.id }
      ]
    },
    Departments: {
      targetCube: () => departmentsCube,
      relationship: 'belongsTo',
      on: [
        { source: productivity.departmentId, target: departments.id }
      ]
    }
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

const DEMO_DB_PATH = 'data/demo.sqlite'

async function seedDatabase() {
  console.log('Seeding Drizby database...')

  // Step 1: Create and populate the demo SQLite database
  seedDemo(DEMO_DB_PATH)

  // Step 2: Register it as a connection in the internal DB
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
  console.log('Registered demo connection')

  // Step 3: Seed demo schema file
  const [demoSchemaFile] = await db
    .insert(schemaFiles)
    .values({
      name: 'demo-schema.ts',
      sourceCode: DEMO_SCHEMA_SOURCE,
      connectionId: demoConnection.id,
      organisationId: 1,
    })
    .returning()
  console.log('Seeded demo schema file')

  // Step 4: Seed demo cube definitions
  await db.insert(cubeDefinitions).values({
    name: 'Demo Cubes',
    title: 'Employee Analytics Cubes',
    description: 'Employees, Departments, and Productivity cubes for the demo dataset',
    sourceCode: DEMO_CUBES_SOURCE,
    schemaFileId: demoSchemaFile.id,
    connectionId: demoConnection.id,
    organisationId: 1,
  })
  console.log('Seeded demo cube definitions')

  // Step 5: Seed an example dashboard
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
            timeDimensions: [
              {
                dimension: 'Productivity.date',
                granularity: 'week',
              },
            ],
          }),
          chartType: 'line',
          chartConfig: { xAxis: ['Productivity.date'], yAxis: ['Productivity.totalLinesOfCode'] },
          w: 12,
          h: 4,
          x: 0,
          y: 4,
        },
      ],
      filters: [],
    },
    organisationId: 1,
  })
  console.log('Seeded example dashboard')

  console.log('\nSeeding completed successfully!')
  process.exit(0)
}

seedDatabase().catch(err => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
