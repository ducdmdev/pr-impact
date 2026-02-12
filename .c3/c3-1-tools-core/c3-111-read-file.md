---
id: c3-111
c3-version: 4
title: read-file
type: component
category: feature
parent: c3-1
goal: Read file content at a specific git ref
summary: Wraps simple-git show for ref:path lookups to read files at any branch or commit
---

# read-file

## Goal

Read file content at a specific git ref. Enables the AI agent to compare base and head versions of files for breaking change detection.

## Container Connection

The agent calls this to read both the old (base) and new (head) versions of source files during breaking change analysis (Step 2 in the system prompt).

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | `simple-git` | External: simple-git |
| OUT (provides) | `readFileAtRef()`, `ReadFileAtRefParams`, `ReadFileAtRefResult` | c3-210, c3-311 |

## Code References

| File | Purpose |
|------|---------|
| `packages/tools-core/src/tools/read-file.ts` | `readFileAtRef()` implementation (17 lines) |

## Related Refs

| Ref | How It Serves Goal |
|-----|-------------------|
| ref-git-operations | Uses `git show ref:path` via simple-git |
