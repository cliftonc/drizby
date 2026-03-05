/**
 * DC-BI database schema
 * Core tables for the BI platform plus sample analytics data
 */

import { pgTable, integer, text, real, boolean, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ============================================================================
// BI Platform Core Tables
// ============================================================================

// Connections - manages database connections to different data sources
export const connections = pgTable('connections', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  description: text('description'),
  engineType: text('engine_type').notNull(), // 'postgres', 'mysql', 'sqlite', 'duckdb'
  connectionString: text('connection_string').notNull(),
  isActive: boolean('is_active').default(true),
  organisationId: integer('organisation_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => [
  index('idx_connections_org').on(table.organisationId)
])

// Cube definitions - stores cube configurations that can be edited and compiled
export const cubeDefinitions = pgTable('cube_definitions', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  title: text('title'),
  description: text('description'),
  connectionId: integer('connection_id').notNull(),
  definition: jsonb('definition').notNull(), // The cube definition JSON
  isActive: boolean('is_active').default(true),
  organisationId: integer('organisation_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => [
  index('idx_cube_definitions_org').on(table.organisationId),
  index('idx_cube_definitions_connection').on(table.connectionId)
])

// Analytics pages / dashboards
export const analyticsPages = pgTable('analytics_pages', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  description: text('description'),
  organisationId: integer('organisation_id').notNull(),
  config: jsonb('config').notNull().$type<{
    portlets: Array<{
      id: string
      title: string
      query: string
      chartType: string
      chartConfig?: Record<string, unknown>
      displayConfig?: Record<string, unknown>
      dashboardFilterMapping?: string[]
      w: number
      h: number
      x: number
      y: number
    }>
    filters?: Array<{
      id: string
      label: string
      isUniversalTime?: boolean
      filter: {
        member: string
        operator: string
        values: unknown[]
      }
    }>
  }>(),
  order: integer('order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => [
  index('idx_analytics_pages_org').on(table.organisationId),
  index('idx_analytics_pages_org_active').on(table.organisationId, table.isActive)
])

// Notebooks table - for storing AI notebook configurations
export const notebooks = pgTable('notebooks', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  description: text('description'),
  organisationId: integer('organisation_id').notNull(),
  config: jsonb('config').$type<{
    blocks: Array<{
      id: string
      type: 'portlet' | 'markdown'
      title?: string
      content?: string
      query?: string
      chartType?: string
      chartConfig?: Record<string, unknown>
      displayConfig?: Record<string, unknown>
    }>
    messages: Array<{
      id: string
      role: 'user' | 'assistant'
      content: string
      toolCalls?: Array<{ name: string; status: string; result?: unknown }>
      timestamp: number
    }>
  }>(),
  order: integer('order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
})

// Settings table
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  organisationId: integer('organisation_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => [
  index('idx_settings_org').on(table.organisationId)
])

// Users
export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('member'),
  isBlocked: boolean('is_blocked').notNull().default(false),
  avatarUrl: text('avatar_url'),
  organisationId: integer('organisation_id').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => [
  index('idx_users_org').on(table.organisationId)
])

// User sessions
export const userSessions = pgTable('user_sessions', {
  id: text('id').primaryKey(), // 64-char hex
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow()
})

// OAuth accounts
export const oauthAccounts = pgTable('oauth_accounts', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerUserId: text('provider_user_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => [
  uniqueIndex('idx_oauth_provider_user').on(table.provider, table.providerUserId)
])

// ============================================================================
// Sample Data Tables (for the built-in demo data source)
// ============================================================================

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
}, (table) => [
  index('idx_employees_org').on(table.organisationId),
  index('idx_employees_org_created').on(table.organisationId, table.createdAt)
])

export const departments = pgTable('departments', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  organisationId: integer('organisation_id').notNull(),
  budget: real('budget')
}, (table) => [
  index('idx_departments_org').on(table.organisationId)
])

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
}, (table) => [
  index('idx_productivity_org').on(table.organisationId),
  index('idx_productivity_org_date').on(table.organisationId, table.date)
])

// ============================================================================
// Relations
// ============================================================================

export const connectionsRelations = relations(connections, ({ many }) => ({
  cubeDefinitions: many(cubeDefinitions)
}))

export const cubeDefinitionsRelations = relations(cubeDefinitions, ({ one }) => ({
  connection: one(connections, {
    fields: [cubeDefinitions.connectionId],
    references: [connections.id]
  })
}))

export const employeesRelations = relations(employees, ({ one, many }) => ({
  department: one(departments, {
    fields: [employees.departmentId],
    references: [departments.id]
  }),
  productivityMetrics: many(productivity)
}))

export const departmentsRelations = relations(departments, ({ many }) => ({
  employees: many(employees)
}))

export const productivityRelations = relations(productivity, ({ one }) => ({
  employee: one(employees, {
    fields: [productivity.employeeId],
    references: [employees.id]
  })
}))

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(userSessions),
  oauthAccounts: many(oauthAccounts)
}))

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.id]
  })
}))

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, {
    fields: [oauthAccounts.userId],
    references: [users.id]
  })
}))

// Export schema for use with Drizzle
export const schema = {
  connections,
  cubeDefinitions,
  analyticsPages,
  notebooks,
  settings,
  users,
  userSessions,
  oauthAccounts,
  employees,
  departments,
  productivity,
  connectionsRelations,
  cubeDefinitionsRelations,
  employeesRelations,
  departmentsRelations,
  productivityRelations,
  usersRelations,
  userSessionsRelations,
  oauthAccountsRelations
}

export type Schema = typeof schema
