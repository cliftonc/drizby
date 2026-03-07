/**
 * Internal SQLite database for Drizby
 * Supports both better-sqlite3 (local/Docker) and D1 HTTP API (Cloudflare)
 */

import * as schema from '../../schema'

export const isD1Mode = () => !!process.env.D1_DATABASE_ID

let db: any
let runMigrations: () => void | Promise<void>

if (isD1Mode()) {
  const { drizzle } = await import('drizzle-orm/d1')
  db = drizzle(
    {
      connection: {
        accountId: process.env.CF_ACCOUNT_ID!,
        databaseId: process.env.D1_DATABASE_ID!,
        token: process.env.CF_API_TOKEN!,
      },
    },
    { schema }
  )
  runMigrations = () => {
    console.log('D1 mode: migrations should be applied via wrangler d1 execute')
  }
} else {
  const { mkdirSync } = await import('node:fs')
  const Database = (await import('better-sqlite3')).default
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')

  const DB_PATH = process.env.DATABASE_PATH || 'data/drizby.sqlite'
  mkdirSync('data', { recursive: true })

  const sqlite = new Database(DB_PATH)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  db = drizzle(sqlite, { schema })
  runMigrations = () => {
    migrate(db, { migrationsFolder: './drizzle' })
  }
}

export { db, runMigrations }
