# Getting Started

A quick guide to installing pr-impact and running your first analysis.

---

## Prerequisites

- **Node.js** >= 18
- **Git** — the repository you want to analyze must be a git repo with at least two branches (or commits) to compare
- The repository must have a **full clone** (not shallow) so `git diff` can access full history

---

## Installation

### Global install (recommended for CLI usage)

```bash
# npm
npm install -g @pr-impact/cli

# pnpm
pnpm add -g @pr-impact/cli
```

### Per-project install

```bash
npm install --save-dev @pr-impact/cli
```

Then run via `npx pri` or add scripts to your `package.json`.

### As a library

```bash
npm install @pr-impact/core
```

See the [Programmatic API Guide](./programmatic-api.md) for library usage.

---

## First Run

Navigate to any git repository and run:

```bash
pri analyze
```

This compares `main` (or `master`, auto-detected) against `HEAD` and prints a full Markdown report covering:

- Breaking changes
- Test coverage gaps
- Stale documentation references
- Import dependency impact graph
- Weighted risk score

### Specify branches explicitly

```bash
pri analyze origin/develop feature/my-branch
```

The first argument is the **base** branch (what you're merging into) and the second is the **head** branch (what you're merging).

---

## Understanding the Output

### Risk Score

The report ends with a risk score from 0 to 100:

| Score Range | Level | Meaning |
|---|---|---|
| 0 -- 25 | **Low** | Routine change, low blast radius |
| 26 -- 50 | **Medium** | Some risk factors present, review recommended |
| 51 -- 75 | **High** | Significant risk, careful review required |
| 76 -- 100 | **Critical** | Major breaking changes or large untested diff |

The score is a weighted combination of six factors. Run `pri risk` for a detailed factor breakdown. See [Risk Scoring](./risk-scoring.md) for the full formula.

### Breaking Changes

Each breaking change includes:

- **File** — which file was affected
- **Type** — what changed (removed export, changed signature, renamed symbol, etc.)
- **Severity** — `low`, `medium`, or `high`
- **Consumers** — which files import the affected symbol

### Test Coverage Gaps

Lists source files that changed but have no corresponding test file changes. A coverage ratio of `1.0` means every changed source file also had test updates.

### Impact Graph

Shows **directly changed** files and **indirectly affected** files (consumers that import the changed files, transitively up to depth 3).

---

## Common Workflows

### Quick breaking change check

```bash
pri breaking
```

Exits with code 1 if any breaking changes are found. Use `--severity medium` to only fail on medium or high severity.

### Risk gate for PRs

```bash
pri risk --threshold 60
```

Exits with code 1 if the risk score is 60 or above.

### Impact of a specific file

```bash
pri impact src/auth/login.ts
```

Shows which files depend on `src/auth/login.ts` and would be affected by changes to it.

### JSON output for scripting

```bash
pri analyze --format json --output report.json
pri risk --format json
```

---

## Next Steps

- [CI Integration](./ci-integration.md) — Set up automated quality gates in your CI pipeline
- [MCP Integration](./mcp-integration.md) — Let AI assistants use pr-impact as a tool
- [Programmatic API](./programmatic-api.md) — Use pr-impact as a library in your own code
- [Configuration Guide](./configuration-guide.md) — Tune thresholds and skip unnecessary checks
- [Troubleshooting](./troubleshooting.md) — Common issues and solutions
