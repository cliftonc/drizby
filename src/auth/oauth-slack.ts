import type { DrizzleDatabase } from 'drizzle-cube/server'
import { getSlackOAuthConfig } from '../services/oauth-settings'

export async function getSlackConfig(db: DrizzleDatabase) {
  return getSlackOAuthConfig(db)
}

export function buildSlackAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  nonce: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    nonce,
    scope: 'openid profile email',
  })
  return `https://slack.com/openid/connect/authorize?${params.toString()}`
}

export async function exchangeSlackCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; idToken?: string }> {
  const res = await fetch('https://slack.com/api/openid.connect.token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  })

  if (!res.ok) throw new Error('Failed to exchange Slack code')
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack token error: ${data.error}`)

  return { accessToken: data.access_token, idToken: data.id_token }
}

export async function fetchSlackProfile(accessToken: string) {
  const res = await fetch('https://slack.com/api/openid.connect.userInfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) throw new Error('Failed to fetch Slack profile')
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack userinfo error: ${data.error}`)

  return {
    sub: data['https://slack.com/user_id'] || data.sub,
    email: data.email as string,
    name: data.name as string,
    picture: data.picture as string | undefined,
  }
}
