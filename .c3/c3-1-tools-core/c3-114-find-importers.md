---
id: c3-114
c3-version: 4
title: find-importers
type: component
category: feature
parent: c3-1
goal: Build cached reverse dependency map and find importers
summary: Scans all source files with fast-glob, extracts imports via regex, caches reverse map per session
---

# find-importers

## Goal

Build cached reverse dependency map and find importers. Provides the impact graph data (Step 5) showing which files are affected by changes to a given module.

## Container Connection

Critical for impact breadth scoring. The AI agent calls this once per changed source file to map the blast radius. Session caching ensures the expensive full-repo scan only happens once.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | `fast-glob`, `fs/promises` | External: fast-glob, Node.js |
| OUT (provides) | `findImporters()`, `clearImporterCache()`, types | c3-210, c3-311 |

## Behavior

- **First call**: Scans all `*.{ts,tsx,js,jsx}` files (excluding node_modules/dist/.git) via fast-glob
- **Import extraction**: 3 regex patterns — static import/export, dynamic import(), require()
- **Normalization**: Strips extensions (.ts/.tsx/.js/.jsx) and `/index` suffix for consistent matching; resolves relative paths (bare directory imports match index files)
- **Cache**: Module-level variables `cachedRepoPath` / `cachedReverseMap` — reused within same session, invalidated if repoPath changes
- **clearImporterCache()**: Exported for test cleanup

## Code References

| File | Purpose |
|------|---------|
| `packages/tools-core/src/tools/find-imports.ts` | `findImporters()`, `buildReverseMap()`, `extractImports()`, `normalizeModulePath()` (118 lines) |

## Related Refs

| Ref | How It Serves Goal |
|-----|-------------------|
| ref-git-operations | Complements git-based tools with filesystem-based import analysis |
