/**
 * Helper: create a Hono test app with db and auth context injected.
 * Wraps route modules for integration testing via app.request().
 */

import { Hono } from 'hono'
import { defineAbilitiesFor } from '../../src/permissions/abilities'

interface MountOptions {
  db: any
  user?: { id: number; name: string; email: string; role: string }
}

/**
 * Mount a Hono route handler with injected db/auth/ability context.
 * Usage: const app = mountRoute(groupsApp, { db, user: adminUser })
 */
export function mountRoute(routeApp: Hono<any>, opts: MountOptions, prefix = '/test') {
  const app = new Hono()
  app.use('*', async (c, next) => {
    const ctx = c as any
    ctx.set('db', opts.db)
    if (opts.user) {
      ctx.set('auth', { userId: opts.user.id, user: opts.user })
      ctx.set('ability', defineAbilitiesFor(opts.user.role))
    }
    await next()
  })
  app.route(prefix, routeApp)
  return app
}

/** Shorthand: make a JSON request */
export function jsonRequest(
  app: Hono,
  method: string,
  path: string,
  body?: Record<string, unknown>
) {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body) init.body = JSON.stringify(body)
  return app.request(path, init)
}
