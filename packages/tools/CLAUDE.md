# CLAUDE.md -- @pr-impact/tools

## What this package does

MCP server that wraps `@pr-impact/tools-core` handlers with zod input schemas and exposes them via the Model Context Protocol (stdio transport).

## Quick commands

```bash
pnpm build --filter=@pr-impact/tools   # Build with tsup (ESM)
npx vitest run packages/tools           # Run tests
```

## Source layout

```
src/
  index.ts       -- Server entry point (StdioServerTransport, SIGINT/SIGTERM handling)
  register.ts    -- registerAllTools(): registers 6 tools with zod schemas on McpServer
```

## Key patterns

- Tool names use snake_case (`git_diff`, `read_file_at_ref`, etc.) to match MCP conventions.
- Each tool wraps the corresponding tools-core function in a try/catch that returns `{ isError: true }` on failure.
- The server responds to JSON-RPC over stdin/stdout (newline-delimited).

## Testing

Tests in `__tests__/` mock `McpServer` (including `close()` method) and verify tool registration and SIGINT/SIGTERM cleanup.

<!-- c3-generated: c3-201,c3-210 -->
## Architecture docs

Before modifying this code, read:
- Container: `.c3/c3-2-tools/README.md`
- Components:
  - `.c3/c3-2-tools/c3-201-mcp-server.md`
  - `.c3/c3-2-tools/c3-210-tool-registration.md`
- Patterns: `ref-esm-conventions`

Full refs: `.c3/refs/ref-{name}.md`
<!-- end-c3-generated -->
