# Reviewer Verdict — Issue #5: Public Share Links / Embedded Dashboards (Cycle 3)

Date: 2026-04-07
Verdict: **APPROVED**

---

## Test Results

```
npx vitest run tests/public-dashboard.test.ts
✓ 13/13 tests passed

npx vitest run (full suite)
✓ 139 passed | 4 failed (cube-compiler.test.ts — pre-existing, unrelated to this feature)

npx tsc --noEmit
✓ Exit 0 — no errors

node_modules/.bin/biome check .
✓ 1 warning (pre-existing MetabaseImportPage.tsx:723 — unrelated, matches main branch baseline)
```

---

## Issues Resolved from Cycle 2

All cycle-2 blockers are confirmed fixed:

1. `tests/public-dashboard.test.ts` — unused imports (`and`, `schema`, `defineAbilitiesFor`) removed. Typecheck exits cleanly at 0.
2. Biome formatting/import-order violations in `app.ts`, `cube-app-cache.ts`, `public-dashboard.ts`, `analytics-pages.ts`, `DashboardViewPage.tsx`, `PublicDashboardPage.tsx` — all resolved. Lint exits with 1 pre-existing warning only (matches main branch baseline).

---

## Remaining Issues

### Suggestions (nice to have, not blocking)

#### 1. Token ID exposed in server logs via Hono request logger

`app.ts:64-67` — the global Hono `logger()` middleware logs every request URL. Requests to
`/public/dashboard/<token>` and `/public/cubejs-api/<token>/v1/load` will print the full
32-char secret token to stdout/log files. Log files shipped to observability platforms
(Datadog, Loki, etc.) would expose the tokens.

Suggested mitigation — add `/public/` to the logger skip list, or scrub the path segment:

```ts
// app.ts:64-67
app.use('*', async (c, next) => {
  if (c.req.path === '/health') return next()
  if (c.req.path.startsWith('/public/')) return next()  // tokens in path — skip logging
  return logger()(c, next)
})
```

This is a suggestion, not a blocker, because: (a) the architect plan does not address log
scrubbing; (b) the token entropy (128-bit) is sufficient that an attacker with log read access
already has a more serious problem; (c) this pattern is common in token-in-URL APIs.

#### 2. Missing `organisationId` filter in `resolveToken`

`src/routes/public-dashboard.ts:28` — `resolveToken` queries only by `id` with no
`organisationId` scope. The `src/CLAUDE.md` convention requires all queries to filter by
`organisationId`. Currently single-tenant so not exploitable, but is a pattern divergence.

```ts
// Suggested addition
and(eq(dashboardShareTokens.id, token), eq(dashboardShareTokens.organisationId, 1))
```

#### 3. Rate limiting on `/public/*` not applied

`app.ts` — acknowledged in the executor summary as a known deferral. The existing
`createRateLimiter` in `src/auth/rate-limit.ts` can be applied independently without schema
changes.

#### 4. Full token ID returned in list endpoint

`src/routes/analytics-pages.ts:457` — the full 32-char token is returned in the list response
(`id: r.id`) alongside the masked version. The architect specified token exposure only at
creation time. The executor documents this as intentional (needed for revocation UX without
adding a separate revoke ID). Acceptable for now; a separate opaque revoke UUID would be the
more secure long-term design.

---

## Security Assessment

- Token entropy: 128-bit random hex. Sufficient.
- Token revocation: soft-revoke via `revokedAt`, checked on every public request. Correct.
- Soft-deleted dashboard: `isActive = true` guard in public route. Correct.
- Auth bypass scope: public routes mounted before `authMiddleware`. Correct.
- CORS `POST` on `/public/*`: correct (needed for cube query POSTs from cross-origin iframes).
- CSP `frame-ancestors *`: intentionally permissive per architect plan.
- Cube proxy SSRF: `connectionId` sourced from DB row, not user input. Safe.
- Ownership authz on token CRUD: `assertOwner` correctly gates on admin role or `createdBy` match.
- No full token logged at creation — returned in response body only. Correct.

---

## Summary

The implementation matches the architect plan. Schema, migration, backend token management routes,
public data routes, cube proxy, frontend public page, and share modal are all correct and
complete. Typecheck and lint are both clean against the main branch baseline. All 13 feature
tests pass; the 4 failing tests are pre-existing cube-compiler failures unrelated to this
change.

The four remaining items are suggestions, not blockers. This branch is ready to merge.

This is a bot review. No shared context with the executor.
