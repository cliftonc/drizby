# Drizby

**[www.drizby.com](https://www.drizby.com)**

![Drizby](docs/images/drizby_3.png)

Drizby is an open-source BI app built around [drizzle-cube](https://try.drizzle-cube.dev). It lets you connect a database, define or import Drizzle schemas, build cube definitions, and explore the results through dashboards, notebooks, and a visual analysis builder.

> **Status:** active work in progress. The README below reflects what is in the repo today.

## What Drizby does today

- Runs as a self-hosted web app with an onboarding flow and demo seed data
- Manages database connections and compiles a semantic layer per connection
- Lets admins author Drizzle schema files and cube definitions in the browser
- Can run `drizzle-kit pull` from the app to bootstrap schema files from an existing database
- Includes AI-assisted cube planning/generation when an AI provider is configured
- Provides dashboards, notebook-style analysis, and a no-code analysis builder
- Supports role-based app access (`admin`, `member`, `user/pending approval`)

## Important scope notes

- **Single-tenant today:** the codebase stores `organisationId` on records, but the app currently runs with that value hardcoded to `1`. Treat the current product as a single workspace deployment, not full multi-tenant SaaS.
- **Schema pull has limits:** Drizby shells out to `drizzle-kit pull`, then cleans up the generated file for use in the editor. For PostgreSQL-style dialects it currently targets the `public` schema, and complex generated extras such as indexes/constraints may need manual cleanup after import.
- **AI features are optional:** notebooks still exist without AI configured. AI-assisted cube generation uses the provider configured in Settings, while notebook chat can also use a per-user API key entered in the notebook UI.

## Quick start with Docker

Create a persistent volume, generate two random secrets, then run the published image with the required production env vars:

```bash
docker volume create drizby-data
openssl rand -hex 32   # use one value for OAUTH_JWT_SECRET
openssl rand -hex 32   # use another value for ENCRYPTION_SECRET

docker run --rm \
  -p 3461:3461 \
  -e APP_URL=http://localhost:3461 \
  -e OAUTH_JWT_SECRET=replace-with-generated-hex-value \
  -e ENCRYPTION_SECRET=replace-with-generated-hex-value \
  -v drizby-data:/app/data \
  ghcr.io/cliftonc/drizby:main
```

Then open [http://localhost:3461](http://localhost:3461).

On first run you will create the initial admin account in the setup wizard, then Drizby seeds a demo SQLite connection with sample data/content so you can explore the product immediately.

### Docker notes

- **External app port:** `3461`
- **Internal Node port inside the container:** `3462` (used behind Caddy; you do **not** need to publish it)
- **Persistent app data path:** `/app/data`
- The named volume stores the internal app database and local file-based data used by the container.
- If you publish a different host port, set `APP_URL` to the public URL users will actually open.
  - Example: `-p 8080:3461` => `APP_URL=http://localhost:8080`
- To reset a local Docker install completely:

```bash
docker rm -f $(docker ps -aq --filter ancestor=ghcr.io/cliftonc/drizby:main) 2>/dev/null || true
docker volume rm drizby-data
```

### Optional Docker env vars

These are not required for a basic local run, but are supported by the app:

- `ADMIN_EMAIL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` to auto-create the admin account and send a setup/reset email
- `APP_NAME` to customize instance branding

## Build the Docker image yourself

```bash
git clone https://github.com/cliftonc/drizby.git
cd drizby
docker build -t drizby .
openssl rand -hex 32   # use one value for OAUTH_JWT_SECRET
openssl rand -hex 32   # use another value for ENCRYPTION_SECRET
docker run --rm \
  -p 3461:3461 \
  -e APP_URL=http://localhost:3461 \
  -e OAUTH_JWT_SECRET=replace-with-generated-hex-value \
  -e ENCRYPTION_SECRET=replace-with-generated-hex-value \
  -v drizby-data:/app/data \
  drizby
```

## Source development

### Prerequisites

- Node.js 24+ recommended (matches the Dockerfile/runtime used in this repo)
- npm

### Setup

```bash
git clone https://github.com/cliftonc/drizby.git
cd drizby
CI=true npm ci --legacy-peer-deps --no-audit --no-fund
npm run setup
```

`npm run setup` generates migrations, applies them, and seeds the local demo content.

### Run the dev servers

```bash
npm run dev
```

That starts:

- **Vite client:** [http://localhost:3460](http://localhost:3460)
- **Backend/API:** [http://localhost:3461](http://localhost:3461)
- Vite proxies `/api`, `/cubejs-api`, `/oauth`, `/.well-known`, `/mcp`, and `/health` to the backend

In normal source development, open **http://localhost:3460**.

### Build and run a local production build

```bash
npm run build
npm start
```

The standalone server listens on `PORT` (default `3461`). In Docker, Caddy listens on `PORT` and proxies to Node on `NODE_PORT` (default `3462`).

## Current capabilities

### Semantic layer and modeling

- Browser-based schema editor with Monaco
- Browser-based cube definition editor with compilation/validation
- Per-connection semantic layer compilation
- Schema import via `drizzle-kit pull`
- AI-assisted cube planning, generation, and join application

### Analysis surfaces

- Dashboards with draggable/resizable grid widgets
- Notebook-style analysis documents with mixed content blocks
- No-code analysis builder for measures, dimensions, and filters
- Chart/table rendering for saved and exploratory analysis

### Connections

The connection registry in the app currently includes presets for:

- PostgreSQL variants: `postgres.js`, `pg`, Neon, Supabase, PGlite, AWS Data API, Aurora DSQL
- MySQL variants: `mysql2`, PlanetScale, TiDB
- SingleStore
- SQLite variants: `better-sqlite3`, LibSQL/Turso
- Databend
- Snowflake
- DuckDB

Each saved connection gets its own schema files, cube definitions, and semantic-layer instance inside Drizby.

### Auth and administration

- Email/password auth
- Role-based permissions (`admin`, `member`, pending `user`)
- Admin approval flow
- Settings UI for AI providers and auth providers
- OAuth/SSO-related routes and settings for Google, GitHub, GitLab, Microsoft, Slack, magic links, and SAML/SCIM configuration

## Typical workflow

1. Start Drizby and create the admin account
2. Add a database connection
3. Pull or write Drizzle schema files
4. Create cube definitions manually or with AI assistance
5. Explore data in the analysis builder or notebooks
6. Save/publish results to dashboards

## Verification commands

The repo includes these main checks:

```bash
npm test
npm run typecheck
npm run lint
```

## Tech stack

| Layer | Technology |
|---|---|
| Semantic layer | [drizzle-cube](https://drizzle.cube) |
| Backend | Hono, TypeScript, Drizzle ORM |
| Frontend | React 18, TanStack Query, Recharts, Tailwind CSS |
| Editor | Monaco |
| Internal app DB | SQLite (`better-sqlite3`) |
| Build tooling | Vite, esbuild/tsx |

## License

MIT
