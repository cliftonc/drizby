import crypto from 'node:crypto'
import { generateCodeVerifier, generateState } from 'arctic'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { count, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { oauthAccounts, passwordResetTokens, settings, users } from '../../schema'
import { authMiddleware, optionalAuth } from '../auth/middleware'
import { createGoogleClient, fetchGoogleProfile } from '../auth/oauth'
import { hashPassword, verifyPassword } from '../auth/password'
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  getSessionCookie,
  setSessionCookie,
} from '../auth/session'
import {
  createNewUserNotificationTemplate,
  createPasswordChangedEmailTemplate,
  createPasswordResetConfirmEmailTemplate,
  createPasswordResetEmailTemplate,
  createWelcomeEmailTemplate,
  getAppName,
  getAppUrl,
  sendEmail,
} from '../services/email'

interface Variables {
  db: DrizzleDatabase
  auth?: { userId: number; user: any }
}

const app = new Hono<{ Variables: Variables }>()

// Check auth status (no auth required)
app.get('/status', optionalAuth, async c => {
  const db = c.get('db') as any
  const [{ value: userCount }] = await db.select({ value: count() }).from(users)
  const needsSetup = userCount === 0
  const auth = c.get('auth') as any

  // Check setup_status setting
  let pendingAdminSetup = false
  let needsSeed = false
  if (!needsSetup) {
    const [statusRow] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, 'setup_status'))
    if (statusRow) {
      pendingAdminSetup = statusRow.value === 'pending_admin_reset'
      needsSeed = statusRow.value === 'needs_seed'
    }
  }

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
        }
      : null,
    googleEnabled: !!createGoogleClient(),
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
app.post('/register', async c => {
  const db = c.get('db') as any
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
        organisationId: 1,
      })
      .returning()

    const sessionId = await createSession(db, user.id)
    setSessionCookie(c, sessionId)

    // Fire-and-forget: send welcome email and notify admins
    const appName = getAppName()
    const appUrl = getAppUrl()

    sendEmail(
      user.email,
      `Welcome to ${appName}`,
      createWelcomeEmailTemplate(user.name, appName, `${appUrl}/login`)
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
            createNewUserNotificationTemplate(user.name, user.email, appName, `${appUrl}/settings/users`)
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
app.post('/login', async c => {
  const db = c.get('db') as any
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
app.post('/forgot-password', async c => {
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
  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, resetToken.userId))

  // If setup_status is pending_admin_reset, transition to needs_seed
  const [statusRow] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, 'setup_status'))
  if (statusRow?.value === 'pending_admin_reset') {
    await db
      .update(settings)
      .set({ value: 'needs_seed', updatedAt: new Date() })
      .where(eq(settings.key, 'setup_status'))
  }

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
  const [statusRow] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, 'setup_status'))

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

// Google OAuth - initiate
app.get('/google', async c => {
  const google = createGoogleClient()
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

// Google OAuth - callback
app.get('/google/callback', async c => {
  const google = createGoogleClient()
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

  // Clean up cookies
  deleteCookie(c, 'oauth_state', { path: '/' })
  deleteCookie(c, 'oauth_code_verifier', { path: '/' })

  try {
    const tokens = await google.validateAuthorizationCode(code, codeVerifier)
    const accessToken = tokens.accessToken()
    const profile = await fetchGoogleProfile(accessToken)

    const db = c.get('db') as any

    // Check if oauth account exists
    const [existingOauth] = await db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.providerUserId, profile.sub))

    let userId: number

    if (existingOauth) {
      userId = existingOauth.userId
      // Update tokens
      await db
        .update(oauthAccounts)
        .set({ accessToken, updatedAt: new Date() })
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
        const [newUser] = await db
          .insert(users)
          .values({
            email: profile.email,
            username,
            name: profile.name,
            role: userCount === 0 ? 'admin' : 'user',
            avatarUrl: profile.picture,
            organisationId: 1,
          })
          .returning()
        userId = newUser.id
      }

      // Link oauth account
      await db.insert(oauthAccounts).values({
        userId,
        provider: 'google',
        providerUserId: profile.sub,
        accessToken,
      })
    }

    // Check if blocked
    const [user] = await db.select().from(users).where(eq(users.id, userId))
    if (user.isBlocked) {
      return c.redirect('/login?error=blocked')
    }

    const sessionId = await createSession(db, userId)
    setSessionCookie(c, sessionId)
    return c.redirect('/')
  } catch (err) {
    console.error('Google OAuth error:', err)
    return c.redirect('/login?error=oauth_failed')
  }
})

export default app
