/**
 * Integration tests for public share links / embedded dashboards (#5)
 *
 * Covers:
 *  - Token creation (201, returns id)
 *  - Token listing (200, masked)
 *  - Token revocation (204; subsequent public fetch → 404)
 *  - Public fetch — valid token → 200 with dashboard config
 *  - Public fetch — revoked token → 404
 *  - Public fetch — expired token → 404
 *  - Public fetch — nonexistent token → 404
 *  - Ownership check — non-owner member cannot create/revoke tokens → 403
 *  - Cascade — soft-deleted dashboard returns 404 on public fetch
 */

import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../schema'
import { analyticsPages, dashboardShareTokens } from '../schema'
import { defineAbilitiesFor } from '../src/permissions/abilities'
import analyticsApp from '../src/routes/analytics-pages'
import { createPublicDashboardApp } from '../src/routes/public-dashboard'
import { jsonRequest, mountRoute } from './helpers/test-app'
import { createTestDb, seedAdminUser, seedMemberUser } from './helpers/test-db'

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let db: any
let sqlite: any
let adminUser: any
let memberUser: any
let dashboardId: number

const minimalConfig = { portlets: [] }

beforeEach(async () => {
  ;({ db, sqlite } = createTestDb())
  adminUser = await seedAdminUser(db)
  memberUser = await seedMemberUser(db)

  // Seed a dashboard owned by admin
  const [page] = await db
    .insert(analyticsPages)
    .values({
      name: 'Test Dashboard',
      organisationId: 1,
      config: minimalConfig,
      createdBy: adminUser.id,
      isActive: true,
    })
    .returning()
  dashboardId = page.id
})

afterEach(() => {
  sqlite.close()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mount the authenticated analytics-pages app */
function makeAnalyticsApp(user: any) {
  return mountRoute(analyticsApp, { db, user }, '/test')
}

/**
 * Mount the public dashboard app with a no-op getCubeApp
 * (cube proxy is not tested here — would require a live connection)
 */
function makePublicApp() {
  const publicApp = createPublicDashboardApp({
    getCubeApp: async () => null,
  })
  // Inject db manually (mirrors what app.ts does via /public/* middleware)
  const wrapper = new Hono()
  wrapper.use('*', async (c: any, next) => {
    c.set('db', db)
    await next()
  })
  wrapper.route('/public', publicApp)
  return wrapper
}

async function createToken(user = adminUser, label?: string, expiresAt?: string) {
  const app = makeAnalyticsApp(user)
  const res = await jsonRequest(
    app,
    'POST',
    `/test/${dashboardId}/share-tokens`,
    label || expiresAt ? { label, expiresAt } : {}
  )
  return res
}

// ---------------------------------------------------------------------------
// Token management (authenticated routes)
// ---------------------------------------------------------------------------

describe('share token management', () => {
  it('admin creates a token → 201 with id', async () => {
    const res = await createToken(adminUser, 'My link')
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.id).toBeTruthy()
    expect(body.data.id.length).toBe(32) // 32-char hex
    expect(body.data.label).toBe('My link')
  })

  it('admin lists tokens → sees created token (masked)', async () => {
    await createToken(adminUser, 'link-a')
    await createToken(adminUser, 'link-b')

    const app = makeAnalyticsApp(adminUser)
    const res = await app.request(`/test/${dashboardId}/share-tokens`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.length).toBe(2)
    // Masked IDs should not expose the full token
    for (const t of body.data) {
      expect(t.idMasked).toMatch(/^[0-9a-f]{8}\.\.\.$/)
      expect(t.id).toBeTruthy() // full id still returned for revoke purposes
    }
  })

  it('admin revokes a token → 204; token disappears from list', async () => {
    const createRes = await createToken(adminUser)
    const { id: tokenId } = (await createRes.json()).data

    const app = makeAnalyticsApp(adminUser)
    const revokeRes = await app.request(`/test/${dashboardId}/share-tokens/${tokenId}`, {
      method: 'DELETE',
    })
    expect(revokeRes.status).toBe(204)

    const listRes = await app.request(`/test/${dashboardId}/share-tokens`)
    const body = await listRes.json()
    expect(body.data.length).toBe(0)
  })

  it('member who is not the creator cannot create tokens → 403', async () => {
    const res = await createToken(memberUser)
    expect(res.status).toBe(403)
  })

  it('member who is not the creator cannot revoke tokens → 403', async () => {
    const createRes = await createToken(adminUser)
    const { id: tokenId } = (await createRes.json()).data

    const app = makeAnalyticsApp(memberUser)
    const res = await app.request(`/test/${dashboardId}/share-tokens/${tokenId}`, {
      method: 'DELETE',
    })
    expect(res.status).toBe(403)
  })

  it('create token for nonexistent dashboard → 404', async () => {
    const app = makeAnalyticsApp(adminUser)
    const res = await jsonRequest(app, 'POST', '/test/99999/share-tokens', {})
    expect(res.status).toBe(404)
  })

  it('member who created the dashboard can create/list/revoke tokens', async () => {
    // Create a dashboard owned by memberUser
    const [memberPage] = await db
      .insert(analyticsPages)
      .values({
        name: 'Member Dashboard',
        organisationId: 1,
        config: minimalConfig,
        createdBy: memberUser.id,
        isActive: true,
      })
      .returning()

    const app = mountRoute(analyticsApp, { db, user: memberUser }, '/test')
    const createRes = await jsonRequest(app, 'POST', `/test/${memberPage.id}/share-tokens`, {
      label: 'member link',
    })
    expect(createRes.status).toBe(201)
  })
})

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------

describe('public dashboard routes', () => {
  it('valid token → 200 with dashboard config', async () => {
    const createRes = await createToken(adminUser)
    const { id: tokenId } = (await createRes.json()).data

    const pub = makePublicApp()
    const res = await pub.request(`/public/dashboard/${tokenId}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.dashboard.id).toBe(dashboardId)
    expect(body.data.dashboard.name).toBe('Test Dashboard')
    expect(body.data.dashboard.config).toBeDefined()
  })

  it('revoked token → 404', async () => {
    const createRes = await createToken(adminUser)
    const { id: tokenId } = (await createRes.json()).data

    // Revoke it
    const app = makeAnalyticsApp(adminUser)
    await app.request(`/test/${dashboardId}/share-tokens/${tokenId}`, { method: 'DELETE' })

    const pub = makePublicApp()
    const res = await pub.request(`/public/dashboard/${tokenId}`)
    expect(res.status).toBe(404)
  })

  it('expired token → 404', async () => {
    // Insert a token that already expired
    const expiredDate = new Date(Date.now() - 1000)
    await db.insert(dashboardShareTokens).values({
      id: 'aabbccddaabbccddaabbccddaabbccdd',
      dashboardId,
      organisationId: 1,
      expiresAt: expiredDate,
    })

    const pub = makePublicApp()
    const res = await pub.request('/public/dashboard/aabbccddaabbccddaabbccddaabbccdd')
    expect(res.status).toBe(404)
  })

  it('nonexistent token → 404', async () => {
    const pub = makePublicApp()
    const res = await pub.request('/public/dashboard/0000000000000000000000000000beef')
    expect(res.status).toBe(404)
  })

  it('soft-deleted dashboard returns 404 even with valid token', async () => {
    const createRes = await createToken(adminUser)
    const { id: tokenId } = (await createRes.json()).data

    // Soft-delete the dashboard
    await db
      .update(analyticsPages)
      .set({ isActive: false })
      .where(eq(analyticsPages.id, dashboardId))

    const pub = makePublicApp()
    const res = await pub.request(`/public/dashboard/${tokenId}`)
    expect(res.status).toBe(404)
  })

  it('future token (not yet expired) → 200', async () => {
    const futureDate = new Date(Date.now() + 86_400_000) // +1 day
    const tokenId = 'ffffffffffffffffffffffffffffffff'
    await db.insert(dashboardShareTokens).values({
      id: tokenId,
      dashboardId,
      organisationId: 1,
      expiresAt: futureDate,
    })

    const pub = makePublicApp()
    const res = await pub.request(`/public/dashboard/${tokenId}`)
    expect(res.status).toBe(200)
  })
})
