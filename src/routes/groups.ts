/**
 * Groups API Routes
 * CRUD for group types, groups, membership, and content visibility
 */

import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, count, eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { contentGroupVisibility, groupTypes, groups, userGroups, users } from '../../schema'
import type { AppAbility } from '../permissions/abilities'

interface Variables {
  db: DrizzleDatabase
  auth: { userId: number; user: any }
  ability?: AppAbility
}

const groupsApp = new Hono<{ Variables: Variables }>()

// Helper: check admin
function isAdmin(c: any): boolean {
  const auth = c.get('auth') as any
  return auth?.user?.role === 'admin'
}

// ============================================================================
// Group Types (admin only)
// ============================================================================

groupsApp.get('/types', async c => {
  const db = c.get('db') as any
  const rows = await db.select().from(groupTypes).where(eq(groupTypes.organisationId, 1))
  return c.json({ data: rows })
})

groupsApp.post('/types', async c => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403)
  const db = c.get('db') as any
  const { name, description } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'Name is required' }, 400)
  try {
    const [row] = await db
      .insert(groupTypes)
      .values({ name: name.trim(), description: description?.trim() || null, organisationId: 1 })
      .returning()
    return c.json({ data: row }, 201)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE'))
      return c.json({ error: 'Group type name already exists' }, 409)
    throw err
  }
})

groupsApp.put('/types/:id', async c => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403)
  const db = c.get('db') as any
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)
  const { name, description } = await c.req.json()
  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (name !== undefined) updateData.name = name.trim()
  if (description !== undefined) updateData.description = description?.trim() || null
  try {
    const [row] = await db
      .update(groupTypes)
      .set(updateData)
      .where(and(eq(groupTypes.id, id), eq(groupTypes.organisationId, 1)))
      .returning()
    if (!row) return c.json({ error: 'Group type not found' }, 404)
    return c.json({ data: row })
  } catch (err: any) {
    if (err.message?.includes('UNIQUE'))
      return c.json({ error: 'Group type name already exists' }, 409)
    throw err
  }
})

groupsApp.delete('/types/:id', async c => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403)
  const db = c.get('db') as any
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)
  const deleted = await db
    .delete(groupTypes)
    .where(and(eq(groupTypes.id, id), eq(groupTypes.organisationId, 1)))
    .returning()
  if (deleted.length === 0) return c.json({ error: 'Group type not found' }, 404)
  return c.json({ message: 'Group type deleted' })
})

// ============================================================================
// Current user's groups
// ============================================================================

groupsApp.get('/mine', async c => {
  const db = c.get('db') as any
  const auth = c.get('auth') as any
  const rows = await db
    .select({
      groupId: userGroups.groupId,
      groupName: groups.name,
      groupTypeId: groups.groupTypeId,
      typeName: groupTypes.name,
    })
    .from(userGroups)
    .innerJoin(groups, eq(userGroups.groupId, groups.id))
    .innerJoin(groupTypes, eq(groups.groupTypeId, groupTypes.id))
    .where(eq(userGroups.userId, auth.userId))
  return c.json({ data: rows })
})

// ============================================================================
// Content visibility
// ============================================================================

groupsApp.get('/content/:contentType/:contentId', async c => {
  const db = c.get('db') as any
  const contentType = c.req.param('contentType')
  const contentId = Number(c.req.param('contentId'))
  if (!['dashboard', 'notebook'].includes(contentType))
    return c.json({ error: 'Invalid content type' }, 400)
  if (Number.isNaN(contentId)) return c.json({ error: 'Invalid content ID' }, 400)

  const rows = await db
    .select({
      groupId: contentGroupVisibility.groupId,
      groupName: groups.name,
      typeName: groupTypes.name,
    })
    .from(contentGroupVisibility)
    .innerJoin(groups, eq(contentGroupVisibility.groupId, groups.id))
    .innerJoin(groupTypes, eq(groups.groupTypeId, groupTypes.id))
    .where(
      and(
        eq(contentGroupVisibility.contentType, contentType),
        eq(contentGroupVisibility.contentId, contentId)
      )
    )
  return c.json({ data: rows })
})

groupsApp.put('/content/:contentType/:contentId', async c => {
  const db = c.get('db') as any
  const contentType = c.req.param('contentType')
  const contentId = Number(c.req.param('contentId'))
  if (!['dashboard', 'notebook'].includes(contentType))
    return c.json({ error: 'Invalid content type' }, 400)
  if (Number.isNaN(contentId)) return c.json({ error: 'Invalid content ID' }, 400)

  // Admin or content owner can set visibility
  if (!isAdmin(c)) {
    const auth = c.get('auth') as any
    // Check ownership - query the appropriate table
    const table = contentType === 'dashboard' ? 'analytics_pages' : 'notebooks'
    const [owner] = await db.all(
      sql`SELECT created_by FROM ${sql.raw(table)} WHERE id = ${contentId} AND organisation_id = 1`
    )
    if (!owner || (owner as any).created_by !== auth.userId) {
      return c.json({ error: 'Not authorized' }, 403)
    }
  }

  const { groupIds } = await c.req.json()
  if (!Array.isArray(groupIds)) return c.json({ error: 'groupIds must be an array' }, 400)

  // Replace all: delete existing, insert new
  await db
    .delete(contentGroupVisibility)
    .where(
      and(
        eq(contentGroupVisibility.contentType, contentType),
        eq(contentGroupVisibility.contentId, contentId)
      )
    )

  if (groupIds.length > 0) {
    await db.insert(contentGroupVisibility).values(
      groupIds.map((groupId: number) => ({
        contentType,
        contentId,
        groupId,
      }))
    )
  }

  return c.json({ message: 'Visibility updated' })
})

// ============================================================================
// Groups CRUD
// ============================================================================

groupsApp.get('/', async c => {
  const db = c.get('db') as any
  const typeIdParam = c.req.query('typeId')

  const conditions = [eq(groups.organisationId, 1)]
  if (typeIdParam) conditions.push(eq(groups.groupTypeId, Number(typeIdParam)))

  const rows = await db
    .select({
      group: groups,
      typeName: groupTypes.name,
      memberCount: count(userGroups.userId),
    })
    .from(groups)
    .innerJoin(groupTypes, eq(groups.groupTypeId, groupTypes.id))
    .leftJoin(userGroups, eq(groups.id, userGroups.groupId))
    .where(and(...conditions))
    .groupBy(groups.id)

  const data = rows.map((r: any) => ({
    ...r.group,
    typeName: r.typeName,
    memberCount: r.memberCount,
  }))
  return c.json({ data })
})

groupsApp.get('/:id', async c => {
  const db = c.get('db') as any
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)

  const [row] = await db
    .select({
      group: groups,
      typeName: groupTypes.name,
    })
    .from(groups)
    .innerJoin(groupTypes, eq(groups.groupTypeId, groupTypes.id))
    .where(and(eq(groups.id, id), eq(groups.organisationId, 1)))
    .limit(1)

  if (!row) return c.json({ error: 'Group not found' }, 404)

  // Get members
  const members = await db
    .select({
      userId: userGroups.userId,
      userName: users.name,
      userEmail: users.email,
    })
    .from(userGroups)
    .innerJoin(users, eq(userGroups.userId, users.id))
    .where(eq(userGroups.groupId, id))

  return c.json({ data: { ...row.group, typeName: row.typeName, members } })
})

groupsApp.post('/', async c => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403)
  const db = c.get('db') as any
  const { name, description, groupTypeId, parentId } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'Name is required' }, 400)
  if (!groupTypeId) return c.json({ error: 'groupTypeId is required' }, 400)

  try {
    const [row] = await db
      .insert(groups)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
        groupTypeId,
        parentId: parentId || null,
        organisationId: 1,
      })
      .returning()
    return c.json({ data: row }, 201)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE'))
      return c.json({ error: 'Group name already exists in this type' }, 409)
    throw err
  }
})

groupsApp.put('/:id', async c => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403)
  const db = c.get('db') as any
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)
  const { name, description, parentId } = await c.req.json()
  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (name !== undefined) updateData.name = name.trim()
  if (description !== undefined) updateData.description = description?.trim() || null
  if (parentId !== undefined) updateData.parentId = parentId || null
  try {
    const [row] = await db
      .update(groups)
      .set(updateData)
      .where(and(eq(groups.id, id), eq(groups.organisationId, 1)))
      .returning()
    if (!row) return c.json({ error: 'Group not found' }, 404)
    return c.json({ data: row })
  } catch (err: any) {
    if (err.message?.includes('UNIQUE'))
      return c.json({ error: 'Group name already exists in this type' }, 409)
    throw err
  }
})

groupsApp.delete('/:id', async c => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403)
  const db = c.get('db') as any
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)
  const deleted = await db
    .delete(groups)
    .where(and(eq(groups.id, id), eq(groups.organisationId, 1)))
    .returning()
  if (deleted.length === 0) return c.json({ error: 'Group not found' }, 404)
  return c.json({ message: 'Group deleted' })
})

// ============================================================================
// Membership (admin only)
// ============================================================================

groupsApp.get('/:id/members', async c => {
  const db = c.get('db') as any
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)
  const members = await db
    .select({
      userId: userGroups.userId,
      userName: users.name,
      userEmail: users.email,
      createdAt: userGroups.createdAt,
    })
    .from(userGroups)
    .innerJoin(users, eq(userGroups.userId, users.id))
    .where(eq(userGroups.groupId, id))
  return c.json({ data: members })
})

groupsApp.post('/:id/members', async c => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403)
  const db = c.get('db') as any
  const id = Number(c.req.param('id'))
  if (Number.isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)
  const { userIds } = await c.req.json()
  if (!Array.isArray(userIds) || userIds.length === 0)
    return c.json({ error: 'userIds must be a non-empty array' }, 400)

  // Filter out already-existing memberships
  const existing = await db
    .select({ userId: userGroups.userId })
    .from(userGroups)
    .where(and(eq(userGroups.groupId, id), inArray(userGroups.userId, userIds)))
  const existingSet = new Set(existing.map((r: any) => r.userId))
  const newIds = userIds.filter((uid: number) => !existingSet.has(uid))

  if (newIds.length > 0) {
    await db.insert(userGroups).values(newIds.map((userId: number) => ({ userId, groupId: id })))
  }
  return c.json({ message: `Added ${newIds.length} member(s)` })
})

groupsApp.delete('/:id/members/:userId', async c => {
  if (!isAdmin(c)) return c.json({ error: 'Admin only' }, 403)
  const db = c.get('db') as any
  const groupId = Number(c.req.param('id'))
  const userId = Number(c.req.param('userId'))
  if (Number.isNaN(groupId) || Number.isNaN(userId)) return c.json({ error: 'Invalid ID' }, 400)
  const deleted = await db
    .delete(userGroups)
    .where(and(eq(userGroups.groupId, groupId), eq(userGroups.userId, userId)))
    .returning()
  if (deleted.length === 0) return c.json({ error: 'Membership not found' }, 404)
  return c.json({ message: 'Member removed' })
})

export default groupsApp
