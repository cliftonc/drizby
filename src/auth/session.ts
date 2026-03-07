import { randomBytes } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { userSessions, users } from '../../schema'

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const EXTEND_THRESHOLD_MS = 1 * 24 * 60 * 60 * 1000 // 1 day
const COOKIE_NAME = 'dc_session'

export async function createSession(db: any, userId: number): Promise<string> {
  const sessionId = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await db.insert(userSessions).values({
    id: sessionId,
    userId,
    expiresAt,
  })

  return sessionId
}

export async function validateSession(db: any, sessionId: string) {
  if (!sessionId || sessionId.length !== 64) return null

  const rows = await db
    .select({
      session: userSessions,
      user: users,
    })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .where(and(eq(userSessions.id, sessionId), gt(userSessions.expiresAt, new Date())))

  if (rows.length === 0) return null

  const { session, user } = rows[0]

  if (user.isBlocked) return null

  // Auto-extend session if close to expiry
  const timeLeft = session.expiresAt.getTime() - Date.now()
  if (timeLeft < EXTEND_THRESHOLD_MS) {
    await db
      .update(userSessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
      .where(eq(userSessions.id, sessionId))
  }

  return { session, user }
}

export async function deleteSession(db: any, sessionId: string) {
  await db.delete(userSessions).where(eq(userSessions.id, sessionId))
}

export function setSessionCookie(c: Context, sessionId: string) {
  setCookie(c, COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
    secure: process.env.NODE_ENV === 'production',
  })
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, COOKIE_NAME, { path: '/' })
}

export function getSessionCookie(c: Context): string | undefined {
  return getCookie(c, COOKIE_NAME)
}
