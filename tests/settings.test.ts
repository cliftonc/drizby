import crypto from 'node:crypto'
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

import { connections, scimTokens, settings, users } from '../schema'
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
  vi.unstubAllEnvs()
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
      apiKey: 'sk-tes...7890',
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

// ─── Feature Settings ──────────────────────────────────────────────

describe('feature settings', () => {
  it('allows members to read feature settings but blocks writes', async () => {
    vi.stubEnv('APP_URL', 'https://drizby.test/')
    await db.insert(settings).values([
      { key: 'mcp_enabled', value: 'true', organisationId: 1 },
      { key: 'brand_name', value: 'Acme BI', organisationId: 1 },
      { key: 'brand_logo_url', value: 'https://cdn.example.com/logo.png', organisationId: 1 },
    ])

    const member = await seedMemberUser(db)

    const getRes = await app(member).request('/test/features')
    expect(getRes.status).toBe(200)
    expect(await getRes.json()).toEqual({
      mcpEnabled: true,
      mcpAppEnabled: false,
      appUrl: 'https://drizby.test/',
      brandName: 'Acme BI',
      brandLogoUrl: 'https://cdn.example.com/logo.png',
    })

    const putRes = await jsonRequest(app(member), 'PUT', '/test/features', { brandName: 'Nope' })
    expect(putRes.status).toBe(403)
  })

  it('deletes empty brand settings while keeping feature flags updated', async () => {
    vi.stubEnv('APP_URL', 'https://drizby.test')
    await db.insert(settings).values([
      { key: 'brand_name', value: 'Old Brand', organisationId: 1 },
      { key: 'brand_logo_url', value: 'https://cdn.example.com/old-logo.png', organisationId: 1 },
    ])

    const res = await jsonRequest(app(), 'PUT', '/test/features', {
      mcpEnabled: true,
      mcpAppEnabled: false,
      brandName: '',
      brandLogoUrl: '',
    })

    expect(res.status).toBe(200)

    const rows = await db.select().from(settings)
    expect(rows.find((row: any) => row.key === 'brand_name')).toBeUndefined()
    expect(rows.find((row: any) => row.key === 'brand_logo_url')).toBeUndefined()
    expect(rows.find((row: any) => row.key === 'mcp_enabled')?.value).toBe('true')
    expect(rows.find((row: any) => row.key === 'mcp_app_enabled')?.value).toBe('false')

    const getRes = await app().request('/test/features')
    expect(await getRes.json()).toEqual({
      mcpEnabled: true,
      mcpAppEnabled: false,
      appUrl: 'https://drizby.test',
      brandName: '',
      brandLogoUrl: '',
    })
  })
})

// ─── OAuth Settings ────────────────────────────────────────────────

describe('oauth settings', () => {
  it('rejects enabling a provider without complete credentials', async () => {
    const res = await jsonRequest(app(), 'PUT', '/test/oauth', {
      google: { enabled: true, clientId: 'google-client-id' },
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: 'Client ID and Client Secret are required to enable google OAuth',
    })
  })

  it('reuses stored encrypted secrets and only returns masked oauth secret data', async () => {
    vi.stubEnv('APP_URL', 'https://drizby.test/')
    vi.stubEnv('ENCRYPTION_SECRET', 'test-encryption-secret')

    const a = app()

    const saveRes = await jsonRequest(a, 'PUT', '/test/oauth', {
      google: {
        enabled: true,
        clientId: 'google-client-id',
        clientSecret: 'super-secret-1234',
      },
    })
    expect(saveRes.status).toBe(200)

    const storedRows = await db.select().from(settings)
    expect(storedRows.find((row: any) => row.key === 'oauth_google_client_secret')?.value).toMatch(
      /^enc:/
    )

    const reuseRes = await jsonRequest(a, 'PUT', '/test/oauth', {
      google: { enabled: true },
    })
    expect(reuseRes.status).toBe(200)

    const getRes = await a.request('/test/oauth')
    expect(getRes.status).toBe(200)
    const oauthData = await getRes.json()
    expect(oauthData).toMatchObject({
      google: {
        enabled: true,
        clientId: 'google-client-id',
        hasClientSecret: true,
        clientSecretHint: '****1234',
        redirectUri: 'https://drizby.test/api/auth/google/callback',
      },
    })
    expect(oauthData.google).not.toHaveProperty('clientSecret')
  })
})

// ─── SCIM Settings ─────────────────────────────────────────────────

describe('SCIM settings', () => {
  it('handles enablement, token creation, listing, and revocation', async () => {
    vi.stubEnv('APP_URL', 'https://drizby.test/')

    const enableRes = await jsonRequest(app(), 'PUT', '/test/scim', { enabled: true })
    expect(enableRes.status).toBe(200)

    const missingNameRes = await jsonRequest(app(), 'POST', '/test/scim/tokens', {})
    expect(missingNameRes.status).toBe(400)
    expect(await missingNameRes.json()).toEqual({ error: 'Token name is required' })

    await db.insert(users).values({
      email: 'scim-user@test.com',
      username: 'scim-user',
      name: 'SCIM User',
      role: 'member',
      organisationId: 1,
      scimProvisioned: true,
    })

    const createRes = await jsonRequest(app(), 'POST', '/test/scim/tokens', { name: 'Okta' })
    expect(createRes.status).toBe(201)
    const created = await createRes.json()

    const storedTokens = await db.select().from(scimTokens)
    expect(storedTokens).toHaveLength(1)
    expect(storedTokens[0]?.id).toBe(created.id)
    expect(storedTokens[0]?.name).toBe('Okta')
    expect(storedTokens[0]?.tokenHash).toBe(
      crypto.createHash('sha256').update(created.token).digest('hex')
    )
    expect(storedTokens[0]?.tokenHash).not.toBe(created.token)

    const getRes = await app().request('/test/scim')
    expect(getRes.status).toBe(200)
    const scimData = await getRes.json()
    expect(scimData).toMatchObject({
      enabled: true,
      endpointUrl: 'https://drizby.test/scim/v2',
      provisionedUserCount: 1,
    })
    expect(scimData.tokens).toHaveLength(1)
    expect(scimData.tokens[0]).toMatchObject({ id: created.id, name: 'Okta' })
    expect(scimData.tokens[0]).not.toHaveProperty('tokenHash')

    const deleteRes = await app().request(`/test/scim/tokens/${created.id}`, { method: 'DELETE' })
    expect(deleteRes.status).toBe(200)
    expect(await db.select().from(scimTokens)).toHaveLength(0)
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
