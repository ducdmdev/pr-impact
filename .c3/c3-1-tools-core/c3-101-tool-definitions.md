---
id: c3-101
c3-version: 4
title: Tool Definitions
type: component
category: foundation
parent: c3-1
goal: Canonical tool schemas shared by MCP server and action
summary: TOOL_DEFS array with name, description, properties, required fields — single source of truth for tool shape
---

# Tool Definitions

## Goal

Canonical tool schemas shared by MCP server and action. Both c3-2 (tools) and c3-3 (action) derive their tool registrations from this single definition, preventing schema drift.

## Container Connection

Without tool-definitions, both consumers would independently define tool schemas, leading to inevitable drift. This foundation component enforces a single source of truth.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| OUT (provides) | `TOOL_DEFS` array, `ToolDef` / `ToolParamDef` types | c3-210 (tool-registration), c3-310 (agentic-client) |

## Code References

| File | Purpose |
|------|---------|
| `packages/tools-core/src/tool-defs.ts` | TOOL_DEFS constant and ToolDef/ToolParamDef interfaces |
| `packages/tools-core/src/index.ts` | Re-exports TOOL_DEFS and types |

## Related Refs

| Ref | How It Serves Goal |
|-----|-------------------|
| ref-esm-conventions | Barrel export pattern with .js extensions |
