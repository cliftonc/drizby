import type { Context, Next } from 'hono'
import { validateSession, getSessionCookie } from './session'

export async function authMiddleware(c: Context, next: Next) {
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
