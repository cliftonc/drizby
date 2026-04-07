# Reviewer Verdict — Issue #5: Public Share Links / Embedded Dashboards (Cycle 2)

Date: 2026-04-07
Verdict: **REQUEST_CHANGES**

---

## Test Results

```
npx vitest run tests/public-dashboard.test.ts
✓ 13/13 tests passed

npx vitest run (full suite)
✓ 139 passed | 4 failed (cube-compiler.test.ts — pre-existing, unrelated)

npm run typecheck
✗ Exit 2 — 3 errors in tests/public-dashboard.test.ts (introduced by this branch)

npm run lint
✗ Exit 1 — 7 errors (formatting + import order in new/modified files, introduced by this branch)
```

Main branch baseline: `typecheck` exits 0 (no errors), `lint` exits 1 with 1 pre-existing warning only.

---

## Issues Resolved from Cycle 1

All three cycle-1 blockers are confirmed fixed:

1. `app.ts:8,15` — `and`, `getSessionCookie`, `validateSession` imports restored. Typecheck clean for `app.ts`.
2. `client/src/pages/DashboardViewPage.tsx:39` — `const [confirm, ConfirmDialog] = useConfirm()` correct tuple destructuring. `confirm({...})` object call and `<ConfirmDialog />` render both present.
3. `app.ts:193` — `allowMethods: ['GET', 'POST', 'OPTIONS']` on `/public/*` CORS middleware.

---

## Critical Issues (must fix before merge)

### 1. Unused imports in test file break `npm run typecheck` — introduced by this branch

`tests/public-dashboard.test.ts:16,19,21`:

```ts
import { and, eq } from 'drizzle-orm'   // line 16 — `and` is never used
import * as schema from '../schema'      // line 19 — `schema` is never used
import { defineAbilitiesFor } from '../src/permissions/abilities'  // line 21 — never used
```

`tsc --noEmit` reports:
```
tests/public-dashboard.test.ts(16,10): error TS6133: 'and' is declared but its value is never read.
tests/public-dashboard.test.ts(19,1): error TS6133: 'schema' is declared but its value is never read.
tests/public-dashboard.test.ts(21,1): error TS6133: 'defineAbilitiesFor' is declared but its value is never read.
```

Main branch exits `typecheck` cleanly at 0. This branch introduces 3 errors that will fail CI.

Fix: remove the unused imports from `tests/public-dashboard.test.ts` lines 16, 19, and 21. Keep `eq` (used), `Hono` (line 17), and `{ analyticsPages, dashboardShareTokens }` (line 20).

---

## Important Issues (should fix)

### 2. Lint formatting violations in new files break `npm run lint` — introduced by this branch

`npm run lint` exits 1 with 7 errors (main branch exits 1 with 1 pre-existing warning only). All 7 errors are in files added or modified by this branch:

- `app.ts` — import sort order (`connection-manager` import must come before `cube-app-cache`) and 2 blank lines before `const app` (should be 0).
- `src/services/cube-app-cache.ts` — import sort order (`ai-settings` before `connection-manager`).
- `src/routes/public-dashboard.ts` — formatter wants `.where(and(...))` on single line where it currently spans 3 lines (arguments short enough to fit).
- `src/routes/analytics-pages.ts` — formatter wants `.where(and(...))` broken to multiple lines (argument too long for one line).
- `client/src/pages/DashboardViewPage.tsx` — 3 formatter violations: close-button `<svg>` attributes inline (should be multi-line); `<p>` text node inline (should be broken); `{token.idMasked}` and conditional `{token.label && ...}` formatting.
- `client/src/pages/PublicDashboardPage.tsx` — outer `<div>` inline style object should be broken to multi-line.

Fix: run `npm run lint:fix`, review the diff, then commit.

---

## Suggestions

### 3. Missing `organisationId` filter in `resolveToken`

`src/routes/public-dashboard.ts:28-45` — token resolution queries only by `id` with no `organisationId` scope. The codebase convention (`src/CLAUDE.md`) requires all queries to filter by `organisationId`. Currently single-tenant (hardcoded to 1) so not exploitable, but diverges from every other query in the codebase.

Consider adding:
```ts
and(eq(dashboardShareTokens.id, token), eq(dashboardShareTokens.organisationId, 1))
```

### 4. Rate limiting not applied to `/public/*`

`app.ts:193` — the public routes are unauthenticated and not rate-limited. The architect plan identified this as a risk. The existing `createRateLimiter` in `src/auth/rate-limit.ts` can be applied before merge.

### 5. Full token ID exposed in list endpoint

`src/routes/analytics-pages.ts:457` — `id: r.id` returns the full 32-char token in the list response alongside `idMasked`. The architect plan stated the token should only be returned at creation time. The updated comment documents the decision as intentional (admins/owners can retrieve it), which is an acceptable resolution — but a separate opaque revoke ID would be the more secure long-term design.

---

## Security Assessment

- Token entropy: 128-bit random. Sufficient.
- Token revocation: soft-revoke via `revokedAt`, checked on every request. Correct.
- Soft-deleted dashboard check: `isActive = true` in public route. Correct.
- Auth bypass scope: public routes mounted before `authMiddleware`. Correct.
- CSP / `frame-ancestors *`: correct for stated use case.
- No SSRF in cube proxy: `connectionId` comes from DB, not user input. Safe.
- CORS POST on `/public/*`: now correct after cycle-1 fix.

---

## Summary

Cycle 1's three blockers are fully resolved. The implementation is architecturally sound — schema, migrations, backend routes, public cube proxy, frontend page, and share modal are all correct. Two new blockers prevent CI from passing: unused imports in the test file break `typecheck`, and formatter/import-order violations in new files break `lint`. Both are mechanical fixes requiring no logic changes. Running `npm run lint:fix` and removing the three unused test imports will clear them.

This is a bot review. No shared context with the executor.
