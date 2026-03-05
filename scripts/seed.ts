/**
 * Database seeding script with sample data for DC-BI
 */

import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { schema, employees, departments, productivity, connections, analyticsPages, schemaFiles, cubeDefinitions } from '../schema'

const connectionString = process.env.DATABASE_URL || 'postgresql://dc_bi_user:dc_bi_pass123@localhost:54930/dc_bi_db'

// Demo schema source code (TypeScript)
const DEMO_SCHEMA_SOURCE = `import { pgTable, integer, text, real, boolean, timestamp, index } from 'drizzle-orm/pg-core'

export const employees = pgTable('employees', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  email: text('email'),
  active: boolean('active').default(true),
  departmentId: integer('department_id'),
  organisationId: integer('organisation_id').notNull(),
  salary: real('salary'),
  city: text('city'),
  region: text('region'),
  country: text('country'),
  createdAt: timestamp('created_at').defaultNow()
})

export const departments = pgTable('departments', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  organisationId: integer('organisation_id').notNull(),
  budget: real('budget')
})

export const productivity = pgTable('productivity', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  employeeId: integer('employee_id').notNull(),
  departmentId: integer('department_id'),
  date: timestamp('date').notNull(),
  linesOfCode: integer('lines_of_code').default(0),
  pullRequests: integer('pull_requests').default(0),
  happinessIndex: integer('happiness_index'),
  organisationId: integer('organisation_id').notNull(),
  createdAt: timestamp('created_at').defaultNow()
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

async function seedDatabase() {
  console.log('Seeding DC-BI database...')
  const client = postgres(connectionString)
  const db = drizzle(client, { schema })

  try {
    // Seed departments
    const deptData = [
      { name: 'Engineering', organisationId: 1, budget: 500000 },
      { name: 'Marketing', organisationId: 1, budget: 200000 },
      { name: 'Sales', organisationId: 1, budget: 300000 },
      { name: 'HR', organisationId: 1, budget: 150000 }
    ]
    const depts = await db.insert(departments).values(deptData).returning()
    console.log(`Seeded ${depts.length} departments`)

    // Seed employees
    const employeeData = [
      { name: 'Alice Chen', email: 'alice@example.com', active: true, departmentId: depts[0].id, organisationId: 1, salary: 120000, city: 'San Francisco', region: 'California', country: 'USA' },
      { name: 'Bob Smith', email: 'bob@example.com', active: true, departmentId: depts[0].id, organisationId: 1, salary: 110000, city: 'San Francisco', region: 'California', country: 'USA' },
      { name: 'Carol White', email: 'carol@example.com', active: true, departmentId: depts[0].id, organisationId: 1, salary: 105000, city: 'Portland', region: 'Oregon', country: 'USA' },
      { name: 'Dave Johnson', email: 'dave@example.com', active: true, departmentId: depts[1].id, organisationId: 1, salary: 95000, city: 'New York', region: 'New York', country: 'USA' },
      { name: 'Eve Brown', email: 'eve@example.com', active: true, departmentId: depts[1].id, organisationId: 1, salary: 90000, city: 'New York', region: 'New York', country: 'USA' },
      { name: 'Frank Garcia', email: 'frank@example.com', active: true, departmentId: depts[2].id, organisationId: 1, salary: 100000, city: 'Chicago', region: 'Illinois', country: 'USA' },
      { name: 'Grace Lee', email: 'grace@example.com', active: true, departmentId: depts[2].id, organisationId: 1, salary: 98000, city: 'Chicago', region: 'Illinois', country: 'USA' },
      { name: 'Henry Wilson', email: 'henry@example.com', active: false, departmentId: depts[2].id, organisationId: 1, salary: 85000, city: 'Austin', region: 'Texas', country: 'USA' },
      { name: 'Ivy Taylor', email: 'ivy@example.com', active: true, departmentId: depts[3].id, organisationId: 1, salary: 88000, city: 'Denver', region: 'Colorado', country: 'USA' },
      { name: 'Jack Davis', email: 'jack@example.com', active: true, departmentId: depts[3].id, organisationId: 1, salary: 92000, city: 'Seattle', region: 'Washington', country: 'USA' }
    ]
    const emps = await db.insert(employees).values(employeeData).returning()
    console.log(`Seeded ${emps.length} employees`)

    // Seed productivity data (3 months of daily data for each employee)
    const prodData: Array<{
      employeeId: number
      departmentId: number | null
      date: Date
      linesOfCode: number
      pullRequests: number
      happinessIndex: number
      organisationId: number
    }> = []
    const startDate = new Date('2024-10-01')

    for (const emp of emps) {
      for (let day = 0; day < 90; day++) {
        const date = new Date(startDate)
        date.setDate(date.getDate() + day)

        // Skip weekends
        if (date.getDay() === 0 || date.getDay() === 6) continue

        prodData.push({
          employeeId: emp.id,
          departmentId: emp.departmentId,
          date,
          linesOfCode: Math.floor(Math.random() * 300) + 50,
          pullRequests: Math.floor(Math.random() * 4),
          happinessIndex: Math.floor(Math.random() * 5) + 5,
          organisationId: 1
        })
      }
    }
    await db.insert(productivity).values(prodData)
    console.log(`Seeded ${prodData.length} productivity records`)

    // Seed a default "local" connection entry pointing to this database
    const [demoConnection] = await db.insert(connections).values({
      name: 'Local PostgreSQL (Demo)',
      description: 'Built-in demo database with sample employee data',
      engineType: 'postgres',
      connectionString: connectionString,
      organisationId: 1
    }).returning()
    console.log('Seeded default connection')

    // Seed demo schema file
    const [demoSchemaFile] = await db.insert(schemaFiles).values({
      name: 'demo-schema.ts',
      sourceCode: DEMO_SCHEMA_SOURCE,
      connectionId: demoConnection.id,
      organisationId: 1,
    }).returning()
    console.log('Seeded demo schema file')

    // Seed demo cube definitions
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

    // Seed an example dashboard
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
              dimensions: ['Departments.name']
            }),
            chartType: 'bar',
            w: 6, h: 4, x: 0, y: 0
          },
          {
            id: 'p2',
            title: 'Average Salary',
            query: JSON.stringify({
              measures: ['Employees.avgSalary'],
              dimensions: ['Departments.name']
            }),
            chartType: 'bar',
            w: 6, h: 4, x: 6, y: 0
          },
          {
            id: 'p3',
            title: 'Code Output Over Time',
            query: JSON.stringify({
              measures: ['Productivity.totalLinesOfCode'],
              timeDimensions: [{
                dimension: 'Productivity.date',
                granularity: 'week'
              }]
            }),
            chartType: 'line',
            w: 12, h: 4, x: 0, y: 4
          }
        ],
        filters: []
      },
      organisationId: 1
    })
    console.log('Seeded example dashboard')

    console.log('\nSeeding completed successfully!')
    console.log('\nSeeded data:')
    console.log('- 4 departments')
    console.log(`- ${emps.length} employees`)
    console.log(`- ${prodData.length} productivity records`)
    console.log('- 1 database connection')
    console.log('- 1 schema file (demo-schema.ts)')
    console.log('- 1 cube definition (Demo Cubes)')
    console.log('- 1 example dashboard')

    process.exit(0)
  } catch (error) {
    console.error('Seeding failed:', error)
    process.exit(1)
  }
}

seedDatabase()
