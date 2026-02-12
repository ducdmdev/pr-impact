---
id: c3-115
c3-version: 4
title: list-tests
type: component
category: feature
parent: c3-1
goal: Find test files associated with source files
summary: Generates candidate paths across sibling/__tests__/test/tests dirs, verifies existence with fast-glob
---

# list-tests

## Goal

Find test files associated with source files. Enables the AI agent to check test coverage gaps (Step 3) by identifying which source files have corresponding tests and whether those tests were updated.

## Container Connection

The coverage ratio from this tool directly feeds the "untested changes" risk factor (weight 0.25).

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | `fast-glob` | External: fast-glob |
| OUT (provides) | `listTestFiles()`, `ListTestFilesParams`, `ListTestFilesResult` | c3-210, c3-311 |

## Behavior

- Generates candidate test paths using source file name:
  - Sibling: `dir/foo.test.ts`, `dir/foo.spec.ts`
  - `__tests__/` under source dir: `dir/__tests__/foo.ts`, `dir/__tests__/foo.test.ts`
  - `__tests__/` at package root (sibling to `src/`)
  - Top-level `test/` and `tests/` directories
- Covers all 4 extensions: `.ts`, `.tsx`, `.js`, `.jsx`
- Uses `fast-glob` to verify which candidates actually exist
- `getPackageRoot()` finds the parent of `src/` or `lib/` for package-root `__tests__/`

## Code References

| File | Purpose |
|------|---------|
| `packages/tools-core/src/tools/list-tests.ts` | `listTestFiles()`, `buildCandidatePaths()`, helpers (88 lines) |
