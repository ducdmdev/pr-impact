# @pr-impact/skill

## 1.0.1

### Patch Changes

- Fix Claude Code plugin structure for correct skill and MCP server registration.

  - Rename `.claude-plugin/config.json` to `plugin.json` (required by Claude Code)
  - Rename `mcp.json` to `.mcp.json` with flat format (matches Claude Code convention)
  - Move `skill.md` to `skills/pr-impact/SKILL.md` (auto-discovered by Claude Code)
  - Replace unsupported `arguments` frontmatter with `argument-hint`
  - Remove explicit `skills`/`mcpServers` fields from plugin.json (auto-discovery)

## 1.0.0

### Major Changes

- 5cbfd52: Replace deterministic analysis engine with AI agent architecture.

  **Breaking:** Removes `@pr-impact/core`, `@pr-impact/cli`, and `@pr-impact/mcp-server`. These are replaced by four new packages:

  - `@pr-impact/tools-core` — Pure tool handler functions (git-diff, read-file, list-files, search-code, find-imports, list-tests)
  - `@pr-impact/tools` — MCP server wrapping tools-core with zod schemas
  - `@pr-impact/action` — GitHub Action with agentic Claude loop (Anthropic API, 30-iteration limit, temperature 0)
  - `@pr-impact/skill` — Claude Code plugin providing `/pr-impact` slash command

  Analysis is now performed by Claude via tool calls rather than deterministic code. The system prompt and report template live in `templates/` and are embedded at build time.
