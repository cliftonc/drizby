import { GitHub } from 'arctic'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { getGitHubOAuthConfig } from '../services/oauth-settings'

export async function createGitHubClient(db: DrizzleDatabase) {
  const config = await getGitHubOAuthConfig(db)
  if (!config) return null
  return { client: new GitHub(config.clientId, config.clientSecret, config.redirectUri), config }
}

interface GitHubUser {
  id: number
  login: string
  email: string | null
  name: string | null
  avatar_url: string
}

interface GitHubEmail {
  email: string
  primary: boolean
  verified: boolean
}

export async function fetchGitHubProfile(accessToken: string) {
  const [userRes, emailsRes] = await Promise.all([
    fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Drizby' },
    }),
    fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Drizby' },
    }),
  ])

  if (!userRes.ok) throw new Error('Failed to fetch GitHub user')

  const user: GitHubUser = await userRes.json()
  let email = user.email

  if (!email && emailsRes.ok) {
    const emails: GitHubEmail[] = await emailsRes.json()
    const primary = emails.find(e => e.primary && e.verified)
    email = primary?.email || emails.find(e => e.verified)?.email || null
  }

  if (!email) throw new Error('No verified email found on GitHub account')

  return {
    sub: String(user.id),
    email,
    name: user.name || user.login,
    picture: user.avatar_url,
  }
}
