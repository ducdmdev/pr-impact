---
id: c3-301
c3-version: 4
title: Template Embedding
type: component
category: foundation
parent: c3-3
goal: Build-time template generation for runtime access
summary: scripts/embed-templates.ts reads templates/*.md and generates src/generated/templates.ts as string constants
---

# Template Embedding

## Goal

Build-time template generation for runtime access. The action runs as a single bundled CJS file with no access to the source repo's templates/ directory, so templates must be embedded as string constants.

## Container Connection

Without this foundation, the agentic client (c3-310) would have no system prompt or report template at runtime. This enables the "templates as single source of truth" abstract constraint.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | `templates/system-prompt.md`, `templates/report-template.md` | Shared templates |
| OUT (provides) | `SYSTEM_PROMPT`, `REPORT_TEMPLATE` constants | c3-310 (agentic-client) |

## Code References

| File | Purpose |
|------|---------|
| `scripts/embed-templates.ts` | Build script that generates templates.ts (26 lines) |
| `packages/action/src/generated/templates.ts` | Generated output (auto-generated, do not edit) |

## Related Refs

| Ref | How It Serves Goal |
|-----|-------------------|
| ref-build-pipeline | Defines the template embedding convention |
