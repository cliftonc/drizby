# Drizby — Contributor Guide

## What is Drizby?

Drizby is an open-source BI platform powered by [drizzle-cube](https://drizzle.cube). It provides dashboards, agentic AI notebooks, a visual analysis builder, a schema/cube editor, and multi-connection database management — all through a semantic layer that compiles Drizzle ORM schemas into analytics cubes.

**Status:** Under active development. Production deployable via Docker.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Hono (TypeScript), Drizzle ORM |
| Frontend | React 18, React Router, TanStack Query, Recharts, Tailwind CSS |
| Code Editor | Monaco Editor |
| Dashboard Grid | react-grid-layout |
| Semantic Layer | drizzle-cube |
| Internal DB | SQLite (better-sqlite3) |
| User DBs | PostgreSQL, SQLite |
| AI Providers | Anthropic Claude, OpenAI, Google Gemini |
| Auth | Sessions, Google OAuth (Arctic), CASL permissions |
| Tests | Vitest |
| Linter | Biome |

---

## Project Structure

```
app.ts                   # Hono app: route mounting, middleware, static serving
schema.ts                # Drizzle schema for the internal SQLite app DB
src/
  index.ts               # Entry point — starts server on port 3461
  routes/                # API handlers (one file per domain)
    auth.ts              # Login, register, setup, magic link
    oauth.ts             # OAuth callback handler
    connections.ts       # Database connection CRUD + test endpoint
    schema-files.ts      # Drizzle schema editing, introspection, AI cube gen (SSE)
    cube-definitions.ts  # Cube CRUD, compilation, registration with semantic layer
    analytics-pages.ts   # Dashboard CRUD, thumbnails, per-dashboard config
    notebooks.ts         # Agentic notebook CRUD
    dashboards.ts        # Dashboard layout persistence
    ai-routes.ts         # AI streaming routes
    users.ts             # User management (admin only)
    settings.ts          # AI provider config, factory reset
    groups.ts            # Group management
    editor-types.ts      # Serves .d.ts files for Monaco autocomplete
    seed-demo.ts         # Demo seeding endpoint
  services/
    connection-manager.ts   # Manages per-connection Drizzle + SemanticLayerCompiler instances
    cube-compiler.ts        # TypeScript compilation of schemas and cube definitions
    ai-settings.ts          # Reads AI provider configuration
    auto-setup.ts           # First-run setup logic
    connection-masking.ts   # Masks sensitive credentials in API responses
    driver-factory.ts       # Creates DB driver instances per connection type
    email.ts                # Email delivery
    oauth-settings.ts       # OAuth provider config
    provider-registry.ts    # Manages registered semantic layer providers
    typecheck-worker.ts     # Background worker for schema type-checking
  auth/                  # Session, password, OAuth, encryption, middleware
  permissions/           # CASL ability definitions per role
  db/                    # Internal DB connection
client/
  src/
    pages/               # React page components (one per route)
    components/          # Shared UI components
    hooks/               # Custom React hooks
    contexts/            # AuthContext
    theme/               # CSS variables and theming
drizzle/                 # Migration files (auto-generated, committed)
tests/                   # Integration tests
  helpers/               # test-db.ts (in-memory SQLite), test-app.ts (route mounting)
scripts/                 # build-server.ts, migrate.ts, seed.ts
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### First-time setup

```bash
git clone https://github.com/cliftonc/drizby.git
cd drizby
npm install --legacy-peer-deps
npm run setup          # generate migrations → apply them → seed demo data
npm run dev            # client on :3460, server on :3461
```

Open [http://localhost:3460](http://localhost:3460). The setup wizard runs on first boot.

### Docker (production)

```bash
docker run -p 3461:3461 -v drizby-data:/app/data ghcr.io/cliftonc/drizby:main
```

---

## Development Commands

```bash
npm run dev            # Start client (:3460) + server (:3461) with hot reload
npm run dev:server     # Server only (tsx watch)
npm run dev:client     # Client only (Vite HMR)

npm run db:generate    # Generate a new migration from schema.ts changes
npm run db:migrate     # Apply pending migrations
npm run db:seed        # Seed demo data

npm run build          # Full production build (client + server)
npm run build:client   # TypeScript check + Vite build
npm run build:server   # esbuild server bundle

npm run lint           # Biome lint + format check
npm run lint:fix       # Biome lint + format with auto-fix
npm run typecheck      # tsc --noEmit
npm test               # Vitest integration tests
```

---

## Pre-commit Checklist

All three must pass before pushing. CI enforces this.

```bash
npm run lint           # Biome lint + format
npm run typecheck      # TypeScript type check
npm test               # Vitest tests
```

---

## Database Migrations

**Never use `drizzle-kit push`.** It applies changes directly to the DB without creating migration files — the migration runner will then fail with duplicate-change errors on the next startup.

The correct workflow:

1. Edit `schema.ts`
2. `npm run db:generate` — creates a new file in `drizzle/`
3. Commit the generated migration alongside the schema change
4. Migrations run automatically on app startup via `migrate()`

Migration files live in `drizzle/` and are tracked in `drizzle/meta/_journal.json`.

---

## Architecture Notes

### Multi-connection semantic layer

Each database connection gets its own Drizzle instance and `SemanticLayerCompiler`. When a cube is compiled and registered, it lives under that connection's provider. `connection-manager.ts` owns this lifecycle.

### Cube query path

All `/cubejs-api/*` routes proxy through drizzle-cube's semantic layer, which translates cube queries to SQL with security context enforcement. The semantic layer is the only thing that touches user databases.

### Auth flow

`authMiddleware` (in `src/auth/middleware.ts`) supports three modes in order:
1. Dev API key (`Bearer dc-bi-dev-key` in non-production)
2. OAuth bearer tokens (opaque or JWT-wrapped)
3. Session cookies

### Permissions

CASL abilities are defined per role in `src/permissions/abilities.ts`. The three roles are `admin`, `member`, and `user` (pending approval). Abilities are set on the Hono context by `authMiddleware` and consumed via `c.get('ability')` in route handlers.

### Organisation scoping

All data is scoped by `organisationId`. Currently single-tenant (hardcoded to 1), but the column exists on every table in preparation for multi-tenancy.

### Soft deletes

Dashboards and notebooks use an `isActive` flag rather than hard deletes.

### Demo seeding

On first boot with no connections configured, `auto-setup.ts` creates a demo SQLite database with sample employee/productivity data, cube definitions, and a pre-built dashboard.

---

## UI Rules

- **Never use `alert()`, `confirm()`, or `prompt()`** — they block the main thread and look terrible. Use:
  - `<Modal>`, `<ConfirmModal>`, `<PromptModal>` from `client/src/components/Modal.tsx`
  - `useConfirm()` / `usePrompt()` hooks from `client/src/hooks/` for imperative flows
- CSS variables and theming live in `client/src/theme/`. Dark/light mode is toggled via `ThemeToggle` and stored in `localStorage`.

---

## Testing

Tests are integration tests, not unit tests. Each test creates a fresh in-memory SQLite database with the full migration history applied.

```ts
// tests/helpers/test-db.ts
const { db } = createTestDb()         // in-memory SQLite, all migrations applied

// tests/helpers/test-app.ts
const app = mountRoute(routeApp, { db, user: adminUser })  // inject auth + db into Hono app
```

To add tests for a route:
1. Import the route handler
2. `createTestDb()` + seed any required fixtures
3. `mountRoute()` to build a testable app
4. Use `app.request()` directly (no HTTP server needed)

---

## Dev API Bypass

In dev mode (`NODE_ENV !== 'production'`), all API routes accept a bearer token for auth bypass:

```
Authorization: Bearer dc-bi-dev-key
```

Works on both `/api/*` and `/cubejs-api/*`. Authenticates as admin user (id: 1). Override the key with `DEV_API_KEY` env var.

```bash
curl -H 'Authorization: Bearer dc-bi-dev-key' http://localhost:3461/api/connections
curl -H 'Authorization: Bearer dc-bi-dev-key' http://localhost:3461/cubejs-api/v1/meta
```

---

## Adding a New Feature

### Backend route

1. Create or extend a file in `src/routes/`
2. Register it in `app.ts`
3. Add CASL ability checks via `c.get('ability').can(action, subject)` — see existing routes for the pattern
4. Write a test in `tests/` using `createTestDb` + `mountRoute`

### Frontend page

1. Create a page component in `client/src/pages/`
2. Add a route in `client/src/App.tsx` (or wherever routes are declared)
3. Wrap with `<AuthGuard>` if auth is required
4. Use TanStack Query for data fetching — see existing pages for the pattern

### Schema change

1. Edit `schema.ts`
2. `npm run db:generate`
3. Commit the generated migration file
4. Update any affected routes, services, and tests

---

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | — | `production` disables dev API key bypass |
| `DEV_API_KEY` | `dc-bi-dev-key` | Bearer token for dev auth bypass |
| `PORT` | `3461` | Server port |
| `DATABASE_URL` | `./data/drizby.db` | Path to internal SQLite DB |
| `OAUTH_JWT_SECRET` | — | Required in production: stable JWT signing secret for OAuth tokens |
| `ENCRYPTION_SECRET` | — | Required in production: AES-256-GCM key for secrets at rest |

AI provider keys are configured at runtime through the Settings UI and stored in the database.
