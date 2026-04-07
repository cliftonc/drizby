# Reviewer Verdict — Issue #5: Public Share Links / Embedded Dashboards

Date: 2026-04-07
Verdict: **REQUEST_CHANGES**

---

## Test Results

```
npx vitest run tests/public-dashboard.test.ts
✓ 13/13 tests passed

npx vitest run (full suite)
✓ 139 passed | 4 failed (cube-compiler.test.ts — pre-existing, unrelated)
```

---

## Critical Issues (must fix before merge)

### 1. Missing imports in `app.ts` break runtime — introduced by this PR

`app.ts:8` — The PR removed `and`, `getSessionCookie`, `validateSession` from imports when extracting logic to `cube-app-cache.ts`, but these names are still referenced in `app.ts`.

- `and` is used at `app.ts:56` (`isMcpEnabled`) and `app.ts:65` (`isMcpAppEnabled`) but is no longer imported from `drizzle-orm`.
- `getSessionCookie` is used at `app.ts:278` and `validateSession` at `app.ts:280` (inside `requireBearerOrSessionAuth`) but the import line `import { getSessionCookie, validateSession } from './src/auth/session'` was removed.

`npx tsc --noEmit` reports all three as errors:
```
app.ts(56,12): error TS2304: Cannot find name 'and'.
app.ts(65,12): error TS2304: Cannot find name 'and'.
app.ts(278,21): error TS2304: Cannot find name 'getSessionCookie'.
app.ts(280,26): error TS2304: Cannot find name 'validateSession'.
```

This will cause a runtime crash for any `/cubejs-api/*` and `/mcp` request that uses session-cookie auth, and any `/api/settings` request that checks MCP state. The feature is otherwise correct; these imports need to be restored.

Fix: add to `app.ts` imports:
```ts
import { and } from 'drizzle-orm'  // or add to existing drizzle-orm import line
import { getSessionCookie, validateSession } from './src/auth/session'
```

### 2. `useConfirm` used incorrectly in `DashboardViewPage.tsx` — breaks revoke UI

`client/src/pages/DashboardViewPage.tsx:39` — `const confirm = useConfirm()` does not destructure the return tuple. The hook returns `[confirmFn, DialogComponent]`.

`DashboardViewPage.tsx:455` — `await confirm('Revoke this share link? ...')` passes a plain string, but `useConfirm` expects a `ConfirmOptions` object `{ title, message }`.

`DashboardViewPage.tsx` never renders the `ConfirmDialog` component, so the modal will not appear even after fixing the call signature.

TypeScript confirms: `error TS2349: This expression is not callable. Type '[(options: ConfirmOptions) => Promise<boolean>, () => ReactNode]' has no call signatures.`

Fix — replace lines 39 and 455, and add `<ConfirmDialog />` to JSX:
```tsx
// line 39
const [confirm, ConfirmDialog] = useConfirm()

// line 455
const ok = await confirm({
  title: 'Revoke share link',
  message: 'Revoke this share link? It will stop working immediately.',
  variant: 'danger',
})

// somewhere in the return JSX (before the closing </div>)
<ConfirmDialog />
```

---

## Important Issues (should fix)

### 3. CORS `allowMethods` on `/public/*` excludes `POST` — breaks cross-origin iframe embedding

`app.ts:200`:
```ts
app.use('/public/*', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'] }))
```

The drizzle-cube API routes (`/v1/load`, `/v1/batch`, `/v1/sql`, `/v1/dry-run`) all use `POST`. When the public dashboard is embedded in a cross-origin iframe, the browser sends a CORS preflight for each cube query. The preflight will receive `Access-Control-Allow-Methods: GET, OPTIONS`, and the browser will block the actual `POST` request.

Same-origin usage works fine. Cross-origin iframe embedding — the primary use case for this feature — will silently fail to load any chart data.

Fix:
```ts
app.use('/public/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'] }))
```

### 4. Full token ID returned in list response contradicts "never re-served" intent

`src/routes/analytics-pages.ts:456-464` — the list response includes `id: r.id` (the full 32-char token) alongside `idMasked`. The comment at line 455 says "full ID is never re-served" but the code does the opposite.

This means any admin with access to the share modal after creation can retrieve all active token IDs. The architect plan explicitly states the token should only be returned once (at creation) and subsequent GET lists should return a masked version only.

The current frontend uses `token.id` for the revoke DELETE call. A separate non-secret revoke ID (e.g., a UUID auto-increment on the token row) would allow revocation without exposing the secret. Alternatively, document that the full ID is intentionally accessible to admins/owners (since they could just create a new token anyway), update the comment, and accept this as a design decision. Either way, the comment and code are inconsistent.

---

## Suggestions

### 5. Missing `organisationId` filter in `resolveToken`

`src/routes/public-dashboard.ts:28-45` — `resolveToken` queries only by `id`, with no `organisationId` scope. Currently single-tenant (hardcoded to 1) so this is not exploitable, but it diverges from the scoping pattern used everywhere else and will become an issue if multi-tenancy is ever activated. Consider adding `eq(dashboardShareTokens.organisationId, 1)` consistent with other tables.

### 6. Rate limiting not applied to `/public/*`

`app.ts:200` — As noted in the architect plan and the executor summary, no rate limiting was applied to the public routes. These are unauthenticated and directly queryable. The existing `createRateLimiter` should be applied before merge for a feature designed to be publicly accessible.

### 7. `isMcpAppEnabled` defined in both `app.ts` and `cube-app-cache.ts`

`app.ts:61-65` and `src/services/cube-app-cache.ts:16-22` — both files define an identical `isMcpAppEnabled` function. `app.ts:61` version is unused (TS reports `'isMcpAppEnabled' is declared but its value is never read`). The one in `cube-app-cache.ts` is the active one. The dead copy in `app.ts` should be removed.

---

## Security Assessment

- **Token entropy**: 128-bit random (`crypto.randomBytes(16).toString('hex')`). Sufficient.
- **Token revocation**: soft-revoke via `revokedAt` timestamp, checked on every public request. Correct.
- **Soft-deleted dashboard check**: `isActive = true` filter present in public route. Correct.
- **Auth bypass scope**: public routes mounted before `authMiddleware`, DB injected separately. Correct.
- **CSP / frame-ancestors**: `frame-ancestors *` on `/public/*` override is correct for the stated use case.
- **Token returned on creation only**: intent is correct but implementation leaks via list endpoint (issue #4 above).
- **No SSRF in cube proxy**: proxy only dispatches to `getCubeApp(connectionId)` where `connectionId` comes from the DB (not user input). Safe.

---

## Summary

The backend schema, token management routes, public data routes, migration, and tests are well-implemented and match the architect plan. The critical blockers are two bugs introduced during refactoring: missing imports in `app.ts` that break session-based auth for cube/MCP routes, and incorrect `useConfirm` usage in the share modal that prevents the revoke confirmation from working. The cross-origin CORS restriction on POST also needs to be fixed for embedded dashboards to function as designed.

This is a bot review. No shared context with the executor.
