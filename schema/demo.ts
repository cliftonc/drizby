/**
 * Demo data tables (SQLite)
 * These live in a separate demo.sqlite database
 */

import { relations } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const employees = sqliteTable(
  'employees',
  {
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
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [
    index('idx_employees_org').on(table.organisationId),
    index('idx_employees_org_created').on(table.organisationId, table.createdAt),
  ]
)

export const departments = sqliteTable(
  'departments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    organisationId: integer('organisation_id').notNull(),
    budget: real('budget'),
  },
  table => [index('idx_departments_org').on(table.organisationId)]
)

export const productivity = sqliteTable(
  'productivity',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    employeeId: integer('employee_id').notNull(),
    departmentId: integer('department_id'),
    date: integer('date', { mode: 'timestamp' }).notNull(),
    linesOfCode: integer('lines_of_code').default(0),
    pullRequests: integer('pull_requests').default(0),
    happinessIndex: integer('happiness_index'),
    organisationId: integer('organisation_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [
    index('idx_productivity_org').on(table.organisationId),
    index('idx_productivity_org_date').on(table.organisationId, table.date),
  ]
)

export const employeesRelations = relations(employees, ({ one, many }) => ({
  department: one(departments, {
    fields: [employees.departmentId],
    references: [departments.id],
  }),
  productivityMetrics: many(productivity),
}))

export const departmentsRelations = relations(departments, ({ many }) => ({
  employees: many(employees),
}))

export const productivityRelations = relations(productivity, ({ one }) => ({
  employee: one(employees, {
    fields: [productivity.employeeId],
    references: [employees.id],
  }),
}))
