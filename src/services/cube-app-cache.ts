/**
 * Shared cube app cache — avoids circular imports between app.ts and public routes.
 * Holds the per-connection cube app instances and exposes getCubeApp / invalidate.
 */

import { createCubeApp } from 'drizzle-cube/adapters/hono'
import type { SecurityContext } from 'drizzle-cube/server'
import { and, eq, gt } from 'drizzle-orm'
import { groupTypes, groups, oauthTokens, settings, userGroups, users } from '../../schema'
import { getSessionCookie, validateSession } from '../auth/session'
import { db } from '../db/index'
import { connectionManager } from './connection-manager'
import { getAIAgentConfig } from './ai-settings'

/** Check if MCP app mode is enabled in settings. */
async function isMcpAppEnabled(): Promise<boolean> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.key, 'mcp_app_enabled'), eq(settings.organisationId, 1)))
  return row?.value === 'true'
}

/**
 * Extract the opaque token ID from a JWT access token, or return as-is if opaque.
 */
function extractTokenId(token: string): string {
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
  let userId: number | null = null

  try {
    const isDev = process.env.NODE_ENV !== 'production'
    const devApiKey = process.env.DEV_API_KEY
    const authHeader = c.req?.header?.('Authorization') ?? c?.headers?.get?.('Authorization')
    if (isDev && devApiKey && authHeader === `Bearer ${devApiKey}`) {
      userId = 1
    }

    if (!userId && authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      userId = await validateOAuthBearer(token)
    }

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
    return { organisationId: 1, userId: 0, groups: {}, groupIds: [] }
  }

  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId))
  const role = user?.role || 'user'

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

// Cache cube apps per connection to avoid re-creating on every request
const cubeAppCache = new Map<number, ReturnType<typeof createCubeApp>>()

export async function getCubeApp(connectionId: number) {
  if (cubeAppCache.has(connectionId)) return cubeAppCache.get(connectionId)!

  const managed = connectionManager.get(connectionId)
  if (!managed) return null

  const agentConfig = await getAIAgentConfig(db)
  const mcpApp = await isMcpAppEnabled()

  const cubeApp = createCubeApp({
    semanticLayer: managed.semanticLayer,
    extractSecurityContext,
    cors: {
      origin: ['http://localhost:3460', 'http://localhost:3461'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'X-Agent-Api-Key',
        'X-Agent-Provider',
        'X-Agent-Model',
        'X-Agent-Base-URL',
        'X-Connection-Id',
      ],
      credentials: true,
    },
    agent: agentConfig,
    mcp: { enabled: true, app: mcpApp },
  })

  cubeAppCache.set(connectionId, cubeApp)
  return cubeApp
}

export function invalidateCubeAppCache(connectionId?: number) {
  if (connectionId !== undefined) cubeAppCache.delete(connectionId)
  else cubeAppCache.clear()
}
