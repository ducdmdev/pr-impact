---
id: c3-113
c3-version: 4
title: search-code
type: component
category: feature
parent: c3-1
goal: Search for regex patterns via git grep
summary: Uses git.raw() for reliable glob filtering; handles exit code 1 as "no matches"
---

# search-code

## Goal

Search for regex patterns via git grep. Used by the AI agent for documentation staleness detection (Step 4) — finding docs that reference changed symbols.

## Container Connection

Enables doc staleness analysis by searching for references to modified symbol names across `*.md` files.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | `simple-git` (raw mode) | External: simple-git |
| OUT (provides) | `searchCode()`, `SearchCodeParams`, `SearchCodeResult`, `SearchMatch` | c3-210, c3-311 |

## Edge Cases

- **Exit code 1**: git grep returns code 1 when no matches found. simple-git wraps this as an error. The handler checks for `"exited with code 1"` in the error message and returns `{ matches: [] }` instead of throwing.
- **Uses `git.raw()`** instead of `git.grep()` because simple-git's grep method doesn't reliably pass glob path specs.

## Code References

| File | Purpose |
|------|---------|
| `packages/tools-core/src/tools/search-code.ts` | `searchCode()` with git grep exit code handling (64 lines) |

## Related Refs

| Ref | How It Serves Goal |
|-----|-------------------|
| ref-git-operations | Uses git.raw() for direct git grep access |
