# CLAUDE.md -- @pr-impact/cli

## What this package does

Commander-based CLI for pr-impact. Binary is called `pri`. Depends on `@pr-impact/core` for all analysis logic.

## Quick commands

```bash
pnpm build                    # Build with tsup
node dist/index.js analyze    # Run locally after build
```

## Source layout

```
src/
  index.ts                    CLI entry point (commander program)
  commands/
    analyze.ts                Full analysis (md/json output, file output)
    breaking.ts               Breaking changes only (severity filter, exit code 1)
    risk.ts                   Risk score (threshold gate, exit code 1)
    impact.ts                 Impact graph (text/json/dot output)
    comment.ts                Post/update PR comment on GitHub
  github/
    ci-env.ts                 Auto-detect PR number/repo from CI env vars
    comment-poster.ts         Create/update PR comments via GitHub API (native fetch)
```

## Key conventions

- ESM only. Use `.js` extensions in all import paths.
- All analysis logic comes from `@pr-impact/core` -- CLI only handles I/O, formatting, and exit codes.
- Commander's `.action()` handler types `opts` as `any` -- this is expected.
- Exit code `1` = threshold exceeded (breaking changes found, risk too high). Exit code `2` = execution error.
- CI environment auto-detection supports GitHub Actions, GitLab CI, and CircleCI.

## Dependencies

- `commander` -- CLI argument parsing
- `chalk` -- terminal colors
- `ora` -- spinners
- `@pr-impact/core` -- analysis engine
