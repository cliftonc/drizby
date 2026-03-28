import crypto from 'node:crypto'
import { generateCodeVerifier, generateState } from 'arctic'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, count, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import {
  emailVerificationTokens,
  groupTypes,
  groups,
  oauthAccounts,
  passwordResetTokens,
  settings,
  userGroups,
  users,
} from '../../schema'
import {
  createSignedToken,
  getMagicLinkSecret,
  storeMagicLinkToken,
  verifyAndConsumeMagicLink,
} from '../auth/magic-link'
import { authMiddleware, optionalAuth } from '../auth/middleware'
import { createGoogleClient, fetchGoogleProfile } from '../auth/oauth'
import { createGitHubClient, fetchGitHubProfile } from '../auth/oauth-github'
import { createGitLabClient, fetchGitLabProfile } from '../auth/oauth-gitlab'
import { createMicrosoftClient, fetchMicrosoftProfile } from '../auth/oauth-microsoft'
import {
  buildSlackAuthUrl,
  exchangeSlackCode,
  fetchSlackProfile,
  getSlackConfig,
} from '../auth/oauth-slack'
import { hashPassword, verifyPassword } from '../auth/password'
import { createRateLimiter } from '../auth/rate-limit'
import { createSamlEntities, extractProfile as extractSamlProfile } from '../auth/saml'
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  getSessionCookie,
  setSessionCookie,
} from '../auth/session'
import { connectionManager } from '../services/connection-manager'
import {
  createEmailVerificationTemplate,
  createMagicLinkEmailTemplate,
  createNewUserNotificationTemplate,
  createPasswordChangedEmailTemplate,
  createPasswordResetConfirmEmailTemplate,
  createPasswordResetEmailTemplate,
  getAppName,
  getAppUrl,
  sendEmail,
} from '../services/email'
import {
  getAutoAcceptDomains,
  getEnabledProviders,
  getMagicLinkEnabled,
  getPasswordEnabled,
  isEmailAutoAccepted,
} from '../services/oauth-settings'

interface Variables {
  db: DrizzleDatabase
  auth?: { userId: number; user: any }
}

const app = new Hono<{ Variables: Variables }>()

// ---------------------------------------------------------------------------
// Shared OAuth callback helper
// ---------------------------------------------------------------------------

async function handleOAuthLogin(
  db: any,
  profile: {
    provider: string
    providerUserId: string
    email: string
    name: string
    avatarUrl?: string
  }
): Promise<{ userId: number; isBlocked: boolean }> {
  // Check if oauth account exists
  const [existingOauth] = await db
    .select()
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, profile.provider),
        eq(oauthAccounts.providerUserId, profile.providerUserId)
      )
    )

  let userId: number

  if (existingOauth) {
    userId = existingOauth.userId
    // Update last-used timestamp
    await db
      .update(oauthAccounts)
      .set({ updatedAt: new Date() })
      .where(eq(oauthAccounts.id, existingOauth.id))
  } else {
    // Check if user with this email exists
    const [existingUser] = await db.select().from(users).where(eq(users.email, profile.email))

    if (existingUser) {
      userId = existingUser.id
    } else {
      // Create new user
      const username = profile.email.split('@')[0]
      const [{ value: userCount }] = await db.select({ value: count() }).from(users)
      let role = 'user'
      if (userCount === 0) {
        role = 'admin'
      } else {
        const autoAcceptDomains = await getAutoAcceptDomains(db)
        if (isEmailAutoAccepted(profile.email, autoAcceptDomains)) {
          role = 'member'
        }
      }
      const [newUser] = await db
        .insert(users)
        .values({
          email: profile.email,
          username,
          name: profile.name,
          role,
          avatarUrl: profile.avatarUrl,
          organisationId: 1,
        })
        .returning()
      userId = newUser.id
    }

    // Link oauth account (no tokens stored — they're not needed post-login)
    await db.insert(oauthAccounts).values({
      userId,
      provider: profile.provider,
      providerUserId: profile.providerUserId,
    })
  }

  // Check if blocked
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  return { userId, isBlocked: user.isBlocked }
}

// Check auth status (no auth required)
const loginLimiter = createRateLimiter(10, 60_000)
const registerLimiter = createRateLimiter(5, 60_000)
const forgotPasswordLimiter = createRateLimiter(5, 60_000)
const magicLinkLimiter = createRateLimiter(5, 60_000)

app.get('/status', optionalAuth, async c => {
  const db = c.get('db') as any
  const [{ value: userCount }] = await db.select({ value: count() }).from(users)
  const needsSetup = userCount === 0
  const auth = c.get('auth') as any

  // Check setup_status setting
  let pendingAdminSetup = false
  let needsSeed = false
  if (!needsSetup) {
    const [statusRow] = await db.select().from(settings).where(eq(settings.key, 'setup_status'))
    if (statusRow) {
      pendingAdminSetup = statusRow.value === 'pending_admin_reset'
      needsSeed = statusRow.value === 'needs_seed'
    }
  }

  const enabledProviders = await getEnabledProviders(db)

  return c.json({
    needsSetup,
    pendingAdminSetup,
    needsSeed,
    authenticated: !!auth,
    user: auth
      ? {
          id: auth.user.id,
          email: auth.user.email,
          name: auth.user.name,
          role: auth.user.role,
          avatarUrl: auth.user.avatarUrl,
          emailVerified: auth.user.emailVerified,
        }
      : null,
    enabledProviders,
    googleEnabled: enabledProviders.includes('google'),
    compiling: connectionManager.isCompiling,
    compilationProgress: connectionManager.compilationProgress,
  })
})

// First-run setup - create initial admin
app.post('/setup', async c => {
  const db = c.get('db') as any
  const [{ value: userCount }] = await db.select({ value: count() }).from(users)

  if (userCount > 0) {
    return c.json({ error: 'Setup already completed' }, 400)
  }

  const body = await c.req.json()
  const { name, email, password } = body

  if (!name || !email || !password) {
    return c.json({ error: 'Name, email, and password are required' }, 400)
  }

  if (password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400)
  }

  const passwordHash = await hashPassword(password)
  const [user] = await db
    .insert(users)
    .values({
      name,
      email,
      username: email.split('@')[0],
      passwordHash,
      role: 'admin',
      organisationId: 1,
    })
    .returning()

  const sessionId = await createSession(db, user.id)
  setSessionCookie(c, sessionId)

  return c.json(
    {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    },
    201
  )
})

// Self-registration — creates a pending user (role: 'user')
app.post('/register', registerLimiter, async c => {
  const db = c.get('db') as any

  if (!(await getPasswordEnabled(db))) {
    return c.json({ error: 'Password authentication is disabled' }, 403)
  }

  const body = await c.req.json()
  const { name, email, password } = body

  if (!name || !email || !password) {
    return c.json({ error: 'Name, email, and password are required' }, 400)
  }

  if (password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400)
  }

  const passwordHash = await hashPassword(password)

  try {
    const [user] = await db
      .insert(users)
      .values({
        name,
        email,
        username: email.split('@')[0],
        passwordHash,
        role: 'user',
        emailVerified: false,
        organisationId: 1,
      })
      .returning()

    const sessionId = await createSession(db, user.id)
    setSessionCookie(c, sessionId)

    // Send verification email
    const appName = getAppName()
    const appUrl = getAppUrl()
    const verificationToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    await db.insert(emailVerificationTokens).values({
      id: verificationToken,
      userId: user.id,
      expiresAt,
    })

    const verifyUrl = `${appUrl}/verify-email?token=${verificationToken}`
    sendEmail(
      user.email,
      `Verify your email on ${appName}`,
      createEmailVerificationTemplate(user.name, verifyUrl, appName)
    ).catch(() => {})

    // Notify all admins
    db.select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.role, 'admin'))
      .then((admins: any[]) => {
        for (const admin of admins) {
          sendEmail(
            admin.email,
            `New user registered on ${appName}`,
            createNewUserNotificationTemplate(
              user.name,
              user.email,
              appName,
              `${appUrl}/settings/users`
            )
          ).catch(() => {})
        }
      })
      .catch(() => {})

    return c.json(
      {
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
      201
    )
  } catch (err: any) {
    if (err.code === '23505' || err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.json({ error: 'An account with this email already exists' }, 409)
    }
    throw err
  }
})

// Login with email + password
app.post('/login', loginLimiter, async c => {
  const db = c.get('db') as any

  if (!(await getPasswordEnabled(db))) {
    return c.json({ error: 'Password authentication is disabled' }, 403)
  }

  const { email, password } = await c.req.json()

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400)
  }

  const [user] = await db.select().from(users).where(eq(users.email, email))

  if (!user || !user.passwordHash) {
    return c.json({ error: 'Invalid email or password' }, 401)
  }

  if (user.isBlocked) {
    return c.json({ error: 'Account is blocked' }, 403)
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    return c.json({ error: 'Invalid email or password' }, 401)
  }

  const sessionId = await createSession(db, user.id)
  setSessionCookie(c, sessionId)

  return c.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  })
})

// Logout
app.post('/logout', authMiddleware, async c => {
  const db = c.get('db') as any
  const sessionId = getSessionCookie(c)
  if (sessionId) {
    await deleteSession(db, sessionId)
  }
  clearSessionCookie(c)
  return c.json({ success: true })
})

// Get current user
app.get('/me', authMiddleware, async c => {
  const auth = c.get('auth') as any
  return c.json({
    id: auth.user.id,
    email: auth.user.email,
    username: auth.user.username,
    name: auth.user.name,
    role: auth.user.role,
    avatarUrl: auth.user.avatarUrl,
  })
})

// Get current user's group memberships
app.get('/me/groups', authMiddleware, async c => {
  const db = c.get('db') as any
  const auth = c.get('auth') as any

  const rows = await db
    .select({
      groupId: userGroups.groupId,
      groupName: groups.name,
      typeName: groupTypes.name,
    })
    .from(userGroups)
    .innerJoin(groups, eq(userGroups.groupId, groups.id))
    .innerJoin(groupTypes, eq(groups.groupTypeId, groupTypes.id))
    .where(eq(userGroups.userId, auth.user.id))

  // Group by type
  const byType: Record<string, string[]> = {}
  for (const row of rows) {
    if (!byType[row.typeName]) byType[row.typeName] = []
    byType[row.typeName].push(row.groupName)
  }

  return c.json(byType)
})

// Get current user's login method
app.get('/me/auth-method', authMiddleware, async c => {
  const db = c.get('db') as any
  const auth = c.get('auth') as any

  const oauthRows = await db
    .select({ provider: oauthAccounts.provider })
    .from(oauthAccounts)
    .where(eq(oauthAccounts.userId, auth.user.id))

  const hasPassword = !!auth.user.passwordHash
  const providers = oauthRows.map((r: any) => r.provider as string)

  return c.json({ hasPassword, oauthProviders: providers })
})

// Change password
app.put('/password', authMiddleware, async c => {
  const db = c.get('db') as any
  const auth = c.get('auth') as any
  const { currentPassword, newPassword } = await c.req.json()

  if (!newPassword || newPassword.length < 8) {
    return c.json({ error: 'New password must be at least 8 characters' }, 400)
  }

  // If user has a password, verify current
  if (auth.user.passwordHash) {
    if (!currentPassword) {
      return c.json({ error: 'Current password is required' }, 400)
    }
    const valid = await verifyPassword(currentPassword, auth.user.passwordHash)
    if (!valid) {
      return c.json({ error: 'Current password is incorrect' }, 401)
    }
  }

  const passwordHash = await hashPassword(newPassword)
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, auth.user.id))

  // Fire-and-forget: send password changed notification
  sendEmail(
    auth.user.email,
    `Password changed on ${getAppName()}`,
    createPasswordChangedEmailTemplate(auth.user.name, getAppName())
  ).catch(() => {})

  return c.json({ success: true })
})

// Forgot password — public endpoint
app.post('/forgot-password', forgotPasswordLimiter, async c => {
  const db = c.get('db') as any
  const { email } = await c.req.json()

  // Always return 200 to avoid leaking email existence
  if (!email) {
    return c.json({ success: true })
  }

  const [user] = await db.select().from(users).where(eq(users.email, email))

  if (user && !user.isBlocked) {
    // Generate token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await db.insert(passwordResetTokens).values({
      id: token,
      userId: user.id,
      expiresAt,
    })

    const appName = getAppName()
    const resetUrl = `${getAppUrl()}/reset-password?token=${token}`

    sendEmail(
      user.email,
      `Reset your ${appName} password`,
      createPasswordResetEmailTemplate(user.name, resetUrl, appName)
    ).catch(() => {})
  }

  return c.json({ success: true })
})

// Reset password — public endpoint
app.post('/reset-password', async c => {
  const db = c.get('db') as any
  const { token, password } = await c.req.json()

  if (!token || !password) {
    return c.json({ error: 'Token and password are required' }, 400)
  }

  if (password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400)
  }

  // Find token
  const [resetToken] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.id, token))

  if (!resetToken) {
    return c.json({ error: 'Invalid or expired reset link' }, 400)
  }

  if (new Date() > resetToken.expiresAt) {
    // Clean up expired token
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, token))
    return c.json({ error: 'Invalid or expired reset link' }, 400)
  }

  // Update password
  const passwordHash = await hashPassword(password)
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, resetToken.userId))

  // Delete all tokens for this user
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, resetToken.userId))

  // If setup_status is pending_admin_reset, transition to needs_seed
  const [statusRow] = await db.select().from(settings).where(eq(settings.key, 'setup_status'))
  if (statusRow?.value === 'pending_admin_reset') {
    await db
      .update(settings)
      .set({ value: 'needs_seed', updatedAt: new Date() })
      .where(eq(settings.key, 'setup_status'))
  }

  // Auto-login: create session for the user
  const sessionId = await createSession(db, resetToken.userId)
  setSessionCookie(c, sessionId)

  // Send confirmation email
  const [user] = await db.select().from(users).where(eq(users.id, resetToken.userId))
  if (user) {
    sendEmail(
      user.email,
      `Password reset complete on ${getAppName()}`,
      createPasswordResetConfirmEmailTemplate(user.name, getAppName())
    ).catch(() => {})
  }

  return c.json({ success: true })
})

// Resend setup email — public endpoint for pending admin setup
app.post('/resend-setup-email', async c => {
  const db = c.get('db') as any

  // Only works when setup_status is pending_admin_reset
  const [statusRow] = await db.select().from(settings).where(eq(settings.key, 'setup_status'))

  if (statusRow?.value !== 'pending_admin_reset') {
    return c.json({ success: true })
  }

  // Find the admin user (first admin)
  const [admin] = await db.select().from(users).where(eq(users.role, 'admin'))
  if (!admin) {
    return c.json({ success: true })
  }

  // Delete existing tokens for this user
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, admin.id))

  // Create new token
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  await db.insert(passwordResetTokens).values({
    id: token,
    userId: admin.id,
    expiresAt,
  })

  const appName = getAppName()
  const resetUrl = `${getAppUrl()}/reset-password?token=${token}`

  sendEmail(
    admin.email,
    `Set up your ${appName} admin account`,
    createPasswordResetEmailTemplate(admin.name, resetUrl, appName)
  ).catch(() => {})

  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

app.post('/verify-email', async c => {
  const db = c.get('db') as any
  const { token } = await c.req.json()

  if (!token) {
    return c.json({ error: 'Token is required' }, 400)
  }

  const [verificationToken] = await db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.id, token))

  if (!verificationToken) {
    return c.json({ error: 'Invalid or already used verification link' }, 400)
  }

  if (new Date() > verificationToken.expiresAt) {
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.id, token))
    return c.json({ error: 'Verification link has expired' }, 400)
  }

  // Mark email as verified
  await db
    .update(users)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(users.id, verificationToken.userId))

  // Apply auto-accept domain logic
  const [user] = await db.select().from(users).where(eq(users.id, verificationToken.userId))
  if (user && user.role === 'user') {
    const autoAcceptDomains = await getAutoAcceptDomains(db)
    if (isEmailAutoAccepted(user.email, autoAcceptDomains)) {
      await db
        .update(users)
        .set({ role: 'member', updatedAt: new Date() })
        .where(eq(users.id, user.id))
    }
  }

  // Delete all verification tokens for this user
  await db
    .delete(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, verificationToken.userId))

  // Create session
  const sessionId = await createSession(db, verificationToken.userId)
  setSessionCookie(c, sessionId)
  return c.json({ success: true })
})

app.post('/resend-verification', authMiddleware, async c => {
  const db = c.get('db') as any
  const auth = c.get('auth') as any

  if (auth.user.emailVerified) {
    return c.json({ error: 'Email already verified' }, 400)
  }

  // Delete existing tokens
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, auth.user.id))

  // Create new token
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  await db.insert(emailVerificationTokens).values({
    id: token,
    userId: auth.user.id,
    expiresAt,
  })

  const appName = getAppName()
  const verifyUrl = `${getAppUrl()}/verify-email?token=${token}`

  sendEmail(
    auth.user.email,
    `Verify your email on ${appName}`,
    createEmailVerificationTemplate(auth.user.name, verifyUrl, appName)
  ).catch(() => {})

  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// Google OAuth
// ---------------------------------------------------------------------------

app.get('/google', async c => {
  const db = c.get('db') as any
  const google = await createGoogleClient(db)
  if (!google) {
    return c.json({ error: 'Google OAuth not configured' }, 400)
  }

  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const url = google.createAuthorizationURL(state, codeVerifier, ['openid', 'email', 'profile'])

  setCookie(c, 'oauth_state', state, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 600 })
  setCookie(c, 'oauth_code_verifier', codeVerifier, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  })

  return c.redirect(url.toString())
})

app.get('/google/callback', async c => {
  const db = c.get('db') as any
  const google = await createGoogleClient(db)
  if (!google) {
    return c.redirect('/login?error=oauth_not_configured')
  }

  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, 'oauth_state')
  const codeVerifier = getCookie(c, 'oauth_code_verifier')

  if (!code || !state || state !== storedState || !codeVerifier) {
    return c.redirect('/login?error=invalid_state')
  }

  deleteCookie(c, 'oauth_state', { path: '/' })
  deleteCookie(c, 'oauth_code_verifier', { path: '/' })

  try {
    const tokens = await google.validateAuthorizationCode(code, codeVerifier)
    const accessToken = tokens.accessToken()
    const profile = await fetchGoogleProfile(accessToken)

    const result = await handleOAuthLogin(db, {
      provider: 'google',
      providerUserId: profile.sub,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.picture,
    })

    if (result.isBlocked) {
      return c.redirect('/login?error=blocked')
    }

    const sessionId = await createSession(db, result.userId)
    setSessionCookie(c, sessionId)
    return c.redirect('/')
  } catch (err) {
    console.error('Google OAuth error:', err)
    return c.redirect('/login?error=oauth_failed')
  }
})

// ---------------------------------------------------------------------------
// GitHub OAuth
// ---------------------------------------------------------------------------

app.get('/github', async c => {
  const db = c.get('db') as any
  const result = await createGitHubClient(db)
  if (!result) return c.json({ error: 'GitHub OAuth not configured' }, 400)

  const state = generateState()
  const url = result.client.createAuthorizationURL(state, ['read:user', 'user:email'])

  setCookie(c, 'oauth_state', state, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 600 })
  return c.redirect(url.toString())
})

app.get('/github/callback', async c => {
  const db = c.get('db') as any
  const result = await createGitHubClient(db)
  if (!result) return c.redirect('/login?error=oauth_not_configured')

  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, 'oauth_state')

  if (!code || !state || state !== storedState) {
    return c.redirect('/login?error=invalid_state')
  }

  deleteCookie(c, 'oauth_state', { path: '/' })

  try {
    const tokens = await result.client.validateAuthorizationCode(code)
    const accessToken = tokens.accessToken()
    const profile = await fetchGitHubProfile(accessToken)

    const loginResult = await handleOAuthLogin(db, {
      provider: 'github',
      providerUserId: profile.sub,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.picture,
    })

    if (loginResult.isBlocked) return c.redirect('/login?error=blocked')

    const sessionId = await createSession(db, loginResult.userId)
    setSessionCookie(c, sessionId)
    return c.redirect('/')
  } catch (err) {
    console.error('GitHub OAuth error:', err)
    return c.redirect('/login?error=oauth_failed')
  }
})

// ---------------------------------------------------------------------------
// GitLab OAuth
// ---------------------------------------------------------------------------

app.get('/gitlab', async c => {
  const db = c.get('db') as any
  const result = await createGitLabClient(db)
  if (!result) return c.json({ error: 'GitLab OAuth not configured' }, 400)

  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const url = result.createAuthorizationURL(state, codeVerifier, ['openid', 'profile', 'email'])

  setCookie(c, 'oauth_state', state, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 600 })
  setCookie(c, 'oauth_code_verifier', codeVerifier, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  })

  return c.redirect(url.toString())
})

app.get('/gitlab/callback', async c => {
  const db = c.get('db') as any
  const result = await createGitLabClient(db)
  if (!result) return c.redirect('/login?error=oauth_not_configured')

  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, 'oauth_state')
  const codeVerifier = getCookie(c, 'oauth_code_verifier')

  if (!code || !state || state !== storedState || !codeVerifier) {
    return c.redirect('/login?error=invalid_state')
  }

  deleteCookie(c, 'oauth_state', { path: '/' })
  deleteCookie(c, 'oauth_code_verifier', { path: '/' })

  try {
    const tokens = await result.validateAuthorizationCode(code, codeVerifier)
    const accessToken = tokens.accessToken()
    const profile = await fetchGitLabProfile(accessToken)

    const loginResult = await handleOAuthLogin(db, {
      provider: 'gitlab',
      providerUserId: profile.sub,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.picture,
    })

    if (loginResult.isBlocked) return c.redirect('/login?error=blocked')

    const sessionId = await createSession(db, loginResult.userId)
    setSessionCookie(c, sessionId)
    return c.redirect('/')
  } catch (err) {
    console.error('GitLab OAuth error:', err)
    return c.redirect('/login?error=oauth_failed')
  }
})

// ---------------------------------------------------------------------------
// Microsoft OAuth (with PKCE)
// ---------------------------------------------------------------------------

app.get('/microsoft', async c => {
  const db = c.get('db') as any
  const result = await createMicrosoftClient(db)
  if (!result) return c.json({ error: 'Microsoft OAuth not configured' }, 400)

  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const url = result.client.createAuthorizationURL(state, codeVerifier, [
    'openid',
    'profile',
    'email',
    'User.Read',
  ])

  setCookie(c, 'oauth_state', state, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 600 })
  setCookie(c, 'oauth_code_verifier', codeVerifier, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  })

  return c.redirect(url.toString())
})

app.get('/microsoft/callback', async c => {
  const db = c.get('db') as any
  const result = await createMicrosoftClient(db)
  if (!result) return c.redirect('/login?error=oauth_not_configured')

  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, 'oauth_state')
  const codeVerifier = getCookie(c, 'oauth_code_verifier')

  if (!code || !state || state !== storedState || !codeVerifier) {
    return c.redirect('/login?error=invalid_state')
  }

  deleteCookie(c, 'oauth_state', { path: '/' })
  deleteCookie(c, 'oauth_code_verifier', { path: '/' })

  try {
    const tokens = await result.client.validateAuthorizationCode(code, codeVerifier)
    const accessToken = tokens.accessToken()
    const profile = await fetchMicrosoftProfile(accessToken)

    const loginResult = await handleOAuthLogin(db, {
      provider: 'microsoft',
      providerUserId: profile.sub,
      email: profile.email,
      name: profile.name,
    })

    if (loginResult.isBlocked) return c.redirect('/login?error=blocked')

    const sessionId = await createSession(db, loginResult.userId)
    setSessionCookie(c, sessionId)
    return c.redirect('/')
  } catch (err) {
    console.error('Microsoft OAuth error:', err)
    return c.redirect('/login?error=oauth_failed')
  }
})

// ---------------------------------------------------------------------------
// Slack OAuth (custom OIDC)
// ---------------------------------------------------------------------------

app.get('/slack', async c => {
  const db = c.get('db') as any
  const config = await getSlackConfig(db)
  if (!config) return c.json({ error: 'Slack OAuth not configured' }, 400)

  const state = generateState()
  const nonce = crypto.randomBytes(16).toString('hex')
  const url = buildSlackAuthUrl(config.clientId, config.redirectUri, state, nonce)

  setCookie(c, 'oauth_state', state, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 600 })
  setCookie(c, 'oauth_nonce', nonce, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 600 })

  return c.redirect(url)
})

app.get('/slack/callback', async c => {
  const db = c.get('db') as any
  const config = await getSlackConfig(db)
  if (!config) return c.redirect('/login?error=oauth_not_configured')

  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, 'oauth_state')

  if (!code || !state || state !== storedState) {
    return c.redirect('/login?error=invalid_state')
  }

  const storedNonce = getCookie(c, 'oauth_nonce')

  deleteCookie(c, 'oauth_state', { path: '/' })
  deleteCookie(c, 'oauth_nonce', { path: '/' })

  try {
    const { accessToken, idToken } = await exchangeSlackCode(
      config.clientId,
      config.clientSecret,
      code,
      config.redirectUri
    )

    // Verify nonce from id_token to prevent replay attacks
    if (idToken && storedNonce) {
      try {
        const [, payloadB64] = idToken.split('.')
        if (payloadB64) {
          const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
          if (payload.nonce !== storedNonce) {
            return c.redirect('/login?error=invalid_state')
          }
        }
      } catch {
        return c.redirect('/login?error=oauth_failed')
      }
    }

    const profile = await fetchSlackProfile(accessToken)

    const loginResult = await handleOAuthLogin(db, {
      provider: 'slack',
      providerUserId: profile.sub,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.picture,
    })

    if (loginResult.isBlocked) return c.redirect('/login?error=blocked')

    const sessionId = await createSession(db, loginResult.userId)
    setSessionCookie(c, sessionId)
    return c.redirect('/')
  } catch (err) {
    console.error('Slack OAuth error:', err)
    return c.redirect('/login?error=oauth_failed')
  }
})

// ---------------------------------------------------------------------------
// Magic Link
// ---------------------------------------------------------------------------

app.post('/magic-link/request', magicLinkLimiter, async c => {
  const db = c.get('db') as any
  const { email } = await c.req.json()

  if (!email) {
    return c.json({ error: 'Email is required' }, 400)
  }

  const enabled = await getMagicLinkEnabled(db)
  if (!enabled) {
    return c.json({ error: 'Magic link authentication is not enabled' }, 400)
  }

  // Always return 200 to avoid leaking info
  try {
    const secret = getMagicLinkSecret()
    const signedToken = await createSignedToken(email, secret)
    await storeMagicLinkToken(db, email, signedToken)

    const appName = getAppName()
    const magicLinkUrl = `${getAppUrl()}/magic-link/verify?token=${encodeURIComponent(signedToken)}`

    sendEmail(
      email,
      `Sign in to ${appName}`,
      createMagicLinkEmailTemplate(magicLinkUrl, appName)
    ).catch(() => {})
  } catch (err) {
    console.error('Magic link error:', err)
  }

  return c.json({ success: true })
})

app.post('/magic-link/verify', async c => {
  const db = c.get('db') as any
  const { token } = await c.req.json()

  if (!token) {
    return c.json({ error: 'Token is required' }, 400)
  }

  const secret = getMagicLinkSecret()
  const result = await verifyAndConsumeMagicLink(db, token, secret)

  if (!result.success) {
    const messages: Record<string, string> = {
      expired: 'This magic link has expired. Please request a new one.',
      invalid: 'This magic link is invalid.',
      already_used: 'This magic link has already been used. Please request a new one.',
    }
    return c.json({ error: messages[result.reason] || 'Verification failed' }, 400)
  }

  // Check if blocked
  const [user] = await db.select().from(users).where(eq(users.id, result.userId))
  if (user?.isBlocked) {
    return c.json({ error: 'Account is blocked' }, 403)
  }

  const sessionId = await createSession(db, result.userId)
  setSessionCookie(c, sessionId)
  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// Cloud Admin Login (Drizby Cloud → Instance)
// ---------------------------------------------------------------------------

const CLOUD_ADMIN_TOKEN_MAX_AGE_MS = 30_000 // 30 seconds
const usedCloudAdminNonces = new Map<string, number>()

// Periodically clean expired nonces
setInterval(() => {
  const cutoff = Date.now() - CLOUD_ADMIN_TOKEN_MAX_AGE_MS * 2
  for (const [nonce, ts] of usedCloudAdminNonces) {
    if (ts < cutoff) usedCloudAdminNonces.delete(nonce)
  }
}, 60_000)

app.get('/cloud-admin', async c => {
  const secret = process.env.CLOUD_ADMIN_SECRET
  if (!secret) {
    return c.json({ error: 'Cloud admin login not configured' }, 404)
  }

  const email = c.req.query('email')
  const name = c.req.query('name')
  const ts = c.req.query('ts')
  const nonce = c.req.query('nonce')
  const sig = c.req.query('sig')

  if (!email || !name || !ts || !nonce || !sig) {
    return c.json({ error: 'Invalid request' }, 400)
  }

  // Check token age
  const tokenAge = Date.now() - Number.parseInt(ts, 10)
  if (Number.isNaN(tokenAge) || tokenAge > CLOUD_ADMIN_TOKEN_MAX_AGE_MS || tokenAge < 0) {
    return c.json({ error: 'Token expired' }, 401)
  }

  // Check nonce replay
  if (usedCloudAdminNonces.has(nonce)) {
    return c.json({ error: 'Token already used' }, 401)
  }

  // Verify HMAC — validate sig format first to prevent Buffer length mismatch crash
  if (!/^[0-9a-f]{64}$/i.test(sig)) {
    return c.json({ error: 'Invalid signature' }, 401)
  }
  const payload = `${email}|${name}|${ts}|${nonce}`
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
    return c.json({ error: 'Invalid signature' }, 401)
  }

  // Mark nonce as used
  usedCloudAdminNonces.set(nonce, Date.now())

  // Find or create cloud admin user — use real email so notifications work
  const db = c.get('db') as any
  const [existingUser] = await db.select().from(users).where(eq(users.email, email))

  let userId: number
  if (existingUser) {
    // Log in as the existing user (don't modify their role)
    userId = existingUser.id
  } else {
    const username = email.split('@')[0]
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        username,
        name,
        role: 'admin',
        emailVerified: true,
        organisationId: 1,
      })
      .returning()
    userId = newUser.id
  }

  // Cloud admin login bypasses the password reset flow, so transition setup_status
  const [statusRow] = await db.select().from(settings).where(eq(settings.key, 'setup_status'))
  if (statusRow?.value === 'pending_admin_reset') {
    await db
      .update(settings)
      .set({ value: 'needs_seed', updatedAt: new Date() })
      .where(eq(settings.key, 'setup_status'))
  }

  const sessionId = await createSession(db, userId)
  setSessionCookie(c, sessionId)
  return c.redirect('/')
})

// ---------------------------------------------------------------------------
// SAML 2.0 SSO
// ---------------------------------------------------------------------------

const samlCallbackLimiter = createRateLimiter(10, 60_000)

app.get('/saml/login', async c => {
  const db = c.get('db') as any
  const entities = await createSamlEntities(db)
  if (!entities) return c.redirect('/login?error=saml_not_configured')

  const { sp, idp } = entities
  try {
    const { context } = sp.createLoginRequest(idp, 'redirect')
    return c.redirect(context)
  } catch (err) {
    console.error('SAML login request error:', err)
    return c.redirect('/login?error=saml_failed')
  }
})

app.post('/saml/callback', samlCallbackLimiter, async c => {
  const db = c.get('db') as any
  const entities = await createSamlEntities(db)
  if (!entities) return c.redirect('/login?error=saml_not_configured')

  const { sp, idp, config } = entities

  try {
    const body = await c.req.parseBody()
    const result = await sp.parseLoginResponse(idp, 'post', {
      body: { SAMLResponse: body.SAMLResponse as string },
    })

    const profile = extractSamlProfile(result.extract, config.attributeMapping)

    const loginResult = await handleOAuthLogin(db, {
      provider: profile.provider,
      providerUserId: profile.providerUserId,
      email: profile.email,
      name: profile.name,
    })

    if (loginResult.isBlocked) return c.redirect('/login?error=blocked')

    // Sync SAML groups if present
    if (profile.groups.length > 0) {
      await syncSamlGroups(db, loginResult.userId, profile.groups)
    }

    const sessionId = await createSession(db, loginResult.userId)
    setSessionCookie(c, sessionId)
    return c.redirect('/')
  } catch (err) {
    console.error('SAML callback error:', err)
    return c.redirect('/login?error=saml_failed')
  }
})

app.get('/saml/metadata', async c => {
  const db = c.get('db') as any
  const entities = await createSamlEntities(db)
  if (!entities) return c.json({ error: 'SAML not configured' }, 400)

  const { sp } = entities
  const metadata = sp.getMetadata()
  return c.text(metadata, 200, { 'Content-Type': 'application/xml' })
})

/**
 * Sync SAML group assertions to Drizby groups.
 * Creates a "SAML" group type if needed, creates missing groups,
 * and updates the user's group membership to match the assertion.
 */
async function syncSamlGroups(db: any, userId: number, samlGroupNames: string[]) {
  try {
    // Find or create the "SAML" group type
    let [samlGroupType] = await db
      .select()
      .from(groupTypes)
      .where(and(eq(groupTypes.name, 'SAML'), eq(groupTypes.organisationId, 1)))

    if (!samlGroupType) {
      ;[samlGroupType] = await db
        .insert(groupTypes)
        .values({
          name: 'SAML',
          description: 'Groups synced from SAML identity provider',
          organisationId: 1,
        })
        .returning()
    }

    // Get all existing groups under the SAML type
    const existingGroups = await db
      .select()
      .from(groups)
      .where(and(eq(groups.groupTypeId, samlGroupType.id), eq(groups.organisationId, 1)))

    const existingByName = new Map(existingGroups.map((g: any) => [g.name, g]))

    // Create any missing groups
    const targetGroupIds: number[] = []
    for (const groupName of samlGroupNames) {
      let group: any = existingByName.get(groupName)
      if (!group) {
        ;[group] = await db
          .insert(groups)
          .values({
            name: groupName,
            groupTypeId: samlGroupType.id,
            organisationId: 1,
          })
          .returning()
      }
      targetGroupIds.push(group.id)
    }

    // Get user's current SAML group memberships
    const currentMemberships = await db
      .select({ groupId: userGroups.groupId })
      .from(userGroups)
      .innerJoin(groups, eq(userGroups.groupId, groups.id))
      .where(and(eq(userGroups.userId, userId), eq(groups.groupTypeId, samlGroupType.id)))

    const currentGroupIds = new Set(currentMemberships.map((m: any) => m.groupId))

    // Add missing memberships
    for (const groupId of targetGroupIds) {
      if (!currentGroupIds.has(groupId)) {
        await db.insert(userGroups).values({ userId, groupId })
      }
    }

    // Remove memberships not in the assertion
    const targetSet = new Set(targetGroupIds)
    for (const { groupId } of currentMemberships) {
      if (!targetSet.has(groupId)) {
        await db
          .delete(userGroups)
          .where(and(eq(userGroups.userId, userId), eq(userGroups.groupId, groupId)))
      }
    }
  } catch (err) {
    // Group sync is best-effort — don't block login on failure
    console.error('SAML group sync error:', err)
  }
}

export default app
