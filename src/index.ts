/**
 * DC-BI server entry point
 */

import 'dotenv/config'
import { serve } from '@hono/node-server'
import app, { initializeConnections } from '../app'

const port = parseInt(process.env.PORT || '3461')

async function start() {
  // Initialize all connections and compile cubes from DB
  await initializeConnections()

  console.log(`Starting DC-BI server on http://localhost:${port}`)
  console.log(`Analytics API: http://localhost:${port}/cubejs-api/v1/meta`)

  serve({
    fetch: app.fetch,
    port
  })

  console.log(`Server running on port ${port}`)
}

start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
