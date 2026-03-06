import { Hono } from 'hono'
import { eq, count } from 'drizzle-orm'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { generateCodeVerifier, generateState } from 'arctic'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { users, oauthAccounts } from '../../schema'
import { hashPassword, verifyPassword } from '../auth/password'
import { createSession, deleteSession, setSessionCookie, clearSessionCookie, getSessionCookie } from '../auth/session'
import { createGoogleClient, fetchGoogleProfile } from '../auth/oauth'
import { optionalAuth, authMiddleware } from '../auth/middleware'

interface Variables {
  db: DrizzleDatabase
  auth?: { userId: number; user: any }
}

const app = new Hono<{ Variables: Variables }>()

// Check auth status (no auth required)
app.get('/status', optionalAuth, async (c) => {
  const db = c.get('db') as any
  const [{ value: userCount }] = await db.select({ value: count() }).from(users)
  const needsSetup = userCount === 0
  const auth = c.get('auth') as any

  return c.json({
    needsSetup,
    authenticated: !!auth,
    user: auth ? {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
      role: auth.user.role,
      avatarUrl: auth.user.avatarUrl
    } : null,
    googleEnabled: !!createGoogleClient()
  })
})

// First-run setup - create initial admin
app.post('/setup', async (c) => {
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
  const [user] = await db.insert(users).values({
    name,
    email,
    username: email.split('@')[0],
    passwordHash,
    role: 'admin',
    organisationId: 1
  }).returning()

  const sessionId = await createSession(db, user.id)
  setSessionCookie(c, sessionId)

  return c.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role }
  }, 201)
})

// Self-registration — creates a pending user (role: 'user')
app.post('/register', async (c) => {
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
    const [user] = await db.insert(users).values({
      name,
      email,
      username: email.split('@')[0],
      passwordHash,
      role: 'user',
      organisationId: 1
    }).returning()

    const sessionId = await createSession(db, user.id)
    setSessionCookie(c, sessionId)

    return c.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    }, 201)
  } catch (err: any) {
    if (err.code === '23505' || err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.json({ error: 'An account with this email already exists' }, 409)
    }
    throw err
  }
})

// Login with email + password
app.post('/login', async (c) => {
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
    user: { id: user.id, email: user.email, name: user.name, role: user.role }
  })
})

// Logout
app.post('/logout', authMiddleware, async (c) => {
  const db = c.get('db') as any
  const sessionId = getSessionCookie(c)
  if (sessionId) {
    await deleteSession(db, sessionId)
  }
  clearSessionCookie(c)
  return c.json({ success: true })
})

// Get current user
app.get('/me', authMiddleware, async (c) => {
  const auth = c.get('auth') as any
  return c.json({
    id: auth.user.id,
    email: auth.user.email,
    username: auth.user.username,
    name: auth.user.name,
    role: auth.user.role,
    avatarUrl: auth.user.avatarUrl
  })
})

// Change password
app.put('/password', authMiddleware, async (c) => {
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
  await db.update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, auth.user.id))

  return c.json({ success: true })
})

// Google OAuth - initiate
app.get('/google', async (c) => {
  const google = createGoogleClient()
  if (!google) {
    return c.json({ error: 'Google OAuth not configured' }, 400)
  }

  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const url = google.createAuthorizationURL(state, codeVerifier, ['openid', 'email', 'profile'])

  setCookie(c, 'oauth_state', state, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 600 })
  setCookie(c, 'oauth_code_verifier', codeVerifier, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 600 })

  return c.redirect(url.toString())
})

// Google OAuth - callback
app.get('/google/callback', async (c) => {
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
    const [existingOauth] = await db.select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.providerUserId, profile.sub))

    let userId: number

    if (existingOauth) {
      userId = existingOauth.userId
      // Update tokens
      await db.update(oauthAccounts)
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
        const [newUser] = await db.insert(users).values({
          email: profile.email,
          username,
          name: profile.name,
          role: userCount === 0 ? 'admin' : 'user',
          avatarUrl: profile.picture,
          organisationId: 1
        }).returning()
        userId = newUser.id
      }

      // Link oauth account
      await db.insert(oauthAccounts).values({
        userId,
        provider: 'google',
        providerUserId: profile.sub,
        accessToken
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
