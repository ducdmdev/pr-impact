# CLAUDE.md -- @pr-impact/mcp-server

## What this package does

MCP server exposing pr-impact analysis as tools for AI assistants. Uses stdio transport. Binary is `pr-impact-mcp`. Depends on `@pr-impact/core` for all analysis logic.

## Quick commands

```bash
pnpm build                    # Build with tsup
node dist/index.js            # Run server (reads stdin, writes stdout)
```

## Source layout

```
src/
  index.ts                    Server entry point (McpServer + StdioServerTransport)
  tools/
    analyze-diff.ts           analyze_diff -- full PR analysis
    get-breaking-changes.ts   get_breaking_changes -- breaking changes with severity filter
    get-risk-score.ts         get_risk_score -- risk score with factor breakdown
    get-impact-graph.ts       get_impact_graph -- import dependency graph
```

## Key conventions

- ESM only. Use `.js` extensions in all import paths.
- All analysis logic comes from `@pr-impact/core` -- tools only handle input validation and output formatting.
- Tool input schemas use `zod`. All parameters are optional with sensible defaults.
- Each tool returns `{ content: [{ type: 'text', text }] }` on success, adds `isError: true` on failure.
- Server handles SIGINT/SIGTERM for graceful shutdown via `server.close()`.
- Mock `McpServer` in tests must include a `close()` method to avoid unhandled rejection during teardown.

## Dependencies

- `@modelcontextprotocol/sdk` -- MCP protocol server implementation
- `zod` -- input schema validation
- `@pr-impact/core` -- analysis engine
