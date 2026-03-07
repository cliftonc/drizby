/**
 * Internal SQLite database for Drizby
 */

import { mkdirSync } from 'node:fs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../../schema'

const DB_PATH = process.env.DATABASE_PATH || 'data/drizby.sqlite'

mkdirSync('data', { recursive: true })

const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })

export function runMigrations() {
  migrate(db, { migrationsFolder: './drizzle' })
}
