---
id: c3-313
c3-version: 4
title: Action Entrypoint
type: component
category: feature
parent: c3-3
goal: Orchestrate inputs, analysis, outputs, and threshold gating
summary: Reads GitHub Action inputs, runs analysis, parses risk score, posts comment, applies threshold gate
---

# Action Entrypoint

## Goal

Orchestrate inputs, analysis, outputs, and threshold gating. This is the GitHub Action's main() that ties everything together.

## Container Connection

The entry point that makes the action a complete GitHub Action. Without it, the other components are libraries without a consumer.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | `runAnalysis()` | c3-310 (agentic-client) |
| IN (uses) | `postOrUpdateComment()` | c3-312 (comment-poster) |
| IN (uses) | `@actions/core`, `@actions/github` | External |
| OUT (provides) | Action outputs: `risk-score`, `risk-level`, `report` | GitHub Actions runtime |

## Behavior

1. Read inputs: `anthropic-api-key`, `base-branch`, `model`, `threshold`, `github-token`
2. Call `runAnalysis()` with inputs
3. Parse risk score via regex: `**Risk Score**: {N}/100 ({level})`
4. Set action outputs
5. If in PR context with token: post comment
6. If threshold set and score >= threshold: `core.setFailed()`
7. Score parse failure: set score to -1, skip threshold check (no false-fail)

## Code References

| File | Purpose |
|------|---------|
| `packages/action/src/index.ts` | `main()` orchestration (63 lines) |
