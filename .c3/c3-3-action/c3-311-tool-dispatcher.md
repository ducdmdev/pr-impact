---
id: c3-311
c3-version: 4
title: Tool Dispatcher
type: component
category: feature
parent: c3-3
goal: Route tool_use calls to tools-core functions
summary: Switch-based dispatch with repoPath injection and JSON stringification
---

# Tool Dispatcher

## Goal

Route tool_use calls to tools-core functions. Translates the Anthropic API's tool_use blocks into direct calls to the tools-core handler functions.

## Container Connection

Bridge between the agentic client's API layer and the shared tool implementations. Without this, tool_use blocks would have no execution target.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | All 6 handler functions | c3-1 tools-core (c3-110 through c3-115) |
| OUT (provides) | `executeTool(name, input)` | c3-310 (agentic-client) |

## Behavior

- Switch on tool name, cast input to handler parameter types
- Returns string: raw text for git_diff/read_file, JSON.stringify for structured results
- Throws for unknown tool names

## Code References

| File | Purpose |
|------|---------|
| `packages/action/src/tools.ts` | `executeTool()` switch dispatcher (39 lines) |
