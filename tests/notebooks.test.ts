import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { contentGroupVisibility, groupTypes, groups, notebooks, userGroups } from '../schema'
import notebooksApp from '../src/routes/notebooks'
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
  return mountRoute(notebooksApp, { db, user: adminUser })
}

function memberApp() {
  return mountRoute(notebooksApp, { db, user: memberUser })
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

async function seedNotebook(localDb: any, userId: number, name: string) {
  const [notebook] = await localDb
    .insert(notebooks)
    .values({
      name,
      organisationId: 1,
      isActive: true,
      config: { blocks: [], messages: [] },
      createdBy: userId,
    })
    .returning()
  return notebook
}

async function assignGroupVisibility(
  localDb: any,
  contentId: number,
  groupId: number,
  contentType = 'notebook'
) {
  await localDb.insert(contentGroupVisibility).values({ contentType, contentId, groupId })
}

async function addUserToGroup(localDb: any, userId: number, groupId: number) {
  await localDb.insert(userGroups).values({ userId, groupId })
}

// ─── Listing ─────────────────────────────────────────────────────

describe('GET / — listing', () => {
  it('admin sees all notebooks including group-restricted ones', async () => {
    const group = await seedGroup(db, 'Engineering')
    const n1 = await seedNotebook(db, adminUser.id, 'Open Notebook')
    const n2 = await seedNotebook(db, adminUser.id, 'Restricted Notebook')
    await assignGroupVisibility(db, n2.id, group.id)

    const res = await adminApp().request('/test')
    const { data } = await res.json()
    const ids = data.map((d: any) => d.id)
    expect(ids).toContain(n1.id)
    expect(ids).toContain(n2.id)
  })

  it('member with no group memberships sees only unguarded notebooks', async () => {
    const group = await seedGroup(db, 'Engineering')
    const n1 = await seedNotebook(db, adminUser.id, 'Open Notebook')
    const n2 = await seedNotebook(db, adminUser.id, 'Restricted Notebook')
    await assignGroupVisibility(db, n2.id, group.id)

    const res = await memberApp().request('/test')
    const { data } = await res.json()
    const ids = data.map((d: any) => d.id)
    expect(ids).toContain(n1.id)
    expect(ids).not.toContain(n2.id)
  })

  it('member sees notebooks assigned to a group they belong to', async () => {
    const group = await seedGroup(db, 'Sales')
    const n1 = await seedNotebook(db, adminUser.id, 'Sales Notebook')
    await assignGroupVisibility(db, n1.id, group.id)
    await addUserToGroup(db, memberUser.id, group.id)

    const res = await memberApp().request('/test')
    const { data } = await res.json()
    const ids = data.map((d: any) => d.id)
    expect(ids).toContain(n1.id)
  })

  it('member cannot see notebooks assigned to a group they are not in', async () => {
    const group = await seedGroup(db, 'Finance')
    const n1 = await seedNotebook(db, adminUser.id, 'Finance Notebook')
    await assignGroupVisibility(db, n1.id, group.id)

    const res = await memberApp().request('/test')
    const { data } = await res.json()
    const ids = data.map((d: any) => d.id)
    expect(ids).not.toContain(n1.id)
  })

  it('creator can still see their own restricted notebook (creator exception)', async () => {
    const group = await seedGroup(db, 'Executives')
    const n1 = await seedNotebook(db, memberUser.id, 'My Restricted Notebook')
    await assignGroupVisibility(db, n1.id, group.id)

    const res = await memberApp().request('/test')
    const { data } = await res.json()
    const ids = data.map((d: any) => d.id)
    expect(ids).toContain(n1.id)
  })

  it('notebook with no visibility groups is visible to all members', async () => {
    const n1 = await seedNotebook(db, adminUser.id, 'Public Notebook')

    const res = await memberApp().request('/test')
    const { data } = await res.json()
    const ids = data.map((d: any) => d.id)
    expect(ids).toContain(n1.id)
  })

  it('returns empty list when member can see no notebooks', async () => {
    const group = await seedGroup(db, 'Restricted')
    const n1 = await seedNotebook(db, adminUser.id, 'Hidden Notebook')
    await assignGroupVisibility(db, n1.id, group.id)

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

  it('returns 404 for non-existent notebook', async () => {
    const res = await adminApp().request('/test/99999')
    expect(res.status).toBe(404)
  })

  it('returns 404 for visibility-blocked notebook (non-admin)', async () => {
    const group = await seedGroup(db, 'Secret')
    const n1 = await seedNotebook(db, adminUser.id, 'Secret Notebook')
    await assignGroupVisibility(db, n1.id, group.id)

    const res = await memberApp().request(`/test/${n1.id}`)
    expect(res.status).toBe(404)
  })

  it('returns notebook when member has group access', async () => {
    const group = await seedGroup(db, 'Sales')
    const n1 = await seedNotebook(db, adminUser.id, 'Sales Notebook')
    await assignGroupVisibility(db, n1.id, group.id)
    await addUserToGroup(db, memberUser.id, group.id)

    const res = await memberApp().request(`/test/${n1.id}`)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.id).toBe(n1.id)
  })
})

// ─── Creation ────────────────────────────────────────────────────

describe('POST / — creation', () => {
  it('missing name returns 400', async () => {
    const res = await jsonRequest(adminApp(), 'POST', '/test', {
      description: 'No name provided',
    })
    expect(res.status).toBe(400)
  })

  it('notebook created by a member with no groups assigns no visibility rows', async () => {
    const res = await jsonRequest(memberApp(), 'POST', '/test', {
      name: 'My Notebook',
    })
    expect(res.status).toBe(201)

    const allVis = await db.select().from(contentGroupVisibility)
    expect(allVis).toHaveLength(0)
  })

  it('notebook created by member auto-assigns their groups to content_group_visibility', async () => {
    const group = await seedGroup(db, 'TeamA')
    await addUserToGroup(db, memberUser.id, group.id)

    const res = await jsonRequest(memberApp(), 'POST', '/test', {
      name: 'Group Notebook',
    })
    expect(res.status).toBe(201)
    const { data } = await res.json()

    const visRows = await db.select().from(contentGroupVisibility)
    expect(visRows).toHaveLength(1)
    expect(visRows[0].contentId).toBe(data.id)
    expect(visRows[0].groupId).toBe(group.id)
    expect(visRows[0].contentType).toBe('notebook')
  })
})

// ─── Update ──────────────────────────────────────────────────────

describe('PUT /:id — update', () => {
  it('admin can update any notebook', async () => {
    const n1 = await seedNotebook(db, memberUser.id, 'Member Notebook')
    const res = await jsonRequest(adminApp(), 'PUT', `/test/${n1.id}`, { name: 'Updated' })
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.name).toBe('Updated')
  })

  it('member can update their own notebook', async () => {
    const n1 = await seedNotebook(db, memberUser.id, 'My Notebook')
    const res = await jsonRequest(memberApp(), 'PUT', `/test/${n1.id}`, { name: 'Renamed' })
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.name).toBe('Renamed')
  })

  it("member cannot update another user's notebook", async () => {
    const n1 = await seedNotebook(db, adminUser.id, 'Admin Notebook')
    const res = await jsonRequest(memberApp(), 'PUT', `/test/${n1.id}`, { name: 'Hacked' })
    expect(res.status).toBe(403)
  })
})

// ─── Delete ──────────────────────────────────────────────────────

describe('DELETE /:id — soft delete', () => {
  it('admin can soft-delete any notebook', async () => {
    const n1 = await seedNotebook(db, memberUser.id, 'Member Notebook')
    const res = await jsonRequest(adminApp(), 'DELETE', `/test/${n1.id}`, {})
    expect(res.status).toBe(200)

    // Should no longer appear in listing
    const list = await adminApp().request('/test')
    const { data } = await list.json()
    const ids = data.map((d: any) => d.id)
    expect(ids).not.toContain(n1.id)
  })

  it('member can soft-delete their own notebook', async () => {
    const n1 = await seedNotebook(db, memberUser.id, 'My Notebook')
    const res = await jsonRequest(memberApp(), 'DELETE', `/test/${n1.id}`, {})
    expect(res.status).toBe(200)

    // Should no longer appear in listing
    const list = await memberApp().request('/test')
    const { data } = await list.json()
    const ids = data.map((d: any) => d.id)
    expect(ids).not.toContain(n1.id)
  })

  it("member cannot delete another user's notebook", async () => {
    const n1 = await seedNotebook(db, adminUser.id, 'Admin Notebook')
    const res = await jsonRequest(memberApp(), 'DELETE', `/test/${n1.id}`, {})
    expect(res.status).toBe(403)
  })
})
