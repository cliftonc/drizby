# Architect Plan — Issue #30: Public Share Links / Embedded Dashboards

Date: 2026-04-07
Complexity: **medium**

---

## Problem Statement

The branch `lastlight/30-feat-public-share-links-and-embedded-das` contains only the guardrails commit (`b6e4341`) on top of `main` (`adc39cc`). The feature described in PR #30 — public share tokens and embeddable dashboards — has NOT been implemented on this branch. The implementation exists in full on a sibling branch (`lastlight/5-public-share-links-embedded-dashboards`, commits `f93defc` through `c3f6370`) and passed review after two fix cycles. The executor must port that complete, reviewed implementation onto this branch.

The current codebase (`schema.ts:78`, `app.ts:173`) has no `dashboardShareTokens` table, no `/public/*` routes, no `src/routes/public-dashboard.ts`, no `src/services/cube-app-cache.ts`, and no frontend share UI. The global CSP at `app.ts:193` sets `frameSrc: ["'none'"]` and the global `xFrameOptions` is `'DENY'`, blocking iframe embedding.

---

## Summary of What Needs to Change

1. **`schema.ts`** — add `dashboardShareTokens` table + relations; export from `schema` object.
2. **Database migration** — `drizzle/0012_public_share_tokens.sql` + `drizzle/meta/_journal.json` entry.
3. **`src/services/cube-app-cache.ts`** — new file; extracts `getCubeApp`, `invalidateCubeAppCache`, `extractSecurityContext`, and `validateOAuthBearer` out of `app.ts` to avoid circular imports.
4. **`app.ts`** — remove extracted functions; import from `cube-app-cache`; add `/public/*` middleware stack (db injection, CORS, CSP override); mount `createPublicDashboardApp`.
5. **`src/routes/public-dashboard.ts`** — new file; `GET /public/dashboard/:token` and `ALL /public/cubejs-api/:token/v1/*`.
6. **`src/routes/analytics-pages.ts`** — add `GET/POST/DELETE /:id/share-tokens` sub-routes; add `isNull` import; add `dashboardShareTokens` and `crypto` imports.
7. **`client/src/types/index.ts`** — add `ShareToken` and `CreateShareTokenRequest` interfaces.
8. **`client/src/hooks/useShareTokens.ts`** — new file; TanStack Query hooks for token CRUD.
9. **`client/src/pages/PublicDashboardPage.tsx`** — new file; read-only dashboard viewer outside AuthGuard.
10. **`client/src/pages/DashboardViewPage.tsx`** — add Share button, share modal state, token list/create/revoke UI.
11. **`client/src/App.tsx`** — add `/public/dashboard/:token` route outside `AuthGuard`.
12. **`tests/public-dashboard.test.ts`** — new file; 13 integration tests covering all token and public-route cases.

---

## Files to Modify

### New files to create

| File | Description |
|---|---|
| `src/services/cube-app-cache.ts` | Extracted cube app cache, security context, OAuth bearer validation |
| `src/routes/public-dashboard.ts` | Public dashboard API routes (unauthenticated) |
| `client/src/hooks/useShareTokens.ts` | TanStack Query hooks for share token CRUD |
| `client/src/pages/PublicDashboardPage.tsx` | Read-only public dashboard page (no AuthGuard) |
| `tests/public-dashboard.test.ts` | 13 integration tests |
| `drizzle/0012_public_share_tokens.sql` | Migration SQL |

### Files to modify

| File | Lines affected | Change |
|---|---|---|
| `schema.ts` | After line 122 (end of `analyticsPages` table) | Add `dashboardShareTokens` table, relations, exports |
| `drizzle/meta/_journal.json` | After line 88 (last entry) | Add `0012_public_share_tokens` journal entry |
| `app.ts` | Lines 7-40 (imports), 57-164 (extracted functions), 250-350 (public routes + cube routing) | Remove extracted functions, add cube-app-cache imports, add `/public/*` middleware, mount public route app |
| `src/routes/analytics-pages.ts` | Line 9 (imports), end of file | Add `dashboardShareTokens`, `isNull`, `crypto` imports; add share token sub-routes |
| `client/src/types/index.ts` | End of file | Add `ShareToken` and `CreateShareTokenRequest` interfaces |
| `client/src/App.tsx` | Import block + route block | Import `PublicDashboardPage`; add `/public/dashboard/:token` route outside `AuthGuard` |
| `client/src/pages/DashboardViewPage.tsx` | Import block, state declarations, JSX | Add share modal state; import `useShareTokens` hooks and `ShareToken` type; add Share button + modal UI |

---

## Implementation Approach

The definitive reference for all code is the reviewed implementation on the sibling branch. The executor should use `git show <commit>:<file>` to extract exact file contents for each new/modified file.

### Step 1 — Schema (`schema.ts`)

After line 122 (closing `]` of `analyticsPages` indexes), insert the `dashboardShareTokens` table definition:

```ts
export const dashboardShareTokens = sqliteTable(
  'dashboard_share_tokens',
  {
    id: text('id').primaryKey(),
    dashboardId: integer('dashboard_id').notNull().references(() => analyticsPages.id, { onDelete: 'cascade' }),
    label: text('label'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
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

Also update `analyticsPageRelations` to add `shareTokens: many(dashboardShareTokens)`, add `dashboardShareTokensRelations`, and add both the table and relations to the `schema` export object. Use `git show c3f6370:schema.ts` for the exact final state.

### Step 2 — Migration files

Create `drizzle/0012_public_share_tokens.sql` with the content from `git show f93defc:drizzle/0012_public_share_tokens.sql`.

Add a new entry to `drizzle/meta/_journal.json` after `idx: 11`:
```json
{
  "idx": 12,
  "version": "6",
  "when": 1744070400000,
  "tag": "0012_public_share_tokens",
  "breakpoints": true
}
```

### Step 3 — `src/services/cube-app-cache.ts` (new file)

Create from `git show c3f6370:src/services/cube-app-cache.ts`. This file contains:
- `validateOAuthBearer(token)` — previously inline in `app.ts:86-99`
- `extractSecurityContext(c)` — previously inline in `app.ts:102-164`
- `getCubeApp(connectionId)` — previously inline in `app.ts`
- `invalidateCubeAppCache(connectionId?)` — previously inline in `app.ts`

The `extractSecurityContext` in this service removes the `console.warn` for unauthenticated users that was present in the original (removed in fix cycle 2 at `5e4e0e4`).

### Step 4 — `app.ts` (refactor + public routes)

Use `git show c3f6370:app.ts` as the reference. Key changes:
- Remove `createCubeApp`, `SecurityContext`, `getSessionCookie`, `validateSession`, `getAIAgentConfig` imports (moved to cube-app-cache)
- Remove `extractTokenId`, `validateOAuthBearer`, `extractSecurityContext`, and the cube app cache map/functions
- Add imports: `{ createPublicDashboardApp }` from `./src/routes/public-dashboard` and `{ getCubeApp, invalidateCubeAppCache, validateOAuthBearer }` from `./src/services/cube-app-cache`
- After the SCIM route block and before `app.use('/api/*', ...)`, add three middleware registrations for `/public/*`:
  1. DB injection middleware
  2. Open CORS (`origin: '*'`, `allowMethods: ['GET', 'OPTIONS']`)
  3. Post-response CSP override (deletes `X-Frame-Options`, sets `frame-ancestors *` CSP)
- Mount: `app.route('/public', createPublicDashboardApp({ getCubeApp }))`
- Keep `requireBearerOrSessionAuth` using the imported `validateOAuthBearer`
- Keep `export { invalidateCubeAppCache }` (used by connection-manager or cube-definitions route)

**Important:** The `isMcpAppEnabled` function in `app.ts` is kept locally (it controls MCP app creation gating in `app.ts`). The one in `cube-app-cache.ts` is a separate copy used during `getCubeApp`.

### Step 5 — `src/routes/public-dashboard.ts` (new file)

Create from `git show c3f6370:src/routes/public-dashboard.ts`. The factory function `createPublicDashboardApp({ getCubeApp })` provides:
- `GET /dashboard/:token` — resolve token, check not-revoked/expired/dashboard-active, update `lastUsedAt` async, return dashboard config
- `ALL /cubejs-api/:token/v1/*` — resolve token, find connection, strip `/public/cubejs-api/:token` prefix, proxy to cube app

The `resolveToken` helper checks `revokedAt`, `expiresAt < now`, and updates `lastUsedAt` asynchronously (fire-and-forget with `.catch()`).

### Step 6 — `src/routes/analytics-pages.ts` (add share token routes)

Use `git show c3f6370:src/routes/analytics-pages.ts` as reference. Add:
- Import `dashboardShareTokens` from `../../schema`
- Import `isNull` from `drizzle-orm`
- Import `crypto` from `node:crypto`
- Add `assertOwner` helper after the existing DELETE handler
- Add `GET /:id/share-tokens`, `POST /:id/share-tokens`, `DELETE /:id/share-tokens/:tid` sub-routes

The `GET` handler returns masked tokens (`idMasked: id.slice(0,8) + '...'`) but still returns the full `id` for revoke operations.

The `POST` handler generates `crypto.randomBytes(16).toString('hex')` for the token ID and returns the full token in the 201 response (the only time the full token is returned).

### Step 7 — `client/src/types/index.ts`

Append `ShareToken` and `CreateShareTokenRequest` interfaces. Use `git show c3f6370:client/src/types/index.ts` to find the exact shape (after the existing `Notebook` interface).

### Step 8 — `client/src/hooks/useShareTokens.ts` (new file)

Create from `git show c3f6370:client/src/hooks/useShareTokens.ts`. Three hooks:
- `useShareTokens(dashboardId)` — GET query, disabled when `dashboardId === 0`
- `useCreateShareToken(dashboardId)` — POST mutation, invalidates query on success
- `useRevokeShareToken(dashboardId)` — DELETE mutation, invalidates query on success

### Step 9 — `client/src/pages/PublicDashboardPage.tsx` (new file)

Create from `git show c3f6370:client/src/pages/PublicDashboardPage.tsx`. Uses `useEffect` + `useState` (not TanStack Query) since there's no auth context. Fetches `/public/dashboard/:token` with `credentials: 'omit'`. On success, renders inside `<CubeProvider>` with `apiUrl: /public/cubejs-api/${token}/v1` and `credentials: 'omit'`. Error states handle 404, 401, and network failures with user-friendly messages.

### Step 10 — `client/src/pages/DashboardViewPage.tsx`

Use `git show c3f6370:client/src/pages/DashboardViewPage.tsx` as reference. Changes from the current branch:
- Import `useCreateShareToken`, `useRevokeShareToken`, `useShareTokens` from `../hooks/useShareTokens`
- Import `ShareToken` from `../types`
- Add state: `showShareModal`, `newTokenLabel`, `createdToken`, `copied`
- Add hooks: `useShareTokens(showShareModal ? numericId : 0)`, `useCreateShareToken(numericId)`, `useRevokeShareToken(numericId)`
- Add Share button (visible when `canEdit`) in the toolbar
- Add share modal JSX at the bottom of the return (parallel to `DashboardEditModal`)

The share modal shows: created token URL (copy-once pattern), list of active tokens (masked), create new token form (label + optional expiry), revoke buttons using `useConfirm()`.

### Step 11 — `client/src/App.tsx`

Use `git show c3f6370:client/src/App.tsx` as reference:
- Add import: `import PublicDashboardPage from './pages/PublicDashboardPage'` (non-lazy, in the "Public pages" block)
- Add route: `<Route path="/public/dashboard/:token" element={<PublicDashboardPage />} />` outside the `<AuthGuard>` block

### Step 12 — `tests/public-dashboard.test.ts` (new file)

Create from `git show c3f6370:tests/public-dashboard.test.ts`. 13 tests covering:
- Token creation (201, 32-char hex id)
- Token listing (200, masked IDs)
- Token revocation (204, disappears from list)
- Non-owner member blocked (403)
- Dashboard owner (member) can manage tokens
- Nonexistent dashboard returns 404
- Public fetch: valid token → 200 with dashboard config
- Public fetch: revoked token → 404
- Public fetch: expired token → 404
- Public fetch: nonexistent token → 404
- Public fetch: soft-deleted dashboard → 404
- Public fetch: future (not yet expired) token → 200

---

## Risks and Edge Cases

**Token secrecy:** The token ID is the secret (128-bit random hex). The `GET /:id/share-tokens` list endpoint returns the full `id` alongside the masked `idMasked` display field — this is intentional so the UI can construct revoke URLs. This was the design in the reviewed implementation.

**Circular imports:** The original `app.ts` had `getCubeApp` and `extractSecurityContext` inline. The public route needs `getCubeApp` but importing `app.ts` would create a circular import. This is why `cube-app-cache.ts` was introduced as a shared service. The executor must NOT attempt to import from `app.ts` in the public route.

**CSP override timing:** The CSP override middleware at `app.use('/public/*', ...)` runs post-response (after `await next()`). The global `secureHeaders` middleware also runs and sets headers. The override deletes `X-Frame-Options` and replaces `Content-Security-Policy` — this works because Hono allows header mutation after response is built. Verified in the reviewed implementation.

**Migration numbering:** The last migration on this branch is `0011_lethal_donald_blake` (idx 11). The new migration must be `0012_public_share_tokens` (idx 12). Do NOT run `npm run db:generate` — instead, manually create the SQL file and journal entry using the exact content from the sibling branch. This avoids generating a different drizzle-kit UUID-based filename.

**Rate limiting:** The `src/auth/rate-limit.ts` module exists. The architect plan from issue #5 mentioned applying rate limiting to public routes, but the final reviewed implementation did NOT add it (it was omitted in the final code). Do not add it unless the CLAUDE.md specifically requires it — keep parity with the reviewed implementation.

**`useShareTokens` called with `dashboardId = 0`:** When the share modal is closed, the hook is called with `0`. TanStack Query will still fire if `queryKey` changes — but since `dashboardId = 0` is a falsy ID that will always return a 400 from the API, this is benign. The reviewed implementation uses `showShareModal ? numericId : 0` to minimize requests.

---

## Test Strategy

The test file (`tests/public-dashboard.test.ts`) from the reviewed implementation provides 13 tests and should be ported verbatim. After implementation:

1. Run `npx vitest run tests/public-dashboard.test.ts` — all 13 must pass.
2. Run `npm run typecheck` — must exit 0 (the feature commits verified this).
3. Run `npm run lint` — must exit 0 with at most 1 pre-existing warning (key={i} in array map).
4. Run `npm test` — the 4 pre-existing failures in `cube-compiler.test.ts` are expected; no new failures.

---

## Reference Commits (sibling branch)

All code can be extracted directly:

| Commit | Content |
|---|---|
| `f93defc` | Initial feature implementation |
| `6ccf4ae` | Cycle 1 fixes (import/type fixes, DashboardViewPage copy button) |
| `5e4e0e4` | Cycle 2 fixes (test assertions, CSP header, PublicDashboardPage error states, analytics-pages.ts `isNull` import) |
| `c3f6370` | Final reviewed state — use this as the reference for all files |

Use `git show c3f6370:<path>` to extract the final version of any file.

---

## Estimated Complexity: medium
