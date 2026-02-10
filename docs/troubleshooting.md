# Troubleshooting

Common issues when using pr-impact and how to resolve them.

---

## Git Errors

### "fatal: bad revision 'main...HEAD'"

**Cause:** The base branch (`main`) doesn't exist locally. This often happens in CI where only the PR branch is checked out.

**Fix:** Use the remote-prefixed branch name:

```bash
pri analyze origin/main HEAD
```

Or ensure the base branch is fetched:

```bash
git fetch origin main
pri analyze main HEAD
```

### "Not a git repository"

**Cause:** pr-impact is being run in a directory that isn't a git repository.

**Fix:** Either `cd` into a git repo or use the `--repo` flag:

```bash
pri analyze --repo /path/to/your/repo
```

### Shallow clone — missing history

**Cause:** CI environments often use shallow clones (`fetch-depth: 1`) for speed. pr-impact needs full history to compute diffs between branches.

**Fix:** In GitHub Actions:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0    # Full clone
```

In GitLab CI:

```yaml
variables:
  GIT_DEPTH: 0
```

In CircleCI, full clones are the default. If you've set `shallow: true`, remove it.

### "fatal: ambiguous argument"

**Cause:** The head branch reference doesn't resolve. This can happen with detached HEAD states or when the branch name contains special characters.

**Fix:** Use explicit refs:

```bash
# Use the commit SHA directly
pri analyze origin/main abc1234

# Or the full ref
pri analyze origin/main refs/heads/feature/my-branch
```

---

## Breaking Change Detection

### False positives from re-exports

**Symptom:** pr-impact reports breaking changes for symbols that are still exported, just re-exported from a different internal path.

**Context:** The breaking change detector compares exports at the file level. If you move a function from `utils.ts` to `helpers.ts` and re-export it from `utils.ts`, it won't be flagged. But if you remove the re-export, it will be flagged even if it's still available from `helpers.ts`.

**Workaround:** Filter by severity (`--severity medium`) to reduce noise from low-severity renames, or skip breaking change detection for non-library projects (`--no-breaking`).

### Non-TypeScript/JavaScript files flagged

**Symptom:** Breaking changes reported for files that aren't part of the public API.

**Context:** Breaking change detection runs on all source files (anything categorized as `source` by the file categorizer). Config files, test files, and docs are excluded.

**Workaround:** This typically doesn't happen because the file categorizer correctly classifies non-source files. If it does, it may indicate a file categorization issue — please report it.

---

## Test Coverage

### Coverage ratio is 0 even though tests exist

**Symptom:** `pri analyze` reports 0% test coverage even though your project has tests.

**Cause:** pr-impact checks whether **changed** source files have corresponding **changed** test files. If you changed source code but didn't modify any tests, coverage is 0 — even if tests exist and pass.

**This is intentional.** The check isn't "do tests exist?" but "did you update tests for the code you changed?"

### Test file not recognized

**Symptom:** You updated a test file but it's not counted toward coverage.

**Cause:** pr-impact maps source files to test files using naming conventions:
- `src/foo.ts` maps to `__tests__/foo.test.ts`, `src/foo.test.ts`, `test/foo.test.ts`, etc.
- It looks for `.test.ts`, `.spec.ts`, `.test.js`, `.spec.js` suffixes

If your test files use a different naming pattern, they may not be recognized.

**Workaround:** Use `--no-coverage` if your project's test naming doesn't match, or consider standardizing test file names.

---

## Risk Score

### Score seems too high

**Cause:** The risk score is a weighted combination of six factors. A large diff alone can push the score above 50 even with no breaking changes.

**Debug:** Run `pri risk` to see the factor breakdown. Identify which factor is driving the score:

```bash
pri risk origin/main HEAD
```

Common drivers of high scores:
- **Diff size** — PRs with >500 changed lines score 80/100 on this factor (weight: 0.15)
- **Untested changes** — If many source files changed without test updates (weight: 0.25)
- **Config changes** — CI/build config modifications score 100/100 (weight: 0.10)

**Fix:** Consider raising your `--threshold` if the current setting produces too many false positives, or split large PRs into smaller ones.

### Score is 0 for a non-trivial PR

**Cause:** The PR might only contain test files, documentation, or config files that don't trigger breaking change detection or test coverage checks.

**This is expected.** If the PR doesn't change source files, most risk factors score 0.

---

## CI Integration

### `pri comment` fails with 403

**Cause:** The GitHub token doesn't have permission to create or update PR comments.

**Fix:** Ensure the token has `pull-requests: write` permission:

```yaml
permissions:
  pull-requests: write

steps:
  - name: Post report
    run: pri comment origin/main HEAD
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### `pri comment` can't detect PR number

**Cause:** `pri comment` auto-detects the PR number from CI environment variables. This works in GitHub Actions, GitLab CI, and CircleCI. Other CI systems may not set the expected variables.

**Fix:** Pass the PR number explicitly:

```bash
pri comment origin/main HEAD --pr 123 --github-repo owner/repo
```

### Exit code 2 in CI

**Meaning:** Exit code 2 means an internal error occurred (not a quality gate failure). The analysis itself crashed.

**Debug:** Check the command output for error messages. Common causes:
- Shallow clone (see above)
- Missing branch references
- Insufficient permissions

---

## MCP Server

### "Server not found" in Claude Code

**Cause:** The MCP server configuration is incorrect or the package isn't installed.

**Fix:** Verify your `.claude/mcp.json`:

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

Make sure `npx` is available on your PATH. Test manually:

```bash
npx -y @pr-impact/mcp-server
```

### MCP tools return empty results

**Cause:** The MCP server defaults to `process.cwd()` as the repository path. If the working directory isn't a git repo, analysis will fail or return empty results.

**Fix:** Pass `repoPath` explicitly when calling tools, or ensure the MCP server is started from within a git repository.

---

## Performance

### Analysis is slow

The full `pri analyze` runs all steps in parallel, but each step involves git operations. Performance depends on:

- **Repository size** — larger repos with more files take longer for import resolution
- **Diff size** — more changed files means more comparisons
- **Impact depth** — deeper impact graph traversal is slower

**Tips:**
- Use `--no-breaking` or `--no-docs` to skip steps you don't need
- Use `pri risk` or `pri breaking` instead of `pri analyze` if you only need one check
- For the impact graph, reduce `--depth` (default 3) if traversal is too broad

---

## Getting Help

If you encounter an issue not covered here:

1. Run with `--format json` to get structured output for debugging
2. Check the [GitHub Issues](https://github.com/ducdmdev/pr-impact/issues) for known problems
3. Open a new issue with the command you ran, the error message, and your Node.js/git versions
