# CLAUDE.md -- @pr-impact/tools-core

## What this package does

Pure tool handler functions for git/repo operations. No framework dependency -- both the MCP server and GitHub Action import from here.

## Quick commands

```bash
pnpm build --filter=@pr-impact/tools-core   # Build with tsup (ESM + dts)
npx vitest run packages/tools-core           # Run tests
```

## Source layout

```
src/
  index.ts              -- Barrel exports for all handlers and types
  tool-defs.ts          -- Canonical tool definitions (TOOL_DEFS, ToolDef, ToolParamDef)
  tools/
    git-diff.ts         -- gitDiff(): raw diff between two refs
    read-file.ts        -- readFileAtRef(): file content at a git ref
    list-files.ts       -- listChangedFiles(): changed files with status/stats
    search-code.ts      -- searchCode(): regex search via git grep
    find-imports.ts     -- findImporters(): reverse dependency map (session-cached)
    list-tests.ts       -- listTestFiles(): test file discovery by naming convention
```

## Key patterns

- All functions accept an optional `repoPath` (defaults to `process.cwd()`).
- `findImporters` builds a reverse dependency map on first call and caches it. Call `clearImporterCache()` to reset.
- `searchCode` uses `git.raw(['grep', ...])` because simple-git's `grep()` doesn't reliably pass glob specs. Exit code 1 from git grep means "no matches", not an error.
- `listTestFiles` generates candidate paths for sibling, `__tests__/`, `test/`, and `tests/` directories, plus `__tests__/` at the package root (sibling to `src/`).
- `listChangedFiles` handles binary files via a type guard (`'insertions' in f`).

## Testing

Tests in `__tests__/` mock `simple-git` and `fast-glob`. No real git repos needed.

<!-- c3-generated: c3-101,c3-110,c3-111,c3-112,c3-113,c3-114,c3-115 -->
## Architecture docs

Before modifying this code, read:
- Container: `.c3/c3-1-tools-core/README.md`
- Components:
  - `.c3/c3-1-tools-core/c3-101-tool-definitions.md` (tool-defs.ts)
  - `.c3/c3-1-tools-core/c3-110-git-diff.md`
  - `.c3/c3-1-tools-core/c3-111-read-file.md`
  - `.c3/c3-1-tools-core/c3-112-list-files.md`
  - `.c3/c3-1-tools-core/c3-113-search-code.md`
  - `.c3/c3-1-tools-core/c3-114-find-importers.md`
  - `.c3/c3-1-tools-core/c3-115-list-tests.md`
- Patterns: `ref-git-operations`, `ref-esm-conventions`

Full refs: `.c3/refs/ref-{name}.md`
<!-- end-c3-generated -->
