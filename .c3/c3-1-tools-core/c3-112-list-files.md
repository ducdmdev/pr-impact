---
id: c3-112
c3-version: 4
title: list-files
type: component
category: feature
parent: c3-1
goal: List changed files with status and line stats
summary: Combines git --name-status with diffSummary for full file change inventory
---

# list-files

## Goal

List changed files with status and line stats. Provides the initial file inventory (Step 1) that the AI agent uses to categorize changes and plan its analysis.

## Container Connection

This is always the first tool called in analysis. It provides the file-level overview that drives all subsequent analysis steps.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | `simple-git` | External: simple-git |
| OUT (provides) | `listChangedFiles()`, types (`ChangedFileEntry`, `FileStatus`, etc.) | c3-210, c3-311 |

## Behavior

- Runs two git commands: `--name-status` for file status (A/M/D/R/C) and `diffSummary` for line counts
- Merges results into `ChangedFileEntry[]` with path, status, additions, deletions
- Handles renamed/copied files by using the new path from the third column
- Binary files are handled via type guard (`'insertions' in f`)

## Code References

| File | Purpose |
|------|---------|
| `packages/tools-core/src/tools/list-files.ts` | `listChangedFiles()` + `parseNameStatus()` + `mapStatusCode()` (83 lines) |

## Related Refs

| Ref | How It Serves Goal |
|-----|-------------------|
| ref-git-operations | Uses simple-git diff and diffSummary |
