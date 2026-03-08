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

  // Initialize all connections and compile cubes from DB
  await initializeConnections()

  logEmailConfig()

  console.log(`Starting Drizby server on http://localhost:${port}`)
  console.log(`Analytics API: http://localhost:${port}/cubejs-api/v1/meta`)

  serve({
    fetch: app.fetch,
    port,
  })

  console.log(`Server running on port ${port}`)
}

start().catch(err => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
