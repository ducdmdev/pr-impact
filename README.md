# pr-impact

**AI-powered PR impact analysis -- detect breaking changes, map blast radius, and score risk before you merge.**

<!-- Badges -->
[![Build](https://img.shields.io/github/actions/workflow/status/ducdm/pr-impact/ci.yml?branch=main)](https://github.com/ducdmdev/pr-impact/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
  - [Claude Code Plugin](#claude-code-plugin)
  - [GitHub Action](#github-action)
  - [MCP Server](#mcp-server)
- [Risk Score](#risk-score)
  - [Factor Breakdown](#factor-breakdown)
  - [Risk Levels](#risk-levels)
- [Architecture](#architecture)
- [Development](#development)
- [License](#license)

---

## Features

- **AI-Driven Analysis** -- uses Claude to intelligently analyze PRs, reading diffs, tracing imports, and producing structured reports.
- **Breaking Change Detection** -- finds removed exports, changed function signatures, altered types, and renamed exports; maps each to its downstream consumers.
- **Impact Graph** -- builds an import-dependency graph to show which files are directly changed and which are indirectly affected (blast radius).
- **Test Coverage Gap Analysis** -- identifies source files that changed without corresponding test updates and flags missing test files.
- **Documentation Staleness Check** -- scans docs for references to symbols, files, or paths that were modified or removed.
- **Weighted Risk Score** -- combines six factors (breaking changes, untested code, diff size, stale docs, config changes, impact breadth) into a single 0-100 score with a severity level.
- **Claude Code Plugin** -- use `/pr-impact` directly in Claude Code to analyze the current branch.
- **GitHub Action** -- automated PR analysis with PR comment posting and threshold-based gating.
- **MCP Server** -- expose git/repo tools to any MCP-compatible AI client.

---

## Quick Start

### Claude Code Plugin

Install the plugin to use pr-impact directly in Claude Code:

```bash
claude plugin add @pr-impact/skill
```

Then use the `/pr-impact` slash command:

```
/pr-impact
```

This starts an AI-driven analysis of your current branch against `main`, using the MCP tools to gather evidence and produce a structured report.

### GitHub Action

Add pr-impact to your CI workflow:

```yaml
name: PR Impact Analysis
on: pull_request

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: ducdmdev/pr-impact@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          threshold: '75'
```

#### Action Inputs

| Input | Description | Required | Default |
|---|---|---|---|
| `anthropic-api-key` | Anthropic API key for Claude | Yes | -- |
| `github-token` | GitHub token for posting PR comments | No | -- |
| `base-branch` | Base branch to compare against | No | `main` |
| `model` | Claude model to use | No | `claude-sonnet-4-5-20250929` |
| `threshold` | Risk score threshold -- action fails if score >= this value | No | -- |

#### Action Outputs

| Output | Description |
|---|---|
| `risk-score` | The calculated risk score (0-100) |
| `risk-level` | The risk level (low/medium/high/critical) |
| `report` | The full markdown report |

### MCP Server

The `@pr-impact/tools` package provides an MCP server with 6 git/repo tools for AI assistants.

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

#### Available MCP Tools

| Tool | Description |
|---|---|
| `git_diff` | Get the raw git diff between two branches, optionally for a single file |
| `read_file_at_ref` | Read a file's content at a specific git ref |
| `list_changed_files` | List files changed between two branches with status and stats |
| `search_code` | Search for a regex pattern in the codebase |
| `find_importers` | Find files that import a given module |
| `list_test_files` | Find test files associated with a source file |

---

## Risk Score

The risk score is a weighted average of six independent factors, producing a single number from 0 to 100.

**Formula:**

```
score = sum(factor_score * factor_weight)
```

### Factor Breakdown

| Factor | Weight | Scoring Logic |
|---|---|---|
| **Breaking changes** | 0.30 | `100` if any high-severity, `60` if medium, `30` if low-only, `0` if none |
| **Untested changes** | 0.25 | `(1 - coverageRatio) * 100` -- higher when changed source files lack test updates |
| **Diff size** | 0.15 | `0` if <100 lines, `50` if 100-500, `80` if 500-1000, `100` if >1000 |
| **Stale documentation** | 0.10 | `min(staleReferences * 20, 100)` -- each stale reference adds 20 points |
| **Config file changes** | 0.10 | `100` if CI/build config changed, `50` if other config, `0` if none |
| **Impact breadth** | 0.10 | `min(indirectlyAffected * 10, 100)` -- each affected file adds 10 points |

### Risk Levels

| Score Range | Level |
|---|---|
| 0 -- 25 | **Low** |
| 26 -- 50 | **Medium** |
| 51 -- 75 | **High** |
| 76 -- 100 | **Critical** |

---

## Architecture

pr-impact is a TypeScript monorepo managed with **pnpm** workspaces and **Turborepo**.

```
pr-impact/
├── packages/
│   ├── tools-core/             @pr-impact/tools-core
│   │   └── src/
│   │       ├── index.ts        Barrel exports
│   │       ├── tool-defs.ts    Canonical tool definitions (TOOL_DEFS)
│   │       └── tools/          6 pure handler functions (git-diff, read-file,
│   │                           list-files, search-code, find-imports, list-tests)
│   │
│   ├── tools/                  @pr-impact/tools
│   │   └── src/
│   │       ├── index.ts        MCP server entry point (stdio transport)
│   │       └── register.ts     Tool registration with zod schemas
│   │
│   ├── action/                 @pr-impact/action
│   │   └── src/
│   │       ├── index.ts        GitHub Action entry point
│   │       ├── client.ts       Anthropic API client (agentic loop)
│   │       ├── tools.ts        Tool dispatcher (calls tools-core)
│   │       ├── comment.ts      PR comment poster (upsert via HTML markers)
│   │       └── generated/      Build-time embedded templates
│   │
│   └── skill/                  @pr-impact/skill
│       ├── .claude-plugin/     Claude Code plugin config (plugin.json)
│       ├── .mcp.json           MCP server reference
│       └── skills/pr-impact/   Assembled skill prompt (SKILL.md, built from templates)
│
├── templates/
│   ├── system-prompt.md        System prompt for Claude analysis
│   └── report-template.md     Report output format template
│
├── scripts/
│   ├── embed-templates.ts      Generates action/src/generated/templates.ts
│   └── build-skill.ts          Assembles skill/skills/pr-impact/SKILL.md from templates
│
├── turbo.json                  Turborepo task configuration
├── pnpm-workspace.yaml         Workspace definition
└── package.json                Root scripts
```

### Package Dependency Graph

```
@pr-impact/tools  ────> @pr-impact/tools-core
@pr-impact/action ────> @pr-impact/tools-core
@pr-impact/skill        (no runtime dependencies — assembled at build time)
```

Both `tools` and `action` depend on `tools-core` via `workspace:*` links. The `tools-core` package has no internal workspace dependencies. The `skill` package has no runtime dependencies -- its build script assembles a skill prompt from shared templates.

### Key Dependencies

| Package | Dependency | Purpose |
|---|---|---|
| `tools-core` | `simple-git` | Git operations (diff, show, log) |
| `tools-core` | `fast-glob` | File discovery for test mapping and imports |
| `tools` | `@modelcontextprotocol/sdk` | MCP protocol server implementation |
| `tools` | `zod` | Input schema validation for MCP tools |
| `action` | `@anthropic-ai/sdk` | Claude API client for agentic analysis loop |
| `action` | `@actions/core` | GitHub Actions runtime (inputs, outputs, logging) |
| `action` | `@actions/github` | GitHub context (PR number, repo) |

---

## Development

### Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9

### Setup

```bash
git clone https://github.com/ducdmdev/pr-impact.git
cd pr-impact
pnpm install
pnpm build
```

### Common Commands

```bash
pnpm build                                    # Build all packages (Turborepo, dependency order)
pnpm test                                     # Run all tests
pnpm lint                                     # Lint all packages
pnpm clean                                    # Clean build artifacts
pnpm build --filter=@pr-impact/tools-core     # Build a single package
npx vitest run packages/action/__tests__/FILE.test.ts  # Run a single test file
```

### Project Conventions

- **ESM only** -- all packages use `"type": "module"` with `.js` extensions in import paths.
- **CJS exception** -- the `action` package builds to CJS (GitHub Actions requires a self-contained `dist/index.cjs`).
- **tsup** for building -- `tools-core`, `tools`, and `action` use tsup. `skill` uses a custom build script.
- **Vitest** for testing -- tests live in `__tests__/` directories.
- **Turborepo** for orchestration -- `pnpm build` runs in dependency order (`tools-core` before `tools` and `action`).
- **Templates are embedded at build time** -- the action's `prebuild` script generates `src/generated/templates.ts`. The skill's build script generates `skills/pr-impact/SKILL.md`.

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Migrating from v0.x

v1.0 is a complete architecture rewrite. The three original packages have been replaced:

| v0.x Package | v1.0 Replacement | Notes |
|---|---|---|
| `@pr-impact/core` | `@pr-impact/tools-core` | Deterministic analysis engine replaced by pure git/repo tool functions. Analysis logic is now in the AI agent's system prompt. |
| `@pr-impact/cli` | `@pr-impact/action` | CLI removed. Use the GitHub Action for CI or the Claude Code plugin for local analysis. |
| `@pr-impact/mcp-server` | `@pr-impact/tools` | 4 high-level analysis tools replaced by 6 lower-level git/repo tools. |

For a detailed guide with code examples, see [docs/migration-guide.md](docs/migration-guide.md).

### Key changes

- **Analysis is AI-driven** -- instead of deterministic code paths, Claude reads diffs and traces imports via tool calls, producing richer and more context-aware reports.
- **No CLI** -- the `pri` command is gone. Use the GitHub Action (`@pr-impact/action`) in CI, or the Claude Code plugin (`@pr-impact/skill`) locally.
- **New MCP tools** -- the MCP server now exposes `git_diff`, `read_file_at_ref`, `list_changed_files`, `search_code`, `find_importers`, and `list_test_files` instead of `analyze_diff`, `get_breaking_changes`, `get_impact_graph`, and `get_risk_score`.
- **Programmatic API changed** -- if you imported from `@pr-impact/core`, switch to `@pr-impact/tools-core` for the individual tool functions. The `analyzePR()` orchestrator no longer exists; use the tool functions directly or the GitHub Action.

---

## License

[MIT](LICENSE)
