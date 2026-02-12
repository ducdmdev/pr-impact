---
id: c3-401
c3-version: 4
title: Plugin Config
type: component
category: foundation
parent: c3-4
goal: Claude Code plugin metadata and MCP server registration
summary: .claude-plugin/config.json defines plugin identity; mcp.json registers the tools MCP server
---

# Plugin Config

## Goal

Claude Code plugin metadata and MCP server registration. Tells Claude Code what this plugin provides and which MCP server to start for tool access.

## Container Connection

Without this config, Claude Code wouldn't recognize the package as a plugin or know to start the MCP tools server.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| OUT (provides) | Plugin identity, MCP server registration | Claude Code runtime |
| OUT (provides) | MCP server reference to `@pr-impact/tools` | c3-2 (tools, via npx) |

## Code References

| File | Purpose |
|------|---------|
| `packages/skill/.claude-plugin/config.json` | Plugin name, version, description, skills array |
| `packages/skill/mcp.json` | MCP server command: `npx -y @pr-impact/tools` |
