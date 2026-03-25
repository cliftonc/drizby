# src/ — Backend Guide

The backend is a [Hono](https://hono.dev) app in TypeScript. All API routes are under `/api/*`; cube/semantic layer routes are under `/cubejs-api/*`.

## Structure

```
src/
  index.ts              # Entry point — creates DB, runs migrations, starts server on :3461
  routes/               # API handlers
  services/             # Business logic, no HTTP context
  auth/                 # Session, password, OAuth, middleware
  permissions/          # CASL abilities
  db/                   # Internal DB connection (better-sqlite3 + Drizzle ORM)
```

## Writing a Route

Routes use Hono. Every route handler gets `db`, `auth`, and `ability` from context:

```ts
import { Hono } from 'hono'
import { guardAbility } from '../permissions/guard'

const app = new Hono<{ Variables: { db: any; auth: any; ability: any } }>()

app.get('/', async (c) => {
  const db = c.get('db')
  const ability = c.get('ability')
  guardAbility(ability, 'read', 'Connection')   // throws 403 if not allowed
  // ...
  return c.json({ data })
})

export default app
```

Register the route in `app.ts`:

```ts
app.route('/api/my-thing', myThingRoute)
```

## Auth Middleware

`src/auth/middleware.ts` — runs on every `/api/*` and `/cubejs-api/*` request. Sets `auth` and `ability` on context. Three auth paths:

1. Dev bearer token (`Bearer dc-bi-dev-key`) — skipped in production
2. OAuth bearer token (opaque or JWT-wrapped)
3. Session cookie

## Permissions

Roles: `admin`, `member`, `user` (pending). Abilities defined in `src/permissions/abilities.ts`.

```ts
// Check in a route:
const ability = c.get('ability')
if (!ability.can('update', 'Dashboard')) return c.json({ error: 'Forbidden' }, 403)

// Or use the guard helper (throws 403):
guardAbility(ability, 'update', 'Dashboard')
```

Members cannot manage connections, schemas, cubes, or users — those are admin-only.

## Services

Services are plain TypeScript modules — no Hono context. They receive `db` and typed parameters.

Key services:

- **`connection-manager.ts`** — `getConnectionInstance(connectionId)` returns a `{ db, compiler }` pair. Each connection gets its own Drizzle instance and SemanticLayerCompiler.
- **`cube-compiler.ts`** — compiles TypeScript schema/cube strings; used by the schema editor.
- **`connection-masking.ts`** — strips sensitive fields (passwords, secret keys) from connection objects before returning to clients.
- **`driver-factory.ts`** — creates DB driver instances for PostgreSQL and SQLite connections.

## Error Handling

Return structured JSON errors:

```ts
return c.json({ error: 'Not found' }, 404)
return c.json({ error: 'Validation failed', details: [...] }, 422)
```

Log unexpected errors with context — don't swallow them silently.

## Organisation Scoping

All queries must scope by `organisationId`. Currently hardcoded to 1 — but the column is on every table and every query should filter on it for future multi-tenancy readiness.

```ts
.where(and(eq(table.organisationId, 1), eq(table.id, id)))
```
