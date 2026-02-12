---
id: c3-210
c3-version: 4
title: Tool Registration
type: component
category: feature
parent: c3-2
goal: Convert tool-defs to zod schemas and register on MCP server
summary: defToZod() converts canonical definitions to zod; registerAllTools() wires each handler with try/catch
---

# Tool Registration

## Goal

Convert tool-defs to zod schemas and register on MCP server. Bridges the canonical tool definitions from c3-101 into the MCP SDK's expected format with schema validation.

## Container Connection

This is the sole feature component — it translates the shared tool contract into MCP-specific registrations, making tools-core handlers accessible via the MCP protocol.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | `TOOL_DEFS` | c3-101 (tool-definitions) |
| IN (uses) | All 6 handler functions | c3-110 through c3-115 |
| IN (uses) | `zod`, `McpServer` | External |
| OUT (provides) | `registerAllTools()` | c3-201 (mcp-server) |

## Behavior

- `defToZod()`: Converts ToolDef to `Record<string, z.ZodTypeAny>`, adding MCP-specific `repoPath` optional param
- Each tool is registered with `server.tool(name, description, schema, handler)`
- Handlers wrap tools-core calls in try/catch: success returns `{ content: [{type: 'text', text}] }`, error returns `{ isError: true }`
- Types (`ToolDef`, param interfaces) imported from `@pr-impact/tools-core` via `import type`

## Code References

| File | Purpose |
|------|---------|
| `packages/tools/src/register.ts` | `registerAllTools()`, `defToZod()` (145 lines) |

## Related Refs

| Ref | How It Serves Goal |
|-----|-------------------|
| ref-esm-conventions | Uses workspace:* dependency with .js import extensions |
