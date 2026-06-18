# Architect Plan — Issue #18: Regression tests for dashboard and notebook visibility rules

## Problem Statement

`src/routes/analytics-pages.ts` and `src/routes/notebooks.ts` both implement non-trivial access-control logic that has no dedicated test coverage. The visibility system involves three interacting rules: (1) admin users bypass all group filters (`analytics-pages.ts:66`, `notebooks.ts:63`); (2) non-admins see only content with no groups assigned, content scoped to a group they belong to, or content they created (`analytics-pages.ts:32–41`, `notebooks.ts:31–40`); (3) creators have their groups auto-assigned to new content at creation time (`analytics-pages.ts:205–215`, `notebooks.ts:187–197`). There are also per-route write-permission checks: non-admins may only update/delete content they created (`analytics-pages.ts:255–263`, `notebooks.ts:217–225`, `notebooks.ts:264–270`). None of these behaviours are currently tested — a regression in any of them would be silent.

## Summary of Changes

Add two new test files:
- `tests/analytics-pages.test.ts` — covers all visibility and permission scenarios for dashboard routes
- `tests/notebooks.test.ts` — mirrors the same scenarios for notebook routes

No source files need modification. All tests use the existing `createTestDb` / `mountRoute` / `jsonRequest` helpers and seed data directly via Drizzle.

## Files to Create

### `tests/analytics-pages.test.ts` (new file)

Covers:
- `GET /` — admin sees all dashboards
- `GET /` — member with no group memberships sees only unguarded dashboards and their own
- `GET /` — member sees dashboards assigned to a group they belong to
- `GET /` — member cannot see dashboards assigned to a group they are not in
- `GET /` — creator can still see their own restricted dashboard (creator exception)
- `GET /` — empty visibility state (no groups in `content_group_visibility`) is visible to all
- `GET /:id` — invalid ID returns 400
- `GET /:id` — not found / visibility-blocked returns 404 for non-admin
- `POST /` — dashboard created by a member auto-assigns their groups to `content_group_visibility`
- `POST /` — dashboard created by a member with no groups assigns no visibility rows
- `POST /` — missing required fields returns 400
- `PUT /:id` — admin can update any dashboard
- `PUT /:id` — member can update their own dashboard
- `PUT /:id` — member cannot update another user's dashboard (403)
- `DELETE /:id` — admin can soft-delete any dashboard
- `DELETE /:id` — member can soft-delete their own dashboard
- `DELETE /:id` — member cannot delete another user's dashboard (403)

### `tests/notebooks.test.ts` (new file)

Mirrors all of the above for notebooks, using:
- `notebooks` table instead of `analyticsPages`
- `content_type = 'notebook'` in `content_group_visibility`
- Route prefix `/test/` against `notebooksApp`

Scenarios unique to notebooks:
- `POST /` validation requires only `name` (no `config` required), returning 400 when missing
- `GET /:id` invalid ID returns 400

## Implementation Approach

1. **Create `tests/analytics-pages.test.ts`**

   a. Import `analyticsApp` from `../src/routes/analytics-pages`, helpers from `./helpers/test-db` and `./helpers/test-app`, and schema tables (`analyticsPages`, `contentGroupVisibility`, `userGroups`, `groups`, `groupTypes`) from `../../schema` for direct seeding.

   b. In `beforeEach`: call `createTestDb()`, seed `adminUser` and `memberUser` via existing helpers.

   c. Add a local helper `seedGroup(db, name)` that inserts a `groupType` + `group` and returns the group row — this keeps individual tests concise.

   d. Add a local helper `seedDashboard(db, userId, name)` that inserts an `analyticsPages` row with `organisationId: 1`, `isActive: true`, minimal `config: { portlets: [] }`, and `createdBy: userId`.

   e. Add a local helper `assignGroupVisibility(db, contentId, groupId, contentType = 'dashboard')` that inserts a `contentGroupVisibility` row directly — bypassing the API so tests are not coupled to the create-flow.

   f. Add a local helper `addUserToGroup(db, userId, groupId)` that inserts a `userGroups` row.

   g. Write `describe` blocks per area (listing, single-fetch, creation, update, delete). Within each, write focused `it` assertions that seed exactly what they need and make a single `app.request()` / `jsonRequest()` call.

2. **Create `tests/notebooks.test.ts`**

   Same structure. Reuse the same local helper pattern. Key differences:
   - Import `notebooksApp` from `../src/routes/notebooks`
   - `seedNotebook(db, userId, name)` inserts into `notebooks` table with `config: { blocks: [], messages: [] }`
   - `assignGroupVisibility` called with `contentType = 'notebook'`

3. **Verify**: run `npm test` locally to confirm all new tests pass alongside the existing suite (one pre-existing failure in `cube-compiler.test.ts` is expected and unrelated).

## Risks and Edge Cases

- **`buildVisibilityFilter` uses raw SQL interpolation** (`sql.raw`) for the table name lookup (`analytics-pages.ts:33`, `notebooks.ts:32`). Tests that exercise the creator-exception path must ensure the seeded content has a matching `created_by` column or they will produce false negatives.
- **`organisationId` is hardcoded to 1** via middleware (`analytics-pages.ts:21–23`, `notebooks.ts:19–21`). All seeded rows must use `organisationId: 1` or queries will return nothing.
- **Auto-assignment on `POST /`** (`analytics-pages.ts:205–215`) only fires when `auth.userId` is set AND the user belongs to at least one group. Tests must explicitly add the creating user to a group first to verify the auto-assignment path.
- **`isActive` soft-delete**: the list and single-fetch routes filter on `isActive = true` (`analytics-pages.ts:60`, `notebooks.ts:58`). Tests for deleted content must verify the row is gone from the listing, not just that the delete succeeded.
- **Biome linting**: the project uses Biome. Test files must avoid `any` type annotations where possible, and array-spread patterns must not trigger the existing array-index-as-React-key warning (not applicable in test files, but Biome still runs over them).
- **`inArray` with empty arrays**: if no dashboard IDs are returned by the initial query, the visibility batch-fetch is skipped (`analytics-pages.ts:95`). Tests for members who can see zero items should confirm the response is `{ data: [], meta: { total: 0 } }` rather than an error.

## Test Strategy

- Integration tests only — matches the project convention (`tests/CLAUDE.md`).
- Fresh in-memory SQLite DB per `beforeEach`; full migration history applied via `createTestDb()`.
- Seed all fixtures (users, groups, memberships, content, visibility) directly via Drizzle inserts, not via the API, except where the behaviour under test is the creation endpoint itself.
- Each `it` block tests exactly one outcome (positive or negative).
- Target test count: ~16–18 per file (32–36 total).

## Estimated Complexity

**Simple.** No source changes required. The test helpers, schema, and patterns are already established. The main effort is identifying the correct fixture combinations for each scenario and verifying the expected HTTP responses.
