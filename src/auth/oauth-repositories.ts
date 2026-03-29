/**
 * OAuth 2.1 repository implementations backed by Drizzle/SQLite.
 * Used by @jmondi/oauth2-server for MCP client authentication.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import type {
  OAuthAuthCode,
  OAuthAuthCodeRepository,
  OAuthClient,
  OAuthClientRepository,
  OAuthScope,
  OAuthScopeRepository,
  OAuthToken,
  OAuthTokenRepository,
  OAuthUser,
  OAuthUserRepository,
} from '@jmondi/oauth2-server'
import type { GrantIdentifier, OAuthUserIdentifier } from '@jmondi/oauth2-server'
import { eq } from 'drizzle-orm'
import { oauthAuthCodes, oauthClients, oauthTokens, users } from '../../schema'
import { verifyPassword } from './password'

type DB = any // Drizzle instance

// ============================================================================
// Client Repository
// ============================================================================

export class ClientRepository implements OAuthClientRepository {
  constructor(private db: DB) {}

  async getByIdentifier(clientId: string): Promise<OAuthClient> {
    const [row] = await this.db.select().from(oauthClients).where(eq(oauthClients.id, clientId))
    if (!row) throw new Error(`Client not found: ${clientId}`)
    return {
      id: row.id,
      name: row.name,
      secret: row.secret,
      redirectUris: row.redirectUris,
      allowedGrants: row.allowedGrants as GrantIdentifier[],
      scopes: (row.scopes as string[]).map(name => ({ name })),
    }
  }

  async isClientValid(
    grantType: GrantIdentifier,
    client: OAuthClient,
    clientSecret?: string
  ): Promise<boolean> {
    if (!client.allowedGrants.includes(grantType)) return false
    // Public clients (no secret) are valid without secret check
    if (!client.secret) return true
    // Confidential clients must provide matching secret (constant-time comparison)
    if (!clientSecret) return false
    const a = Buffer.from(client.secret, 'utf8')
    const b = Buffer.from(clientSecret, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  }
}

// ============================================================================
// Token Repository
// ============================================================================

export class TokenRepository implements OAuthTokenRepository {
  constructor(private db: DB) {}

  async issueToken(
    client: OAuthClient,
    scopes: OAuthScope[],
    user?: OAuthUser | null
  ): Promise<OAuthToken> {
    return {
      accessToken: randomBytes(40).toString('hex'),
      accessTokenExpiresAt: new Date(Date.now() + 3600_000), // overridden by server
      client,
      user: user ?? null,
      scopes,
    }
  }

  async issueRefreshToken(token: OAuthToken, _client: OAuthClient): Promise<OAuthToken> {
    token.refreshToken = randomBytes(40).toString('hex')
    token.refreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 3600_000)
    return token
  }

  async persist(token: OAuthToken): Promise<void> {
    await this.db.insert(oauthTokens).values({
      accessToken: token.accessToken,
      accessTokenExpiresAt: token.accessTokenExpiresAt,
      refreshToken: token.refreshToken ?? null,
      refreshTokenExpiresAt: token.refreshTokenExpiresAt ?? null,
      clientId: token.client.id,
      userId: (token.user as OAuthUser).id as number,
      scopes: token.scopes.map(s => s.name),
    })
  }

  async revoke(token: OAuthToken): Promise<void> {
    await this.db
      .update(oauthTokens)
      .set({ isRevoked: true })
      .where(eq(oauthTokens.accessToken, token.accessToken))
  }

  async isRefreshTokenRevoked(token: OAuthToken): Promise<boolean> {
    if (token.refreshTokenExpiresAt && token.refreshTokenExpiresAt < new Date()) return true
    const [row] = await this.db
      .select({ isRevoked: oauthTokens.isRevoked })
      .from(oauthTokens)
      .where(eq(oauthTokens.accessToken, token.accessToken))
    return row?.isRevoked ?? true
  }

  async getByRefreshToken(refreshTokenValue: string): Promise<OAuthToken> {
    const [row] = await this.db
      .select()
      .from(oauthTokens)
      .where(eq(oauthTokens.refreshToken, refreshTokenValue))
    if (!row) throw new Error('Refresh token not found')

    const [clientRow] = await this.db
      .select()
      .from(oauthClients)
      .where(eq(oauthClients.id, row.clientId))
    const client: OAuthClient = {
      id: clientRow.id,
      name: clientRow.name,
      secret: clientRow.secret,
      redirectUris: clientRow.redirectUris,
      allowedGrants: clientRow.allowedGrants as GrantIdentifier[],
      scopes: (clientRow.scopes as string[]).map(name => ({ name })),
    }

    return {
      accessToken: row.accessToken,
      accessTokenExpiresAt: row.accessTokenExpiresAt,
      refreshToken: row.refreshToken,
      refreshTokenExpiresAt: row.refreshTokenExpiresAt,
      client,
      user: { id: row.userId },
      scopes: (row.scopes as string[]).map(name => ({ name })),
    }
  }

  async getByAccessToken(accessTokenValue: string): Promise<OAuthToken> {
    const [row] = await this.db
      .select()
      .from(oauthTokens)
      .where(eq(oauthTokens.accessToken, accessTokenValue))
    if (!row) throw new Error('Access token not found')

    const [clientRow] = await this.db
      .select()
      .from(oauthClients)
      .where(eq(oauthClients.id, row.clientId))
    const client: OAuthClient = {
      id: clientRow.id,
      name: clientRow.name,
      secret: clientRow.secret,
      redirectUris: clientRow.redirectUris,
      allowedGrants: clientRow.allowedGrants as GrantIdentifier[],
      scopes: (clientRow.scopes as string[]).map(name => ({ name })),
    }

    return {
      accessToken: row.accessToken,
      accessTokenExpiresAt: row.accessTokenExpiresAt,
      refreshToken: row.refreshToken,
      refreshTokenExpiresAt: row.refreshTokenExpiresAt,
      client,
      user: { id: row.userId },
      scopes: (row.scopes as string[]).map(name => ({ name })),
    }
  }
}

// ============================================================================
// Auth Code Repository
// ============================================================================

export class AuthCodeRepository implements OAuthAuthCodeRepository {
  constructor(private db: DB) {}

  issueAuthCode(
    client: OAuthClient,
    user: OAuthUser | undefined,
    scopes: OAuthScope[]
  ): OAuthAuthCode {
    return {
      code: randomBytes(32).toString('hex'),
      redirectUri: null,
      codeChallenge: null,
      codeChallengeMethod: 'S256',
      expiresAt: new Date(Date.now() + 10 * 60_000), // 10 min
      client,
      user: user ?? null,
      scopes,
    }
  }

  async persist(authCode: OAuthAuthCode): Promise<void> {
    await this.db.insert(oauthAuthCodes).values({
      code: authCode.code,
      redirectUri: authCode.redirectUri,
      codeChallenge: authCode.codeChallenge,
      codeChallengeMethod: authCode.codeChallengeMethod,
      clientId: authCode.client.id,
      userId: (authCode.user as OAuthUser).id as number,
      scopes: authCode.scopes.map(s => s.name),
      expiresAt: authCode.expiresAt,
    })
  }

  async getByIdentifier(code: string): Promise<OAuthAuthCode> {
    const [row] = await this.db.select().from(oauthAuthCodes).where(eq(oauthAuthCodes.code, code))
    if (!row) throw new Error('Auth code not found')

    const [clientRow] = await this.db
      .select()
      .from(oauthClients)
      .where(eq(oauthClients.id, row.clientId))
    const client: OAuthClient = {
      id: clientRow.id,
      name: clientRow.name,
      secret: clientRow.secret,
      redirectUris: clientRow.redirectUris,
      allowedGrants: clientRow.allowedGrants as GrantIdentifier[],
      scopes: (clientRow.scopes as string[]).map(name => ({ name })),
    }

    return {
      code: row.code,
      redirectUri: row.redirectUri,
      codeChallenge: row.codeChallenge,
      codeChallengeMethod: row.codeChallengeMethod as 'S256' | 'plain' | null,
      expiresAt: row.expiresAt,
      client,
      user: { id: row.userId },
      scopes: (row.scopes as string[]).map(name => ({ name })),
    }
  }

  async isRevoked(code: string): Promise<boolean> {
    const [row] = await this.db
      .select({ isRevoked: oauthAuthCodes.isRevoked })
      .from(oauthAuthCodes)
      .where(eq(oauthAuthCodes.code, code))
    return row?.isRevoked ?? true
  }

  async revoke(code: string): Promise<void> {
    await this.db
      .update(oauthAuthCodes)
      .set({ isRevoked: true })
      .where(eq(oauthAuthCodes.code, code))
  }
}

// ============================================================================
// Scope Repository
// ============================================================================

const SUPPORTED_SCOPES: OAuthScope[] = [{ name: 'mcp:read' }]

export class ScopeRepository implements OAuthScopeRepository {
  async getAllByIdentifiers(scopeNames: string[]): Promise<OAuthScope[]> {
    return SUPPORTED_SCOPES.filter(s => scopeNames.includes(s.name))
  }

  async finalize(
    scopes: OAuthScope[],
    _identifier: GrantIdentifier,
    _client: OAuthClient,
    _userId?: OAuthUserIdentifier
  ): Promise<OAuthScope[]> {
    // If no scopes requested, grant default
    if (scopes.length === 0) return SUPPORTED_SCOPES
    return scopes
  }
}

// ============================================================================
// User Repository
// ============================================================================

export class UserRepository implements OAuthUserRepository {
  constructor(private db: DB) {}

  async getUserByCredentials(
    identifier: OAuthUserIdentifier,
    password?: string,
    grantType?: GrantIdentifier,
    _client?: OAuthClient
  ): Promise<OAuthUser | undefined> {
    // The library calls this with either an email (password grant) or a numeric id
    // (auth code grant internally resolves user by id after code exchange)
    const isNumericId = typeof identifier === 'number' || /^\d+$/.test(String(identifier))
    const [user] = await this.db
      .select()
      .from(users)
      .where(isNumericId ? eq(users.id, Number(identifier)) : eq(users.email, String(identifier)))
    if (!user) return undefined
    if (user.isBlocked) return undefined

    // Auth code grant resolves user by ID after code exchange — no password needed
    if (grantType === 'authorization_code' || grantType === 'refresh_token') {
      return { id: user.id }
    }

    // All other grants require password verification
    if (!password || !user.passwordHash) return undefined
    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) return undefined
    return { id: user.id }
  }
}
