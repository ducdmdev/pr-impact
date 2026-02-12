---
id: c3-312
c3-version: 4
title: Comment Poster
type: component
category: feature
parent: c3-3
goal: Upsert PR comments via GitHub API with HTML markers
summary: Searches for existing pr-impact comment by HTML markers, PATCHes or POSTs accordingly
---

# Comment Poster

## Goal

Upsert PR comments via GitHub API with HTML markers. Ensures each PR has exactly one pr-impact report comment that gets updated on re-runs rather than creating duplicates.

## Container Connection

Delivers the analysis report to the PR where developers review it. Without this, reports would only be available as action outputs.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | `fetch` (global) | Node.js built-in |
| OUT (provides) | `postOrUpdateComment()` returning comment URL | c3-313 (action-entrypoint) |

## Behavior

- Wraps report body in `<!-- pr-impact:start -->` / `<!-- pr-impact:end -->` markers
- `findExistingComment()`: Paginates through PR comments (100 per page) searching for the start marker; logs warning on API failure instead of silently returning null
- If existing comment found: PATCH to update
- If no existing comment: POST to create
- Uses GitHub REST API v3 with `X-GitHub-Api-Version: 2022-11-28`

## Code References

| File | Purpose |
|------|---------|
| `packages/action/src/comment.ts` | `postOrUpdateComment()`, `findExistingComment()` (66 lines) |
