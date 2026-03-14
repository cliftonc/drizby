import crypto from 'node:crypto'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, count, eq, like, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { passwordResetTokens, users } from '../../schema'
import { guardPermission } from '../permissions/guard'
import {
  createAccountStatusEmailTemplate,
  createInviteEmailTemplate,
  getAppName,
  getAppUrl,
  sendEmail,
} from '../services/email'

interface Variables {
  db: DrizzleDatabase
  auth: { userId: number; user: any }
}

const app = new Hono<{ Variables: Variables }>()

// All routes require manage User permission
app.use('*', async (c, next) => {
  const denied = guardPermission(c, 'manage', 'User')
  if (denied) return denied
  await next()
})

// List all users (supports ?search=X&limit=N)
app.get('/', async c => {
  const db = c.get('db') as any
  const search = c.req.query('search')
  const limitParam = c.req.query('limit')

  const conditions = [eq(users.organisationId, 1)]
  if (search) {
    const pattern = `%${search}%`
    conditions.push(or(like(users.name, pattern), like(users.email, pattern))!)
  }

  let query = db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isBlocked: users.isBlocked,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(...conditions))

  if (limitParam) {
    query = query.limit(Number(limitParam))
  }

  const result = await query
  return c.json(result)
})

// Count pending users (role = 'user')
app.get('/pending-count', async c => {
  const db = c.get('db') as any
  const [{ value }] = await db
    .select({ value: count() })
    .from(users)
    .where(and(eq(users.organisationId, 1), eq(users.role, 'user')))
  return c.json({ count: value })
})

// Create user — sends invite email with password reset link
app.post('/', async c => {
  const db = c.get('db') as any
  const auth = c.get('auth') as any
  const body = await c.req.json()
  const { name, email, role } = body

  if (!name || !email) {
    return c.json({ error: 'Name and email are required' }, 400)
  }

  const values: any = {
    name,
    email,
    username: email.split('@')[0],
    role: role || 'member',
    organisationId: 1,
  }

  try {
    const [user] = await db.insert(users).values(values).returning()

    // Create password reset token for invite (24h expiry)
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await db.insert(passwordResetTokens).values({
      id: token,
      userId: user.id,
      expiresAt,
    })

    // Send invite email
    const appName = getAppName()
    const resetUrl = `${getAppUrl()}/reset-password?token=${token}`
    sendEmail(
      user.email,
      `You've been invited to ${appName}`,
      createInviteEmailTemplate(user.name, auth.user.name, appName, resetUrl)
    ).catch(() => {})

    return c.json(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
      201
    )
  } catch (err: any) {
    if (err.code === '23505' || err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.json({ error: 'Email already exists' }, 409)
    }
    throw err
  }
})

// Update user (role, blocked status)
app.put('/:id', async c => {
  const db = c.get('db') as any
  const id = Number.parseInt(c.req.param('id'))
  const auth = c.get('auth') as any
  const body = await c.req.json()

  // Prevent self-demotion
  if (id === auth.user.id && body.role && body.role !== 'admin') {
    return c.json({ error: 'Cannot change your own role' }, 400)
  }

  const updates: any = { updatedAt: new Date() }
  if (body.role !== undefined) updates.role = body.role
  if (body.isBlocked !== undefined) updates.isBlocked = body.isBlocked
  if (body.name !== undefined) updates.name = body.name

  // Check current blocked status before update for change detection
  const [existingUser] = await db.select().from(users).where(eq(users.id, id))
  if (!existingUser) {
    return c.json({ error: 'User not found' }, 404)
  }

  const result = await db.update(users).set(updates).where(eq(users.id, id)).returning()

  const user = result[0]

  // Fire-and-forget: send account status email when isBlocked changes
  if (body.isBlocked !== undefined && body.isBlocked !== existingUser.isBlocked) {
    sendEmail(
      user.email,
      `Your account has been ${body.isBlocked ? 'blocked' : 'unblocked'} on ${getAppName()}`,
      createAccountStatusEmailTemplate(user.name, getAppName(), body.isBlocked)
    ).catch(() => {})
  }

  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isBlocked: user.isBlocked,
  })
})

// Delete user
app.delete('/:id', async c => {
  const db = c.get('db') as any
  const id = Number.parseInt(c.req.param('id'))
  const auth = c.get('auth') as any

  if (id === auth.user.id) {
    return c.json({ error: 'Cannot delete yourself' }, 400)
  }

  const result = await db.delete(users).where(eq(users.id, id)).returning()

  if (result.length === 0) {
    return c.json({ error: 'User not found' }, 404)
  }

  return c.json({ success: true })
})

export default app
