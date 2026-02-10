# CLAUDE.md -- @pr-impact/core

## What this package does

Analysis engine for pr-impact. Pure logic, no I/O except git via `simple-git` and file discovery via `fast-glob`. All other packages depend on this one.

## Quick commands

```bash
pnpm build                    # Build with tsup
pnpm test                     # Run vitest
npx vitest run packages/core/__tests__/FILE.test.ts  # Single test file
```

## Source layout

```
src/
  analyzer.ts               Top-level analyzePR() orchestrator (runs steps via Promise.all)
  types.ts                  All shared TypeScript interfaces
  index.ts                  Barrel exports (public API)
  diff/
    diff-parser.ts          Parse git diff into ChangedFile[]
    file-categorizer.ts     Classify files as source/test/doc/config/other
  breaking/
    detector.ts             Detect breaking changes across changed files
    export-differ.ts        Diff exported symbols (regex-based, not AST)
    signature-differ.ts     Compare function/class signatures
  coverage/
    coverage-checker.ts     Check whether changed source files have test changes
    test-mapper.ts          Map source files to expected test files
  docs/
    staleness-checker.ts    Find stale references in doc files
  imports/
    import-resolver.ts      Resolve import paths, find consumers, reverse dep map
  impact/
    impact-graph.ts         Build import dependency graph from changed files
  risk/
    risk-calculator.ts      Calculate weighted risk score from all factors
    factors.ts              Individual risk factor evaluators with weights
  output/
    markdown-reporter.ts    Format PRAnalysis as Markdown
    json-reporter.ts        Format PRAnalysis as JSON
```

## Key conventions

- ESM only. Use `.js` extensions in all import paths.
- All shared types go in `types.ts`. Import types from there.
- New public APIs must be re-exported from `index.ts`.
- Export parsing uses **regex**, not AST. See `export-differ.ts`.
- Risk scoring uses six weighted factors defined in `factors.ts`.
- `analyzePR()` runs analysis steps in parallel via `Promise.all`.

## Testing

- Tests live in `__tests__/` and use vitest.
- Unit tests only -- mock `simple-git` calls, never depend on real git state.
- 14 test files, covering all modules.

## Dependencies

- `simple-git` -- all git operations
- `fast-glob` -- file discovery for test mapping and imports
