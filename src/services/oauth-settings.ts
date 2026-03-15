/**
 * OAuth settings service
 * Reads OAuth provider config from the settings table with env var fallback
 */

import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, eq, inArray } from 'drizzle-orm'
import { settings } from '../../schema'
import { maybeDecrypt } from '../auth/encryption'

// ---------------------------------------------------------------------------
// Generic helper
// ---------------------------------------------------------------------------

interface OAuthProviderConfig {
  enabled: boolean
  clientId: string
  clientSecret: string
  redirectUri: string
}

async function getProviderConfig(
  db: DrizzleDatabase,
  provider: string,
  envPrefix: string
): Promise<OAuthProviderConfig | null> {
  const keys = [
    `oauth_${provider}_enabled`,
    `oauth_${provider}_client_id`,
    `oauth_${provider}_client_secret`,
  ]

  const rows = await (db as any)
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(and(eq(settings.organisationId, 1), inArray(settings.key, keys)))

  const map = new Map(rows.map((r: any) => [r.key, r.value]))

  const rawClientId = (map.get(`oauth_${provider}_client_id`) as string) || ''
  const rawClientSecret = (map.get(`oauth_${provider}_client_secret`) as string) || ''

  const clientId =
    (rawClientId ? await maybeDecrypt(rawClientId) : '') ||
    process.env[`${envPrefix}_CLIENT_ID`] ||
    ''
  const clientSecret =
    (rawClientSecret ? await maybeDecrypt(rawClientSecret) : '') ||
    process.env[`${envPrefix}_CLIENT_SECRET`] ||
    ''

  // Explicit kill switch
  const dbEnabled = map.get(`oauth_${provider}_enabled`) as string | undefined
  if (dbEnabled === 'false') return null

  if (!clientId || !clientSecret) return null

  const baseUrl = (process.env.APP_URL || 'http://localhost:3461').replace(/\/$/, '')
  const redirectUri =
    process.env[`${envPrefix}_REDIRECT_URI`] || `${baseUrl}/api/auth/${provider}/callback`

  return { enabled: true, clientId, clientSecret, redirectUri }
}

// ---------------------------------------------------------------------------
// Per-provider configs
// ---------------------------------------------------------------------------

export interface GoogleOAuthConfig {
  enabled: boolean
  clientId: string
  clientSecret: string
  redirectUri: string
}

export async function getGoogleOAuthConfig(db: DrizzleDatabase): Promise<GoogleOAuthConfig | null> {
  return getProviderConfig(db, 'google', 'GOOGLE')
}

export async function getGitHubOAuthConfig(db: DrizzleDatabase) {
  return getProviderConfig(db, 'github', 'GITHUB')
}

export async function getGitLabOAuthConfig(db: DrizzleDatabase) {
  return getProviderConfig(db, 'gitlab', 'GITLAB')
}

export async function getMicrosoftOAuthConfig(db: DrizzleDatabase) {
  // Also read tenant ID
  const base = await getProviderConfig(db, 'microsoft', 'MICROSOFT')
  if (!base) return null

  const [row] = await (db as any)
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.organisationId, 1), eq(settings.key, 'oauth_microsoft_tenant_id')))

  const tenantId = row?.value || process.env.MICROSOFT_TENANT_ID || 'common'
  return { ...base, tenantId }
}

export async function getSlackOAuthConfig(db: DrizzleDatabase) {
  return getProviderConfig(db, 'slack', 'SLACK')
}

export async function getMagicLinkEnabled(db: DrizzleDatabase): Promise<boolean> {
  const [row] = await (db as any)
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.organisationId, 1), eq(settings.key, 'magic_link_enabled')))

  return row?.value === 'true'
}

export async function getAutoAcceptDomains(db: DrizzleDatabase): Promise<string[]> {
  const [row] = await (db as any)
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.organisationId, 1), eq(settings.key, 'auto_accept_email_domains')))

  if (!row?.value) return []
  return row.value
    .split(/[,;\n]+/)
    .map((d: string) => d.trim().toLowerCase())
    .filter(Boolean)
}

export function isEmailAutoAccepted(email: string, domains: string[]): boolean {
  if (domains.length === 0) return false
  const emailDomain = email.split('@')[1]?.toLowerCase()
  return !!emailDomain && domains.includes(emailDomain)
}

export async function getPasswordEnabled(db: DrizzleDatabase): Promise<boolean> {
  const [row] = await (db as any)
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.organisationId, 1), eq(settings.key, 'password_auth_enabled')))

  // Enabled by default — only disabled when explicitly set to 'false'
  return row?.value !== 'false'
}

export async function getEnabledProviders(db: DrizzleDatabase): Promise<string[]> {
  const providers: string[] = []

  if (await getPasswordEnabled(db)) providers.push('password')
  if (await getGoogleOAuthConfig(db)) providers.push('google')
  if (await getGitHubOAuthConfig(db)) providers.push('github')
  if (await getGitLabOAuthConfig(db)) providers.push('gitlab')
  if (await getMicrosoftOAuthConfig(db)) providers.push('microsoft')
  if (await getSlackOAuthConfig(db)) providers.push('slack')
  if (await getMagicLinkEnabled(db)) providers.push('magic_link')

  return providers
}
