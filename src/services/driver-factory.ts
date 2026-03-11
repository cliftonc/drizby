/**
 * Driver factory — creates database clients and drizzle instances for each provider.
 * Used by both connection-manager (persistent connections) and connection routes (test connections).
 */

import type { DrizzleDatabase } from 'drizzle-cube/server'
import { getDefaultProvider, getProvider } from './provider-registry'

export interface DriverResult {
  client: any
  db: DrizzleDatabase
  cleanup: () => Promise<void>
  engineType: string
}

async function tryImport(packageName: string, npmPackage: string): Promise<any> {
  try {
    return await import(packageName)
  } catch {
    throw new Error(
      `Provider requires the '${npmPackage}' package. Install it with:\n  npm install ${npmPackage}`
    )
  }
}

/**
 * Parse the connectionString — for structured providers it's JSON, otherwise a plain string.
 */
function parseConfig(connectionString: string): Record<string, string> {
  try {
    const parsed = JSON.parse(connectionString)
    if (typeof parsed === 'object' && parsed !== null) return parsed
  } catch {}
  return { url: connectionString }
}

/**
 * Create a driver instance for the given provider and connection string.
 */
export async function createDriver(
  engineType: string,
  connectionString: string,
  provider?: string | null
): Promise<DriverResult> {
  const resolvedProvider = provider || getDefaultProvider(engineType)
  const providerDef = getProvider(resolvedProvider)
  if (!providerDef) {
    throw new Error(`Unknown provider: ${resolvedProvider}`)
  }

  switch (resolvedProvider) {
    // ── PostgreSQL providers ──────────────────────────────
    case 'postgres-js':
    case 'supabase': {
      const { default: postgres } = await tryImport('postgres', 'postgres')
      const { drizzle } = await tryImport('drizzle-orm/postgres-js', 'drizzle-orm')
      const client = postgres(connectionString)
      const db = drizzle(client) as unknown as DrizzleDatabase
      return { client, db, cleanup: () => client.end(), engineType: 'postgres' }
    }

    case 'node-postgres': {
      const { Pool } = await tryImport('pg', 'pg')
      const { drizzle } = await tryImport('drizzle-orm/node-postgres', 'drizzle-orm')
      const client = new Pool({ connectionString })
      const db = drizzle(client) as unknown as DrizzleDatabase
      return { client, db, cleanup: () => client.end(), engineType: 'postgres' }
    }

    case 'neon': {
      const { Pool } = await tryImport('@neondatabase/serverless', '@neondatabase/serverless')
      const { drizzle } = await tryImport('drizzle-orm/neon-serverless', 'drizzle-orm')
      const client = new Pool({ connectionString })
      const db = drizzle({ client }) as unknown as DrizzleDatabase
      return { client, db, cleanup: () => client.end(), engineType: 'postgres' }
    }

    case 'pglite': {
      const { PGlite } = await tryImport('@electric-sql/pglite', '@electric-sql/pglite')
      const { drizzle } = await tryImport('drizzle-orm/pglite', 'drizzle-orm')
      const path = connectionString.replace(/^file:/, '')
      const client = new PGlite(path)
      const db = drizzle(client) as unknown as DrizzleDatabase
      return { client, db, cleanup: async () => client.close(), engineType: 'postgres' }
    }

    case 'aws-data-api-pg': {
      const { RDSDataClient } = await tryImport(
        '@aws-sdk/client-rds-data',
        '@aws-sdk/client-rds-data'
      )
      const { drizzle } = await tryImport('drizzle-orm/aws-data-api/pg', 'drizzle-orm')
      const config = parseConfig(connectionString)
      const client = new RDSDataClient({})
      const db = drizzle(client, {
        database: config.database,
        secretArn: config.secretArn,
        resourceArn: config.resourceArn,
      }) as unknown as DrizzleDatabase
      return { client, db, cleanup: async () => client.destroy(), engineType: 'postgres' }
    }

    case 'aurora-dsql': {
      const config = parseConfig(connectionString)
      // Aurora DSQL uses node-postgres with a token-generating connector
      let AuroraDSQLPool: any
      try {
        const mod = await import('@aws/aurora-dsql-node-postgres-connector' as any)
        AuroraDSQLPool = mod.AuroraDSQLPool || mod.default?.AuroraDSQLPool
      } catch {
        throw new Error(
          'Aurora DSQL requires the connector package. Install it with:\n  npm install @aws/aurora-dsql-node-postgres-connector pg @aws-sdk/credential-providers'
        )
      }
      const { drizzle } = await tryImport('drizzle-orm/node-postgres', 'drizzle-orm')
      const client = new AuroraDSQLPool({
        host: config.host,
        user: config.user || 'admin',
      })
      const db = drizzle(client) as unknown as DrizzleDatabase
      return { client, db, cleanup: () => client.end(), engineType: 'postgres' }
    }

    // ── MySQL providers ───────────────────────────────────
    case 'mysql2': {
      const mysql2 = await tryImport('mysql2/promise', 'mysql2')
      const { drizzle } = await tryImport('drizzle-orm/mysql2', 'drizzle-orm')
      const client = await mysql2.createConnection(connectionString)
      const db = drizzle(client) as unknown as DrizzleDatabase
      return { client, db, cleanup: async () => client.end(), engineType: 'mysql' }
    }

    case 'planetscale': {
      const { Client } = await tryImport('@planetscale/database', '@planetscale/database')
      const { drizzle } = await tryImport('drizzle-orm/planetscale-serverless', 'drizzle-orm')
      const config = parseConfig(connectionString)
      const client = new Client({
        host: config.host,
        username: config.username,
        password: config.password,
      })
      const db = drizzle(client) as unknown as DrizzleDatabase
      return { client, db, cleanup: async () => {}, engineType: 'mysql' }
    }

    case 'tidb': {
      const { connect } = await tryImport('@tidbcloud/serverless', '@tidbcloud/serverless')
      const { drizzle } = await tryImport('drizzle-orm/tidb-serverless', 'drizzle-orm')
      const client = connect({ url: connectionString })
      const db = drizzle(client) as unknown as DrizzleDatabase
      return { client, db, cleanup: async () => {}, engineType: 'mysql' }
    }

    // ── SingleStore ───────────────────────────────────────
    case 'singlestore': {
      const mysql2 = await tryImport('mysql2/promise', 'mysql2')
      const { drizzle } = await tryImport('drizzle-orm/singlestore', 'drizzle-orm')
      const client = await mysql2.createConnection(connectionString)
      const db = drizzle(client) as unknown as DrizzleDatabase
      return { client, db, cleanup: async () => client.end(), engineType: 'singlestore' }
    }

    // ── SQLite providers ──────────────────────────────────
    case 'better-sqlite3': {
      const { default: Database } = await tryImport('better-sqlite3', 'better-sqlite3')
      const { drizzle } = await tryImport('drizzle-orm/better-sqlite3', 'drizzle-orm')
      const filePath = connectionString.replace(/^file:/, '')
      const client = new Database(filePath)
      client.pragma('journal_mode = WAL')
      client.pragma('foreign_keys = ON')
      const db = drizzle(client) as unknown as DrizzleDatabase
      return { client, db, cleanup: async () => client.close(), engineType: 'sqlite' }
    }

    case 'libsql': {
      const { createClient } = await tryImport('@libsql/client', '@libsql/client')
      const { drizzle } = await tryImport('drizzle-orm/libsql', 'drizzle-orm')
      const config = parseConfig(connectionString)
      const client = createClient({
        url: config.url,
        authToken: config.authToken || undefined,
      })
      const db = drizzle(client) as unknown as DrizzleDatabase
      return { client, db, cleanup: async () => client.close(), engineType: 'sqlite' }
    }

    // ── DuckDB ────────────────────────────────────────────
    case 'duckdb': {
      const duckdb = await tryImport('duckdb', 'duckdb')
      const filePath = connectionString.replace(/^file:/, '')
      const nativeDb = new duckdb.Database(filePath)
      const client = nativeDb.connect()
      // DuckDB doesn't have a drizzle-orm submodule — we store the raw connection
      // and the SemanticLayerCompiler handles queries via engineType: 'duckdb'
      return {
        client: { nativeDb, connection: client },
        db: null as unknown as DrizzleDatabase,
        cleanup: async () => {
          return new Promise<void>((resolve, reject) => {
            nativeDb.close((err: any) => (err ? reject(err) : resolve()))
          })
        },
        engineType: 'duckdb',
      }
    }

    default:
      throw new Error(`Unsupported provider: ${resolvedProvider}`)
  }
}

/**
 * Test a connection by running a simple query, then clean up.
 */
export async function testDriver(
  engineType: string,
  connectionString: string,
  provider?: string | null
): Promise<{ success: boolean; message: string }> {
  const start = Date.now()
  let driver: DriverResult | undefined

  try {
    driver = await createDriver(engineType, connectionString, provider)
    const elapsed = () => `${Date.now() - start}ms`

    const resolvedProvider = provider || getDefaultProvider(engineType)

    switch (resolvedProvider) {
      case 'better-sqlite3':
        driver.client.prepare('SELECT 1').get()
        break

      case 'duckdb':
        await new Promise<void>((resolve, reject) => {
          driver!.client.connection.run('SELECT 1', (err: any) => (err ? reject(err) : resolve()))
        })
        break

      case 'libsql': {
        const config = parseConfig(connectionString)
        const libsql = await tryImport('@libsql/client', '@libsql/client')
        const testClient = libsql.createClient({
          url: config.url,
          authToken: config.authToken || undefined,
        })
        await testClient.execute('SELECT 1')
        testClient.close()
        break
      }

      default:
        // All SQL-based drivers that support drizzle: run via drizzle's execute
        if (driver.db) {
          await (driver.db as any).execute(/* sql */ 'SELECT 1')
        }
        break
    }

    return { success: true, message: `Connected successfully (${elapsed()})` }
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection failed' }
  } finally {
    if (driver) {
      try {
        await driver.cleanup()
      } catch {}
    }
  }
}
