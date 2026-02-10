# CLAUDE.md — pr-impact

## Project overview

pr-impact is a PR analysis tool that detects breaking changes, test coverage gaps, stale documentation, and import-graph impact for pull requests. It produces a weighted risk score and generates Markdown or JSON reports.

This is a **pnpm monorepo** managed with **Turborepo**. The workspace is defined in `pnpm-workspace.yaml` and contains three packages under `packages/`.

## Quick commands

```bash
pnpm build                                    # Build all packages (via turbo, respects dependency order)
pnpm test                                     # Run all tests (vitest, workspace mode)
npx vitest run packages/core/__tests__/FILE.test.ts  # Run a single test file
pnpm lint                                     # Lint all packages (ESLint flat config)
pnpm lint:fix                                 # Lint and auto-fix
pnpm build --filter=@pr-impact/core           # Build only @pr-impact/core
pnpm build --filter=@pr-impact/cli            # Build only @pr-impact/cli
pnpm clean                                    # Remove all dist/ directories
pnpm changeset                                # Create a new changeset for versioning
pnpm version-packages                         # Apply changesets and bump versions
pnpm release                                  # Build all packages and publish to npm
```

## Architecture

```
packages/
  core/       @pr-impact/core      — Analysis engine. Pure logic, no I/O except git via simple-git.
  cli/        @pr-impact/cli       — Commander-based CLI (`pri`). Depends on core.
  mcp-server/ @pr-impact/mcp-server — MCP server exposing tools to LLMs. Depends on core.
```

### packages/core (the main package)

All analysis logic lives here. Source is organized by analysis layer:

```
src/
  analyzer.ts               — Top-level analyzePR() orchestrator (runs steps in parallel)
  types.ts                  — All shared TypeScript interfaces
  index.ts                  — Barrel exports for the public API
  diff/
    diff-parser.ts          — Parse git diff into ChangedFile[]
    file-categorizer.ts     — Classify files as source/test/doc/config/other
  breaking/
    detector.ts             — Detect breaking changes across changed files
    export-differ.ts        — Diff exported symbols between base and head (regex-based)
    signature-differ.ts     — Compare function/class signatures for changes
  coverage/
    coverage-checker.ts     — Check whether changed source files have test changes
    test-mapper.ts          — Map source files to their expected test files
  docs/
    staleness-checker.ts    — Find stale references in doc files
  imports/
    import-resolver.ts      — Resolve import paths and find consumers of changed files
  impact/
    impact-graph.ts         — Build import dependency graph from changed files
  risk/
    risk-calculator.ts      — Calculate weighted risk score from all factors
    factors.ts              — Individual risk factor evaluators with weights
  output/
    markdown-reporter.ts    — Format PRAnalysis as Markdown
    json-reporter.ts        — Format PRAnalysis as JSON
```

### packages/cli

Commander-based CLI binary (`pri`). Commands live in `src/commands/`:
- `analyze.ts` — full analysis
- `breaking.ts` — breaking changes only
- `comment.ts` — post analysis report as PR comment (upsert via HTML markers)
- `impact.ts` — impact graph only
- `risk.ts` — risk score only

GitHub integration helpers live in `src/github/`:
- `ci-env.ts` — auto-detect PR number and repo from CI environment variables
- `comment-poster.ts` — create/update PR comments via GitHub API (native fetch)

Dependencies: commander, chalk, ora.

### packages/mcp-server

MCP server exposing tools via `@modelcontextprotocol/sdk`. Tool definitions live in `src/tools/`:
- `analyze-diff.ts`
- `get-breaking-changes.ts`
- `get-impact-graph.ts`
- `get-risk-score.ts`

Dependencies: @modelcontextprotocol/sdk, zod.

## Code conventions

- **ESM only** — all packages use `"type": "module"`. Use `.js` extensions in all import paths (even for `.ts` source files), e.g. `import { parseDiff } from './diff/diff-parser.js'`.
- **TypeScript strict mode** — `tsconfig.base.json` sets `"strict": true`, target ES2022, module ES2022 with bundler resolution.
- **All shared types** are defined in `packages/core/src/types.ts`. Import types from there.
- **Barrel exports** — the public API of `@pr-impact/core` is defined in `packages/core/src/index.ts`. Any new public function or type must be re-exported from this file.
- **Linting** — ESLint flat config (`eslint.config.mjs`) with `typescript-eslint` (type-checked), `@stylistic/eslint-plugin` (formatting), and `eslint-plugin-vitest` (test files). No Prettier needed.
- **tsup** is used for bundling all packages. Config: ESM format, dts generation, sourcemaps, clean output.
- **Turbo** task graph: `build` depends on `^build` (dependency packages build first); `test` depends on `build`; `lint` depends on `^build`.
- **Changesets** — `@changesets/cli` manages versioning and changelogs. All three packages use fixed versioning (same version number). Release workflow in `.github/workflows/release.yml` auto-creates "Version Packages" PRs and publishes to npm on merge to `main`.

## Key patterns

- **Git operations** use `simple-git` (the `simpleGit()` function). All git calls go through this library, never raw `child_process`.
- **File discovery** uses `fast-glob` for finding files in the repo.
- **Export parsing** uses **regex-based parsing** (not tree-sitter or AST). See `export-differ.ts`.
- **Risk scoring** uses six weighted factors (defined in `risk/factors.ts`):
  - Breaking changes — weight 0.30
  - Untested changes — weight 0.25
  - Diff size — weight 0.15
  - Stale documentation — weight 0.10
  - Config file changes — weight 0.10
  - Impact breadth — weight 0.10
- **Parallel analysis** — `analyzePR()` runs breaking-change detection, test coverage, doc staleness, and impact graph building concurrently via `Promise.all`.

## Documentation

Detailed documentation lives in `docs/`:

### Adoption Guides

| Document | Description |
|---|---|
| [`docs/getting-started.md`](docs/getting-started.md) | Installation, first run, understanding the output, common workflows |
| [`docs/ci-integration.md`](docs/ci-integration.md) | GitHub Actions, GitLab CI, CircleCI, Jenkins examples, exit codes, thresholds, PR comments |
| [`docs/mcp-integration.md`](docs/mcp-integration.md) | MCP server architecture, 4 available tools with parameters, tool registration pattern, client configuration (Claude Code, Claude Desktop, Cursor, VS Code), manual testing with MCP Inspector |
| [`docs/programmatic-api.md`](docs/programmatic-api.md) | Using `@pr-impact/core` as a library, individual analysis steps, types, error handling, custom CI scripts |
| [`docs/configuration-guide.md`](docs/configuration-guide.md) | Threshold selection, skipping analysis steps, monorepo considerations, impact depth, output formats |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | Git errors, shallow clones, false positives, test coverage issues, CI integration, MCP server problems |

### Internal Architecture

| Document | Description |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Monorepo layout, package dependency graph, build pipeline, core module organization, external dependencies, design principles |
| [`docs/analysis-pipeline.md`](docs/analysis-pipeline.md) | The 6-step `analyzePR()` pipeline, sequence diagram, skip behavior, entry points (CLI / MCP / programmatic) |
| [`docs/data-flow.md`](docs/data-flow.md) | Type relationships (ER diagram), data flow through the pipeline, internal types, module-to-type mapping |
| [`docs/risk-scoring.md`](docs/risk-scoring.md) | Risk formula, 6 factor weights and scoring logic, score-to-level mapping, worked example |

## Testing guidelines

- Tests use **vitest** and live in `packages/core/__tests__/`.
- Test file naming convention: `MODULE_NAME.test.ts` (e.g. `export-differ.test.ts`, `risk-calculator.test.ts`).
- Only the `packages/core` workspace is included in the vitest workspace config (`vitest.workspace.ts`).
- Write **unit tests only** — do not write integration tests that require a real git repository.
- **Mock git operations** (simple-git calls) where needed; tests should not depend on filesystem or git state.
- Existing test files:
  - `analyzer.test.ts`
  - `coverage-checker.test.ts`
  - `detector.test.ts`
  - `diff-parser.test.ts`
  - `export-differ.test.ts`
  - `file-categorizer.test.ts`
  - `impact-graph.test.ts`
  - `import-resolver.test.ts`
  - `json-reporter.test.ts`
  - `markdown-reporter.test.ts`
  - `risk-calculator.test.ts`
  - `signature-differ.test.ts`
  - `staleness-checker.test.ts`
  - `test-mapper.test.ts`
