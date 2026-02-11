# Design: AI Agent Rewrite of pr-impact

**Date**: 2026-02-11
**Status**: Draft
**Author**: ducdm

---

## Motivation

Replace all deterministic TypeScript analysis code with an AI agent that reasons about PR impact directly. The current regex-based export parsing, heuristic test mapping, and rule-based risk scoring are limited in what they can detect. An AI agent can understand code semantics, explain findings, and provide actionable recommendations.

## Goals

- AI agent performs all analysis: breaking changes, test coverage gaps, doc staleness, impact graph, risk scoring
- Deliver as a **Claude Code plugin** for interactive use
- Deliver as a **GitHub Action** for automated CI
- Structured output using a predefined template (consistent across runs)
- Conversational follow-up in Claude Code (ask why, get suggestions)

## Non-Goals

- Support for non-Claude LLMs (may revisit later)
- Keeping the old deterministic analysis as a fallback
- Real-time streaming of partial results

---

## Architecture Overview

Four packages replace the current three (`core`, `cli`, `mcp-server`). The key design decision is a shared `tools-core` package containing pure tool logic that both the MCP server and GitHub Action import. This eliminates the DRY violation of duplicating tool implementations.

```
pr-impact/
├── packages/
│   ├── tools-core/          @pr-impact/tools-core (pure tool functions)
│   │   └── src/
│   │       ├── index.ts           Barrel exports
│   │       ├── git-diff.ts        Get diff between branches
│   │       ├── read-file.ts       Read file at a specific git ref
│   │       ├── list-files.ts      List changed files between branches
│   │       ├── search-code.ts     Search for patterns in codebase
│   │       ├── find-importers.ts  Find files that import a given path
│   │       └── list-tests.ts      List test files related to a source file
│   │
│   ├── tools/               @pr-impact/tools (MCP server)
│   │   └── src/
│   │       ├── index.ts           MCP server entry (stdio transport)
│   │       └── tools/
│   │           ├── git-diff.ts        MCP wrapper for tools-core
│   │           ├── read-file.ts       MCP wrapper for tools-core
│   │           ├── list-files.ts      MCP wrapper for tools-core
│   │           ├── search-code.ts     MCP wrapper for tools-core
│   │           ├── find-importers.ts  MCP wrapper for tools-core
│   │           └── list-tests.ts      MCP wrapper for tools-core
│   │
│   ├── skill/               Claude Code plugin
│   │   ├── .claude-plugin/
│   │   │   └── config.json      Plugin metadata
│   │   ├── skill.md             Skill definition (assembled from templates at build time)
│   │   ├── mcp.json             Registers @pr-impact/tools MCP server
│   │   └── package.json
│   │
│   └── action/              GitHub Action
│       ├── action.yml           Action metadata
│       ├── src/
│       │   ├── index.ts         Entry point
│       │   ├── client.ts        Anthropic API client with tool use
│       │   └── templates.ts     Generated file — prompt/report templates as string constants
│       ├── tsconfig.json
│       └── package.json
│
├── templates/               Shared prompt & report templates
│   ├── system-prompt.md     Core analysis methodology
│   └── report-template.md   Output structure
│
└── scripts/
    └── build-skill.ts       Assembles skill.md from templates
```

### Package Dependency Graph

```
@pr-impact/tools       ──depends──> @pr-impact/tools-core
@pr-impact/action      ──depends──> @pr-impact/tools-core
@pr-impact/skill       ──uses MCP──> @pr-impact/tools
templates/             ──assembled by──> scripts/build-skill.ts ──into──> skill/skill.md
```

`tools-core` is a pure library with no I/O framework dependencies. It exports plain async functions that accept parameters and return typed results. The `tools` package wraps each function in an MCP tool definition. The `action` package calls the same functions directly in its agentic loop.

---

## MCP Tools (`@pr-impact/tools-core` + `@pr-impact/tools`)

Six thin tools that give the AI read-only access to the repository. No analysis logic — tools return raw data, the AI interprets it. The pure implementations live in `tools-core`; the MCP server in `tools` wraps them with schema validation and MCP transport.

| Tool | Purpose | Parameters | Returns |
|---|---|---|---|
| `git_diff` | Get diff between two branches | `repoPath`, `base`, `head`, `file?` | Raw diff text |
| `read_file_at_ref` | Read file content at a git ref | `repoPath`, `ref`, `filePath` | File contents |
| `list_changed_files` | List files changed between branches | `repoPath`, `base`, `head` | `{path, status, additions, deletions}[]` |
| `search_code` | Search for a pattern in the codebase | `repoPath`, `pattern`, `glob?` | `{file, line, match}[]` |
| `find_importers` | Find files that import a given module | `repoPath`, `modulePath` | File paths array |
| `list_test_files` | Find test files related to a source file | `repoPath`, `sourceFile` | Test file paths array |

**Implementation**: Uses `simple-git` for git operations and `fast-glob` for file discovery. Each tool function in `tools-core` is ~20 lines.

**`list_changed_files`**: Returns `{path, status, additions, deletions}[]`. The `status` field (added/modified/deleted/renamed) comes from `git.diffSummary()`, which provides this information per file. This lets the AI know which files are new, removed, or renamed without calling `git_diff` on every file.

**`search_code`**: Uses `git grep` internally. The `glob` parameter is passed as a `--` pathspec to `git grep` for filtering by file pattern. Handles `git grep` exit code 1 (no matches found) gracefully by returning `{ matches: [] }` instead of throwing.

**`find_importers`**: Builds a reverse dependency map by scanning all source files in the repository. The map is cached internally for the duration of the MCP server session — subsequent calls to `find_importers` with different `modulePath` values reuse the cached map, avoiding repeated filesystem scans.

**Context window management**: `git_diff` accepts an optional `file` parameter to get per-file diffs. The system prompt instructs the AI to list changed files first, then inspect selectively.

---

## Prompt Templates

### System Prompt (`templates/system-prompt.md`)

Defines the analysis methodology — the "brain" that replaces coded logic:

```markdown
You are a PR impact analyzer. Given access to a git repository, analyze a pull
request and produce a structured impact report.

## Analysis Steps

1. **Diff Overview**: Call `list_changed_files` to get all changed files.
   Categorize each as source/test/doc/config/other.

2. **Breaking Change Detection**: For each changed source file that exports
   public API symbols:
   - Call `read_file_at_ref` for both base and head versions
   - Compare exported functions, classes, types, interfaces
   - Identify: removed exports, changed signatures, changed types, renames
   - For each breaking change, call `find_importers` to find consumers
   - Assign severity: high (removed/renamed), medium (changed signature),
     low (changed type)

3. **Test Coverage Gaps**: For each changed source file:
   - Call `list_test_files` to find associated tests
   - Check if those test files appear in the changed file list
   - Flag source files that changed without test updates

4. **Documentation Staleness**: For each changed doc file:
   - Look for references to modified/deleted symbols, paths, or patterns
   - Flag references that point to changed or removed targets

5. **Impact Graph**: For each changed source file:
   - Call `find_importers` to build the dependency chain
   - Identify directly changed vs. indirectly affected files
   - Only call `find_importers` once per directly changed source file
     (do not recurse into indirect consumers)

6. **Risk Assessment**: Score each factor 0-100, apply weights:
   - Breaking changes (0.30): 100 if high, 60 if medium, 30 if low, 0 if none
   - Untested changes (0.25): (1 - coverageRatio) * 100
   - Diff size (0.15): 0 (<100), 50 (100-500), 80 (500-1000), 100 (>1000)
   - Stale docs (0.10): min(staleRefs * 20, 100)
   - Config changes (0.10): 100 if CI/build, 50 if other, 0 if none
   - Impact breadth (0.10): min(indirectlyAffected * 10, 100)

## Rules
- Always use tools to verify — never guess about file contents or imports.
- If a file is too large, focus on exported symbols and public API.
- Categorize every finding with severity and evidence.
- Always use `git_diff` with the `file` parameter — never load the full diff at once.

## Large PR Strategy
- If >30 changed files: only call `read_file_at_ref` for files with >50 lines
  changed. For smaller changes, rely on the per-file diff from `git_diff`.
- If >50 changed files: focus only on source files. Skip documentation
  staleness check entirely.
- For `find_importers`: call once per directly changed source file only.
  Do not follow indirect consumers.
```

### Report Template (`templates/report-template.md`)

```markdown
# PR Impact Report

## Summary
- **Risk Score**: {score}/100 ({level})
- **Files Changed**: {count} ({additions} added, {deletions} deleted)
- **Breaking Changes**: {count} ({high} high, {medium} medium, {low} low)
- **Test Coverage**: {ratio}% of changed source files have test updates
- **Stale Doc References**: {count}

## Breaking Changes
| File | Change | Symbol | Severity | Consumers |
|------|--------|--------|----------|-----------|

## Test Coverage Gaps
| Source File | Expected Test | Test Exists | Test Updated |
|-------------|---------------|-------------|--------------|

## Impact Graph
### Directly Changed
### Indirectly Affected

## Risk Factor Breakdown
| Factor | Score | Weight | Details |
|--------|-------|--------|---------|

## Recommendations
(AI-generated: explains findings and suggests next steps)
```

---

## Claude Code Skill (Plugin)

### Plugin Config (`.claude-plugin/config.json`)

```json
{
  "name": "@pr-impact/skill",
  "version": "1.0.0",
  "description": "AI-powered PR impact analysis",
  "skills": ["skill.md"]
}
```

### MCP Registration (`mcp.json`)

```json
{
  "mcpServers": {
    "pr-impact-tools": {
      "command": "npx",
      "args": ["-y", "@pr-impact/tools"]
    }
  }
}
```

### Skill Definition (`skill.md`)

```markdown
---
name: pr-impact
description: Analyze PR impact — breaking changes, test coverage, risk score
arguments:
  - name: base
    description: Base branch (default: main)
    required: false
  - name: head
    description: Head branch (default: HEAD)
    required: false
---

{system-prompt content}

Analyze the PR comparing `$base` (default: main) to `$head` (default: HEAD).
Use the pr-impact MCP tools. Follow the analysis steps exactly.
Output using the report template.

{report-template content}
```

### Template Assembly

`skill.md` is **not** manually maintained. It is assembled at build time by `scripts/build-skill.ts`, which reads `templates/system-prompt.md` and `templates/report-template.md`, interpolates them into the skill definition skeleton, and writes the final `skill/skill.md`. This ensures the skill always uses the same prompt and report template as the GitHub Action.

The build script runs as part of the `build` task for `@pr-impact/skill` in the Turborepo pipeline.

### User Experience

```bash
/pr-impact                          # Full analysis, main...HEAD
/pr-impact main feature/auth        # Specify branches
# Then conversational follow-up:
"Why is the risk score so high?"
"What would reduce the breaking changes?"
```

---

## GitHub Action

### `action.yml`

```yaml
name: 'PR Impact Analysis'
description: 'AI-powered PR impact analysis'
inputs:
  anthropic-api-key:
    description: 'Anthropic API key'
    required: true
  github-token:
    description: 'GitHub token for posting PR comments'
    required: false
  base-branch:
    description: 'Base branch'
    required: false
    default: 'main'
  model:
    description: 'Claude model'
    required: false
    default: 'claude-sonnet-4-5-20250929'
  threshold:
    description: 'Risk score threshold (fail if >=)'
    required: false
runs:
  using: 'node20'
  main: 'dist/index.js'
```

Note: `github-token` does not use `default: ${{ github.token }}` because that expression syntax only works in workflow files, not in `action.yml` defaults. Users must pass it explicitly in their workflow.

### Workflow Example

```yaml
name: PR Impact
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ducdmdev/pr-impact-action@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ github.token }}
          threshold: 70
```

### Build Configuration

The action is bundled with tsup using **CJS format** (`format: ['cjs']`) because the GitHub Actions runner expects a CommonJS entry point at `dist/index.js`.

**Template embedding**: Templates must be available at runtime but the action runs as a single bundled file with no access to the source repo's `templates/` directory. To solve this, a pre-build step reads `templates/system-prompt.md` and `templates/report-template.md` and generates `src/templates.ts` containing exported string constants:

```typescript
// Auto-generated by build script — do not edit
export const SYSTEM_PROMPT = `...`;
export const REPORT_TEMPLATE = `...`;
```

This file is committed to the action package so the build is hermetic. The build script that generates it runs before tsup in the Turborepo pipeline.

### Implementation Flow

The action imports tool functions from `@pr-impact/tools-core` (bundled at build time by tsup). Flow:

1. Read inputs (base branch, threshold, API key, GitHub token)
2. Load system prompt and report template from embedded string constants
3. Call Claude API with `temperature: 0` and tools defined, `MAX_ITERATIONS = 30`
4. Execute tool calls locally as Claude requests them (calling `tools-core` functions directly)
5. If iteration count reaches `MAX_ITERATIONS` or wall-clock time exceeds **180 seconds**, stop the loop and use whatever results are available. Append a warning to the report: "Analysis terminated early due to resource limits. Results may be incomplete."
6. Collect final report from Claude's response
7. Parse risk score from the report (regex for `**Risk Score**: {N}/100`). If parsing fails, log a warning and set risk score to -1 (threshold check is skipped)
8. Post report as PR comment (upsert with HTML markers)
9. If threshold is set and risk score >= threshold, exit 1

---

## Reliability & Consistency

LLM-based analysis is non-deterministic. Even with identical inputs, results will vary between runs.

- **Use `temperature: 0`** for the most reproducible results. This minimizes but does not eliminate variation.
- **Risk scores may vary +/-5 points** between runs on the same diff. This is inherent to LLM sampling.
- **CI threshold gates should use a buffer**: if you want to catch PRs at risk level 70+, set the threshold to 65 to account for score variance.
- **Claude Code interactive use is unaffected**: users can simply re-run `/pr-impact` if a result seems off, and follow up conversationally for clarification.

---

## Cost & Performance

Switching from deterministic analysis to an LLM agent introduces API costs and higher latency.

| Metric | Estimate |
|---|---|
| Input tokens per analysis | 30k - 80k (depends on PR size and number of tool calls) |
| Output tokens per analysis | 2k - 4k |
| Cost per PR (Sonnet) | $0.30 - $1.50 |
| Cost per PR (Opus) | $1.00 - $5.00 |
| Latency | 30 - 90 seconds (vs. 2-5 seconds for old deterministic approach) |

**Recommendations**:
- Use **Haiku** for CI if cost is a primary concern (fastest, cheapest, still capable for structured analysis)
- Use **Sonnet** for balanced quality/cost (default in `action.yml`)
- Use **Opus** when maximum accuracy matters and cost is not a constraint
- **Claude Code plugin**: no API cost to the user — it uses the host Claude Code instance's context

---

## Migration Plan

### Phase 1: Tools Core + MCP Server + Templates
- Create `packages/tools-core` with 6 pure tool functions
- Create `packages/tools` as MCP server wrapping `tools-core`
- Create `templates/` with system prompt and report template
- Write tests for each tool function (unit tests, mock git)

### Phase 2: Claude Code Plugin
- Create `packages/skill` with plugin config and skill definition
- Create `scripts/build-skill.ts` to assemble `skill.md` from templates
- Register MCP tools via `mcp.json`
- Test interactively with Claude Code

### Phase 3: GitHub Action
- Create `packages/action` with action metadata and TypeScript entry point
- Import tool functions from `@pr-impact/tools-core`
- Create build script to embed templates as string constants
- Configure tsup for CJS output
- Test on a real PR in the repository

### Phase 4: Cleanup
- Remove `packages/core`, `packages/cli`, `packages/mcp-server`
- Update root `package.json`, `turbo.json`, `pnpm-workspace.yaml`
- Update all documentation

---

## Breaking Changes for Existing Users

This rewrite removes the programmatic API and CLI. Users of the current packages must migrate:

| Removed | Migration Path |
|---|---|
| `@pr-impact/core` — `analyzePR()` and all analysis functions | Use the Claude Code plugin (`/pr-impact`) for interactive analysis, or the GitHub Action for CI. There is no programmatic `analyzePR()` equivalent. |
| `@pr-impact/cli` — `pri` binary and all subcommands | Use the Claude Code plugin for local analysis. Use the GitHub Action for CI comment posting. |
| `@pr-impact/mcp-server` — old MCP tool definitions | Replaced by `@pr-impact/tools`. The new tools are data-only (no analysis logic). |

`@pr-impact/tools-core` exports the raw tool functions (`gitDiff`, `readFileAtRef`, `listChangedFiles`, `searchCode`, `findImporters`, `listTestFiles`) but does **not** export any analysis or scoring logic. Analysis is performed entirely by the LLM at runtime.

---

## What Gets Deleted

| Current Package | Reason |
|---|---|
| `packages/core` | All analysis logic replaced by AI reasoning |
| `packages/cli` | Replaced by Claude Code skill |
| `packages/mcp-server` | Replaced by `packages/tools` (thinner, data-only tools) |

## What Gets Reused

| Component | From | In |
|---|---|---|
| `simple-git` usage patterns | `core` | `tools-core` |
| `fast-glob` file discovery | `core` | `tools-core` |
| PR comment upsert logic | `cli/github/comment-poster.ts` | `action` |
| Type interfaces (as output schema reference) | `core/types.ts` | Templates |
| Risk scoring formula and weights | `core/risk/factors.ts` | System prompt |
