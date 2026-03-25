# tests/ — Testing Guide

Integration tests using [Vitest](https://vitest.dev). Tests run against a real SQLite DB with the full migration history applied — no mocks of the DB layer.

## Run Tests

```bash
npm test               # All tests
npx vitest run tests/my-test.ts   # Single file
npx vitest watch       # Watch mode
```

## Helpers

### `helpers/test-db.ts`

Creates a fresh in-memory SQLite database with all migrations applied:

```ts
import { createTestDb, seedAdminUser, seedMemberUser } from './helpers/test-db'

const { db } = createTestDb()
const admin = await seedAdminUser(db)
const member = await seedMemberUser(db)
```

Each test file should call `createTestDb()` in a `beforeEach` so tests are fully isolated.

### `helpers/test-app.ts`

Mounts a Hono route handler with injected `db`, `auth`, and `ability` context — no real HTTP server:

```ts
import { mountRoute, jsonRequest } from './helpers/test-app'
import myRoute from '../src/routes/my-route'

const app = mountRoute(myRoute, { db, user: admin })

// Make requests directly
const res = await jsonRequest(app, 'POST', '/test/resource', { name: 'Test' })
expect(res.status).toBe(201)
const body = await res.json()
```

The `prefix` argument (default `/test`) is the base path within the test app.

## Writing a New Test

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, seedAdminUser } from './helpers/test-db'
import { mountRoute, jsonRequest } from './helpers/test-app'
import myRoute from '../src/routes/my-route'

describe('my-route', () => {
  let db: any
  let admin: any
  let app: any

  beforeEach(async () => {
    ({ db } = createTestDb())
    admin = await seedAdminUser(db)
    app = mountRoute(myRoute, { db, user: admin })
  })

  it('creates a resource', async () => {
    const res = await jsonRequest(app, 'POST', '/test/', { name: 'Foo' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('Foo')
  })

  it('returns 403 for members', async () => {
    const { db: db2 } = createTestDb()
    const member = await seedMemberUser(db2)
    const memberApp = mountRoute(myRoute, { db: db2, user: member })
    const res = await jsonRequest(memberApp, 'DELETE', '/test/1')
    expect(res.status).toBe(403)
  })
})
```

## What to Test

- Happy path CRUD for each route
- Permission enforcement (admin vs member vs unauthenticated)
- Edge cases: not found, validation errors, duplicate records
- Any service-level logic with non-trivial branching (`cube-compiler.test.ts` is a good example)

## What Not to Test

- Framework behaviour (Hono routing, Drizzle SQL generation)
- UI rendering — the frontend has no test suite yet; rely on TypeScript and manual testing
