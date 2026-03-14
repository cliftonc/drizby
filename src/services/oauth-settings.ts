/**
 * OAuth settings service
 * Reads OAuth provider config from the settings table with env var fallback
 */

import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, eq, inArray } from 'drizzle-orm'
import { settings } from '../../schema'

const GOOGLE_KEYS = [
  'oauth_google_enabled',
  'oauth_google_client_id',
  'oauth_google_client_secret',
] as const

export interface GoogleOAuthConfig {
  enabled: boolean
  clientId: string
  clientSecret: string
  redirectUri: string
}

export async function getGoogleOAuthConfig(db: DrizzleDatabase): Promise<GoogleOAuthConfig | null> {
  const rows = await (db as any)
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(and(eq(settings.organisationId, 1), inArray(settings.key, [...GOOGLE_KEYS])))

  const map = new Map(rows.map((r: any) => [r.key, r.value]))

  // DB values take precedence over env vars
  const clientId =
    (map.get('oauth_google_client_id') as string) || process.env.GOOGLE_CLIENT_ID || ''
  const clientSecret =
    (map.get('oauth_google_client_secret') as string) || process.env.GOOGLE_CLIENT_SECRET || ''

  // Explicit kill switch: if DB says disabled, respect it even if credentials exist
  const dbEnabled = map.get('oauth_google_enabled') as string | undefined
  if (dbEnabled === 'false') return null

  // If DB says enabled, or if credentials exist (env var fallback)
  if (!clientId || !clientSecret) return null

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `${(process.env.APP_URL || 'http://localhost:3461').replace(/\/$/, '')}/api/auth/google/callback`

  return { enabled: true, clientId, clientSecret, redirectUri }
}
