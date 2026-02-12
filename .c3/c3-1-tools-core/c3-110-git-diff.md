---
id: c3-110
c3-version: 4
title: git-diff
type: component
category: feature
parent: c3-1
goal: Get raw git diff between two refs
summary: Wraps simple-git diff with optional per-file filtering via three-dot range
---

# git-diff

## Goal

Get raw git diff between two refs. Supports optional `file` parameter for per-file diffs, which the system prompt requires to avoid loading the full diff at once.

## Container Connection

Provides the primary diff evidence that the AI agent uses for breaking change detection and diff size scoring.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | `simple-git` | External: simple-git |
| OUT (provides) | `gitDiff()`, `GitDiffParams`, `GitDiffResult` | c3-210, c3-311 |

## Code References

| File | Purpose |
|------|---------|
| `packages/tools-core/src/tools/git-diff.ts` | `gitDiff()` implementation (22 lines) |

## Related Refs

| Ref | How It Serves Goal |
|-----|-------------------|
| ref-git-operations | Uses simple-git three-dot range convention |
