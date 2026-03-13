/**
 * Shared test helper: in-memory SQLite database with full schema applied.
 * Creates a fresh DB and Hono app context helpers for each test.
 */

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../../schema'

export function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './drizzle' })
  return { db, sqlite }
}

/**
 * Seed a minimal admin user (id will be auto-assigned).
 * Returns the created user row.
 */
export async function seedAdminUser(db: any) {
  const [user] = await db
    .insert(schema.users)
    .values({
      email: 'admin@test.com',
      username: 'admin',
      name: 'Test Admin',
      role: 'admin',
      organisationId: 1,
    })
    .returning()
  return user
}

/**
 * Seed a member user.
 */
export async function seedMemberUser(db: any) {
  const [user] = await db
    .insert(schema.users)
    .values({
      email: 'member@test.com',
      username: 'member',
      name: 'Test Member',
      role: 'member',
      organisationId: 1,
    })
    .returning()
  return user
}
