# Guardrails Report — Issue #5

Date: 2026-04-07

## 1. Test Framework

**Status: PASS (with pre-existing failures)**

- Runner: Vitest `^4.0.18`
- Config: `vitest.config.ts`
- Test files: 7 files in `tests/` (`*.test.ts`)
- Result: `1 failed | 6 passed (7 files)` — `126 passed | 4 failed (130 tests)`
- Pre-existing failures in `tests/cube-compiler.test.ts` (full compilation suite, 4 tests). These exist on `main` and are not introduced by this branch.
- Command: `npm test` — runs successfully

## 2. Linting

**Status: PASS**

- Linter: Biome `^1.9.4`
- Config: `biome.json`
- Result: 1 warning (React key index in `ImportConnectionModal`), no errors
- Command: `npm run lint` — exits 0

## 3. Type Checking

**Status: PASS**

- Tool: TypeScript `tsc --noEmit`
- Config: `tsconfig.json`
- Result: No errors
- Command: `npm run typecheck` — exits 0

## 4. CI Pipeline

**Status: PRESENT (informational)**

- `.github/workflows/ci.yml`: runs lint → typecheck → test on push/PR to `main`
- `.github/workflows/docker.yml`: Docker image build
- CI will flag the pre-existing `cube-compiler.test.ts` failures on PR

## Pre-existing Test Failures (to watch)

`tests/cube-compiler.test.ts` — 4 failures in "full compilation" suite. These are present on `main` before this branch was created. Do not introduce additional failures.
