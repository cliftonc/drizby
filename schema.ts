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
    engineType: text('engine_type').notNull(), // 'postgres', 'mysql', 'sqlite', 'singlestore', 'duckdb'
    provider: text('provider'), // e.g. 'postgres-js', 'neon', 'mysql2', 'better-sqlite3', etc. Null = default for engineType
    connectionString: text('connection_string').notNull(), // URL string or JSON for structured providers
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
        query?: string
        chartType: string
        chartConfig?: Record<string, unknown>
        displayConfig?: Record<string, unknown>
        analysisConfig?: Record<string, unknown>
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

// Password reset tokens
export const passwordResetTokens = sqliteTable('password_reset_tokens', {
  id: text('id').primaryKey(), // 64-char hex token
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
  userGroups: many(userGroups),
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

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}))

// ============================================================================
// OAuth 2.1 Tables (MCP authentication)
// ============================================================================

// Dynamically registered OAuth/MCP clients
export const oauthClients = sqliteTable('oauth_clients', {
  id: text('id').primaryKey(), // client_id
  name: text('name').notNull(),
  secret: text('secret'), // hashed, nullable for public clients
  redirectUris: text('redirect_uris', { mode: 'json' }).notNull().$type<string[]>(),
  allowedGrants: text('allowed_grants', { mode: 'json' })
    .notNull()
    .$type<string[]>()
    .$defaultFn(() => ['authorization_code', 'refresh_token']),
  scopes: text('scopes', { mode: 'json' })
    .notNull()
    .$type<string[]>()
    .$defaultFn(() => ['mcp:read']),
  organisationId: integer('organisation_id').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// Access + refresh tokens
export const oauthTokens = sqliteTable(
  'oauth_tokens',
  {
    accessToken: text('access_token').primaryKey(),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }).notNull(),
    refreshToken: text('refresh_token'),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scopes: text('scopes', { mode: 'json' }).notNull().$type<string[]>(),
    isRevoked: integer('is_revoked', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [
    index('idx_oauth_tokens_refresh').on(table.refreshToken),
    index('idx_oauth_tokens_user').on(table.userId),
  ]
)

// Short-lived authorization codes
export const oauthAuthCodes = sqliteTable('oauth_auth_codes', {
  code: text('code').primaryKey(),
  redirectUri: text('redirect_uri'),
  codeChallenge: text('code_challenge'),
  codeChallengeMethod: text('code_challenge_method').default('S256'),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClients.id, { onDelete: 'cascade' }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  scopes: text('scopes', { mode: 'json' }).notNull().$type<string[]>(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  isRevoked: integer('is_revoked', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

// OAuth relations
export const oauthClientsRelations = relations(oauthClients, ({ many }) => ({
  tokens: many(oauthTokens),
  authCodes: many(oauthAuthCodes),
}))

export const oauthTokensRelations = relations(oauthTokens, ({ one }) => ({
  client: one(oauthClients, {
    fields: [oauthTokens.clientId],
    references: [oauthClients.id],
  }),
  user: one(users, {
    fields: [oauthTokens.userId],
    references: [users.id],
  }),
}))

export const oauthAuthCodesRelations = relations(oauthAuthCodes, ({ one }) => ({
  client: one(oauthClients, {
    fields: [oauthAuthCodes.clientId],
    references: [oauthClients.id],
  }),
  user: one(users, {
    fields: [oauthAuthCodes.userId],
    references: [users.id],
  }),
}))

// ============================================================================
// Groups System Tables
// ============================================================================

// Group types — taxonomy categories (e.g., "Department", "Role")
export const groupTypes = sqliteTable(
  'group_types',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    organisationId: integer('organisation_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [
    uniqueIndex('idx_group_types_name_org').on(table.name, table.organisationId),
    index('idx_group_types_org').on(table.organisationId),
  ]
)

// Groups — individual groups within a taxonomy
export const groups = sqliteTable(
  'groups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    groupTypeId: integer('group_type_id')
      .notNull()
      .references(() => groupTypes.id, { onDelete: 'cascade' }),
    parentId: integer('parent_id').references((): any => groups.id, { onDelete: 'set null' }),
    organisationId: integer('organisation_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [
    uniqueIndex('idx_groups_name_type').on(table.name, table.groupTypeId),
    index('idx_groups_org').on(table.organisationId),
    index('idx_groups_type').on(table.groupTypeId),
  ]
)

// User-group membership junction table
export const userGroups = sqliteTable(
  'user_groups',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: integer('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [
    index('idx_user_groups_user').on(table.userId),
    index('idx_user_groups_group').on(table.groupId),
  ]
)

// Content-group visibility junction table
export const contentGroupVisibility = sqliteTable(
  'content_group_visibility',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    contentType: text('content_type').notNull(), // 'dashboard' | 'notebook'
    contentId: integer('content_id').notNull(),
    groupId: integer('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [
    uniqueIndex('idx_cgv_unique').on(table.contentType, table.contentId, table.groupId),
    index('idx_cgv_content').on(table.contentType, table.contentId),
    index('idx_cgv_group').on(table.groupId),
  ]
)

// Groups relations
export const groupTypesRelations = relations(groupTypes, ({ many }) => ({
  groups: many(groups),
}))

export const groupsRelations = relations(groups, ({ one, many }) => ({
  groupType: one(groupTypes, {
    fields: [groups.groupTypeId],
    references: [groupTypes.id],
  }),
  parent: one(groups, {
    fields: [groups.parentId],
    references: [groups.id],
    relationName: 'parentChild',
  }),
  children: many(groups, { relationName: 'parentChild' }),
  userGroups: many(userGroups),
  contentVisibility: many(contentGroupVisibility),
}))

export const userGroupsRelations = relations(userGroups, ({ one }) => ({
  user: one(users, {
    fields: [userGroups.userId],
    references: [users.id],
  }),
  group: one(groups, {
    fields: [userGroups.groupId],
    references: [groups.id],
  }),
}))

export const contentGroupVisibilityRelations = relations(contentGroupVisibility, ({ one }) => ({
  group: one(groups, {
    fields: [contentGroupVisibility.groupId],
    references: [groups.id],
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
  passwordResetTokens,
  groupTypes,
  groups,
  userGroups,
  contentGroupVisibility,
  oauthClients,
  oauthTokens,
  oauthAuthCodes,
  connectionsRelations,
  schemaFilesRelations,
  cubeDefinitionsRelations,
  usersRelations,
  userSessionsRelations,
  oauthAccountsRelations,
  passwordResetTokensRelations,
  groupTypesRelations,
  groupsRelations,
  userGroupsRelations,
  contentGroupVisibilityRelations,
  oauthClientsRelations,
  oauthTokensRelations,
  oauthAuthCodesRelations,
}

export type Schema = typeof schema
