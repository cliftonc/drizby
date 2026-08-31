/**
 * Security context resolution.
 *
 * Lives here rather than in app.ts because drizzle-cube 0.8 requires a
 * SecurityContext on every cube-resolving call (`getMetadata`, `validateQuery`,
 * `getCube`, ...), so routes need it too — not just the cube adapter. Keeping
 * one implementation means the metadata a route sees is scoped exactly as the
 * queries it describes.
 */

import type { SecurityContext } from 'drizzle-cube/server'
import { and, eq, gt } from 'drizzle-orm'
import { groupTypes, groups, oauthTokens, userGroups, users } from '../../schema'
import { db } from '../db/index'
import { getSessionCookie, validateSession } from './session'

/**
 * Extract the opaque token ID from a JWT access token, or return as-is if opaque.
 *
 * Note: The JWT signature is intentionally NOT verified here. The extracted jti is
 * always looked up in the database (the DB is the authoritative gate), so a forged
 * JWT with an arbitrary jti would still need to match a valid token row. The JWT is
 * just an envelope for the opaque token ID.
 */
function extractTokenId(token: string): string {
  // JWTs have 3 dot-separated base64 segments
  if (token.includes('.')) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
      if (payload.jti) return payload.jti
    } catch {}
  }
  return token
}

/** Look up a Bearer token in oauth_tokens, return userId if valid. */
export async function validateOAuthBearer(token: string): Promise<number | null> {
  const tokenId = extractTokenId(token)
  const [row] = await db
    .select({
      userId: oauthTokens.userId,
      isRevoked: oauthTokens.isRevoked,
      expiresAt: oauthTokens.accessTokenExpiresAt,
    })
    .from(oauthTokens)
    .where(
      and(eq(oauthTokens.accessToken, tokenId), gt(oauthTokens.accessTokenExpiresAt, new Date()))
    )
  if (!row || row.isRevoked) return null
  return row.userId
}

export async function extractSecurityContext(c: any): Promise<SecurityContext> {
  // Resolve userId directly from the request (headers/cookies),
  // since the cube app is a separate Hono instance without shared context.
  let userId: number | null = null

  try {
    // Dev mode: check Bearer token (requires DEV_API_KEY env var)
    const isDev = process.env.NODE_ENV !== 'production'
    const devApiKey = process.env.DEV_API_KEY
    const authHeader = c.req?.header?.('Authorization') ?? c?.headers?.get?.('Authorization')
    if (isDev && devApiKey && authHeader === `Bearer ${devApiKey}`) {
      userId = 1
    }

    // OAuth Bearer token
    if (!userId && authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      userId = await validateOAuthBearer(token)
    }

    // Session cookie
    if (!userId) {
      const sessionId = getSessionCookie(c)
      if (sessionId) {
        const result = await validateSession(db as any, sessionId)
        if (result) userId = result.user.id
      }
    }
  } catch (err) {
    console.error('[security-context] Error resolving user:', err)
  }

  if (!userId) {
    console.warn('[security-context] No authenticated user, returning empty context')
    return { organisationId: 1, userId: 0, groups: {}, groupIds: [] }
  }

  // Look up the user's role
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId))
  const role = user?.role || 'user'

  // Resolve group memberships for the authenticated user
  const groupRows = await db
    .select({
      groupId: userGroups.groupId,
      groupName: groups.name,
      typeName: groupTypes.name,
    })
    .from(userGroups)
    .innerJoin(groups, eq(userGroups.groupId, groups.id))
    .innerJoin(groupTypes, eq(groups.groupTypeId, groupTypes.id))
    .where(eq(userGroups.userId, userId))

  const groupsByType: Record<string, string[]> = {}
  const groupIds: number[] = []
  for (const row of groupRows) {
    groupIds.push(row.groupId)
    if (!groupsByType[row.typeName]) groupsByType[row.typeName] = []
    groupsByType[row.typeName].push(row.groupName)
  }

  return { organisationId: 1, userId, role, groups: groupsByType, groupIds }
}
