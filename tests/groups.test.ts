import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import groupsApp from '../src/routes/groups'
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
  return mountRoute(groupsApp, { db, user: adminUser })
}

function memberApp() {
  return mountRoute(groupsApp, { db, user: memberUser })
}

// ─── Group Types ──────────────────────────────────────────────────

describe('group types', () => {
  it('admin can create a group type', async () => {
    const res = await jsonRequest(adminApp(), 'POST', '/test/types', {
      name: 'Department',
      description: 'Org departments',
    })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data.name).toBe('Department')
  })

  it('member cannot create a group type', async () => {
    const res = await jsonRequest(memberApp(), 'POST', '/test/types', { name: 'X' })
    expect(res.status).toBe(403)
  })

  it('rejects duplicate group type names', async () => {
    const app = adminApp()
    await jsonRequest(app, 'POST', '/test/types', { name: 'Role' })
    const res = await jsonRequest(app, 'POST', '/test/types', { name: 'Role' })
    expect(res.status).toBe(409)
  })

  it('admin can update a group type', async () => {
    const app = adminApp()
    const create = await jsonRequest(app, 'POST', '/test/types', { name: 'Old' })
    const { data: created } = await create.json()
    const res = await jsonRequest(app, 'PUT', `/test/types/${created.id}`, { name: 'New' })
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.name).toBe('New')
  })

  it('admin can delete a group type (cascades groups)', async () => {
    const app = adminApp()
    const create = await jsonRequest(app, 'POST', '/test/types', { name: 'Temp' })
    const { data: type } = await create.json()
    // Create a group under it
    await jsonRequest(app, 'POST', '/test', { name: 'G1', groupTypeId: type.id })

    const res = await jsonRequest(app, 'DELETE', `/test/types/${type.id}`)
    expect(res.status).toBe(200)

    // Group should be gone too (cascade)
    const list = await app.request(`/test?typeId=${type.id}`)
    const { data } = await list.json()
    expect(data).toHaveLength(0)
  })

  it('lists group types', async () => {
    const app = adminApp()
    await jsonRequest(app, 'POST', '/test/types', { name: 'A' })
    await jsonRequest(app, 'POST', '/test/types', { name: 'B' })
    const res = await app.request('/test/types')
    const { data } = await res.json()
    expect(data).toHaveLength(2)
  })
})

// ─── Groups CRUD ──────────────────────────────────────────────────

describe('groups CRUD', () => {
  let typeId: number

  beforeEach(async () => {
    const app = adminApp()
    const res = await jsonRequest(app, 'POST', '/test/types', { name: 'Department' })
    const { data } = await res.json()
    typeId = data.id
  })

  it('admin can create a group', async () => {
    const res = await jsonRequest(adminApp(), 'POST', '/test', {
      name: 'Engineering',
      groupTypeId: typeId,
    })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data.name).toBe('Engineering')
    expect(data.groupTypeId).toBe(typeId)
  })

  it('member cannot create a group', async () => {
    const res = await jsonRequest(memberApp(), 'POST', '/test', {
      name: 'X',
      groupTypeId: typeId,
    })
    expect(res.status).toBe(403)
  })

  it('rejects duplicate group name within same type', async () => {
    const app = adminApp()
    await jsonRequest(app, 'POST', '/test', { name: 'Sales', groupTypeId: typeId })
    const res = await jsonRequest(app, 'POST', '/test', { name: 'Sales', groupTypeId: typeId })
    expect(res.status).toBe(409)
  })

  it('supports hierarchical groups (parentId)', async () => {
    const app = adminApp()
    const parent = await jsonRequest(app, 'POST', '/test', {
      name: 'Engineering',
      groupTypeId: typeId,
    })
    const { data: parentGroup } = await parent.json()

    const child = await jsonRequest(app, 'POST', '/test', {
      name: 'Frontend',
      groupTypeId: typeId,
      parentId: parentGroup.id,
    })
    const { data: childGroup } = await child.json()
    expect(childGroup.parentId).toBe(parentGroup.id)
  })

  it('lists groups with member count', async () => {
    const app = adminApp()
    const create = await jsonRequest(app, 'POST', '/test', {
      name: 'Engineering',
      groupTypeId: typeId,
    })
    const { data: group } = await create.json()

    // Add a member
    await jsonRequest(app, 'POST', `/test/${group.id}/members`, { userIds: [adminUser.id] })

    const res = await app.request('/test')
    const { data } = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].memberCount).toBe(1)
  })

  it('gets single group with members', async () => {
    const app = adminApp()
    const create = await jsonRequest(app, 'POST', '/test', {
      name: 'Sales',
      groupTypeId: typeId,
    })
    const { data: group } = await create.json()
    await jsonRequest(app, 'POST', `/test/${group.id}/members`, {
      userIds: [adminUser.id, memberUser.id],
    })

    const res = await app.request(`/test/${group.id}`)
    const { data } = await res.json()
    expect(data.name).toBe('Sales')
    expect(data.members).toHaveLength(2)
  })

  it('admin can update a group', async () => {
    const app = adminApp()
    const create = await jsonRequest(app, 'POST', '/test', {
      name: 'Old',
      groupTypeId: typeId,
    })
    const { data: group } = await create.json()

    const res = await jsonRequest(app, 'PUT', `/test/${group.id}`, { name: 'Updated' })
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.name).toBe('Updated')
  })

  it('admin can delete a group', async () => {
    const app = adminApp()
    const create = await jsonRequest(app, 'POST', '/test', {
      name: 'Temp',
      groupTypeId: typeId,
    })
    const { data: group } = await create.json()

    const res = await jsonRequest(app, 'DELETE', `/test/${group.id}`)
    expect(res.status).toBe(200)

    const check = await app.request(`/test/${group.id}`)
    expect(check.status).toBe(404)
  })
})

// ─── Membership ──────────────────────────────────────────────────

describe('membership', () => {
  let groupId: number

  beforeEach(async () => {
    const app = adminApp()
    const typeRes = await jsonRequest(app, 'POST', '/test/types', { name: 'Dept' })
    const { data: type } = await typeRes.json()
    const groupRes = await jsonRequest(app, 'POST', '/test', {
      name: 'Engineering',
      groupTypeId: type.id,
    })
    const { data: group } = await groupRes.json()
    groupId = group.id
  })

  it('admin can add members', async () => {
    const app = adminApp()
    const res = await jsonRequest(app, 'POST', `/test/${groupId}/members`, {
      userIds: [adminUser.id, memberUser.id],
    })
    expect(res.status).toBe(200)

    const list = await app.request(`/test/${groupId}/members`)
    const { data } = await list.json()
    expect(data).toHaveLength(2)
  })

  it('skips duplicate memberships', async () => {
    const app = adminApp()
    await jsonRequest(app, 'POST', `/test/${groupId}/members`, { userIds: [adminUser.id] })
    const res = await jsonRequest(app, 'POST', `/test/${groupId}/members`, {
      userIds: [adminUser.id],
    })
    const body = await res.json()
    expect(body.message).toBe('Added 0 member(s)')
  })

  it('admin can remove a member', async () => {
    const app = adminApp()
    await jsonRequest(app, 'POST', `/test/${groupId}/members`, { userIds: [memberUser.id] })

    const res = await jsonRequest(app, 'DELETE', `/test/${groupId}/members/${memberUser.id}`)
    expect(res.status).toBe(200)

    const list = await app.request(`/test/${groupId}/members`)
    const { data } = await list.json()
    expect(data).toHaveLength(0)
  })

  it('member cannot add members', async () => {
    const res = await jsonRequest(memberApp(), 'POST', `/test/${groupId}/members`, {
      userIds: [memberUser.id],
    })
    expect(res.status).toBe(403)
  })
})

// ─── Current user's groups ──────────────────────────────────────

describe('my groups', () => {
  it('returns groups the current user belongs to', async () => {
    const app = adminApp()
    const typeRes = await jsonRequest(app, 'POST', '/test/types', { name: 'Team' })
    const { data: type } = await typeRes.json()
    const g1Res = await jsonRequest(app, 'POST', '/test', {
      name: 'Alpha',
      groupTypeId: type.id,
    })
    const { data: g1 } = await g1Res.json()
    const g2Res = await jsonRequest(app, 'POST', '/test', {
      name: 'Beta',
      groupTypeId: type.id,
    })
    const { data: g2 } = await g2Res.json()

    await jsonRequest(app, 'POST', `/test/${g1.id}/members`, { userIds: [adminUser.id] })
    await jsonRequest(app, 'POST', `/test/${g2.id}/members`, { userIds: [adminUser.id] })

    const res = await app.request('/test/mine')
    const { data } = await res.json()
    expect(data).toHaveLength(2)
    expect(data.map((d: any) => d.groupName).sort()).toEqual(['Alpha', 'Beta'])
  })

  it('returns empty when user has no groups', async () => {
    const app = memberApp()
    const res = await app.request('/test/mine')
    const { data } = await res.json()
    expect(data).toHaveLength(0)
  })
})

// ─── Content Visibility ─────────────────────────────────────────

describe('content visibility', () => {
  let groupId: number

  beforeEach(async () => {
    const app = adminApp()
    const typeRes = await jsonRequest(app, 'POST', '/test/types', { name: 'Dept' })
    const { data: type } = await typeRes.json()
    const groupRes = await jsonRequest(app, 'POST', '/test', {
      name: 'Sales',
      groupTypeId: type.id,
    })
    const { data: group } = await groupRes.json()
    groupId = group.id
  })

  it('admin can set and get content visibility', async () => {
    const app = adminApp()
    const putRes = await jsonRequest(app, 'PUT', '/test/content/dashboard/1', {
      groupIds: [groupId],
    })
    expect(putRes.status).toBe(200)

    const getRes = await app.request('/test/content/dashboard/1')
    const { data } = await getRes.json()
    expect(data).toHaveLength(1)
    expect(data[0].groupId).toBe(groupId)
  })

  it('replacing visibility removes old groups', async () => {
    const app = adminApp()
    // Create a second group
    const g2Res = await jsonRequest(app, 'POST', '/test', {
      name: 'HR',
      groupTypeId: (await (await app.request('/test/types')).json()).data[0].id,
    })
    const { data: g2 } = await g2Res.json()

    // Set to groupId, then replace with g2
    await jsonRequest(app, 'PUT', '/test/content/dashboard/1', { groupIds: [groupId] })
    await jsonRequest(app, 'PUT', '/test/content/dashboard/1', { groupIds: [g2.id] })

    const { data } = await (await app.request('/test/content/dashboard/1')).json()
    expect(data).toHaveLength(1)
    expect(data[0].groupId).toBe(g2.id)
  })

  it('setting empty groupIds clears visibility', async () => {
    const app = adminApp()
    await jsonRequest(app, 'PUT', '/test/content/dashboard/1', { groupIds: [groupId] })
    await jsonRequest(app, 'PUT', '/test/content/dashboard/1', { groupIds: [] })

    const { data } = await (await app.request('/test/content/dashboard/1')).json()
    expect(data).toHaveLength(0)
  })

  it('rejects invalid content type', async () => {
    const res = await jsonRequest(adminApp(), 'PUT', '/test/content/invalid/1', {
      groupIds: [groupId],
    })
    expect(res.status).toBe(400)
  })
})
