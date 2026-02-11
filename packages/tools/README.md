# @pr-impact/tools

MCP server that exposes git/repo tools for AI-powered PR impact analysis. Wraps `@pr-impact/tools-core` handlers with zod input schemas and the MCP protocol.

## Usage

### With any MCP client

```json
{
  "mcpServers": {
    "pr-impact": {
      "command": "npx",
      "args": ["-y", "@pr-impact/tools"]
    }
  }
}
```

### Available Tools

| Tool | Description |
|---|---|
| `git_diff` | Get raw git diff between two branches, optionally for a single file |
| `read_file_at_ref` | Read a file's content at a specific git ref |
| `list_changed_files` | List files changed between two branches with status and stats |
| `search_code` | Search for a regex pattern in the codebase |
| `find_importers` | Find files that import a given module |
| `list_test_files` | Find test files associated with a source file |

## Architecture

- `src/index.ts` -- MCP server entry point using stdio transport
- `src/register.ts` -- Tool registration with zod schemas

The server uses `@modelcontextprotocol/sdk` for the MCP protocol and `zod` for input validation.

## License

[MIT](../../LICENSE)
