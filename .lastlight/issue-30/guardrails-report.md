# Guardrails Report — Issue #30

Checked: 2026-04-07

## 1. Test Framework

**Status: PASS (with pre-existing failures)**

- Runner: Vitest (`vitest.config.ts` present, `npm test` = `vitest run`)
- Test files: `tests/*.test.ts` (7 files, 130 tests total)
- Result: 126 passed, 4 failed
- Failures are pre-existing in `tests/cube-compiler.test.ts` (schema compilation assertions — unrelated to issue #30)
- Test infrastructure is functional; failures are not caused by missing setup

## 2. Linting

**Status: PASS**

- Linter: Biome (`biome.json` present)
- Command: `npm run lint` → `biome check .`
- Result: 1 warning (key={i} in array map), no errors, exit 0
- `lint:fix` available for auto-remediation

## 3. Type Checking

**Status: PASS**

- Config: `tsconfig.json` present
- Command: `npm run typecheck` → `tsc --noEmit`
- Result: Clean — zero errors, zero warnings

## 4. CI Pipeline

**Status: PRESENT (informational)**

- `.github/workflows/ci.yml` runs on push/PR to `main`
- Steps: `npm ci` → `biome check .` → `tsc --noEmit` → `npm test`
- Also: `.github/workflows/docker.yml` for image builds

## Summary

All critical guardrails are present and operational. The 4 failing tests in `cube-compiler.test.ts` are pre-existing and unrelated to the public share links / embedded dashboard feature targeted by issue #30.
