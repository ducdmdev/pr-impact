# Configuration Guide

Guidance on tuning pr-impact for your project — choosing thresholds, skipping unnecessary checks, and handling monorepo setups.

---

## Threshold Selection

### Risk Score Threshold (`pri risk --threshold`)

The risk score ranges from 0 to 100. Choosing a threshold depends on your team's risk tolerance:

| Threshold | Blocks | Best for |
|---|---|---|
| `--threshold 75` | Critical only | Large, fast-moving projects where most PRs touch many files |
| `--threshold 60` | High + Critical | **Recommended default.** Blocks genuinely risky PRs without too much friction |
| `--threshold 50` | Medium + High + Critical | Stricter teams, libraries with public API stability guarantees |
| `--threshold 26` | Everything except Low | Very strict; every non-trivial change needs attention |

**Starting recommendation:** Begin with `--threshold 60` and adjust based on false-positive rates over 2-4 weeks. If the gate blocks PRs that your team considers safe, raise the threshold. If risky PRs slip through, lower it.

### Breaking Change Severity (`pri breaking --severity`)

| Severity | What it catches | When to use |
|---|---|---|
| `--severity low` | All breaking changes including renames | Public libraries, strict API contracts |
| `--severity medium` | Signature changes + removed exports | **Recommended default.** Catches real breakage without noise from renames |
| `--severity high` | Only removed exports and drastic signature changes | Internal projects where consumers can be updated quickly |

---

## Skipping Analysis Steps

Some analysis steps may not be relevant for every project.

### `--no-breaking`

Skip breaking change detection. Use when:
- The project has no exported API (e.g., a standalone application, not a library)
- Breaking change detection produces too many false positives for your codebase

### `--no-coverage`

Skip test coverage gap analysis. Use when:
- The project uses a different test file naming convention that pr-impact doesn't recognize
- Test coverage is enforced through other tools (e.g., Istanbul/c8 coverage thresholds)

### `--no-docs`

Skip documentation staleness checking. Use when:
- The project has no documentation files
- Documentation is maintained separately (e.g., in a different repo or wiki)

### Example: Application with no public API

```bash
pri analyze --no-breaking
pri risk --threshold 60 --no-breaking
```

### Example: Minimal check (just risk score from diff size + test coverage)

```bash
pri analyze --no-breaking --no-docs
```

---

## Monorepo Considerations

pr-impact operates on the entire git diff between two branches. In a monorepo, this means changes across all packages are analyzed together.

### Running against the whole monorepo

```bash
# This analyzes ALL changes across all packages
pri analyze origin/main HEAD
```

This works well when:
- You want a single risk score for the entire PR
- Breaking changes in shared packages should surface as risks

### Running against a specific package

pr-impact doesn't have a built-in package filter, but you can scope the analysis by pointing `--repo` at a subdirectory (if it's its own git repo) or by using the programmatic API to filter `ChangedFile[]` by path prefix.

```typescript
import { parseDiff, calculateRisk, detectBreakingChanges } from '@pr-impact/core';

const allFiles = await parseDiff('.', 'main', 'HEAD');
const coreFiles = allFiles.filter(f => f.path.startsWith('packages/core/'));

// Run analysis only on core package files
const breaking = await detectBreakingChanges('.', 'main', 'HEAD', coreFiles);
```

---

## Impact Graph Depth

The `--depth` flag on `pri impact` controls how many levels of transitive imports to follow:

| Depth | Behavior | Use case |
|---|---|---|
| `1` | Direct consumers only | Quick check, large codebases |
| `3` | Three levels of transitive imports | **Default.** Good balance of coverage and noise |
| `5+` | Deep traversal | Small codebases, thorough impact analysis |

Deeper traversal is slower and may surface files that are only loosely related. Start with the default (3) and increase if you need more visibility.

---

## Output Formats

| Format | Flag | Best for |
|---|---|---|
| Markdown | `--format md` | Human reading, PR comments |
| JSON | `--format json` | Parsing in scripts, dashboards, custom reporting |
| Plain text | `--format text` | Terminal output (default for `pri risk`) |
| Graphviz DOT | `--format dot` | Generating visual impact diagrams |

### Generating impact diagrams

```bash
pri impact --format dot > impact.dot
dot -Tsvg impact.dot -o impact.svg
```

Requires [Graphviz](https://graphviz.org/) installed (`brew install graphviz` on macOS).

---

## Environment Variables

| Variable | Used by | Description |
|---|---|---|
| `GITHUB_TOKEN` | `pri comment` | GitHub API token for posting PR comments |

`pri comment` auto-detects the PR number and repository from CI environment variables (GitHub Actions, GitLab CI, CircleCI). You can override with `--pr` and `--github-repo` flags.

---

## Next Steps

- [CI Integration](./ci-integration.md) — Set up automated quality gates
- [Risk Scoring](./risk-scoring.md) — Understand how the risk score is calculated
- [Troubleshooting](./troubleshooting.md) — Common issues and fixes
