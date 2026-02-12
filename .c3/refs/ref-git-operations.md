---
id: ref-git-operations
c3-version: 4
title: Git Operation Patterns
goal: Standardize all git access through simple-git for testability and safety
scope: [c3-1]
---

# Git Operation Patterns

## Goal

Standardize all git access through simple-git for testability and safety. All 6 tool handlers in tools-core use simple-git rather than raw `child_process.exec`.

## Choice

Use the `simple-git` library for all git operations. Create a new `simpleGit(repoPath)` instance per call. Use `git.raw()` when the high-level API is insufficient.

## Why

- **Testability**: simple-git can be mocked cleanly in vitest (mock the module, return fake responses)
- **Safety**: No shell injection risk from user-provided parameters
- **Ergonomics**: Typed API with promise support, error handling for common git exit codes
- **Consistency**: All 6 tools follow the same pattern — `const git = simpleGit(params.repoPath ?? process.cwd())`

## How

| Guideline | Example |
|-----------|---------|
| Initialize with repoPath or cwd | `const git = simpleGit(params.repoPath ?? process.cwd())` |
| Use three-dot range for branch diffs | `git.diff([`${base}...${head}`])` |
| Use `git.show()` for file-at-ref | `git.show([`${ref}:${filePath}`])` |
| Use `git.raw()` when high-level API is limited | `git.raw(['grep', '-n', '--', pattern])` for search-code |
| Handle git grep exit code 1 | Check error message for "exited with code 1" — means no matches |

## Not This

| Alternative | Rejected Because |
|-------------|------------------|
| `child_process.exec('git ...')` | Shell injection risk, no typed API, harder to mock |
| `isomorphic-git` | Heavier, less mature, doesn't support all git commands |
| `nodegit` | Native bindings, installation issues, project maintenance concerns |

## Scope

**Applies to:**
- All tool handlers in `packages/tools-core/src/tools/`

**Does NOT apply to:**
- Build scripts (no git operations)
- Action/skill packages (they don't call git directly — they go through tools-core)

## Cited By

- c3-110 (git-diff)
- c3-111 (read-file)
- c3-112 (list-files)
- c3-113 (search-code)
- c3-114 (find-importers)
