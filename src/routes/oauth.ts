/**
 * OAuth 2.1 endpoints for MCP client authentication.
 *
 * Implements:
 * - RFC 9728 Protected Resource Metadata
 * - RFC 8414 Authorization Server Metadata
 * - RFC 7591 Dynamic Client Registration
 * - Authorization Code + PKCE flow
 * - Token endpoint (authorization_code + refresh_token)
 * - Token revocation
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { AuthorizationServer } from '@jmondi/oauth2-server'
import {
  handleVanillaError,
  requestFromVanilla,
  responseToVanilla,
} from '@jmondi/oauth2-server/vanilla'
import { Hono } from 'hono'
import { oauthClients } from '../../schema'
import {
  AuthCodeRepository,
  ClientRepository,
  ScopeRepository,
  TokenRepository,
  UserRepository,
} from '../auth/oauth-repositories'
import { createRateLimiter } from '../auth/rate-limit'
import { getSessionCookie, validateSession } from '../auth/session'
import { db } from '../db/index'

// ============================================================================
// Initialize authorization server
// ============================================================================

const clientRepo = new ClientRepository(db)
const tokenRepo = new TokenRepository(db)
const scopeRepo = new ScopeRepository()
const authCodeRepo = new AuthCodeRepository(db)
const userRepo = new UserRepository(db)

if (process.env.NODE_ENV === 'production' && !process.env.OAUTH_JWT_SECRET) {
  throw new Error(
    '[FATAL] OAUTH_JWT_SECRET is not set. The server cannot start in production without a stable JWT secret. Set the OAUTH_JWT_SECRET environment variable.'
  )
}
const JWT_SECRET = process.env.OAUTH_JWT_SECRET || randomBytes(32).toString('hex')

const authorizationServer = new AuthorizationServer(clientRepo, tokenRepo, scopeRepo, JWT_SECRET, {
  requiresPKCE: true,
  requiresS256: true,
})

authorizationServer.enableGrantTypes(
  { grant: 'authorization_code', authCodeRepository: authCodeRepo, userRepository: userRepo },
  'refresh_token'
)

// ============================================================================
// Helpers
// ============================================================================

function getBaseUrl(c: any): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '')
  }
  // Dev-only fallback: use Host header only (never trust X-Forwarded-* without APP_URL)
  const host = c.req.header('host') || 'localhost:3461'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  return `${proto}://${host}`
}

// ============================================================================
// Well-known metadata (mounted from app.ts at /.well-known/*)
// ============================================================================

export function protectedResourceMetadata(c: any) {
  const base = getBaseUrl(c)
  return c.json({
    resource: base,
    authorization_servers: [base],
    scopes_supported: ['mcp:read'],
    bearer_methods_supported: ['header'],
  })
}

export function authorizationServerMetadata(c: any) {
  const base = getBaseUrl(c)
  return c.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/token/revoke`,
    scopes_supported: ['mcp:read'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
  })
}

// ============================================================================
// OAuth routes
// ============================================================================

const oauthApp = new Hono()

// --- Dynamic Client Registration (RFC 7591) ---
// Open endpoint: MCP clients must be able to register without prior authentication.
// Security is enforced downstream — registered clients still need user authorization
// via the full OAuth 2.1 flow (PKCE + consent) to obtain access tokens.
oauthApp.post('/register', async c => {
  const body = await c.req.json()
  const clientName = body.client_name || 'MCP Client'
  const redirectUris: string[] = body.redirect_uris || []
  const grantTypes: string[] = body.grant_types || ['authorization_code', 'refresh_token']
  const responseTypes: string[] = body.response_types || ['code']

  if (redirectUris.length === 0) {
    return c.json(
      { error: 'invalid_client_metadata', error_description: 'redirect_uris required' },
      400
    )
  }

  // Validate redirect URIs per OAuth 2.1: require https (except localhost), no fragments
  for (const uri of redirectUris) {
    let parsed: URL
    try {
      parsed = new URL(uri)
    } catch {
      return c.json(
        { error: 'invalid_client_metadata', error_description: `Invalid redirect URI: ${uri}` },
        400
      )
    }
    if (
      parsed.protocol !== 'https:' &&
      !(
        parsed.protocol === 'http:' &&
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
      )
    ) {
      return c.json(
        {
          error: 'invalid_client_metadata',
          error_description: 'Redirect URIs must use HTTPS (except localhost)',
        },
        400
      )
    }
    if (parsed.hash) {
      return c.json(
        {
          error: 'invalid_client_metadata',
          error_description: 'Redirect URIs must not contain fragments',
        },
        400
      )
    }
  }

  const clientId = randomBytes(16).toString('hex')

  await db.insert(oauthClients).values({
    id: clientId,
    name: clientName,
    redirectUris,
    allowedGrants: grantTypes,
    scopes: ['mcp:read'],
  })

  return c.json(
    {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      response_types: responseTypes,
      token_endpoint_auth_method: 'none',
    },
    201
  )
})

// --- Authorization endpoint (GET = render consent, POST = approve) ---
oauthApp.get('/authorize', async c => {
  try {
    const oauthRequest = await requestFromVanilla(c.req.raw)
    const authRequest = await authorizationServer.validateAuthorizationRequest(oauthRequest)

    // Check if user is logged in via session cookie
    const sessionId = getSessionCookie(c)
    if (!sessionId) {
      const returnTo = `/oauth/authorize?${new URL(c.req.url).searchParams.toString()}`
      return c.redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`)
    }

    const result = await validateSession(db as any, sessionId)
    if (!result) {
      const returnTo = `/oauth/authorize?${new URL(c.req.url).searchParams.toString()}`
      return c.redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`)
    }

    // Store auth request params in the consent page so POST can reconstruct
    const clientName = authRequest.client.name || authRequest.client.id
    const scopes = authRequest.scopes.map(s => s.name).join(', ') || 'mcp:read'
    const queryString = new URL(c.req.url).searchParams.toString()

    // Generate CSRF token for consent form protection
    const csrfToken = randomBytes(32).toString('hex')
    c.header(
      'Set-Cookie',
      `csrf_token=${csrfToken}; HttpOnly; SameSite=Strict; Path=/oauth/authorize; Max-Age=600`
    )

    return c.html(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorize - Drizby</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e4e4e7; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #1a1b23; border: 1px solid #2e2f3a; border-radius: 12px; padding: 32px; max-width: 400px; width: 100%; }
    h2 { margin: 0 0 8px; font-size: 20px; }
    p { color: #a1a1aa; font-size: 14px; margin: 0 0 24px; }
    .client { color: #818cf8; font-weight: 600; }
    .scope { background: #2e2f3a; padding: 4px 10px; border-radius: 4px; font-size: 13px; display: inline-block; margin: 4px 2px; }
    .actions { display: flex; gap: 12px; margin-top: 24px; }
    button { flex: 1; padding: 10px; border-radius: 8px; border: none; font-size: 14px; font-weight: 500; cursor: pointer; }
    .approve { background: #818cf8; color: white; }
    .approve:hover { background: #6366f1; }
    .deny { background: #2e2f3a; color: #a1a1aa; }
    .deny:hover { background: #3f3f46; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Authorize Application</h2>
    <p><span class="client">${escapeHtml(clientName)}</span> wants access to your Drizby account.</p>
    <div>
      <strong style="font-size:13px;">Requested permissions:</strong><br>
      ${scopes
        .split(', ')
        .map(s => `<span class="scope">${escapeHtml(s)}</span>`)
        .join(' ')}
    </div>
    <div class="actions">
      <form method="POST" action="/oauth/authorize?${escapeHtml(queryString)}" style="flex:1;display:flex;">
        <input type="hidden" name="approved" value="0">
        <input type="hidden" name="csrf_token" value="${csrfToken}">
        <button type="submit" class="deny" style="flex:1">Deny</button>
      </form>
      <form method="POST" action="/oauth/authorize?${escapeHtml(queryString)}" style="flex:1;display:flex;">
        <input type="hidden" name="approved" value="1">
        <input type="hidden" name="csrf_token" value="${csrfToken}">
        <button type="submit" class="approve" style="flex:1">Authorize</button>
      </form>
    </div>
  </div>
</body>
</html>`)
  } catch (e) {
    const oauthResponse = handleVanillaError(e)
    return responseToVanilla(oauthResponse)
  }
})

oauthApp.post('/authorize', async c => {
  try {
    // Read form body BEFORE requestFromVanilla consumes it
    const contentType = c.req.header('content-type') || ''
    let approved = false
    let formCsrfToken = ''
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await c.req.parseBody()
      approved = formData.approved === '1'
      formCsrfToken = String(formData.csrf_token || '')
    } else {
      const body = await c.req.json().catch(() => ({}))
      approved = body.approved === true || body.approved === '1'
      formCsrfToken = String(body.csrf_token || '')
    }

    // Verify CSRF token from form matches the cookie
    const cookieHeader = c.req.header('cookie') || ''
    const csrfCookie =
      cookieHeader
        .split(';')
        .map(s => s.trim())
        .find(s => s.startsWith('csrf_token='))
        ?.split('=')[1] || ''
    if (
      !formCsrfToken ||
      !csrfCookie ||
      formCsrfToken.length !== csrfCookie.length ||
      !timingSafeEqual(Buffer.from(formCsrfToken), Buffer.from(csrfCookie))
    ) {
      return c.json({ error: 'CSRF token mismatch' }, 403)
    }
    // Clear the CSRF cookie after use
    c.header(
      'Set-Cookie',
      'csrf_token=; HttpOnly; SameSite=Strict; Path=/oauth/authorize; Max-Age=0'
    )

    // validateAuthorizationRequest only needs query params, build a GET-like request
    const url = new URL(c.req.url)
    const getRequest = new Request(url.toString(), { method: 'GET' })
    const oauthRequest = await requestFromVanilla(getRequest)
    const authRequest = await authorizationServer.validateAuthorizationRequest(oauthRequest)

    // Verify session
    const sessionId = getSessionCookie(c)
    if (!sessionId) {
      return c.json({ error: 'Not authenticated — no session cookie' }, 401)
    }

    const result = await validateSession(db as any, sessionId)
    if (!result) {
      return c.json({ error: 'Not authenticated — invalid session' }, 401)
    }

    authRequest.user = { id: result.user.id }
    authRequest.isAuthorizationApproved = approved

    const oauthResponse = await authorizationServer.completeAuthorizationRequest(authRequest)
    return responseToVanilla(oauthResponse)
  } catch (e) {
    const oauthResponse = handleVanillaError(e)
    return responseToVanilla(oauthResponse)
  }
})

// --- Token endpoint ---
const tokenLimiter = createRateLimiter(30, 60_000) // 30 requests/min per IP
oauthApp.post('/token', tokenLimiter, async c => {
  try {
    const oauthRequest = await requestFromVanilla(c.req.raw)
    const oauthResponse = await authorizationServer.respondToAccessTokenRequest(oauthRequest)
    return responseToVanilla(oauthResponse)
  } catch (e) {
    const oauthResponse = handleVanillaError(e)
    return responseToVanilla(oauthResponse)
  }
})

// --- Token revocation ---
const revokeLimiter = createRateLimiter(20, 60_000) // 20 requests/min per IP
oauthApp.post('/token/revoke', revokeLimiter, async c => {
  try {
    const oauthRequest = await requestFromVanilla(c.req.raw)
    const oauthResponse = await authorizationServer.revoke(oauthRequest)
    return responseToVanilla(oauthResponse)
  } catch (e) {
    const oauthResponse = handleVanillaError(e)
    return responseToVanilla(oauthResponse)
  }
})

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default oauthApp
