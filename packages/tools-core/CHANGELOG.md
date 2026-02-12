# @pr-impact/tools-core

## 1.0.0

### Major Changes

- 5cbfd52: Replace deterministic analysis engine with AI agent architecture.

  **Breaking:** Removes `@pr-impact/core`, `@pr-impact/cli`, and `@pr-impact/mcp-server`. These are replaced by four new packages:

  - `@pr-impact/tools-core` — Pure tool handler functions (git-diff, read-file, list-files, search-code, find-imports, list-tests)
  - `@pr-impact/tools` — MCP server wrapping tools-core with zod schemas
  - `@pr-impact/action` — GitHub Action with agentic Claude loop (Anthropic API, 30-iteration limit, temperature 0)
  - `@pr-impact/skill` — Claude Code plugin providing `/pr-impact` slash command

  Analysis is now performed by Claude via tool calls rather than deterministic code. The system prompt and report template live in `templates/` and are embedded at build time.
