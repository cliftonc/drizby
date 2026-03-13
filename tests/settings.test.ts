import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock app.ts to avoid pulling in the full app (drizzle-cube, connection-manager, etc.)
vi.mock('../app', () => ({
  invalidateCubeAppCache: vi.fn(),
}))

// Mock connection-manager to avoid real connection handling
vi.mock('../src/services/connection-manager', () => ({
  connectionManager: {
    remove: vi.fn(),
    getConnectionIds: () => [],
    createConnection: vi.fn(),
    compileAll: vi.fn(),
  },
}))

import { connections, settings, users } from '../schema'
import settingsApp from '../src/routes/settings'
import { jsonRequest, mountRoute } from './helpers/test-app'
import { createTestDb, seedAdminUser, seedMemberUser } from './helpers/test-db'

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

function app(user?: any) {
  return mountRoute(settingsApp, { db, user: user || adminUser })
}

// ─── AI Settings ──────────────────────────────────────────────────

describe('AI settings', () => {
  it('returns empty config when no settings exist', async () => {
    const res = await app().request('/test/ai')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.provider).toBe('')
    expect(data.hasApiKey).toBe(false)
  })

  it('saves and retrieves AI config', async () => {
    const a = app()
    await jsonRequest(a, 'PUT', '/test/ai', {
      provider: 'anthropic',
      apiKey: 'sk-test-1234567890',
      model: 'claude-sonnet-4-20250514',
    })

    const res = await a.request('/test/ai')
    const data = await res.json()
    expect(data.provider).toBe('anthropic')
    expect(data.model).toBe('claude-sonnet-4-20250514')
    expect(data.hasApiKey).toBe(true)
    expect(data.apiKeyHint).toBe('****7890')
  })

  it('updates existing setting value', async () => {
    const a = app()
    await jsonRequest(a, 'PUT', '/test/ai', { provider: 'openai' })
    await jsonRequest(a, 'PUT', '/test/ai', { provider: 'anthropic' })

    const res = await a.request('/test/ai')
    const data = await res.json()
    expect(data.provider).toBe('anthropic')
  })

  it('deletes a setting when value is empty string', async () => {
    const a = app()
    await jsonRequest(a, 'PUT', '/test/ai', { provider: 'openai' })
    await jsonRequest(a, 'PUT', '/test/ai', { provider: '' })

    const res = await a.request('/test/ai')
    const data = await res.json()
    expect(data.provider).toBe('')
  })

  it('member cannot access settings', async () => {
    const member = await seedMemberUser(db)
    const res = await app(member).request('/test/ai')
    expect(res.status).toBe(403)
  })
})

// ─── Factory Reset ────────────────────────────────────────────────

describe('factory reset', () => {
  it('deletes all data from all tables', async () => {
    const a = app()

    // Seed some data
    await db.insert(connections).values({
      name: 'Test',
      engineType: 'sqlite',
      connectionString: 'file:test.db',
      organisationId: 1,
    })
    await db.insert(settings).values({ key: 'test_key', value: 'test_val', organisationId: 1 })

    const res = await jsonRequest(a, 'POST', '/test/factory-reset')
    expect(res.status).toBe(200)

    const conns = await db.select().from(connections)
    const sets = await db.select().from(settings)
    const usrs = await db.select().from(users)
    expect(conns).toHaveLength(0)
    expect(sets).toHaveLength(0)
    expect(usrs).toHaveLength(0)
  })
})
