# @pr-impact/action

GitHub Action that runs an agentic Claude loop to analyze pull requests and produce structured impact reports.

## Usage

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

## Inputs

| Input | Description | Required | Default |
|---|---|---|---|
| `anthropic-api-key` | Anthropic API key for Claude | Yes | -- |
| `github-token` | GitHub token for posting PR comments | No | -- |
| `base-branch` | Base branch to compare against | No | `main` |
| `model` | Claude model to use | No | `claude-sonnet-4-5-20250929` |
| `threshold` | Fail the action if risk score >= this value | No | -- |

## Outputs

| Output | Description |
|---|---|
| `risk-score` | Calculated risk score (0-100), or `-1` if parsing fails |
| `risk-level` | Risk level: `low`, `medium`, `high`, `critical`, or `unknown` |
| `report` | Full markdown analysis report |

## How It Works

1. Reads action inputs and detects PR context
2. Starts an agentic loop with Claude using the Anthropic API
3. Claude calls tools (`git_diff`, `read_file_at_ref`, `list_changed_files`, etc.) to gather evidence
4. Claude produces a structured risk report following the embedded system prompt
5. Parses the risk score, sets outputs, optionally posts a PR comment
6. Fails the action if risk score exceeds the threshold

Safety limits: 30-iteration max, 180-second timeout, temperature 0.

## License

[MIT](../../LICENSE)
