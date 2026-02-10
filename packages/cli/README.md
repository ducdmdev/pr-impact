# @pr-impact/cli

Command-line interface for pr-impact -- analyze PRs for breaking changes, risk, and impact from your terminal or CI pipeline.

## Install

```bash
npm install -g @pr-impact/cli
```

The CLI binary is called **`pri`**.

## Commands

### `pri analyze`

Run the full PR impact analysis -- breaking changes, test coverage, doc staleness, impact graph, and risk score.

```bash
pri analyze [base] [head] [options]
```

| Option | Description | Default |
|---|---|---|
| `--format <type>` | Output format: `md` or `json` | `md` |
| `--output <file>` | Write report to file instead of stdout | -- |
| `--repo <path>` | Path to git repository | cwd |
| `--no-breaking` | Skip breaking change detection | -- |
| `--no-coverage` | Skip test coverage analysis | -- |
| `--no-docs` | Skip documentation staleness check | -- |

```bash
pri analyze
pri analyze main HEAD --format json --output report.json
pri analyze --no-breaking --no-docs
```

### `pri breaking`

Detect breaking API changes. Exits with code 1 if any breaking changes are found at or above the specified severity.

```bash
pri breaking [base] [head] [options]
```

| Option | Description | Default |
|---|---|---|
| `--severity <level>` | Minimum severity: `low`, `medium`, `high` | `low` |
| `--format <type>` | Output format: `md` or `json` | `md` |
| `--repo <path>` | Path to git repository | cwd |

```bash
pri breaking
pri breaking --severity high
pri breaking --severity medium   # CI gate
```

### `pri risk`

Calculate and display the weighted risk score with a full factor breakdown.

```bash
pri risk [base] [head] [options]
```

| Option | Description | Default |
|---|---|---|
| `--threshold <n>` | Fail (exit 1) if risk score >= this value | -- |
| `--format <type>` | Output format: `text` or `json` | `text` |
| `--repo <path>` | Path to git repository | cwd |

```bash
pri risk
pri risk --threshold 60          # CI gate
pri risk --format json
```

### `pri impact`

Build and display the import-dependency impact graph.

```bash
pri impact [file] [options]
```

| Option | Description | Default |
|---|---|---|
| `--depth <n>` | Maximum dependency traversal depth | `3` |
| `--format <type>` | Output format: `text`, `json`, or `dot` | `text` |
| `--repo <path>` | Path to git repository | cwd |

```bash
pri impact
pri impact src/auth/login.ts
pri impact --format dot > impact.dot
```

### `pri comment`

Run analysis and post/update a PR comment on GitHub. Auto-detects PR context from CI environment variables (GitHub Actions, GitLab CI, CircleCI).

```bash
pri comment [base] [head] [options]
```

| Option | Description | Default |
|---|---|---|
| `--pr <number>` | PR number | auto-detect from CI |
| `--github-repo <owner/repo>` | GitHub repository | auto-detect from CI |
| `--token <token>` | GitHub token | `GITHUB_TOKEN` env var |
| `--repo <path>` | Path to git repository | cwd |

```bash
pri comment
pri comment --pr 42 --github-repo owner/repo --token $GITHUB_TOKEN
```

## CI Integration

Use `pri breaking` and `pri risk` as quality gates:

```yaml
# GitHub Actions example
- name: Check for breaking changes
  run: pri breaking --severity medium

- name: Check risk threshold
  run: pri risk --threshold 60
```

Exit codes:
- `0` -- success / no issues found
- `1` -- threshold exceeded (breaking changes found, risk too high)
- `2` -- execution error

## Requirements

- Node.js >= 20

## License

[MIT](../../LICENSE)
