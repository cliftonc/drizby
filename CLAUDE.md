# Drizby Project Guidelines

## Overview

Drizby is a full-featured BI platform built on [drizzle-cube](https://drizzle.cube). It provides dashboards, agentic AI notebooks, a visual analysis builder, a schema/cube editor, and multi-connection database management — all powered by a semantic layer.

## Tech Stack

- **Backend:** Hono (TypeScript), Drizzle ORM, SQLite (internal DB)
- **Frontend:** React 18, React Router, TanStack Query, Recharts, Tailwind CSS, Monaco Editor
- **Semantic Layer:** drizzle-cube — compiles Drizzle schemas into analytics cubes
- **AI:** Anthropic Claude, OpenAI, Google Gemini (configurable)
- **Auth:** Session-based with Google OAuth, CASL role-based permissions

## Project Structure

```
app.ts                  # Hono app setup, route mounting, static serving
src/
  index.ts              # Server entry point (port 3461)
  routes/               # API route handlers
    auth.ts             # Login, register, setup, OAuth, sessions
    connections.ts      # Database connection CRUD + testing
    schema-files.ts     # Drizzle schema editing, introspection, AI cube gen
    cube-definitions.ts # Cube CRUD, compilation, registration
    analytics-pages.ts  # Dashboard CRUD, thumbnails, config
    notebooks.ts        # Agentic notebook CRUD
    users.ts            # User management (admin)
    settings.ts         # AI provider config, factory reset
    editor-types.ts     # .d.ts files for Monaco autocomplete
  services/
    connection-manager.ts  # Per-connection Drizzle + SemanticLayerCompiler instances
    cube-compiler.ts       # TypeScript compilation of schemas and cubes
    ai-settings.ts         # AI provider config reader
  auth/                 # Session, password, OAuth, middleware
  permissions/          # CASL role-based access control
  db/                   # Database connection and helpers
schema.ts               # Drizzle schema for internal SQLite DB
client/
  src/
    pages/              # React page components
    components/         # Shared UI (Modal, Layout, AuthGuard, etc.)
    hooks/              # useConnections, useConfirm, usePrompt, etc.
    contexts/           # AuthContext
    theme/              # CSS variables, theming
```

## Running

```bash
npm run dev          # Start client (3460) + server (3461) with hot reload
npm run setup        # Generate migrations, run them, seed demo data
npm run build:client # TypeScript check + Vite production build
```

## Database Migrations

- **Never use `drizzle-kit push`** — it applies changes directly to the DB without creating migration files, causing the migration runner to fail on duplicate changes. Always use `drizzle-kit generate` to create migration files, then let the app's `migrate()` call apply them on startup.
- Migration files live in `drizzle/` and are tracked in `drizzle/meta/_journal.json`.

## UI Rules

- **Never use browser `alert()`, `confirm()`, or `prompt()` dialogs.** Use the generic `Modal`, `ConfirmModal`, and `PromptModal` components from `client/src/components/Modal.tsx`, or the `useConfirm` / `usePrompt` hooks from `client/src/hooks/` for imperative flows.

## Dev API Access

In dev mode (`NODE_ENV !== 'production'`), all API endpoints accept a Bearer token for auth bypass:

```
Authorization: Bearer dc-bi-dev-key
```

This works on both `/api/*` and `/cubejs-api/*` routes. The key defaults to `dc-bi-dev-key` and can be overridden via `DEV_API_KEY` env var. Authenticates as admin user (id: 1).

Example: `curl -H 'Authorization: Bearer dc-bi-dev-key' http://localhost:3461/cubejs-api/v1/meta`

## Pre-commit Checks

**Always run these before committing:**

```bash
npm run lint          # Biome lint + format check
npx tsc --noEmit      # TypeScript type check
npm test              # Vitest tests
```

All three must pass — CI will reject the push otherwise.

## Key Architecture Notes

- **Multi-connection:** Each database connection gets its own Drizzle instance and SemanticLayerCompiler. Cubes are registered per connection.
- **Semantic layer:** drizzle-cube sits between queries and the database. It translates cube queries to SQL with security context enforcement.
- **Cube API:** All `/cubejs-api/*` routes proxy through drizzle-cube's semantic layer.
- **Soft deletes:** Dashboards and notebooks use `isActive` flag.
- **Organisation scoping:** All data is scoped by `organisationId` (currently single-tenant, hardcoded to 1).
- **Demo seeding:** On first startup with no connections, a demo SQLite database with sample data, cubes, and a dashboard is auto-created.
