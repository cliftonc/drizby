# Architect Plan — Issue #5: Public Share Links / Embedded Dashboards

Date: 2026-04-07
Complexity: **medium**

---

## Problem Statement

Dashboards in Drizby (`analyticsPages` table, `schema.ts:78`) are fully auth-gated: every `/api/*` route goes through `authMiddleware` (`src/auth/middleware.ts:22`) and every client route is wrapped in `<AuthGuard>` (`client/src/App.tsx:101`). There is no mechanism to share a read-only view of a dashboard with an unauthenticated user, nor any token table to track or revoke such access. The global CSP in `app.ts:180` sets `frameSrc: ["'none'"]` and `xFrameOptions: 'DENY'`, blocking iframe embedding entirely. Fixing this requires a new database table, new backend routes that bypass `authMiddleware`, token-scoped cubejs-api forwarding, and a new public-facing client page served outside `AuthGuard`.

---

## Summary of Changes

1. **Schema**: new `dashboardShareTokens` table to store revocable, optionally-expiring tokens linked to a dashboard.
2. **Backend — token management API**: authenticated routes on `/api/analytics-pages/:id/share-tokens` for CRUD on tokens (admin/owner only).
3. **Backend — public data API**: unauthenticated routes on `/public/dashboard/:token` to look up and serve the dashboard config, and `/public/cubejs-api/:token/v1/*` to proxy cube queries scoped to that dashboard's connection.
4. **Security headers**: per-route CSP/frame override for the public endpoints to allow iframing.
5. **Frontend — public page**: `PublicDashboardPage.tsx` served at `/public/dashboard/:token`, outside `AuthGuard`, read-only.
6. **Frontend — share UI**: "Share" button on `DashboardViewPage.tsx` for admins/owners to generate and copy a share URL.
7. **Migration**: `npm run db:generate` after schema change.

---

## Files to Modify

### Backend

| File | Change |
|---|---|
| `schema.ts` | Add `dashboardShareTokens` table and relation |
| `app.ts` | Register new public routes before `authMiddleware`; add per-route frame/CSP override |
| `src/routes/analytics-pages.ts` | Add share token CRUD sub-routes under `/:id/share-tokens` |
| `src/routes/public-dashboard.ts` | **New file** — public read route + cube proxy |
| `src/permissions/abilities.ts` | No change needed (share token routes do their own authz checks) |

### Frontend

| File | Change |
|---|---|
| `client/src/App.tsx` | Add `/public/dashboard/:token` route outside `AuthGuard` |
| `client/src/pages/PublicDashboardPage.tsx` | **New file** — read-only dashboard viewer |
| `client/src/pages/DashboardViewPage.tsx` | Add "Share" button + token management UI |
| `client/src/hooks/useShareTokens.ts` | **New file** — TanStack Query hooks for share token CRUD |
| `client/src/types/index.ts` | Add `ShareToken` interface |

### Database

| File | Change |
|---|---|
| `drizzle/NNNN_share_tokens.sql` | Auto-generated migration (run `npm run db:generate`) |

---

## Implementation Approach

### Step 1 — Schema (`schema.ts`)

Add after the `analyticsPages` table:

```ts
export const dashboardShareTokens = sqliteTable(
  'dashboard_share_tokens',
  {
    id: text('id').primaryKey(),                          // 32-char hex (random, opaque)
    dashboardId: integer('dashboard_id')
      .notNull()
      .references(() => analyticsPages.id, { onDelete: 'cascade' }),
    label: text('label'),                                 // human-readable name
    createdBy: integer('created_by')
      .references(() => users.id, { onDelete: 'set null' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),  // null = never
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),  // null = active
    lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
    organisationId: integer('organisation_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  table => [
    index('idx_dst_dashboard').on(table.dashboardId),
    index('idx_dst_org').on(table.organisationId),
  ]
)
```

Add the relation on `analyticsPages` and export from the `schema` object.

Run `npm run db:generate` — commit the generated migration alongside the schema change.

### Step 2 — Token management routes (`src/routes/analytics-pages.ts`)

Add three sub-routes after the existing handlers. These are protected by the existing `authMiddleware` (already applied in `app.ts:307`). Only the dashboard owner or an admin may manage tokens.

```
GET    /api/analytics-pages/:id/share-tokens       → list tokens for dashboard
POST   /api/analytics-pages/:id/share-tokens       → create token (returns id = the URL token)
DELETE /api/analytics-pages/:id/share-tokens/:tid  → revoke (set revokedAt = now)
```

Token creation: `randomBytes(16).toString('hex')` — 32-char hex, stored as-is (the ID is the secret). No JWT wrapping needed because the DB row is the authoritative gate (consistent with how `oauthTokens` works, `app.ts:86-99`).

Ownership check: same pattern as existing PUT/DELETE handlers (`analytics-pages.ts:254-262`).

### Step 3 — Public API routes (`src/routes/public-dashboard.ts`)

New Hono app, mounted in `app.ts` **before** the `authMiddleware` block:

```
GET  /public/dashboard/:token          → resolve token, return { dashboard, connectionId }
ALL  /public/cubejs-api/:token/v1/*    → proxy cube queries for that token's connection
```

Token resolution logic:
1. Look up `dashboardShareTokens` by `id = token`.
2. Reject if not found, `revokedAt IS NOT NULL`, or `expiresAt < now`.
3. Fetch the `analyticsPages` row for the token's `dashboardId` (must be `isActive = true`).
4. Update `lastUsedAt`.
5. Return `{ data: { dashboard: { id, name, description, config, connectionId }, connectionId } }`.

Cube proxy: reuse `getCubeApp(connectionId)` from `app.ts` (export it or inline the lookup). Forward the raw request to the cube app. The semantic layer's `extractSecurityContext` will return an empty/anonymous context — that is acceptable for read-only public access since the cube layer enforces row-level security via security context, and public share implies the token granter accepts that data is visible.

### Step 4 — Security headers for public routes (`app.ts`)

The global `secureHeaders` middleware sets `frameSrc: ["'none'"]` and `xFrameOptions: 'DENY'` (`app.ts:174-198`). For public routes, override these per-route before mounting:

```ts
// In app.ts, before app.route('/public', publicDashboardApp):
app.use('/public/*', async (c, next) => {
  await next()
  // Allow iframing for public dashboard routes
  c.res.headers.delete('X-Frame-Options')
  c.res.headers.set('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors *; object-src 'none'; base-uri 'self'"
  )
})
```

`frame-ancestors *` permits all origins to embed. If the operator wants to restrict, this can later be made configurable via a setting.

CORS: add `/public/*` to the existing `cors()` middleware's `origin` list, or create a separate permissive CORS middleware for public routes (no credentials needed):

```ts
app.use('/public/*', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'] }))
```

### Step 5 — Frontend: public page (`client/src/pages/PublicDashboardPage.tsx`)

- Uses `useParams` to get `token`.
- Fetches `/public/dashboard/:token` (no auth headers — uses `fetch` directly, not the authenticated hooks).
- On success, wraps in `<CubeProvider apiUrl={/public/cubejs-api/${token}/v1} headers={{}} />`.
- Renders `<AnalyticsDashboard config={...} editable={false} />` — read-only.
- No `<Layout>`, no nav, no sidebar — minimal shell with logo/branding only.
- Handles expired/revoked token with a friendly error state.

Route in `App.tsx` — add outside the `AuthGuard` block (parallel to `/login`):

```tsx
<Route path="/public/dashboard/:token" element={<PublicDashboardPage />} />
```

### Step 6 — Frontend: share UI (`client/src/pages/DashboardViewPage.tsx`)

Add a "Share" button visible to `canEdit` users (`DashboardViewPage.tsx:26`). Opens a modal that:
- Lists existing active tokens (from `GET /api/analytics-pages/:id/share-tokens`).
- Allows creating a new token (POST) with an optional label and expiry.
- Shows the full public URL after creation: `${window.location.origin}/public/dashboard/${token.id}`.
- Provides a copy-to-clipboard button.
- Allows revoking tokens (DELETE).

Use `useConfirm()` for revoke confirmation per `client/CLAUDE.md` modal rules. Extract logic into `client/src/hooks/useShareTokens.ts`.

---

## Risks and Edge Cases

### Security
- **Token is the secret**: the `id` is a 128-bit random value, which is sufficient entropy. It must be treated as a secret — never logged in full, and only returned once at creation time (subsequent GET lists should not return the raw token; return a masked version or just the first 8 chars + `...` for display).
- **Cube security context**: public viewers will have `userId: 0` / empty groups in the semantic layer security context. If cubes use row-level security tied to user/group, data visible via public links may differ from what the sharer sees. This should be documented clearly in the UI.
- **Rate limiting**: the `/public/*` routes are unauthenticated and should be rate-limited. The existing `createRateLimiter` in `src/auth/rate-limit.ts` can be applied.
- **Cascade on delete**: the FK `onDelete: 'cascade'` means soft-deleted dashboards (`isActive = false`) still have token rows — the public route must check `isActive = true` on the dashboard lookup.

### Architecture
- `getCubeApp` in `app.ts` is currently not exported (`app.ts:369`). The public route handler will need it — either export it or move the lookup logic into a shared service.
- The cube proxy in the public route needs to strip the `:token` prefix from the URL before forwarding to the cube app, which expects `/cubejs-api/v1/*` paths.
- The `CubeProvider` in `PublicDashboardPage` will need `apiUrl` set to `/public/cubejs-api/${token}/v1` and `credentials: 'omit'` (no session cookies for public routes).

### iframe embedding
- `frame-ancestors *` is intentionally permissive. If stricter embedding policy is needed later, add an `allowed_origins` field to `dashboardShareTokens`.
- The SPA client served at `/public/dashboard/:token` also needs to be reachable in production (Caddy static serve or the Hono static fallback handles this already since it serves `index.html` for all non-API paths).

---

## Test Strategy

Add `tests/public-dashboard.test.ts`:

1. **Token creation** — admin creates a token for a dashboard → returns 201 with token id.
2. **Token listing** — admin lists tokens → sees the created token.
3. **Token revocation** — admin revokes token → 204; subsequent public fetch returns 404/410.
4. **Public fetch — valid token** → 200 with dashboard config.
5. **Public fetch — revoked token** → 401.
6. **Public fetch — expired token** → 401.
7. **Public fetch — nonexistent token** → 404.
8. **Ownership check** — member who did not create the dashboard cannot create/revoke tokens → 403.
9. **Cascade** — soft-deleted dashboard (isActive = false) returns 404 on public fetch even with valid token.

Use `createTestDb()` + `mountRoute()` following the established pattern in `tests/helpers/`.

---

## Complexity

**Medium.** The feature touches schema, backend routing, frontend routing, and security headers, but each piece is straightforward and follows established patterns in the codebase. The main non-trivial parts are: (1) exporting/sharing `getCubeApp` for the public cube proxy, and (2) getting the CSP/frame header override correct without breaking the global middleware.

Estimated implementation: 4-6 hours of focused work.
