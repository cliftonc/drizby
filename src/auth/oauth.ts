import { Google } from 'arctic'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { getGoogleOAuthConfig } from '../services/oauth-settings'

export async function createGoogleClient(db: DrizzleDatabase) {
  const config = await getGoogleOAuthConfig(db)
  if (!config) return null
  return new Google(config.clientId, config.clientSecret, config.redirectUri)
}

export interface GoogleProfile {
  sub: string
  email: string
  name: string
  picture?: string
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch Google profile')
  return res.json()
}
