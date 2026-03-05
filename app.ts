/**
 * DC-BI Hono application
 * Configurable BI platform powered by drizzle-cube
 */

import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { createCubeApp } from 'drizzle-cube/adapters/hono'
import type { SecurityContext, DrizzleDatabase } from 'drizzle-cube/server'
import { schema } from './schema'
import { allCubes } from './cubes'
import connectionsApp from './src/routes/connections'
import cubeDefsApp from './src/routes/cube-definitions'
import analyticsApp from './src/routes/analytics-pages'
import notebooksApp from './src/routes/notebooks'

interface Variables {
  db: DrizzleDatabase
}

const defaultConnectionString = 'postgresql://dc_bi_user:dc_bi_pass123@localhost:54930/dc_bi_db'
const client = postgres(process.env.DATABASE_URL || defaultConnectionString)
const db = drizzle(client, { schema })

async function extractSecurityContext(_c: unknown): Promise<SecurityContext> {
  return {
    organisationId: 1,
    userId: 1
  }
}

const app = new Hono<{ Variables: Variables }>()

// Middleware
app.use('*', logger())
app.use('*', cors({
  origin: ['http://localhost:3460', 'http://localhost:3461'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Agent-Api-Key', 'X-Agent-Provider', 'X-Agent-Model', 'X-Agent-Base-URL'],
  credentials: true
}))

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'DC-BI Analytics Platform',
    version: '0.1.0',
    status: 'running'
  })
})

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Mount the cube API routes (built-in demo cubes)
const cubeApp = createCubeApp({
  cubes: allCubes,
  drizzle: db as DrizzleDatabase,
  schema,
  extractSecurityContext,
  engineType: 'postgres',
  cors: {
    origin: ['http://localhost:3460', 'http://localhost:3461'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Agent-Api-Key', 'X-Agent-Provider', 'X-Agent-Model', 'X-Agent-Base-URL'],
    credentials: true
  },
  agent: {
    allowClientApiKey: true,
    maxTurns: 25
  }
})

app.route('/', cubeApp)

// Inject db into all API routes
app.use('/api/*', async (c, next) => {
  c.set('db', db as DrizzleDatabase)
  await next()
})

// Mount platform API routes
app.route('/api/connections', connectionsApp)
app.route('/api/cube-definitions', cubeDefsApp)
app.route('/api/analytics-pages', analyticsApp)
app.route('/api/notebooks', notebooksApp)

// Error handling
app.onError((err, c) => {
  console.error('Application error:', err)
  return c.json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  }, 500)
})

app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404)
})

export default app
export { db }
