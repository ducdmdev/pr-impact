# CLAUDE.md -- pr-impact

## Project overview

pr-impact is an AI-powered PR analysis tool that detects breaking changes, test coverage gaps, stale documentation, and import-graph impact for pull requests. It uses Claude to analyze diffs via tool calls and produces a weighted risk score with a structured Markdown report.

This is a **pnpm monorepo** managed with **Turborepo**. The workspace is defined in `pnpm-workspace.yaml` and contains four packages under `packages/`.

## Quick commands

```bash
pnpm build                                        # Build all packages (via turbo, respects dependency order)
pnpm test                                          # Run all tests (vitest)
npx vitest run packages/action/__tests__/FILE.test.ts  # Run a single test file
pnpm lint                                          # Lint all packages (ESLint flat config)
pnpm lint:fix                                      # Lint and auto-fix
pnpm build --filter=@pr-impact/tools-core          # Build only tools-core
pnpm build --filter=@pr-impact/action              # Build only action (includes prebuild for templates)
pnpm clean                                         # Remove all dist/ directories
```

## Architecture

```
packages/
  tools-core/  @pr-impact/tools-core  -- Pure tool handler functions. No framework dependency.
  tools/       @pr-impact/tools       -- MCP server wrapping tools-core. Depends on tools-core.
  action/      @pr-impact/action      -- GitHub Action with agentic Claude loop. Depends on tools-core.
  skill/       @pr-impact/skill       -- Claude Code plugin (no runtime deps, built from templates).
```

### Dependency graph

```
@pr-impact/tools  ────> @pr-impact/tools-core
@pr-impact/action ────> @pr-impact/tools-core
@pr-impact/skill        (no runtime dependencies)
```

### packages/tools-core (shared foundation)

Pure handler functions for git/repo operations. Both `tools` (MCP) and `action` (GitHub Action) import from here.

```
src/
  index.ts                  -- Barrel exports for all handlers and types
  tool-defs.ts              -- Canonical tool definitions (TOOL_DEFS, ToolDef, ToolParamDef)
  tools/
    git-diff.ts             -- Get raw git diff between two refs
    read-file.ts            -- Read file content at a specific git ref
    list-files.ts           -- List changed files with status and stats
    search-code.ts          -- Search for regex patterns via git grep
    find-imports.ts         -- Find files that import a given module (cached)
    list-tests.ts           -- Find test files associated with a source file
```

Dependencies: simple-git, fast-glob.

### packages/tools (MCP server)

Thin MCP server wrapping tools-core handlers with zod schemas:

```
src/
  index.ts                  -- MCP server entry point (stdio transport)
  register.ts               -- Tool registration with zod input schemas
```

Dependencies: @modelcontextprotocol/sdk, zod, @pr-impact/tools-core.

### packages/action (GitHub Action)

GitHub Action that runs an agentic Claude loop to analyze PRs:

```
src/
  index.ts                  -- GitHub Action entry point (reads inputs, runs analysis, posts comment)
  client.ts                 -- Anthropic API client with 30-iteration limit, 180s timeout, temperature 0
  tools.ts                  -- Tool dispatcher (switch on tool name, calls tools-core)
  comment.ts                -- PR comment poster (upsert via HTML markers)
  generated/
    templates.ts            -- Auto-generated at build time from templates/*.md
```

Dependencies: @anthropic-ai/sdk, @actions/core, @actions/github, @pr-impact/tools-core.

**Build note:** The `prebuild` script runs `tsx ../../scripts/embed-templates.ts` to generate `src/generated/templates.ts` before tsup bundles. Output is CJS (`dist/index.cjs`) because GitHub Actions requires CommonJS. All dependencies are bundled via `noExternal: [/.*/]`.

### packages/skill (Claude Code plugin)

Claude Code plugin that provides the `/pr-impact` slash command:

```
.claude-plugin/
  plugin.json                -- Plugin metadata (name, version, description)
.mcp.json                    -- MCP server reference (points to @pr-impact/tools via npx)
skills/
  pr-impact/
    SKILL.md                 -- GENERATED: assembled skill prompt (do not edit)
package.json                 -- Build script only
```

**Build note:** The build script (`tsx ../../scripts/build-skill.ts`) assembles `skills/pr-impact/SKILL.md` from `templates/system-prompt.md` and `templates/report-template.md`.

### Shared templates

```
templates/
  system-prompt.md           -- System prompt for Claude analysis (analysis steps, rules, scoring)
  report-template.md         -- Report output format template (sections, tables)
```

These are the single source of truth. Both `action` (via embed-templates.ts) and `skill` (via build-skill.ts) consume them at build time.

### Build scripts

```
scripts/
  embed-templates.ts         -- Reads templates/*.md, generates action/src/generated/templates.ts
  build-skill.ts             -- Reads templates/*.md, generates skill/skills/pr-impact/SKILL.md
```

## Code conventions

- **ESM only** -- all packages use `"type": "module"`. Use `.js` extensions in all import paths (even for `.ts` source files), e.g. `import { gitDiff } from './tools/git-diff.js'`.
- **CJS exception** -- the `action` package builds to CJS format (`dist/index.cjs`) because GitHub Actions requires CommonJS. Source code is still ESM.
- **TypeScript strict mode** -- `tsconfig.base.json` sets `"strict": true`, target ES2022, module ES2022 with bundler resolution.
- **Linting** -- ESLint flat config (`eslint.config.mjs`) with `typescript-eslint` (type-checked), `@stylistic/eslint-plugin` (formatting), and `eslint-plugin-vitest` (test files). No Prettier needed.
- **tsup** is used for bundling `tools-core`, `tools`, and `action`. The `skill` package uses a custom build script.
- **Turbo** task graph: `build` depends on `^build` (dependency packages build first); `test` depends on `build`; `lint` depends on `^build`.
- **Generated files** -- `packages/action/src/generated/templates.ts` and `packages/skill/skills/pr-impact/SKILL.md` are auto-generated. Do not edit manually.

## Key patterns

- **Git operations** use `simple-git` (the `simpleGit()` function). All git calls go through this library, never raw `child_process`.
- **File discovery** uses `fast-glob` for finding files in the repo.
- **`find_importers` caches the reverse dependency map** -- built on first call, reused within the same session. Call `clearImporterCache()` to reset.
- **Tool handlers return plain objects** -- the MCP wrapper (`tools`) handles formatting as MCP ToolResult. The action dispatcher (`action/tools.ts`) handles stringification.
- **Templates are embedded at build time** -- no filesystem reads at runtime for prompts or report formats.
- **Client has safety limits** -- 30-iteration max, 180-second wall-clock timeout, `temperature: 0` for consistency.
- **Risk score parsing is explicit** -- if parsing fails, logs warning and skips threshold check instead of false-failing.
- **Risk scoring** uses six weighted factors:
  - Breaking changes -- weight 0.30
  - Untested changes -- weight 0.25
  - Diff size -- weight 0.15
  - Stale documentation -- weight 0.10
  - Config file changes -- weight 0.10
  - Impact breadth -- weight 0.10

## Testing guidelines

- Tests use **vitest** and live in `__tests__/` directories within each package.
- Test file naming convention: `MODULE_NAME.test.ts` (e.g. `git-diff.test.ts`, `tools.test.ts`).
- Vitest projects are configured in `vitest.config.ts` (root) with `packages/tools-core`, `packages/tools`, and `packages/action`.
- Write **unit tests only** -- do not write integration tests that require a real git repository.
- **Mock git operations** (simple-git calls) and external dependencies where needed; tests should not depend on filesystem or git state.
- Test files per package (14 files, 100 tests):
  - `packages/tools-core/__tests__/`: git-diff, read-file, list-files, search-code, find-imports, list-tests, regression (7 files)
  - `packages/tools/__tests__/`: index, register, build-scripts (3 files)
  - `packages/action/__tests__/`: tools, client, comment, index (4 files)
