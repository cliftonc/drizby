import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { analyticsPages, contentGroupVisibility, groupTypes, groups, userGroups } from '../schema'
import analyticsApp from '../src/routes/analytics-pages'
import { jsonRequest, mountRoute } from './helpers/test-app'
import { createTestDb, seedAdminUser, seedMemberUser } from './helpers/test-db'

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

function adminApp() {
  return mountRoute(analyticsApp, { db, user: adminUser })
}

function memberApp() {
  return mountRoute(analyticsApp, { db, user: memberUser })
}

async function seedGroup(localDb: any, name: string) {
  const [type] = await localDb
    .insert(groupTypes)
    .values({ name: `Type-${name}`, organisationId: 1 })
    .returning()
  const [group] = await localDb
    .insert(groups)
    .values({ name, groupTypeId: type.id, organisationId: 1 })
    .returning()
  return group
}

async function seedDashboard(localDb: any, userId: number, name: string) {
  const [page] = await localDb
    .insert(analyticsPages)
    .values({
      name,
      organisationId: 1,
      isActive: true,
      config: { portlets: [] },
      createdBy: userId,
    })
    .returning()
  return page
}

async function assignGroupVisibility(
  localDb: any,
  contentId: number,
  groupId: number,
  contentType = 'dashboard'
) {
  await localDb.insert(contentGroupVisibility).values({ contentType, contentId, groupId })
}

async function addUserToGroup(localDb: any, userId: number, groupId: number) {
  await localDb.insert(userGroups).values({ userId, groupId })
}

// ─── Listing ─────────────────────────────────────────────────────

describe('GET / — listing', () => {
  it('admin sees all dashboards including group-restricted ones', async () => {
    const group = await seedGroup(db, 'Engineering')
    const d1 = await seedDashboard(db, adminUser.id, 'Open Dashboard')
    const d2 = await seedDashboard(db, adminUser.id, 'Restricted Dashboard')
    await assignGroupVisibility(db, d2.id, group.id)

    const res = await adminApp().request('/test')
    const { data } = await res.json()
    const ids = data.map((d: any) => d.id)
    expect(ids).toContain(d1.id)
    expect(ids).toContain(d2.id)
  })

  it('member with no group memberships sees only unguarded dashboards', async () => {
    const group = await seedGroup(db, 'Engineering')
    const d1 = await seedDashboard(db, adminUser.id, 'Open Dashboard')
    const d2 = await seedDashboard(db, adminUser.id, 'Restricted Dashboard')
    await assignGroupVisibility(db, d2.id, group.id)

    const res = await memberApp().request('/test')
    const { data } = await res.json()
    const ids = data.map((d: any) => d.id)
    expect(ids).toContain(d1.id)
    expect(ids).not.toContain(d2.id)
  })

  it('member sees dashboards assigned to a group they belong to', async () => {
    const group = await seedGroup(db, 'Sales')
    const d1 = await seedDashboard(db, adminUser.id, 'Sales Dashboard')
    await assignGroupVisibility(db, d1.id, group.id)
    await addUserToGroup(db, memberUser.id, group.id)

    const res = await memberApp().request('/test')
    const { data } = await res.json()
    const ids = data.map((d: any) => d.id)
    expect(ids).toContain(d1.id)
  })

  it('member cannot see dashboards assigned to a group they are not in', async () => {
    const group = await seedGroup(db, 'Finance')
    const d1 = await seedDashboard(db, adminUser.id, 'Finance Dashboard')
    await assignGroupVisibility(db, d1.id, group.id)

    const res = await memberApp().request('/test')
    const { data } = await res.json()
    const ids = data.map((d: any) => d.id)
    expect(ids).not.toContain(d1.id)
  })

  it('creator can still see their own restricted dashboard (creator exception)', async () => {
    const group = await seedGroup(db, 'Executives')
    const d1 = await seedDashboard(db, memberUser.id, 'My Restricted Dashboard')
    await assignGroupVisibility(db, d1.id, group.id)

    const res = await memberApp().request('/test')
    const { data } = await res.json()
    const ids = data.map((d: any) => d.id)
    expect(ids).toContain(d1.id)
  })

  it('dashboard with no visibility groups is visible to all members', async () => {
    const d1 = await seedDashboard(db, adminUser.id, 'Public Dashboard')

    const res = await memberApp().request('/test')
    const { data } = await res.json()
    const ids = data.map((d: any) => d.id)
    expect(ids).toContain(d1.id)
  })

  it('returns empty list when member can see no dashboards', async () => {
    const group = await seedGroup(db, 'Restricted')
    const d1 = await seedDashboard(db, adminUser.id, 'Hidden Dashboard')
    await assignGroupVisibility(db, d1.id, group.id)

    const res = await memberApp().request('/test')
    const body = await res.json()
    expect(body.data).toHaveLength(0)
    expect(body.meta.total).toBe(0)
  })
})

// ─── Single fetch ────────────────────────────────────────────────

describe('GET /:id — single fetch', () => {
  it('returns 400 for invalid ID', async () => {
    const res = await adminApp().request('/test/notanumber')
    expect(res.status).toBe(400)
  })

  it('returns 404 for non-existent dashboard', async () => {
    const res = await adminApp().request('/test/99999')
    expect(res.status).toBe(404)
  })

  it('returns 404 for visibility-blocked dashboard (non-admin)', async () => {
    const group = await seedGroup(db, 'Secret')
    const d1 = await seedDashboard(db, adminUser.id, 'Secret Dashboard')
    await assignGroupVisibility(db, d1.id, group.id)

    const res = await memberApp().request(`/test/${d1.id}`)
    expect(res.status).toBe(404)
  })

  it('returns dashboard when member has group access', async () => {
    const group = await seedGroup(db, 'Sales')
    const d1 = await seedDashboard(db, adminUser.id, 'Sales Dashboard')
    await assignGroupVisibility(db, d1.id, group.id)
    await addUserToGroup(db, memberUser.id, group.id)

    const res = await memberApp().request(`/test/${d1.id}`)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.id).toBe(d1.id)
  })
})

// ─── Creation ────────────────────────────────────────────────────

describe('POST / — creation', () => {
  it('missing required fields returns 400', async () => {
    const res = await jsonRequest(adminApp(), 'POST', '/test', { name: 'No Config' })
    expect(res.status).toBe(400)
  })

  it('missing name returns 400', async () => {
    const res = await jsonRequest(adminApp(), 'POST', '/test', {
      config: { portlets: [] },
    })
    expect(res.status).toBe(400)
  })

  it('dashboard created by a member with no groups assigns no visibility rows', async () => {
    const res = await jsonRequest(memberApp(), 'POST', '/test', {
      name: 'My Dashboard',
      config: { portlets: [] },
    })
    expect(res.status).toBe(201)

    const allVis = await db.select().from(contentGroupVisibility)
    expect(allVis).toHaveLength(0)
  })

  it('dashboard created by member auto-assigns their groups to content_group_visibility', async () => {
    const group = await seedGroup(db, 'TeamA')
    await addUserToGroup(db, memberUser.id, group.id)

    const res = await jsonRequest(memberApp(), 'POST', '/test', {
      name: 'Group Dashboard',
      config: { portlets: [] },
    })
    expect(res.status).toBe(201)
    const { data } = await res.json()

    const visRows = await db.select().from(contentGroupVisibility)
    expect(visRows).toHaveLength(1)
    expect(visRows[0].contentId).toBe(data.id)
    expect(visRows[0].groupId).toBe(group.id)
    expect(visRows[0].contentType).toBe('dashboard')
  })
})

// ─── Update ──────────────────────────────────────────────────────

describe('PUT /:id — update', () => {
  it('admin can update any dashboard', async () => {
    const d1 = await seedDashboard(db, memberUser.id, 'Member Dashboard')
    const res = await jsonRequest(adminApp(), 'PUT', `/test/${d1.id}`, { name: 'Updated' })
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.name).toBe('Updated')
  })

  it('member can update their own dashboard', async () => {
    const d1 = await seedDashboard(db, memberUser.id, 'My Dashboard')
    const res = await jsonRequest(memberApp(), 'PUT', `/test/${d1.id}`, { name: 'Renamed' })
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.name).toBe('Renamed')
  })

  it("member cannot update another user's dashboard", async () => {
    const d1 = await seedDashboard(db, adminUser.id, 'Admin Dashboard')
    const res = await jsonRequest(memberApp(), 'PUT', `/test/${d1.id}`, { name: 'Hacked' })
    expect(res.status).toBe(403)
  })
})

// ─── Delete ──────────────────────────────────────────────────────

describe('DELETE /:id — soft delete', () => {
  it('admin can soft-delete any dashboard', async () => {
    const d1 = await seedDashboard(db, memberUser.id, 'Member Dashboard')
    const res = await jsonRequest(adminApp(), 'DELETE', `/test/${d1.id}`, {})
    expect(res.status).toBe(200)

    // Should no longer appear in listing
    const list = await adminApp().request('/test')
    const { data } = await list.json()
    const ids = data.map((d: any) => d.id)
    expect(ids).not.toContain(d1.id)
  })

  it('member can soft-delete their own dashboard', async () => {
    const d1 = await seedDashboard(db, memberUser.id, 'My Dashboard')
    const res = await jsonRequest(memberApp(), 'DELETE', `/test/${d1.id}`, {})
    expect(res.status).toBe(200)

    // Should no longer appear in listing
    const list = await memberApp().request('/test')
    const { data } = await list.json()
    const ids = data.map((d: any) => d.id)
    expect(ids).not.toContain(d1.id)
  })

  it("member cannot delete another user's dashboard", async () => {
    const d1 = await seedDashboard(db, adminUser.id, 'Admin Dashboard')
    const res = await jsonRequest(memberApp(), 'DELETE', `/test/${d1.id}`, {})
    expect(res.status).toBe(403)
  })
})
