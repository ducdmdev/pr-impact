---
id: c3-201
c3-version: 4
title: MCP Server
type: component
category: foundation
parent: c3-2
goal: MCP stdio transport with lifecycle management
summary: Creates McpServer, connects StdioServerTransport, handles SIGINT/SIGTERM graceful shutdown
---

# MCP Server

## Goal

MCP stdio transport with lifecycle management. Provides the runtime process that hosts all registered tools and communicates via JSON-RPC over stdin/stdout.

## Container Connection

Without this foundation, no MCP client can connect to the tools. It owns the process lifecycle that the skill (c3-4) and external AI clients depend on.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | `@modelcontextprotocol/sdk` (McpServer, StdioServerTransport) | External |
| IN (uses) | `registerAllTools()` | c3-210 (tool-registration) |
| OUT (provides) | Running MCP server process | c3-4 (skill via npx), external AI clients |

## Code References

| File | Purpose |
|------|---------|
| `packages/tools/src/index.ts` | Server creation, transport connection, signal handling (25 lines) |
