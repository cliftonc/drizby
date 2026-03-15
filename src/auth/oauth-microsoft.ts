import { MicrosoftEntraId } from 'arctic'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { getMicrosoftOAuthConfig } from '../services/oauth-settings'

export async function createMicrosoftClient(db: DrizzleDatabase) {
  const config = await getMicrosoftOAuthConfig(db)
  if (!config) return null
  const client = new MicrosoftEntraId(
    config.tenantId,
    config.clientId,
    config.clientSecret,
    config.redirectUri
  )
  return { client, config }
}

export async function fetchMicrosoftProfile(accessToken: string) {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Drizby' },
  })
  if (!res.ok) throw new Error('Failed to fetch Microsoft profile')

  const data: {
    id: string
    displayName: string | null
    mail: string | null
    userPrincipalName: string
  } = await res.json()

  const email = data.mail || data.userPrincipalName

  return {
    sub: data.id,
    email,
    name: data.displayName || email.split('@')[0],
  }
}
