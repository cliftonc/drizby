/**
 * SCIM 2.0 ↔ Drizby mapping service
 * Transforms between SCIM User/Group schemas and Drizzle ORM records
 */

import { and, eq } from 'drizzle-orm'
import { groupTypes, groups, scimTokens, userGroups, users } from '../../schema'
import { hashPassword } from '../auth/password'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScimContext {
  db: any
  organisationId: number
}

interface ScimUser {
  id?: string
  externalId?: string
  userName: string
  displayName?: string
  name?: { formatted?: string; givenName?: string; familyName?: string }
  active?: boolean
  emails?: Array<{ value: string; primary?: boolean; type?: string }>
  password?: string
  groups?: Array<{ value: string; display?: string }>
}

interface ScimGroup {
  id?: string
  externalId?: string
  displayName: string
  members?: Array<{ value: string; display?: string }>
}

// ---------------------------------------------------------------------------
// User mapping: Drizby → SCIM
// ---------------------------------------------------------------------------

export function userToScim(user: any): ScimUser {
  return {
    id: String(user.id),
    externalId: user.scimExternalId || undefined,
    userName: user.email,
    displayName: user.name,
    name: {
      formatted: user.name,
    },
    active: !user.isBlocked,
    emails: [
      {
        value: user.email,
        primary: true,
        type: 'work',
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// User mapping: SCIM → Drizby (for create/update)
// ---------------------------------------------------------------------------

export function scimToUserValues(data: ScimUser) {
  const email = data.emails?.find(e => e.primary)?.value || data.emails?.[0]?.value || data.userName

  const name =
    data.displayName ||
    (data.name ? [data.name.givenName, data.name.familyName].filter(Boolean).join(' ') : null) ||
    data.name?.formatted ||
    email.split('@')[0]

  const values: Record<string, any> = {
    email,
    name,
    username: email.split('@')[0],
  }

  if (data.externalId !== undefined) {
    values.scimExternalId = data.externalId
  }

  if (data.active !== undefined) {
    values.isBlocked = !data.active
  }

  return values
}

// ---------------------------------------------------------------------------
// User SCIMMY callbacks
// ---------------------------------------------------------------------------

export async function userIngress(resource: any, data: ScimUser, ctx: ScimContext) {
  const { db, organisationId } = ctx

  if (resource.id) {
    // Update existing user
    const updateValues: Record<string, any> = {
      ...scimToUserValues(data),
      updatedAt: new Date(),
    }

    await db
      .update(users)
      .set(updateValues)
      .where(and(eq(users.id, Number(resource.id)), eq(users.organisationId, organisationId)))

    const [updated] = await db
      .select()
      .from(users)
      .where(eq(users.id, Number(resource.id)))

    return userToScim(updated)
  }

  // Create new user
  const newValues: Record<string, any> = {
    ...scimToUserValues(data),
    role: 'member', // SCIM-provisioned users are pre-approved
    scimProvisioned: true,
    emailVerified: true,
    organisationId,
  }

  // Set a password hash if provided (user typically uses SSO, not password)
  if (data.password) {
    newValues.passwordHash = await hashPassword(data.password)
  }

  const [created] = await db.insert(users).values(newValues).returning()
  return userToScim(created)
}

export async function userEgress(resource: any, ctx: ScimContext) {
  const { db, organisationId } = ctx

  if (resource.id) {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, Number(resource.id)), eq(users.organisationId, organisationId)))

    if (!user) throw new Error('User not found')
    return userToScim(user)
  }

  // List users — apply SCIMMY-parsed constraints
  const query = db.select().from(users).where(eq(users.organisationId, organisationId))

  // SCIMMY provides filter as a parsed constraint object on resource
  // For basic listing, return all users
  const allUsers = await query
  return allUsers.map(userToScim)
}

export async function userDegress(resource: any, ctx: ScimContext) {
  const { db, organisationId } = ctx

  // Soft-deprovisioning: block the user instead of deleting
  await db
    .update(users)
    .set({ isBlocked: true, updatedAt: new Date() })
    .where(and(eq(users.id, Number(resource.id)), eq(users.organisationId, organisationId)))
}

// ---------------------------------------------------------------------------
// Group mapping: Drizby → SCIM
// ---------------------------------------------------------------------------

export function groupToScim(group: any, members: any[] = []): ScimGroup {
  return {
    id: String(group.id),
    externalId: undefined,
    displayName: group.name,
    members: members.map(m => ({
      value: String(m.userId),
      display: m.userName || m.userEmail,
    })),
  }
}

// ---------------------------------------------------------------------------
// Group SCIMMY callbacks
// ---------------------------------------------------------------------------

async function getOrCreateScimGroupType(db: any, organisationId: number) {
  let [scimType] = await db
    .select()
    .from(groupTypes)
    .where(and(eq(groupTypes.name, 'SCIM'), eq(groupTypes.organisationId, organisationId)))

  if (!scimType) {
    ;[scimType] = await db
      .insert(groupTypes)
      .values({
        name: 'SCIM',
        description: 'Groups provisioned via SCIM',
        organisationId,
      })
      .returning()
  }

  return scimType
}

async function getGroupMembers(db: any, groupId: number) {
  return db
    .select({
      userId: userGroups.userId,
      userName: users.name,
      userEmail: users.email,
    })
    .from(userGroups)
    .innerJoin(users, eq(userGroups.userId, users.id))
    .where(eq(userGroups.groupId, groupId))
}

export async function groupIngress(resource: any, data: ScimGroup, ctx: ScimContext) {
  const { db, organisationId } = ctx

  if (resource.id) {
    // Update existing group
    await db
      .update(groups)
      .set({
        name: data.displayName,
        updatedAt: new Date(),
      })
      .where(and(eq(groups.id, Number(resource.id)), eq(groups.organisationId, organisationId)))

    // Sync members if provided
    if (data.members !== undefined) {
      await syncGroupMembers(db, Number(resource.id), data.members || [])
    }

    const members = await getGroupMembers(db, Number(resource.id))
    const [updated] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, Number(resource.id)))
    return groupToScim(updated, members)
  }

  // Create new group
  const scimType = await getOrCreateScimGroupType(db, organisationId)

  const [created] = await db
    .insert(groups)
    .values({
      name: data.displayName,
      groupTypeId: scimType.id,
      organisationId,
    })
    .returning()

  // Add members if provided
  if (data.members?.length) {
    await syncGroupMembers(db, created.id, data.members)
  }

  const members = await getGroupMembers(db, created.id)
  return groupToScim(created, members)
}

export async function groupEgress(resource: any, ctx: ScimContext) {
  const { db, organisationId } = ctx

  if (resource.id) {
    const [group] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.id, Number(resource.id)), eq(groups.organisationId, organisationId)))

    if (!group) throw new Error('Group not found')
    const members = await getGroupMembers(db, group.id)
    return groupToScim(group, members)
  }

  // List all SCIM groups
  const scimType = await getOrCreateScimGroupType(db, organisationId)
  const allGroups = await db
    .select()
    .from(groups)
    .where(and(eq(groups.groupTypeId, scimType.id), eq(groups.organisationId, organisationId)))

  const results = []
  for (const group of allGroups) {
    const members = await getGroupMembers(db, group.id)
    results.push(groupToScim(group, members))
  }
  return results
}

export async function groupDegress(resource: any, ctx: ScimContext) {
  const { db, organisationId } = ctx

  // Hard delete the group (memberships cascade)
  await db
    .delete(groups)
    .where(and(eq(groups.id, Number(resource.id)), eq(groups.organisationId, organisationId)))
}

// ---------------------------------------------------------------------------
// Helper: sync group membership
// ---------------------------------------------------------------------------

async function syncGroupMembers(
  db: any,
  groupId: number,
  scimMembers: Array<{ value: string; display?: string }>
) {
  const targetUserIds = scimMembers.map(m => Number(m.value))

  // Get current members
  const current = await db
    .select({ userId: userGroups.userId })
    .from(userGroups)
    .where(eq(userGroups.groupId, groupId))

  const currentIds = new Set(current.map((c: any) => c.userId))

  // Add new members
  for (const userId of targetUserIds) {
    if (!currentIds.has(userId)) {
      await db.insert(userGroups).values({ userId, groupId })
    }
  }

  // Remove members not in target
  const targetSet = new Set(targetUserIds)
  for (const { userId } of current) {
    if (!targetSet.has(userId)) {
      await db
        .delete(userGroups)
        .where(and(eq(userGroups.userId, userId), eq(userGroups.groupId, groupId)))
    }
  }
}

// ---------------------------------------------------------------------------
// Token validation helper
// ---------------------------------------------------------------------------

export async function validateScimToken(
  db: any,
  token: string,
  organisationId: number
): Promise<boolean> {
  // Hash the token and compare against stored hashes
  const crypto = await import('node:crypto')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const [found] = await db
    .select()
    .from(scimTokens)
    .where(and(eq(scimTokens.tokenHash, tokenHash), eq(scimTokens.organisationId, organisationId)))

  if (!found) return false

  // Update last used timestamp
  await db.update(scimTokens).set({ lastUsedAt: new Date() }).where(eq(scimTokens.id, found.id))

  return true
}
