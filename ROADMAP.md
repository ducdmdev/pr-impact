# pr-impact Roadmap

## Phase 1: Quality & DX (Low effort) -- COMPLETED

### 1.1 Linting Setup -- Done
- [x] ESLint flat config + typescript-eslint + @stylistic/eslint-plugin
- [x] Files: `eslint.config.mjs`, `.editorconfig`, root `package.json`, `turbo.json`
- [x] No Prettier needed — @stylistic handles formatting
- [x] Rules: single quotes, semicolons, 2-space indent, trailing commas, no-floating-promises, no-explicit-any

### 1.2 Coverage to ~99% -- Done
- [x] Added tests for all modules (14 test files total)
- [x] `core/index.ts` at 0% is a V8 artifact (barrel re-exports) — excluded from coverage

### 1.3 Documentation Fixes -- Done
- [x] Added `imports/import-resolver.ts` to CLAUDE.md directory listing
- [x] Updated CLAUDE.md test files list (all 14 test files)
- [x] Updated docs/architecture.md with Imports Layer in module diagram
- [x] Updated docs/data-flow.md with import-resolver in module-to-type mapping
- [x] Added lint commands and ESLint convention to CLAUDE.md

## Phase 2: Distribution (Medium effort) -- COMPLETED

### 2.1 MCP Server Distribution -- Done
- [x] Added `main`, `exports`, `description`, `keywords`, `engines`, `bin` to mcp-server package.json
- [x] Added Claude Desktop config example to docs/mcp-integration.md
- [x] Added Cursor and VS Code (Copilot MCP) config examples
- [x] Added MCP Inspector manual testing instructions

### 2.2 Release Workflow (Changesets) -- Done
- [x] Installed @changesets/cli, created `.changeset/config.json` (fixed versioning across all 3 packages)
- [x] Added `publishConfig.access: "public"` to all 3 package.jsons
- [x] Added `license`, `description`, `repository`, `keywords`, `engines` to all package.jsons
- [x] Created `.github/workflows/release.yml` (auto Version Packages PR + npm publish)
- [x] Added `changeset`, `version-packages`, `release` scripts to root package.json

## Phase 3: Features (Medium-High effort) -- COMPLETED

### 3.1 PR Comment Posting -- Done
- [x] New `pri comment` subcommand (upsert via HTML markers)
- [x] No new deps -- native fetch (Node 20+)
- [x] Auto-detect PR number from CI env vars (GitHub Actions, GitLab, CircleCI)
- [x] Files: `commands/comment.ts`, `github/comment-poster.ts`, `github/ci-env.ts`
- [x] Updated docs/ci-integration.md with built-in `pri comment` workflow and options table

### 3.2 Export Parsing Improvements -- Done
- [x] Short term: Fixed regex gaps
  - [x] Added `declare` keyword support
  - [x] Added `abstract class` support
  - [x] Fixed `const enum` (dedicated regex before variable regex)
  - [x] Added `function*` (generators)
  - [x] Added destructured export detection
  - [x] Synced staleness-checker.ts regex
- Long term (deferred): Migrate to ts-morph or TS compiler API for `export *` barrel support

## Phase 4: Performance (Optional)

### 4.1 Eliminate Double Repo Scan
- `findConsumers()` and `buildImpactGraph()` both independently scan entire repo
- Option A: Pass impact graph's reverse-dep map to detector
- Option B: Extract shared `buildReverseDependencyMap()` function, run once in analyzePR()
