# @pr-impact/mcp-server

[Model Context Protocol](https://modelcontextprotocol.io/) server that exposes pr-impact analysis tools to AI assistants like Claude Code, Cursor, and other MCP-compatible clients.

## Install

```bash
npm install -g @pr-impact/mcp-server
```

## Setup

### Claude Code

Add to `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "pr-impact": {
      "command": "npx",
      "args": ["-y", "@pr-impact/mcp-server"]
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "pr-impact": {
      "command": "npx",
      "args": ["-y", "@pr-impact/mcp-server"]
    }
  }
}
```

### Cursor / VS Code

Follow the editor's MCP server configuration to add:

```
command: npx
args: -y @pr-impact/mcp-server
```

## Available Tools

| Tool | Description |
|---|---|
| `analyze_diff` | Full PR analysis -- breaking changes, test coverage, doc staleness, impact graph, and risk score |
| `get_breaking_changes` | Detect breaking API changes with optional severity filtering |
| `get_risk_score` | Calculate risk score with full factor breakdown |
| `get_impact_graph` | Build import-dependency graph showing directly changed and indirectly affected files |

### Parameters

All tools accept these optional parameters:

| Parameter | Type | Description |
|---|---|---|
| `repoPath` | `string` | Path to git repo (defaults to cwd) |
| `baseBranch` | `string` | Base branch (defaults to main/master) |
| `headBranch` | `string` | Head branch (defaults to HEAD) |

Additional tool-specific parameters:

- **`get_breaking_changes`**: `minSeverity` (`"low"` | `"medium"` | `"high"`) -- filter by minimum severity
- **`get_impact_graph`**: `filePath` (`string`) -- focus on a specific file; `depth` (`number`) -- max graph traversal depth

## Transport

Uses **stdio** transport. The server reads from stdin and writes to stdout, which is the standard transport for local MCP servers.

## Requirements

- Node.js >= 20
- Must be run inside (or pointed at) a git repository

## License

[MIT](../../LICENSE)
