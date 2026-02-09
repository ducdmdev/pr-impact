# pr-impact

**Static analysis for pull requests -- detect breaking changes, map blast radius, and score risk before you merge.**

<!-- Badges -->
[![Build](https://img.shields.io/github/actions/workflow/status/ducdm/pr-impact/ci.yml?branch=main)](https://github.com/ducdm/pr-impact/actions)
[![npm](https://img.shields.io/npm/v/@pr-impact/core)](https://www.npmjs.com/package/@pr-impact/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [CLI Commands](#cli-commands)
  - [analyze](#pri-analyze)
  - [breaking](#pri-breaking)
  - [risk](#pri-risk)
  - [impact](#pri-impact)
- [MCP Server (AI Tool Integration)](#mcp-server-ai-tool-integration)
- [Programmatic API](#programmatic-api)
- [Risk Score](#risk-score)
  - [Factor Breakdown](#factor-breakdown)
  - [Risk Levels](#risk-levels)
- [Architecture](#architecture)
- [Development](#development)
- [License](#license)

---

## Features

- **Breaking Change Detection** -- finds removed exports, changed function signatures, altered types, and renamed exports; maps each to its downstream consumers.
- **Impact Graph** -- builds an import-dependency graph to show which files are directly changed and which are indirectly affected (blast radius).
- **Test Coverage Gap Analysis** -- identifies source files that changed without corresponding test updates and flags missing test files.
- **Documentation Staleness Check** -- scans docs for references to symbols, files, or paths that were modified or removed.
- **Weighted Risk Score** -- combines six factors (breaking changes, untested code, diff size, stale docs, config changes, impact breadth) into a single 0-100 score with a severity level.
- **Multiple Output Formats** -- Markdown reports, JSON, plain text, and Graphviz DOT for the impact graph.
- **MCP Server** -- expose every analysis capability as a tool that AI assistants (Claude Code, Cursor, etc.) can call directly.
- **CI-Friendly** -- the `breaking` and `risk` commands exit with code 1 when thresholds are exceeded, making them usable as quality gates.

---

## Quick Start

### Install globally

```bash
# Install the CLI
npm install -g @pr-impact/cli

# Or with pnpm
pnpm add -g @pr-impact/cli
```

### Run from a git repository

```bash
# Full analysis (compares main...HEAD by default)
pri analyze

# Just check for breaking changes
pri breaking

# Get the risk score
pri risk

# View the impact graph
pri impact
```

### Specify branches explicitly

```bash
pri analyze origin/main feature/my-branch
```

---

## CLI Commands

The CLI binary is called **`pri`**. Every command accepts `--repo <path>` to point at a repository other than the current working directory.

### `pri analyze`

Run the full PR impact analysis -- breaking changes, test coverage, doc staleness, impact graph, and risk score combined into a single report.

```
pri analyze [base] [head] [options]
```

| Option | Description | Default |
|---|---|---|
| `[base]` | Base branch | `main` or `master` (auto-detected) |
| `[head]` | Head branch | `HEAD` |
| `--format <type>` | Output format: `md` or `json` | `md` |
| `--output <file>` | Write report to a file instead of stdout | -- |
| `--repo <path>` | Path to the git repository | current directory |
| `--no-breaking` | Skip breaking change detection | -- |
| `--no-coverage` | Skip test coverage analysis | -- |
| `--no-docs` | Skip documentation staleness check | -- |

**Examples:**

```bash
# Markdown report to stdout
pri analyze

# JSON report written to a file
pri analyze main HEAD --format json --output report.json

# Skip expensive checks
pri analyze --no-breaking --no-docs
```

### `pri breaking`

Detect breaking API changes between two branches. Exits with code 1 if any breaking changes are found at or above the specified severity.

```
pri breaking [base] [head] [options]
```

| Option | Description | Default |
|---|---|---|
| `[base]` | Base branch | `main` |
| `[head]` | Head branch | `HEAD` |
| `--severity <level>` | Minimum severity filter: `low`, `medium`, or `high` | `low` |
| `--format <type>` | Output format: `md` or `json` | `md` |
| `--repo <path>` | Path to the git repository | current directory |

**Examples:**

```bash
# Show all breaking changes
pri breaking

# Only high-severity issues
pri breaking --severity high

# Use as a CI gate (exits 1 if any medium+ breaking changes exist)
pri breaking --severity medium
```

### `pri risk`

Calculate and display the weighted risk score with a full factor breakdown.

```
pri risk [base] [head] [options]
```

| Option | Description | Default |
|---|---|---|
| `[base]` | Base branch | `main` or `master` (auto-detected) |
| `[head]` | Head branch | `HEAD` |
| `--threshold <n>` | Fail (exit 1) if risk score >= this value | -- |
| `--format <type>` | Output format: `text` or `json` | `text` |
| `--repo <path>` | Path to the git repository | current directory |

**Examples:**

```bash
# Display the risk breakdown
pri risk

# CI gate: fail if risk is 60 or higher
pri risk --threshold 60

# JSON output for downstream tooling
pri risk --format json
```

### `pri impact`

Build and display the import-dependency impact graph. Shows which files are directly changed and which are indirectly affected through transitive imports.

```
pri impact [file] [options]
```

| Option | Description | Default |
|---|---|---|
| `[file]` | Trace impact for a specific file | all changed files |
| `--depth <n>` | Maximum dependency traversal depth | `3` |
| `--format <type>` | Output format: `text`, `json`, or `dot` | `text` |
| `--repo <path>` | Path to the git repository | current directory |

**Examples:**

```bash
# Full impact graph
pri impact

# Trace a single file
pri impact src/auth/login.ts

# Generate a Graphviz diagram
pri impact --format dot > impact.dot
dot -Tsvg impact.dot -o impact.svg

# Deeper traversal
pri impact --depth 5
```

---

## MCP Server (AI Tool Integration)

The `@pr-impact/mcp-server` package exposes pr-impact as a [Model Context Protocol](https://modelcontextprotocol.io/) server. This lets AI assistants like Claude Code, Cursor, or any MCP-compatible client call the analysis tools directly.

### Setup for Claude Code

Add the server to your Claude Code MCP configuration (`.claude/mcp.json` or the global settings file):

```json
{
  "mcpServers": {
    "pr-impact": {
      "command": "npx",
      "args": ["-y", "@pr-impact/mcp-server"]
    }
  }
}
```

Or if you have the package installed locally in the monorepo:

```json
{
  "mcpServers": {
    "pr-impact": {
      "command": "node",
      "args": ["./packages/mcp-server/dist/index.js"]
    }
  }
}
```

### Available MCP Tools

| Tool | Description | Parameters |
|---|---|---|
| `analyze_diff` | Full PR analysis (breaking changes, coverage, docs, risk) | `repoPath?`, `baseBranch?`, `headBranch?` |
| `get_breaking_changes` | Detect breaking API changes with severity filtering | `repoPath?`, `baseBranch?`, `headBranch?`, `minSeverity?` |
| `get_risk_score` | Calculate risk score with factor breakdown | `repoPath?`, `baseBranch?`, `headBranch?` |
| `get_impact_graph` | Build import-dependency impact graph | `repoPath?`, `baseBranch?`, `headBranch?`, `filePath?`, `depth?` |

All parameters are optional. The server defaults to the current working directory and `main...HEAD`.

---

## Programmatic API

The `@pr-impact/core` package exports every analysis function for use in your own scripts, custom tooling, or CI integrations.

### Install

```bash
npm install @pr-impact/core
```

### Full Analysis

```typescript
import { analyzePR, formatMarkdown, formatJSON } from '@pr-impact/core';

const analysis = await analyzePR({
  repoPath: '/path/to/repo',
  baseBranch: 'main',
  headBranch: 'feature/my-branch',
});

// Structured result
console.log(analysis.riskScore.score);   // 42
console.log(analysis.riskScore.level);   // "medium"
console.log(analysis.breakingChanges);   // BreakingChange[]
console.log(analysis.summary);           // Human-readable summary

// Formatted output
console.log(formatMarkdown(analysis));   // Full Markdown report
console.log(formatJSON(analysis));       // JSON string
```

### Individual Analysis Steps

Each analysis step can be used independently:

```typescript
import {
  parseDiff,
  detectBreakingChanges,
  checkTestCoverage,
  checkDocStaleness,
  buildImpactGraph,
  calculateRisk,
} from '@pr-impact/core';

const repoPath = '/path/to/repo';
const base = 'main';
const head = 'HEAD';

// 1. Parse the git diff
const changedFiles = await parseDiff(repoPath, base, head);

// 2. Detect breaking changes
const breakingChanges = await detectBreakingChanges(
  repoPath, base, head, changedFiles
);

// 3. Check test coverage gaps
const testCoverage = await checkTestCoverage(repoPath, changedFiles);

// 4. Check documentation staleness
const docStaleness = await checkDocStaleness(
  repoPath, changedFiles, base, head
);

// 5. Build the impact graph
const impactGraph = await buildImpactGraph(repoPath, changedFiles);

// 6. Calculate the risk score
const riskScore = calculateRisk(
  changedFiles,
  breakingChanges,
  testCoverage,
  docStaleness,
  impactGraph,
);

console.log(`Risk: ${riskScore.score}/100 (${riskScore.level})`);
```

### Lower-Level Utilities

```typescript
import {
  categorizeFile,
  parseExports,
  diffExports,
  diffSignatures,
  mapTestFiles,
} from '@pr-impact/core';

// Categorize a file path
categorizeFile('src/utils/auth.ts');    // 'source'
categorizeFile('__tests__/auth.test.ts'); // 'test'
categorizeFile('README.md');            // 'doc'
categorizeFile('tsconfig.json');        // 'config'
```

### Key Types

All TypeScript interfaces are exported from `@pr-impact/core`:

```typescript
import type {
  PRAnalysis,         // Top-level result from analyzePR()
  AnalysisOptions,    // Input options for analyzePR()
  ChangedFile,        // A file in the diff
  BreakingChange,     // A detected breaking API change
  TestCoverageReport, // Coverage ratio + gaps
  TestCoverageGap,    // A source file missing test changes
  DocStalenessReport, // Stale doc references
  StaleReference,     // A single stale reference in a doc file
  ImpactGraph,        // Directly/indirectly affected files + edges
  ImpactEdge,         // A single import dependency edge
  RiskAssessment,     // Overall score, level, and factors
  RiskFactor,         // Individual factor with score, weight, description
} from '@pr-impact/core';
```

---

## Risk Score

The risk score is a weighted average of six independent factors, producing a single number from 0 to 100.

**Formula:**

```
score = sum(factor_score * factor_weight) / sum(factor_weight)
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

CI/build config patterns that trigger the highest config score include `.github/`, `Dockerfile`, `docker-compose`, `webpack.config`, `vite.config`, `rollup.config`, `turbo.json`, `.gitlab-ci`, `Jenkinsfile`, `.circleci/`, and `esbuild.config`.

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
│   ├── core/                  @pr-impact/core
│   │   └── src/
│   │       ├── index.ts       Public API exports
│   │       ├── analyzer.ts    Orchestrates the full analysis pipeline
│   │       ├── types.ts       All TypeScript interfaces
│   │       ├── diff/          Git diff parsing & file categorization
│   │       ├── breaking/      Breaking change detection (exports, signatures)
│   │       ├── coverage/      Test file mapping & coverage gap analysis
│   │       ├── docs/          Documentation staleness checking
│   │       ├── impact/        Import dependency graph builder
│   │       ├── risk/          Risk factor evaluation & score calculation
│   │       └── output/        Markdown & JSON report formatters
│   │
│   ├── cli/                   @pr-impact/cli
│   │   └── src/
│   │       ├── index.ts       CLI entry point (commander)
│   │       └── commands/      analyze, breaking, risk, impact
│   │
│   └── mcp-server/            @pr-impact/mcp-server
│       └── src/
│           ├── index.ts       MCP server entry point (stdio transport)
│           └── tools/         analyze_diff, get_breaking_changes,
│                              get_risk_score, get_impact_graph
│
├── turbo.json                 Turborepo task configuration
├── pnpm-workspace.yaml        Workspace definition
└── package.json               Root scripts (build, test, lint, clean)
```

### Package Dependency Graph

```
@pr-impact/cli  ──────────> @pr-impact/core
@pr-impact/mcp-server ────> @pr-impact/core
```

Both `cli` and `mcp-server` depend on `core` via `workspace:*` links. The `core` package has no internal workspace dependencies.

### Key Dependencies

| Package | Dependency | Purpose |
|---|---|---|
| `core` | `simple-git` | Git operations (diff, rev-parse, branch listing) |
| `core` | `fast-glob` | File discovery for test mapping and imports |
| `cli` | `commander` | CLI argument parsing and subcommands |
| `cli` | `chalk` | Terminal color output |
| `cli` | `ora` | Spinner for long-running operations |
| `mcp-server` | `@modelcontextprotocol/sdk` | MCP protocol server implementation |
| `mcp-server` | `zod` | Input schema validation for MCP tools |

---

## Development

### Prerequisites

- **Node.js** >= 18
- **pnpm** >= 9

### Setup

```bash
# Clone the repository
git clone https://github.com/ducdm/pr-impact.git
cd pr-impact

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Common Commands

```bash
# Build all packages (respects dependency order via Turborepo)
pnpm build

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Lint all packages
pnpm lint

# Clean build artifacts
pnpm clean
```

### Running the CLI in Development

```bash
# Build and then run directly
pnpm build
node packages/cli/dist/index.js analyze

# Or link globally
cd packages/cli && pnpm link --global
pri analyze
```

### Project Conventions

- **ESM only** -- all packages use `"type": "module"` with `.js` extensions in import paths.
- **tsup** for building -- each package uses tsup to bundle TypeScript to JavaScript.
- **Vitest** for testing -- tests live alongside source files or in `__tests__/` directories.
- **Turborepo** for orchestration -- `pnpm build` runs in dependency order (`core` before `cli` and `mcp-server`).

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and add tests
4. Run the full build and test suite: `pnpm build && pnpm test`
5. Commit and push to your fork
6. Open a pull request

---

## License

[MIT](LICENSE)
