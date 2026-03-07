import type { DrizzleDatabase } from 'drizzle-cube/server'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { users } from '../../schema'
import { hashPassword } from '../auth/password'
import { guardPermission } from '../permissions/guard'

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

// List all users
app.get('/', async c => {
  const db = c.get('db') as any
  const result = await db
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
    .where(eq(users.organisationId, 1))

  return c.json(result)
})

// Create user
app.post('/', async c => {
  const db = c.get('db') as any
  const body = await c.req.json()
  const { name, email, password, role } = body

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

  if (password) {
    if (password.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters' }, 400)
    }
    values.passwordHash = await hashPassword(password)
  }

  try {
    const [user] = await db.insert(users).values(values).returning()
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

  const result = await db.update(users).set(updates).where(eq(users.id, id)).returning()

  if (result.length === 0) {
    return c.json({ error: 'User not found' }, 404)
  }

  const user = result[0]
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
