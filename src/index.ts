/**
 * DC-BI server entry point
 */

import 'dotenv/config'
import { serve } from '@hono/node-server'
import app from '../app'

const port = parseInt(process.env.PORT || '3461')

console.log(`Starting DC-BI server on http://localhost:${port}`)
console.log(`Analytics API: http://localhost:${port}/cubejs-api/v1/meta`)

serve({
  fetch: app.fetch,
  port
})

console.log(`Server running on port ${port}`)
