import { and, eq, gt } from 'drizzle-orm'
import type { Context, Next } from 'hono'
import { oauthTokens, users } from '../../schema'
import { defineAbilitiesFor } from '../permissions/abilities'
import { getSessionCookie, validateSession } from './session'

const ACTIVITY_THROTTLE_MS = 5 * 60_000 // only update lastActiveAt every 5 minutes

function touchLastActive(db: any, user: any): void {
  const fiveMinAgo = new Date(Date.now() - ACTIVITY_THROTTLE_MS)
  if (!user.lastActiveAt || user.lastActiveAt < fiveMinAgo) {
    db.update(users)
      .set({ lastActiveAt: new Date() })
      .where(eq(users.id, user.id))
      .catch(() => {})
  }
}

const DEV_API_KEY = process.env.DEV_API_KEY || 'dc-bi-dev-key'
const isDev = process.env.NODE_ENV !== 'production'

export async function authMiddleware(c: Context, next: Next) {
  // Dev mode: accept a fixed API key via header or query param
  if (isDev) {
    const authHeader = c.req.header('Authorization')
    if (authHeader === `Bearer ${DEV_API_KEY}`) {
      c.set('auth', {
        userId: 1,
        user: { id: 1, name: 'Dev User', email: 'dev@localhost', role: 'admin' },
      })
      c.set('ability', defineAbilitiesFor('admin'))
      return next()
    }
  }

  // OAuth Bearer token (may be a JWT wrapping an opaque token ID)
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const db = c.get('db') as any
    let tokenId = authHeader.slice(7)
    // Extract opaque token ID from JWT if needed
    if (tokenId.includes('.')) {
      try {
        const payload = JSON.parse(Buffer.from(tokenId.split('.')[1], 'base64url').toString())
        if (payload.jti) tokenId = payload.jti
      } catch {}
    }
    const [row] = await db
      .select({ userId: oauthTokens.userId, isRevoked: oauthTokens.isRevoked })
      .from(oauthTokens)
      .where(
        and(eq(oauthTokens.accessToken, tokenId), gt(oauthTokens.accessTokenExpiresAt, new Date()))
      )
    if (row && !row.isRevoked) {
      const [user] = await db.select().from(users).where(eq(users.id, row.userId))
      if (user && !user.isBlocked) {
        c.set('auth', { userId: user.id, user })
        c.set('ability', defineAbilitiesFor(user.role))
        touchLastActive(db, user)
        return next()
      }
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
  touchLastActive(db, result.user)
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
