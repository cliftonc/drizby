/**
 * Database migration script
 */

import 'dotenv/config'
import { mkdirSync } from 'node:fs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

const dbPath = process.env.DATABASE_PATH || 'data/drizby.sqlite'

mkdirSync('data', { recursive: true })

console.log('Running database migrations...')
const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')
const db = drizzle(sqlite)

try {
  migrate(db, { migrationsFolder: './drizzle' })
  console.log('Migrations completed successfully')
} catch (error) {
  console.error('Migration failed:', error)
  process.exit(1)
} finally {
  sqlite.close()
}
