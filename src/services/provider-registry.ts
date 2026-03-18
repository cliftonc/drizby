/**
 * Provider registry — single source of truth for all supported database providers.
 * Used by connection-manager, connections route, and the client UI.
 */

export type ConnectionMode = 'connection-string' | 'structured'
export type EngineType =
  | 'postgres'
  | 'mysql'
  | 'sqlite'
  | 'singlestore'
  | 'duckdb'
  | 'databend'
  | 'snowflake'

export interface StructuredField {
  key: string
  label: string
  placeholder: string
  required: boolean
  secret?: boolean
}

export interface ProviderDef {
  id: string
  label: string
  engineType: EngineType
  connectionMode: ConnectionMode
  npmPackage: string
  drizzleImport: string
  placeholder?: string
  example?: string
  docUrl?: string
  helpText?: string
  structuredFields?: StructuredField[]
  /** drizzle-kit dialect override, if different from the engineType default (e.g. 'turso' for libsql) */
  drizzleKitDialect?: string
}

export const PROVIDERS: ProviderDef[] = [
  // ── PostgreSQL ──────────────────────────────────────────
  {
    id: 'postgres-js',
    label: 'PostgreSQL (postgres.js)',
    engineType: 'postgres',
    connectionMode: 'connection-string',
    npmPackage: 'postgres',
    drizzleImport: 'drizzle-orm/postgres-js',
    placeholder: 'postgresql://user:password@host:5432/database',
    example: 'postgresql://admin:secret@localhost:5432/mydb',
    docUrl: 'https://orm.drizzle.team/docs/get-started/postgresql-new',
    helpText:
      'Standard PostgreSQL via the postgres.js driver. Best for long-running Node.js servers.',
  },
  {
    id: 'node-postgres',
    label: 'PostgreSQL (node-postgres)',
    engineType: 'postgres',
    connectionMode: 'connection-string',
    npmPackage: 'pg',
    drizzleImport: 'drizzle-orm/node-postgres',
    placeholder: 'postgresql://user:password@host:5432/database',
    example: 'postgresql://admin:secret@localhost:5432/mydb',
    docUrl: 'https://orm.drizzle.team/docs/connect-node-postgres',
    helpText: 'Standard PostgreSQL via the pg (node-postgres) driver.',
  },
  {
    id: 'neon',
    label: 'Neon Serverless',
    engineType: 'postgres',
    connectionMode: 'connection-string',
    npmPackage: '@neondatabase/serverless',
    drizzleImport: 'drizzle-orm/neon-serverless',
    placeholder:
      'postgresql://user:password@ep-cool-name-123456.us-east-2.aws.neon.tech/dbname?sslmode=require',
    example:
      'postgresql://neondb_owner:pass@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require',
    docUrl: 'https://orm.drizzle.team/docs/connect-neon',
    helpText: 'Neon serverless PostgreSQL. Get your connection string from the Neon dashboard.',
  },
  {
    id: 'supabase',
    label: 'Supabase',
    engineType: 'postgres',
    connectionMode: 'connection-string',
    npmPackage: 'postgres',
    drizzleImport: 'drizzle-orm/postgres-js',
    placeholder:
      'postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres',
    example:
      'postgresql://postgres.abcdefg:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    docUrl: 'https://orm.drizzle.team/docs/connect-supabase',
    helpText:
      'Supabase hosted PostgreSQL. Uses postgres.js driver. Get your connection string from Supabase dashboard → Settings → Database.',
  },
  {
    id: 'pglite',
    label: 'PGlite (Embedded)',
    engineType: 'postgres',
    connectionMode: 'connection-string',
    npmPackage: '@electric-sql/pglite',
    drizzleImport: 'drizzle-orm/pglite',
    placeholder: 'file:path/to/pgdata',
    example: 'file:data/my-pg-data',
    docUrl: 'https://orm.drizzle.team/docs/connect-pglite',
    helpText:
      'Embedded PostgreSQL that runs in-process. No server needed — data stored in a local directory.',
  },
  {
    id: 'aws-data-api-pg',
    label: 'AWS Data API (PostgreSQL)',
    engineType: 'postgres',
    connectionMode: 'structured',
    npmPackage: '@aws-sdk/client-rds-data',
    drizzleImport: 'drizzle-orm/aws-data-api/pg',
    docUrl: 'https://orm.drizzle.team/docs/connect-aws-data-api-pg',
    helpText:
      'Connect to Amazon RDS/Aurora PostgreSQL via the AWS Data API. Requires AWS credentials configured in your environment.',
    structuredFields: [
      {
        key: 'resourceArn',
        label: 'Resource ARN',
        placeholder: 'arn:aws:rds:us-east-1:123456789:cluster:my-cluster',
        required: true,
      },
      {
        key: 'secretArn',
        label: 'Secret ARN',
        placeholder: 'arn:aws:secretsmanager:us-east-1:123456789:secret:my-secret',
        required: true,
      },
      { key: 'database', label: 'Database Name', placeholder: 'mydb', required: true },
    ],
  },
  {
    id: 'aurora-dsql',
    label: 'Amazon Aurora DSQL',
    engineType: 'postgres',
    connectionMode: 'structured',
    npmPackage: 'pg',
    drizzleImport: 'drizzle-orm/node-postgres',
    docUrl: 'https://docs.aws.amazon.com/aurora-dsql/latest/userguide/getting-started.html',
    helpText:
      'Amazon Aurora DSQL with automatic token-based auth. Requires @aws/aurora-dsql-node-postgres-connector and AWS credentials in your environment.',
    structuredFields: [
      {
        key: 'host',
        label: 'Cluster Endpoint',
        placeholder: 'example.dsql.us-east-1.on.aws',
        required: true,
      },
      { key: 'user', label: 'User', placeholder: 'admin', required: true },
    ],
  },

  // ── MySQL ───────────────────────────────────────────────
  {
    id: 'mysql2',
    label: 'MySQL',
    engineType: 'mysql',
    connectionMode: 'connection-string',
    npmPackage: 'mysql2',
    drizzleImport: 'drizzle-orm/mysql2',
    placeholder: 'mysql://user:password@host:3306/database',
    example: 'mysql://root:secret@localhost:3306/mydb',
    docUrl: 'https://orm.drizzle.team/docs/get-started/mysql-new',
    helpText: 'Standard MySQL via the mysql2 driver.',
  },
  {
    id: 'planetscale',
    label: 'PlanetScale',
    engineType: 'mysql',
    connectionMode: 'structured',
    npmPackage: '@planetscale/database',
    drizzleImport: 'drizzle-orm/planetscale-serverless',
    docUrl: 'https://orm.drizzle.team/docs/connect-planetscale',
    helpText: 'PlanetScale serverless MySQL. Get credentials from the PlanetScale dashboard.',
    structuredFields: [
      { key: 'host', label: 'Host', placeholder: 'aws.connect.psdb.cloud', required: true },
      { key: 'username', label: 'Username', placeholder: 'your-username', required: true },
      {
        key: 'password',
        label: 'Password',
        placeholder: 'pscale_pw_...',
        required: true,
        secret: true,
      },
    ],
  },
  {
    id: 'tidb',
    label: 'TiDB Serverless',
    engineType: 'mysql',
    connectionMode: 'connection-string',
    npmPackage: '@tidbcloud/serverless',
    drizzleImport: 'drizzle-orm/tidb-serverless',
    placeholder:
      'mysql://user:password@gateway01.us-east-1.prod.aws.tidbcloud.com:4000/database?ssl={}',
    example: 'mysql://user:pass@gateway01.us-east-1.prod.aws.tidbcloud.com:4000/test',
    docUrl: 'https://orm.drizzle.team/docs/connect-tidb',
    helpText:
      'TiDB Serverless — MySQL-compatible distributed database. Get your connection URL from the TiDB Cloud console.',
  },

  // ── SingleStore ─────────────────────────────────────────
  {
    id: 'singlestore',
    label: 'SingleStore',
    engineType: 'singlestore',
    connectionMode: 'connection-string',
    npmPackage: 'mysql2',
    drizzleImport: 'drizzle-orm/singlestore',
    placeholder: 'mysql://user:password@host:3306/database',
    example: 'mysql://admin:secret@svc-abc.singlestore.com:3306/mydb',
    docUrl: 'https://orm.drizzle.team/docs/get-started/singlestore-new',
    helpText:
      'SingleStore (formerly MemSQL) — high-performance MySQL-compatible database. Uses the mysql2 driver.',
  },

  // ── SQLite ──────────────────────────────────────────────
  {
    id: 'better-sqlite3',
    label: 'SQLite',
    engineType: 'sqlite',
    connectionMode: 'connection-string',
    npmPackage: 'better-sqlite3',
    drizzleImport: 'drizzle-orm/better-sqlite3',
    placeholder: 'file:path/to/database.sqlite',
    example: 'file:data/mydata.sqlite',
    docUrl: 'https://orm.drizzle.team/docs/connect-better-sqlite3',
    helpText: 'Local SQLite database via better-sqlite3. Fast, synchronous, file-based.',
  },
  {
    id: 'libsql',
    label: 'LibSQL / Turso',
    engineType: 'sqlite',
    connectionMode: 'structured',
    npmPackage: '@libsql/client',
    drizzleImport: 'drizzle-orm/libsql',
    drizzleKitDialect: 'turso',
    docUrl: 'https://orm.drizzle.team/docs/connect-turso',
    helpText:
      'LibSQL (Turso) — SQLite fork optimized for edge/serverless. Supports local files or remote Turso databases.',
    structuredFields: [
      {
        key: 'url',
        label: 'Database URL',
        placeholder: 'libsql://your-db-org.turso.io  or  file:local.db',
        required: true,
      },
      {
        key: 'authToken',
        label: 'Auth Token',
        placeholder: 'eyJhbG... (required for remote Turso databases)',
        required: false,
        secret: true,
      },
    ],
  },

  // ── Databend ──────────────────────────────────────────────
  {
    id: 'databend',
    label: 'Databend',
    engineType: 'databend',
    connectionMode: 'connection-string',
    npmPackage: 'databend-driver',
    drizzleImport: 'drizzle-databend',
    placeholder: 'databend://user:password@host:8000/database?sslmode=disable',
    example: 'databend://databend:databend@localhost:8000/default?sslmode=disable',
    docUrl: 'https://www.npmjs.com/package/drizzle-databend',
    helpText:
      "Databend — cloud-native data warehouse. Uses the databend-driver with Drizzle's Postgres-compatible surface.",
  },

  // ── Snowflake ────────────────────────────────────────────
  {
    id: 'snowflake',
    label: 'Snowflake',
    engineType: 'snowflake',
    connectionMode: 'structured',
    npmPackage: 'snowflake-sdk',
    drizzleImport: 'drizzle-snowflake',
    docUrl: 'https://www.npmjs.com/package/drizzle-snowflake',
    helpText:
      'Snowflake cloud data warehouse. Uses snowflake-sdk with the drizzle-snowflake driver.',
    structuredFields: [
      {
        key: 'account',
        label: 'Account',
        placeholder: 'orgname-accountname',
        required: true,
      },
      {
        key: 'username',
        label: 'Username',
        placeholder: 'my_user',
        required: true,
      },
      {
        key: 'password',
        label: 'Password',
        placeholder: 'my_password',
        required: true,
        secret: true,
      },
      {
        key: 'database',
        label: 'Database',
        placeholder: 'MY_DB',
        required: true,
      },
      {
        key: 'warehouse',
        label: 'Warehouse',
        placeholder: 'COMPUTE_WH',
        required: false,
      },
      {
        key: 'schema',
        label: 'Schema',
        placeholder: 'PUBLIC',
        required: false,
      },
      {
        key: 'role',
        label: 'Role',
        placeholder: 'ACCOUNTADMIN',
        required: false,
      },
    ],
  },

  // ── DuckDB ──────────────────────────────────────────────
  {
    id: 'duckdb',
    label: 'DuckDB',
    engineType: 'duckdb',
    connectionMode: 'connection-string',
    npmPackage: 'duckdb',
    drizzleImport: '',
    placeholder: 'file:path/to/database.duckdb',
    example: 'file:data/analytics.duckdb',
    docUrl: 'https://duckdb.org/docs/api/nodejs/overview',
    helpText:
      'DuckDB — in-process OLAP database. Great for analytical workloads on local files (CSV, Parquet, etc.).',
  },
]

/** Get a provider by ID */
export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find(p => p.id === id)
}

/** Get providers for a given engine type */
export function getProvidersForEngine(engineType: string): ProviderDef[] {
  return PROVIDERS.filter(p => p.engineType === engineType)
}

/** Get the default provider ID for an engine type */
export function getDefaultProvider(engineType: string): string {
  const defaults: Record<string, string> = {
    postgres: 'postgres-js',
    mysql: 'mysql2',
    sqlite: 'better-sqlite3',
    singlestore: 'singlestore',
    duckdb: 'duckdb',
    databend: 'databend',
    snowflake: 'snowflake',
  }
  return defaults[engineType] || engineType
}

/**
 * Build a drizzle-kit config object for a given provider and connection string.
 * Handles resolving relative file paths, structured credentials, and driver overrides.
 */
export async function buildDrizzleKitConfig(
  connectionString: string,
  engineType: string,
  provider?: string | null,
  outDir?: string
): Promise<Record<string, any>> {
  const { resolve } = await import('node:path')
  const resolvedProvider = provider || getDefaultProvider(engineType)
  const providerDef = getProvider(resolvedProvider)

  const defaultDialect =
    engineType === 'sqlite'
      ? 'sqlite'
      : engineType === 'mysql' || engineType === 'singlestore'
        ? 'mysql'
        : 'postgresql' // postgres, databend, snowflake all use postgresql dialect
  const dialect = providerDef?.drizzleKitDialect || defaultDialect

  // Parse structured connection strings (JSON) into key-value config
  let config: Record<string, string>
  try {
    const parsed = JSON.parse(connectionString)
    config = typeof parsed === 'object' && parsed !== null ? parsed : { url: connectionString }
  } catch {
    config = { url: connectionString }
  }

  // Resolve relative file: paths to absolute for SQLite providers
  if (config.url?.startsWith('file:')) {
    config.url = `file:${resolve(process.cwd(), config.url.replace(/^file:/, ''))}`
  }

  // Build dbCredentials — for connection-string providers, just use url
  // For structured providers, pass through all parsed config keys
  const dbCredentials: Record<string, string> =
    providerDef?.connectionMode === 'structured' ? config : { url: config.url || connectionString }

  const result: Record<string, any> = {
    dialect,
    dbCredentials,
  }

  if (outDir) result.out = outDir
  if (dialect === 'postgresql') result.schemaFilter = ['public']

  return result
}

/** All unique engine types */
export const ENGINE_TYPES: { id: EngineType; label: string }[] = [
  { id: 'postgres', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'sqlite', label: 'SQLite' },
  { id: 'singlestore', label: 'SingleStore' },
  { id: 'databend', label: 'Databend' },
  { id: 'snowflake', label: 'Snowflake' },
  { id: 'duckdb', label: 'DuckDB' },
]
