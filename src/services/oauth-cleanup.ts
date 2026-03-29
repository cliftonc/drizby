/**
 * Periodic cleanup of expired/revoked OAuth tokens and authorization codes.
 * Prevents unbounded table growth.
 */

import { eq, lt, or } from 'drizzle-orm'
import { oauthAuthCodes, oauthTokens } from '../../schema'

export async function cleanupExpiredOAuthData(db: any): Promise<{ tokens: number; codes: number }> {
  const now = new Date()

  const tokenResult = await db
    .delete(oauthTokens)
    .where(or(lt(oauthTokens.accessTokenExpiresAt, now), eq(oauthTokens.isRevoked, true)))

  const codeResult = await db
    .delete(oauthAuthCodes)
    .where(or(lt(oauthAuthCodes.expiresAt, now), eq(oauthAuthCodes.isRevoked, true)))

  return {
    tokens: tokenResult.changes ?? 0,
    codes: codeResult.changes ?? 0,
  }
}
