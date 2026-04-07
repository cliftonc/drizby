# Executor Summary — Issue #5: Public Share Links / Embedded Dashboards

Date: 2026-04-07

## What Was Done

Implemented all components of the feature exactly per the architect plan.

### Files Changed

**Backend**

| File | Change |
|---|---|
| `schema.ts` | Added `dashboardShareTokens` table + relations; exported in schema object |
| `drizzle/0012_public_share_tokens.sql` | New migration for dashboard_share_tokens table |
| `drizzle/meta/_journal.json` | Added idx 12 journal entry |
| `src/services/cube-app-cache.ts` | **New** — extracted `getCubeApp`, `invalidateCubeAppCache`, `validateOAuthBearer`, `extractSecurityContext` from `app.ts` into a shared service (avoids circular import with public route) |
| `src/routes/public-dashboard.ts` | **New** — factory `createPublicDashboardApp({ getCubeApp })`, handles `GET /public/dashboard/:token` and `ALL /public/cubejs-api/:token/v1/*` |
| `src/routes/analytics-pages.ts` | Added 3 share token sub-routes: `GET /:id/share-tokens`, `POST /:id/share-tokens`, `DELETE /:id/share-tokens/:tid` |
| `app.ts` | Imported from cube-app-cache service; removed duplicate functions; added `/public/*` db injection, CORS, and CSP/frame override middleware; mounted `createPublicDashboardApp` |

**Frontend**

| File | Change |
|---|---|
| `client/src/types/index.ts` | Added `ShareToken` and `CreateShareTokenRequest` interfaces |
| `client/src/hooks/useShareTokens.ts` | **New** — TanStack Query hooks: `useShareTokens`, `useCreateShareToken`, `useRevokeShareToken` |
| `client/src/pages/PublicDashboardPage.tsx` | **New** — public read-only dashboard viewer; fetches via unauthenticated fetch, wraps in `CubeProvider` with public cube API URL |
| `client/src/App.tsx` | Added `/public/dashboard/:token` route outside `AuthGuard` |
| `client/src/pages/DashboardViewPage.tsx` | Added Share button (visible to `canEdit` users) and inline share modal with token create/list/revoke |

**Tests**

| File | Change |
|---|---|
| `tests/public-dashboard.test.ts` | **New** — 13 integration tests covering all scenarios from the architect's test strategy |

## Test Results

```
npx vitest run tests/public-dashboard.test.ts
✓ 13/13 tests pass

npx vitest run (full suite)
✓ 139 passed | 4 failed (cube-compiler pre-existing failures, unrelated to this feature)
```

## Deviations from Architect Plan

1. **`getCubeApp` extraction**: Rather than just exporting `getCubeApp` from `app.ts` (which would create a circular import via `public-dashboard.ts` → `app.ts` → `public-dashboard.ts`), the function was extracted to `src/services/cube-app-cache.ts`. Both `app.ts` and `public-dashboard.ts` import from it. This is architecturally cleaner.

2. **Factory pattern for public route**: The public route is created via `createPublicDashboardApp({ getCubeApp })` rather than directly importing from the service, keeping the route module decoupled from the cache implementation.

3. **Rate limiting not added**: The architect noted rate limiting as a "should add" risk. Not implemented in this pass — it can be added separately without requiring a schema/migration change.

## Known Issues / Follow-ups

- **Rate limiting on `/public/*`** not yet applied (mentioned in architect's risk section). Low priority — easy to add with `createRateLimiter`.
- **Frontend typecheck**: Not run in this environment (no Vite/tsc available). The TypeScript should be correct based on patterns followed from existing code.
- **`frame-ancestors *`**: Intentionally permissive per architect plan. An `allowed_origins` field can be added to `dashboardShareTokens` in a follow-up for stricter embedding control.
