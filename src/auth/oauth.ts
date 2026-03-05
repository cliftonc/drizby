import { Google } from 'arctic'

export function createGoogleClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3461/api/auth/google/callback'

  if (!clientId || !clientSecret) return null

  return new Google(clientId, clientSecret, redirectUri)
}

export interface GoogleProfile {
  sub: string
  email: string
  name: string
  picture?: string
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) throw new Error('Failed to fetch Google profile')
  return res.json()
}
