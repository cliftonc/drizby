/**
 * Drizby server entry point
 */

import 'dotenv/config'
import { serve } from '@hono/node-server'
import app, { initializeConnections } from '../app'
import { db, runMigrations } from './db/index'
import { runAutoSetup } from './services/auto-setup'
import { logEmailConfig } from './services/email'
import { cleanupExpiredOAuthData } from './services/oauth-cleanup'

// Validate required production secrets
if (process.env.NODE_ENV === 'production' && !process.env.ENCRYPTION_SECRET) {
  throw new Error(
    '[FATAL] ENCRYPTION_SECRET is not set. The server cannot start in production without a stable encryption key. Set the ENCRYPTION_SECRET environment variable.'
  )
}
if (process.env.NODE_ENV === 'production' && !process.env.APP_URL) {
  throw new Error(
    '[FATAL] APP_URL is not set. Required in production for OAuth metadata endpoints. Set the APP_URL environment variable (e.g. https://drizby.example.com).'
  )
}

// In Docker, NODE_PORT is the internal port (Caddy proxies from PORT)
// In dev/standalone, PORT is used directly
const port = Number.parseInt(process.env.NODE_PORT || process.env.PORT || '3461')

async function start() {
  // Run migrations
  console.log('Running migrations...')
  runMigrations()

  // Auto-setup: create admin if ADMIN_EMAIL + RESEND_API_KEY are set
  await runAutoSetup(db)

  logEmailConfig()

  console.log(`Starting Drizby server on http://localhost:${port}`)
  console.log(`Analytics API: http://localhost:${port}/cubejs-api/v1/meta`)

  // Start server FIRST so it accepts requests immediately
  serve({
    fetch: app.fetch,
    port,
  })

  console.log(`Server running on port ${port}`)

  // Initialize connections and compile cubes in the background
  initializeConnections().catch(err => {
    console.error('Connection initialization failed:', err)
  })

  // Periodic cleanup of expired OAuth tokens and auth codes (every hour)
  setInterval(async () => {
    try {
      const result = await cleanupExpiredOAuthData(db)
      if (result.tokens > 0 || result.codes > 0) {
        console.log(
          `[oauth-cleanup] Removed ${result.tokens} expired tokens, ${result.codes} expired auth codes`
        )
      }
    } catch (err) {
      console.error('[oauth-cleanup] Error:', err)
    }
  }, 60 * 60_000).unref()
}

start().catch(err => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
