/**
 * Drizby server entry point
 */

import 'dotenv/config'
import { serve } from '@hono/node-server'
import app, { initializeConnections } from '../app'
import { db, runMigrations } from './db/index'
import { runAutoSetup } from './services/auto-setup'
import { logEmailConfig } from './services/email'

const port = Number.parseInt(process.env.PORT || '3461')

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
}

start().catch(err => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
