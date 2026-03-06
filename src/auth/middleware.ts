import type { Context, Next } from 'hono'
import { validateSession, getSessionCookie } from './session'
import { defineAbilitiesFor } from '../permissions/abilities'

const DEV_API_KEY = process.env.DEV_API_KEY || 'dc-bi-dev-key'
const isDev = process.env.NODE_ENV !== 'production'

export async function authMiddleware(c: Context, next: Next) {
  // Dev mode: accept a fixed API key via header or query param
  if (isDev) {
    const authHeader = c.req.header('Authorization')
    if (authHeader === `Bearer ${DEV_API_KEY}`) {
      c.set('auth', { userId: 1, user: { id: 1, name: 'Dev User', email: 'dev@localhost', role: 'admin' } })
      c.set('ability', defineAbilitiesFor('admin'))
      return next()
    }
  }

  const sessionId = getSessionCookie(c)
  if (!sessionId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const db = c.get('db')
  const result = await validateSession(db, sessionId)
  if (!result) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  c.set('auth', { userId: result.user.id, user: result.user })
  c.set('ability', defineAbilitiesFor(result.user.role))
  await next()
}

export async function optionalAuth(c: Context, next: Next) {
  const sessionId = getSessionCookie(c)
  if (sessionId) {
    const db = c.get('db')
    const result = await validateSession(db, sessionId)
    if (result) {
      c.set('auth', { userId: result.user.id, user: result.user })
    }
  }
  await next()
}
