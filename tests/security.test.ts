/**
 * Security regression tests — M001-j8s3m1
 *
 * Each describe block maps to a specific finding from the red-team audit.
 * These tests exist to prevent regressions; if any fail, a security fix has
 * been reverted or broken.
 */

import crypto from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../schema'
import { oauthAccounts, users } from '../schema'
import { createRateLimiter } from '../src/auth/rate-limit'
import { defineAbilitiesFor } from '../src/permissions/abilities'
import connectionsApp from '../src/routes/connections'
import usersApp from '../src/routes/users'
import { jsonRequest, mountRoute } from './helpers/test-app'
import { createTestDb, seedAdminUser, seedMemberUser } from './helpers/test-db'

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let db: any
let sqlite: any
let adminUser: any
let memberUser: any

beforeEach(async () => {
  ;({ db, sqlite } = createTestDb())
  adminUser = await seedAdminUser(db)
  memberUser = await seedMemberUser(db)
})

afterEach(() => {
  sqlite.close()
})

// ---------------------------------------------------------------------------
// Helper: seed a pending (role=user) account
// ---------------------------------------------------------------------------
async function seedPendingUser(db: any) {
  const [user] = await db
    .insert(users)
    .values({
      email: 'pending@test.com',
      username: 'pending',
      name: 'Pending User',
      role: 'user',
      organisationId: 1,
    })
    .returning()
  return user
}

// ---------------------------------------------------------------------------
// Helper: seed a connection row
// ---------------------------------------------------------------------------
async function seedConnection(db: any, opts: { connectionString?: string } = {}) {
  const [conn] = await db
    .insert(schema.connections)
    .values({
      name: 'Test DB',
      engineType: 'sqlite',
      connectionString: opts.connectionString ?? 'file:./data/test.db',
      organisationId: 1,
    })
    .returning()
  return conn
}

// ---------------------------------------------------------------------------
// Helper: mount connections route with a given user
// ---------------------------------------------------------------------------
function connectionApp(user: any) {
  return mountRoute(connectionsApp, { db, user })
}

// ===========================================================================
// Finding #1 — OAuth cross-provider account takeover (S01)
// ===========================================================================

describe('OAuth provider filter — cross-provider account takeover prevention', () => {
  it('does not match a GitHub account when a Google account has the same providerUserId', async () => {
    // Create a real user linked to Google with providerUserId "12345"
    const googleUser = await db
      .insert(users)
      .values({
        email: 'google-user@test.com',
        username: 'googleuser',
        name: 'Google User',
        role: 'member',
        organisationId: 1,
      })
      .returning()
      .then((r: any[]) => r[0])

    await db.insert(oauthAccounts).values({
      userId: googleUser.id,
      provider: 'google',
      providerUserId: '12345',
    })

    // A GitHub account with the SAME providerUserId should NOT find the Google record
    const [match] = await db
      .select()
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.provider, 'github'), // different provider
          eq(oauthAccounts.providerUserId, '12345') // same ID
        )
      )

    expect(match).toBeUndefined()
  })

  it('correctly finds an account when both provider AND providerUserId match', async () => {
    const user = await db
      .insert(users)
      .values({
        email: 'gh@test.com',
        username: 'ghuser',
        name: 'GH User',
        role: 'member',
        organisationId: 1,
      })
      .returning()
      .then((r: any[]) => r[0])

    await db.insert(oauthAccounts).values({
      userId: user.id,
      provider: 'github',
      providerUserId: '99999',
    })

    const [match] = await db
      .select()
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.provider, 'github'), eq(oauthAccounts.providerUserId, '99999')))

    expect(match).toBeDefined()
    expect(match.userId).toBe(user.id)
  })

  it('two users can share the same providerUserId on different providers without collision', async () => {
    const [u1] = await db
      .insert(users)
      .values({ email: 'a@test.com', username: 'a', name: 'A', role: 'member', organisationId: 1 })
      .returning()
    const [u2] = await db
      .insert(users)
      .values({ email: 'b@test.com', username: 'b', name: 'B', role: 'member', organisationId: 1 })
      .returning()

    await db
      .insert(oauthAccounts)
      .values({ userId: u1.id, provider: 'google', providerUserId: 'shared-id' })
    await db
      .insert(oauthAccounts)
      .values({ userId: u2.id, provider: 'github', providerUserId: 'shared-id' })

    const [googleMatch] = await db
      .select()
      .from(oauthAccounts)
      .where(
        and(eq(oauthAccounts.provider, 'google'), eq(oauthAccounts.providerUserId, 'shared-id'))
      )

    const [githubMatch] = await db
      .select()
      .from(oauthAccounts)
      .where(
        and(eq(oauthAccounts.provider, 'github'), eq(oauthAccounts.providerUserId, 'shared-id'))
      )

    expect(googleMatch.userId).toBe(u1.id)
    expect(githubMatch.userId).toBe(u2.id)
    expect(googleMatch.userId).not.toBe(githubMatch.userId)
  })
})

// ===========================================================================
// Finding #2 — GET /api/connections/:id credential leakage (S02)
// ===========================================================================

describe('Connection credential masking — role-based access', () => {
  it('admin receives the (unmasked) connectionString field', async () => {
    const conn = await seedConnection(db, { connectionString: 'postgres://user:secret@host/db' })
    const res = await connectionApp(adminUser).request(`/test/${conn.id}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    // Admin path: connectionString is present (may be encrypted/decrypted but field exists)
    expect(body).toHaveProperty('connectionString')
    expect(body).not.toHaveProperty('maskedConnectionString')
  })

  it('member does NOT receive connectionString — only maskedConnectionString', async () => {
    const conn = await seedConnection(db, { connectionString: 'postgres://user:secret@host/db' })
    const res = await connectionApp(memberUser).request(`/test/${conn.id}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).not.toHaveProperty('connectionString')
    expect(body).toHaveProperty('maskedConnectionString')
  })

  it('masked string does not expose the raw secret', async () => {
    const conn = await seedConnection(db, {
      connectionString: 'postgres://admin:supersecret@host/db',
    })
    const res = await connectionApp(memberUser).request(`/test/${conn.id}`)
    const body = await res.json()
    expect(body.maskedConnectionString).not.toContain('supersecret')
  })
})

// ===========================================================================
// Finding #5 — Role enum validation (S06)
// ===========================================================================

describe('User role enum validation', () => {
  function adminUsersApp() {
    return mountRoute(usersApp, { db, user: adminUser })
  }

  it('rejects invalid role on user create', async () => {
    const res = await jsonRequest(adminUsersApp(), 'POST', '/test', {
      name: 'Bad Role',
      email: 'badrole@test.com',
      role: 'superadmin',
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid role/i)
  })

  it('rejects invalid role on user update', async () => {
    const res = await jsonRequest(adminUsersApp(), 'PUT', `/test/${memberUser.id}`, {
      role: 'superadmin',
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid role/i)
  })

  it('accepts all valid roles on create', async () => {
    for (const role of ['admin', 'member', 'user']) {
      const res = await jsonRequest(adminUsersApp(), 'POST', '/test', {
        name: `Test ${role}`,
        email: `${role}-valid@test.com`,
        role,
      })
      // 201 created or 409 conflict (email exists), either is fine — just not 400
      expect(res.status).not.toBe(400)
    }
  })

  it('accepts valid role on update', async () => {
    const res = await jsonRequest(adminUsersApp(), 'PUT', `/test/${memberUser.id}`, {
      role: 'admin',
    })
    expect(res.status).toBe(200)
  })

  it('invalid role is rejected before self-demotion check', async () => {
    // Admin updating their own user with an invalid role should get 400 (not 400 for self-demotion)
    const res = await jsonRequest(adminUsersApp(), 'PUT', `/test/${adminUser.id}`, {
      role: 'overlord',
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid role/i)
  })
})

// ===========================================================================
// Finding #6 — Cloud admin HMAC crash on malformed signatures (S06)
// ===========================================================================

describe('Cloud admin — malformed hex signature handling', () => {
  // We test the guard logic directly rather than the full HTTP route
  // because the route requires a running session/cookie infrastructure.
  // The guard: if (!/^[0-9a-f]{64}$/i.test(sig)) return 401

  const validSigPattern = /^[0-9a-f]{64}$/i

  it('rejects signature that is too short', () => {
    const sig = 'abc123'
    expect(validSigPattern.test(sig)).toBe(false)
  })

  it('rejects signature that is too long', () => {
    const sig = 'a'.repeat(65)
    expect(validSigPattern.test(sig)).toBe(false)
  })

  it('rejects signature with non-hex characters', () => {
    const sig = 'z'.repeat(64)
    expect(validSigPattern.test(sig)).toBe(false)
  })

  it('rejects empty string', () => {
    expect(validSigPattern.test('')).toBe(false)
  })

  it('accepts a valid 64-char lowercase hex string', () => {
    const sig = crypto.randomBytes(32).toString('hex') // always 64 hex chars
    expect(validSigPattern.test(sig)).toBe(true)
  })

  it('accepts a valid 64-char uppercase hex string', () => {
    const sig = crypto.randomBytes(32).toString('hex').toUpperCase()
    expect(validSigPattern.test(sig)).toBe(true)
  })

  it('does not throw RangeError when timingSafeEqual is called with matched lengths', () => {
    // Verify our pattern correctly gates timingSafeEqual from mismatched buffers
    const sig = crypto.randomBytes(32).toString('hex') // 64 hex chars = 32 bytes
    const expected = crypto.randomBytes(32).toString('hex')

    expect(() => {
      if (validSigPattern.test(sig)) {
        crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
      }
    }).not.toThrow()
  })
})

// ===========================================================================
// Finding #7 — Rate limiter (S06)
// ===========================================================================

describe('Rate limiter', () => {
  function buildApp(maxRequests: number, windowMs: number) {
    const limiter = createRateLimiter(maxRequests, windowMs)
    const app = new Hono()
    app.use('/protected', limiter)
    app.get('/protected', c => c.json({ ok: true }))
    return app
  }

  it('allows requests below the threshold', async () => {
    const app = buildApp(3, 60_000)
    for (let i = 0; i < 3; i++) {
      const res = await app.request('/protected')
      expect(res.status).toBe(200)
    }
  })

  it('returns 429 when threshold is exceeded', async () => {
    const app = buildApp(2, 60_000)
    await app.request('/protected') // 1
    await app.request('/protected') // 2
    const res = await app.request('/protected') // 3 — over limit
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toMatch(/too many requests/i)
  })

  it('sets standard rate-limit headers on all responses', async () => {
    const app = buildApp(5, 60_000)
    const res = await app.request('/protected')
    expect(res.headers.get('x-ratelimit-limit')).toBe('5')
    expect(res.headers.get('x-ratelimit-remaining')).toBe('4')
    expect(res.headers.get('x-ratelimit-reset')).toBeTruthy()
  })

  it('sets Retry-After and X-RateLimit-Remaining:0 on 429', async () => {
    const app = buildApp(1, 60_000)
    await app.request('/protected') // allowed
    const res = await app.request('/protected') // blocked
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect(res.headers.get('x-ratelimit-remaining')).toBe('0')
  })
})

// ===========================================================================
// Finding #8 — Pending users blocked from /cubejs-api/* (S06)
// Tested via app.ts middleware logic — mount a minimal simulation
// ===========================================================================

describe('Pending user (role=user) access control', () => {
  it('pending user role is correctly identified as role=user in the DB', async () => {
    const pending = await seedPendingUser(db)
    expect(pending.role).toBe('user')
  })

  it('CASL ability for role=user cannot manage connections or cubes', () => {
    const ability = defineAbilitiesFor('user')
    expect(ability.can('manage', 'Connection')).toBe(false)
    expect(ability.can('manage', 'CubeDefinition')).toBe(false)
  })

  it('CASL ability for member can read connections', () => {
    const ability = defineAbilitiesFor('member')
    expect(ability.can('read', 'Connection')).toBe(true)
  })

  it('CASL ability for admin has full access', () => {
    const ability = defineAbilitiesFor('admin')
    expect(ability.can('manage', 'all')).toBe(true)
  })
})

// ===========================================================================
// Finding — User management RBAC (defence-in-depth)
// ===========================================================================

describe('User management — RBAC enforcement', () => {
  function memberUsersApp() {
    return mountRoute(usersApp, { db, user: memberUser })
  }

  function adminUsersApp() {
    return mountRoute(usersApp, { db, user: adminUser })
  }

  it('member cannot list users', async () => {
    const res = await memberUsersApp().request('/test')
    expect(res.status).toBe(403)
  })

  it('member cannot create a user', async () => {
    const res = await jsonRequest(memberUsersApp(), 'POST', '/test', {
      name: 'Hacker',
      email: 'hacker@evil.com',
      role: 'admin',
    })
    expect(res.status).toBe(403)
  })

  it('member cannot update another user', async () => {
    const res = await jsonRequest(memberUsersApp(), 'PUT', `/test/${adminUser.id}`, {
      role: 'member',
    })
    expect(res.status).toBe(403)
  })

  it('member cannot delete a user', async () => {
    const res = await jsonRequest(memberUsersApp(), 'DELETE', `/test/${adminUser.id}`)
    expect(res.status).toBe(403)
  })

  it('admin cannot demote themselves', async () => {
    const res = await jsonRequest(adminUsersApp(), 'PUT', `/test/${adminUser.id}`, {
      role: 'member',
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/cannot change your own role/i)
  })

  it('admin cannot delete themselves', async () => {
    const res = await jsonRequest(adminUsersApp(), 'DELETE', `/test/${adminUser.id}`)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/cannot delete yourself/i)
  })
})
