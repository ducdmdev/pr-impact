# CLAUDE.md -- @pr-impact/skill

## What this package does

Claude Code plugin that provides the `/pr-impact` slash command. No runtime dependencies -- everything is assembled at build time from shared templates.

## Quick commands

```bash
pnpm build --filter=@pr-impact/skill   # Build: assemble skill.md from templates
```

## File layout

```
.claude-plugin/
  config.json          -- Plugin metadata (name, description, skill references)
mcp.json               -- MCP server reference (points to @pr-impact/tools via npx)
skill.md               -- GENERATED: assembled skill prompt (do not edit)
package.json           -- Build script only
```

## Key patterns

- **Generated file**: `skill.md` is assembled by `scripts/build-skill.ts` from `templates/system-prompt.md` and `templates/report-template.md`. Do not edit it manually.
- **MCP integration**: `mcp.json` tells Claude Code to start the `@pr-impact/tools` MCP server, making all 6 tools available during analysis.
- **No runtime deps**: the published package contains only static files (`.claude-plugin/`, `skill.md`, `mcp.json`).
- **Published files**: controlled by the `files` array in `package.json` -- only `.claude-plugin`, `skill.md`, and `mcp.json` are included.
