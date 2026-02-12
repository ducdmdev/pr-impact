---
id: c3-2
c3-version: 4
title: tools
type: container
boundary: service
parent: c3-0
goal: Expose tools-core as MCP protocol tools for AI clients
summary: Thin MCP server wrapping tools-core with zod schemas via stdio transport
---

# tools

## Goal

Expose tools-core as MCP protocol tools for AI clients. Provides the MCP stdio server that the Claude Code skill (c3-4) registers and that any MCP-compatible client can connect to.

## Responsibilities

- Run MCP server on stdio transport (JSON-RPC)
- Convert canonical tool definitions to zod input schemas
- Wrap each tools-core handler in MCP try/catch error formatting
- Handle graceful shutdown on SIGINT/SIGTERM

## Complexity Assessment

**Level:** simple
**Why:** Thin wrapper layer with no business logic. Each tool registration follows the same pattern: defToZod + try/catch + JSON.stringify. The only non-trivial aspect is lifecycle management (signal handling).

## Components

| ID | Name | Category | Status | Goal Contribution |
|----|------|----------|--------|-------------------|
| c3-201 | mcp-server | foundation | implemented | Stdio transport and process lifecycle |
| c3-210 | tool-registration | feature | implemented | Converts tool-defs to zod schemas and registers handlers |
