# CLAUDE.md -- @pr-impact/skill

## What this package does

Claude Code plugin that provides the `/pr-impact` slash command. No runtime dependencies -- everything is assembled at build time from shared templates.

## Quick commands

```bash
pnpm build --filter=@pr-impact/skill   # Build: assemble SKILL.md from templates
```

## File layout

```
.claude-plugin/
  plugin.json            -- Plugin metadata (name, version, description)
.mcp.json                -- MCP server reference (points to @pr-impact/tools via npx)
skills/
  pr-impact/
    SKILL.md             -- GENERATED: assembled skill prompt (do not edit)
package.json             -- Build script only
```

## Key patterns

- **Generated file**: `skills/pr-impact/SKILL.md` is assembled by `scripts/build-skill.ts` from `templates/system-prompt.md` and `templates/report-template.md`. Do not edit it manually.
- **MCP integration**: `.mcp.json` tells Claude Code to start the `@pr-impact/tools` MCP server, making all 6 tools available during analysis.
- **No runtime deps**: the published package contains only static files (`.claude-plugin/`, `.mcp.json`, `skills/`).
- **Published files**: controlled by the `files` array in `package.json` -- only `.claude-plugin`, `.mcp.json`, and `skills` are included.

<!-- c3-generated: c3-401,c3-410 -->
## Architecture docs

Before modifying this code, read:
- Container: `.c3/c3-4-skill/README.md`
- Components:
  - `.c3/c3-4-skill/c3-401-plugin-config.md`
  - `.c3/c3-4-skill/c3-410-skill-prompt.md`
- Patterns: `ref-build-pipeline`

Full refs: `.c3/refs/ref-{name}.md`
<!-- end-c3-generated -->
