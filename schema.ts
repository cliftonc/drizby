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

// Dashboard share tokens — public, revocable share links
export const dashboardShareTokens = sqliteTable(
  'dashboard_share_tokens',
  {
    id: text('id').primaryKey(), // 32-char hex (random, opaque — the ID is the secret)
    dashboardId: integer('dashboard_id')
      .notNull()
      .references(() => analyticsPages.id, { onDelete: 'cascade' }),
    label: text('label'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }), // null = never expires
    revokedAt: integer('revoked_at', { mode: 'timestamp' }), // null = active
    lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
    organisationId: integer('organisation_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [
    index('idx_dst_dashboard').on(table.dashboardId),
    index('idx_dst_org').on(table.organisationId),
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
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(true),
    avatarUrl: text('avatar_url'),
    scimExternalId: text('scim_external_id'),
    scimProvisioned: integer('scim_provisioned', { mode: 'boolean' }).notNull().default(false),
    organisationId: integer('organisation_id').notNull().default(1),
    lastActiveAt: integer('last_active_at', { mode: 'timestamp' }),
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

export const analyticsPageRelations = relations(analyticsPages, ({ many }) => ({
  shareTokens: many(dashboardShareTokens),
}))

export const dashboardShareTokensRelations = relations(dashboardShareTokens, ({ one }) => ({
  dashboard: one(analyticsPages, {
    fields: [dashboardShareTokens.dashboardId],
    references: [analyticsPages.id],
  }),
  creator: one(users, {
    fields: [dashboardShareTokens.createdBy],
    references: [users.id],
  }),
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
// SCIM Provisioning Tables
// ============================================================================

// SCIM API tokens for IdP-to-Drizby provisioning
export const scimTokens = sqliteTable(
  'scim_tokens',
  {
    id: text('id').primaryKey(), // random hex
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    organisationId: integer('organisation_id').notNull().default(1),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [index('idx_scim_tokens_org').on(table.organisationId)]
)

export const scimTokensRelations = relations(scimTokens, ({ one }) => ({
  creator: one(users, {
    fields: [scimTokens.createdBy],
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

// Email verification tokens for password-registered accounts
export const emailVerificationTokens = sqliteTable('email_verification_tokens', {
  id: text('id').primaryKey(), // 64-char hex token
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [emailVerificationTokens.userId],
    references: [users.id],
  }),
}))

// Magic link tokens for passwordless authentication
export const magicLinkTokens = sqliteTable('magic_link_tokens', {
  id: text('id').primaryKey(), // hex token hash
  email: text('email').notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const magicLinkTokensRelations = relations(magicLinkTokens, ({ one }) => ({
  user: one(users, {
    fields: [magicLinkTokens.userId],
    references: [users.id],
  }),
}))

// ============================================================================
// GitHub App Integration Tables
// ============================================================================

// GitHub App configuration — stores the GitHub App credentials (one per org)
export const githubAppConfig = sqliteTable(
  'github_app_config',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    appId: text('app_id').notNull(),
    appName: text('app_name'),
    appSlug: text('app_slug'), // URL-safe slug for installation URLs
    privateKey: text('private_key').notNull(), // encrypted via maybeEncrypt
    clientId: text('client_id').notNull(),
    clientSecret: text('client_secret').notNull(), // encrypted
    webhookSecret: text('webhook_secret'), // encrypted, optional
    organisationId: integer('organisation_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [index('idx_github_app_config_org').on(table.organisationId)]
)

// GitHub installations — tracks which GitHub orgs/accounts have installed the app
export const githubInstallations = sqliteTable(
  'github_installations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    installationId: integer('installation_id').notNull(),
    accountLogin: text('account_login').notNull(),
    accountType: text('account_type').notNull(), // 'Organization' | 'User'
    githubAppConfigId: integer('github_app_config_id')
      .notNull()
      .references(() => githubAppConfig.id, { onDelete: 'cascade' }),
    organisationId: integer('organisation_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [
    uniqueIndex('idx_github_installations_unique').on(table.installationId),
    index('idx_github_installations_org').on(table.organisationId),
  ]
)

// GitHub sync config — instance-level sync to a repo/branch
export const githubSyncConfig = sqliteTable(
  'github_sync_config',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    installationId: integer('installation_id').notNull(), // GitHub's installation_id
    repoOwner: text('repo_owner').notNull(),
    repoName: text('repo_name').notNull(),
    branch: text('branch').notNull().default('main'),
    lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }),
    lastSyncStatus: text('last_sync_status'), // 'success' | 'error' | 'in_progress'
    lastSyncError: text('last_sync_error'),
    lastSyncCommitSha: text('last_sync_commit_sha'),
    organisationId: integer('organisation_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [index('idx_github_sync_config_org').on(table.organisationId)]
)

// GitHub App relations
export const githubAppConfigRelations = relations(githubAppConfig, ({ many }) => ({
  installations: many(githubInstallations),
}))

export const githubInstallationsRelations = relations(githubInstallations, ({ one }) => ({
  appConfig: one(githubAppConfig, {
    fields: [githubInstallations.githubAppConfigId],
    references: [githubAppConfig.id],
  }),
}))

// Export schema for use with Drizzle
export const schema = {
  connections,
  schemaFiles,
  cubeDefinitions,
  analyticsPages,
  dashboardShareTokens,
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
  emailVerificationTokens,
  magicLinkTokens,
  oauthClients,
  oauthTokens,
  oauthAuthCodes,
  connectionsRelations,
  analyticsPageRelations,
  dashboardShareTokensRelations,
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
  emailVerificationTokensRelations,
  magicLinkTokensRelations,
  githubAppConfig,
  githubInstallations,
  githubSyncConfig,
  githubAppConfigRelations,
  githubInstallationsRelations,
  scimTokens,
  scimTokensRelations,
}

export type Schema = typeof schema
