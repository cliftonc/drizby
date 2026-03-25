import type { Context, Next } from 'hono'

interface RateLimitEntry {
  count: number
  resetAt: number
}

export function createRateLimiter(maxRequests: number, windowMs: number) {
  const store = new Map<string, RateLimitEntry>()

  // Prune expired entries every windowMs
  setInterval(
    () => {
      const now = Date.now()
      for (const [key, entry] of store.entries()) {
        if (now >= entry.resetAt) {
          store.delete(key)
        }
      }
    },
    Math.max(windowMs, 10_000)
  ).unref?.()

  return async function rateLimitMiddleware(c: Context, next: Next) {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      'unknown'

    const now = Date.now()
    let entry = store.get(ip)

    if (!entry || now >= entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs }
      store.set(ip, entry)
    } else {
      entry.count++
    }

    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)

    if (entry.count > maxRequests) {
      c.header('Retry-After', String(retryAfter))
      c.header('X-RateLimit-Limit', String(maxRequests))
      c.header('X-RateLimit-Remaining', '0')
      c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))
      return c.json({ error: 'Too many requests' }, 429)
    }

    c.header('X-RateLimit-Limit', String(maxRequests))
    c.header('X-RateLimit-Remaining', String(maxRequests - entry.count))
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))

    await next()
  }
}
