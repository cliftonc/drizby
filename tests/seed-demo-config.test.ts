import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../app', () => ({
  invalidateCubeAppCache: vi.fn(),
}))

vi.mock('../src/services/connection-manager', () => ({
  connectionManager: {
    remove: vi.fn(),
    getConnectionIds: () => [],
  },
}))
import {
  analyticsPages,
  connections,
  contentGroupVisibility,
  cubeDefinitions,
  groupTypes,
  groups,
  notebooks,
  schemaFiles,
  userGroups,
} from '../schema'
import { clearDemoData } from '../src/routes/seed-demo-config'
import { createTestDb, seedAdminUser } from './helpers/test-db'

let db: any
let sqlite: any
let adminUser: any

beforeEach(async () => {
  ;({ db, sqlite } = createTestDb())
  adminUser = await seedAdminUser(db)
})

afterEach(() => {
  sqlite.close()
})

/** Seed demo-like data into the internal DB (without touching the filesystem) */
async function seedDemoRows() {
  const [conn] = await db
    .insert(connections)
    .values({
      name: 'Demo SQLite',
      engineType: 'sqlite',
      connectionString: 'file:data/demo.sqlite',
      organisationId: 1,
    })
    .returning()

  const [sf] = await db
    .insert(schemaFiles)
    .values({
      name: 'demo-schema.ts',
      sourceCode: 'export const x = 1',
      connectionId: conn.id,
      organisationId: 1,
    })
    .returning()

  await db.insert(cubeDefinitions).values({
    name: 'Demo Cubes',
    sourceCode: 'export const x = 1',
    schemaFileId: sf.id,
    connectionId: conn.id,
    organisationId: 1,
  })

  await db.insert(analyticsPages).values({
    name: 'Overview Dashboard',
    connectionId: conn.id,
    config: { portlets: [], filters: [] },
    organisationId: 1,
  })

  await db.insert(notebooks).values({
    name: 'Demo Notebook',
    connectionId: conn.id,
    organisationId: 1,
  })

  const [deptType] = await db
    .insert(groupTypes)
    .values({ name: 'Department', organisationId: 1 })
    .returning()

  const [eng] = await db
    .insert(groups)
    .values({ name: 'Engineering', groupTypeId: deptType.id, organisationId: 1 })
    .returning()

  await db.insert(userGroups).values({ userId: adminUser.id, groupId: eng.id })

  await db.insert(contentGroupVisibility).values({
    contentType: 'dashboard',
    contentId: 1,
    groupId: eng.id,
  })

  return { conn, sf, deptType, eng }
}

describe('clearDemoData', () => {
  it('removes all demo connection data', async () => {
    await seedDemoRows()
    await clearDemoData(db)

    expect(await db.select().from(connections)).toHaveLength(0)
    expect(await db.select().from(schemaFiles)).toHaveLength(0)
    expect(await db.select().from(cubeDefinitions)).toHaveLength(0)
    expect(await db.select().from(analyticsPages)).toHaveLength(0)
    expect(await db.select().from(notebooks)).toHaveLength(0)
  })

  it('removes demo Department groups and memberships', async () => {
    await seedDemoRows()
    await clearDemoData(db)

    expect(await db.select().from(groupTypes)).toHaveLength(0)
    expect(await db.select().from(groups)).toHaveLength(0)
    expect(await db.select().from(userGroups)).toHaveLength(0)
    expect(await db.select().from(contentGroupVisibility)).toHaveLength(0)
  })

  it('does NOT delete user-created groups', async () => {
    await seedDemoRows()

    // Create a user-managed group type + group
    const [customType] = await db
      .insert(groupTypes)
      .values({ name: 'Team', organisationId: 1 })
      .returning()
    const [customGroup] = await db
      .insert(groups)
      .values({ name: 'Alpha Team', groupTypeId: customType.id, organisationId: 1 })
      .returning()
    await db.insert(userGroups).values({ userId: adminUser.id, groupId: customGroup.id })

    await clearDemoData(db)

    // User-created data should survive
    const remainingTypes = await db.select().from(groupTypes)
    expect(remainingTypes).toHaveLength(1)
    expect(remainingTypes[0].name).toBe('Team')

    const remainingGroups = await db.select().from(groups)
    expect(remainingGroups).toHaveLength(1)
    expect(remainingGroups[0].name).toBe('Alpha Team')

    const remainingMemberships = await db.select().from(userGroups)
    expect(remainingMemberships).toHaveLength(1)
  })

  it('does NOT delete non-demo connections', async () => {
    await seedDemoRows()

    // Add a user connection
    await db.insert(connections).values({
      name: 'Production Postgres',
      engineType: 'postgres',
      connectionString: 'postgres://...',
      organisationId: 1,
    })

    await clearDemoData(db)

    const remaining = await db.select().from(connections)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].name).toBe('Production Postgres')
  })

  it('is safe to call when no demo data exists', async () => {
    // Should not throw on empty DB
    await clearDemoData(db)
    expect(await db.select().from(connections)).toHaveLength(0)
  })

  it('is idempotent (safe to call twice)', async () => {
    await seedDemoRows()
    await clearDemoData(db)
    await clearDemoData(db)
    expect(await db.select().from(connections)).toHaveLength(0)
  })
})
