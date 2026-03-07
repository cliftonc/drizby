/**
 * Drizby internal database schema (SQLite)
 * Core tables for the BI platform
 */

import { relations } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// ============================================================================
// BI Platform Core Tables
// ============================================================================

// Connections - manages database connections to different data sources
export const connections = sqliteTable(
  'connections',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    engineType: text('engine_type').notNull(), // 'postgres', 'mysql', 'sqlite', 'duckdb'
    connectionString: text('connection_string').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    organisationId: integer('organisation_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [index('idx_connections_org').on(table.organisationId)]
)

// Schema files - stores Drizzle table definitions as TypeScript source
export const schemaFiles = sqliteTable(
  'schema_files',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(), // e.g. "orders.ts"
    sourceCode: text('source_code').notNull(),
    connectionId: integer('connection_id').notNull(),
    organisationId: integer('organisation_id').notNull(),
    compiledAt: integer('compiled_at', { mode: 'timestamp' }),
    compilationErrors: text('compilation_errors', { mode: 'json' }),
    version: integer('version').default(1),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [
    index('idx_schema_files_org').on(table.organisationId),
    index('idx_schema_files_connection').on(table.connectionId),
  ]
)

// Cube definitions - stores cube configurations that can be edited and compiled
export const cubeDefinitions = sqliteTable(
  'cube_definitions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    title: text('title'),
    description: text('description'),
    sourceCode: text('source_code'), // Raw TypeScript source
    schemaFileId: integer('schema_file_id'), // FK to schemaFiles
    connectionId: integer('connection_id').notNull(),
    definition: text('definition', { mode: 'json' }), // Compiled metadata cache
    compiledAt: integer('compiled_at', { mode: 'timestamp' }),
    compilationErrors: text('compilation_errors', { mode: 'json' }),
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    organisationId: integer('organisation_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [
    index('idx_cube_definitions_org').on(table.organisationId),
    index('idx_cube_definitions_connection').on(table.connectionId),
  ]
)

// Analytics pages / dashboards
export const analyticsPages = sqliteTable(
  'analytics_pages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    connectionId: integer('connection_id'),
    organisationId: integer('organisation_id').notNull(),
    config: text('config', { mode: 'json' }).notNull().$type<{
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
    createdBy: integer('created_by'),
    order: integer('order').default(0),
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [
    index('idx_analytics_pages_org').on(table.organisationId),
    index('idx_analytics_pages_org_active').on(table.organisationId, table.isActive),
  ]
)

// Notebooks table - for storing AI notebook configurations
export const notebooks = sqliteTable('notebooks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  connectionId: integer('connection_id'),
  organisationId: integer('organisation_id').notNull(),
  config: text('config', { mode: 'json' }).$type<{
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
  createdBy: integer('created_by'),
  order: integer('order').default(0),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// Settings table
export const settings = sqliteTable(
  'settings',
  {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    organisationId: integer('organisation_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [index('idx_settings_org').on(table.organisationId)]
)

// Users
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull().unique(),
    username: text('username').notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash'),
    role: text('role').notNull().default('member'),
    isBlocked: integer('is_blocked', { mode: 'boolean' }).notNull().default(false),
    avatarUrl: text('avatar_url'),
    organisationId: integer('organisation_id').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [index('idx_users_org').on(table.organisationId)]
)

// User sessions
export const userSessions = sqliteTable('user_sessions', {
  id: text('id').primaryKey(), // 64-char hex
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// OAuth accounts
export const oauthAccounts = sqliteTable(
  'oauth_accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [uniqueIndex('idx_oauth_provider_user').on(table.provider, table.providerUserId)]
)

// ============================================================================
// Relations
// ============================================================================

export const connectionsRelations = relations(connections, ({ many }) => ({
  cubeDefinitions: many(cubeDefinitions),
  schemaFiles: many(schemaFiles),
}))

export const schemaFilesRelations = relations(schemaFiles, ({ one }) => ({
  connection: one(connections, {
    fields: [schemaFiles.connectionId],
    references: [connections.id],
  }),
}))

export const cubeDefinitionsRelations = relations(cubeDefinitions, ({ one }) => ({
  connection: one(connections, {
    fields: [cubeDefinitions.connectionId],
    references: [connections.id],
  }),
  schemaFile: one(schemaFiles, {
    fields: [cubeDefinitions.schemaFileId],
    references: [schemaFiles.id],
  }),
}))

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(userSessions),
  oauthAccounts: many(oauthAccounts),
}))

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.id],
  }),
}))

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, {
    fields: [oauthAccounts.userId],
    references: [users.id],
  }),
}))

// Export schema for use with Drizzle
export const schema = {
  connections,
  schemaFiles,
  cubeDefinitions,
  analyticsPages,
  notebooks,
  settings,
  users,
  userSessions,
  oauthAccounts,
  connectionsRelations,
  schemaFilesRelations,
  cubeDefinitionsRelations,
  usersRelations,
  userSessionsRelations,
  oauthAccountsRelations,
}

export type Schema = typeof schema
