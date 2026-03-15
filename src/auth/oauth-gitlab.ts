import { CodeChallengeMethod, GitLab } from 'arctic'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { getGitLabOAuthConfig } from '../services/oauth-settings'

export async function createGitLabClient(db: DrizzleDatabase) {
  const config = await getGitLabOAuthConfig(db)
  if (!config) return null
  const client = new GitLab(
    'https://gitlab.com',
    config.clientId,
    config.clientSecret,
    config.redirectUri
  )
  return {
    /** Build authorization URL with PKCE (S256) */
    createAuthorizationURL(state: string, codeVerifier: string, scopes: string[]): URL {
      // Use the underlying OAuth2Client's PKCE-aware method
      return (client as any).client.createAuthorizationURLWithPKCE(
        'https://gitlab.com/oauth/authorize',
        state,
        CodeChallengeMethod.S256,
        codeVerifier,
        scopes
      )
    },
    /** Exchange code with PKCE code_verifier */
    async validateAuthorizationCode(code: string, codeVerifier: string) {
      return (client as any).client.validateAuthorizationCode(
        'https://gitlab.com/oauth/token',
        code,
        codeVerifier
      )
    },
    config,
  }
}

export async function fetchGitLabProfile(accessToken: string) {
  const res = await fetch('https://gitlab.com/oauth/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch GitLab profile')

  const data: { sub: string; email: string; name: string; picture?: string } = await res.json()

  return {
    sub: data.sub,
    email: data.email,
    name: data.name,
    picture: data.picture,
  }
}
