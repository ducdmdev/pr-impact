# @pr-impact/skill

Claude Code plugin that provides the `/pr-impact` slash command for AI-powered PR impact analysis.

## Installation

```bash
claude plugin add @pr-impact/skill
```

## Usage

In Claude Code, run:

```
/pr-impact
```

Or with arguments:

```
/pr-impact main feature-branch
```

This starts an AI-driven analysis of your current branch against `main`, using MCP tools to gather evidence and produce a structured risk report.

## How It Works

The plugin bundles:
- **skills/pr-impact/SKILL.md** -- System prompt with analysis methodology and report template
- **.mcp.json** -- References `@pr-impact/tools` MCP server for git/repo tools
- **.claude-plugin/plugin.json** -- Plugin metadata

At build time, `SKILL.md` is assembled from shared templates (`templates/system-prompt.md` and `templates/report-template.md`).

## License

[MIT](../../LICENSE)
