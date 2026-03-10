/**
 * Shared demo seed configuration — schema source, cube source, and dashboard portlets.
 * Used by both seed-demo.ts (SSE endpoint) and settings.ts (reseed endpoint).
 */

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

export const DEMO_CUBES_SOURCE = `import { eq } from 'drizzle-orm'
import { defineCube } from 'drizzle-cube/server'
import type { QueryContext, BaseQueryDefinition, Cube } from 'drizzle-cube/server'
import { employees, departments, productivity, prEvents } from './demo-schema'

let employeesCube: Cube
let departmentsCube: Cube
let productivityCube: Cube
let prEventsCube: Cube

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

prEventsCube = defineCube('PREvents', {
  title: 'PR Events',
  description: 'Pull request lifecycle events for funnel analysis',
  sql: (ctx: QueryContext): BaseQueryDefinition => ({
    from: prEvents,
    where: eq(prEvents.organisationId, ctx.securityContext.organisationId as number)
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
            { name: 'Created', filter: { member: 'PREvents.eventType', operator: 'equals', values: ['created'] } },
            { name: 'Review Requested', filter: { member: 'PREvents.eventType', operator: 'equals', values: ['review_requested'] } },
            { name: 'Approved', filter: { member: 'PREvents.eventType', operator: 'equals', values: ['approved'] } },
            { name: 'Merged', filter: { member: 'PREvents.eventType', operator: 'equals', values: ['merged'] } },
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
  {
    id: 'p5',
    title: 'PR Event Flow',
    analysisConfig: {
      version: 1,
      analysisType: 'flow',
      activeView: 'chart',
      charts: {
        flow: {
          chartType: 'sankey',
          chartConfig: {},
          displayConfig: {
            showGrid: false,
            showLegend: true,
            showTooltip: true,
          },
        },
      },
      query: {
        flow: {
          bindingKey: 'PREvents.prNumber',
          stepsAfter: 3,
          stepsBefore: 3,
          joinStrategy: 'auto',
          startingStep: {
            name: 'Starting Step',
            filter: {
              member: 'PREvents.eventType',
              values: ['created'],
              operator: 'equals',
            },
          },
          timeDimension: 'PREvents.timestamp',
          eventDimension: 'PREvents.eventType',
        },
      },
    },
    chartType: 'sankey',
    w: 6,
    h: 6,
    x: 0,
    y: 14,
  },
]
