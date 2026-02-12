# Contributing to pr-impact

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9

## Setup

```bash
git clone https://github.com/ducdmdev/pr-impact.git
cd pr-impact
pnpm install
pnpm build
```

## Development Workflow

### Build

```bash
pnpm build                                 # Build all packages (Turborepo, dependency order)
pnpm build --filter=@pr-impact/tools-core  # Build a single package
```

Build order: `tools-core` builds first, then `tools` and `action` (in parallel), then `skill`.

### Test

```bash
pnpm test                                              # Run all tests
npx vitest run packages/tools-core/__tests__/FILE.test.ts  # Run a single test file
```

### Lint

```bash
pnpm lint                              # Check for lint errors
pnpm lint:fix                          # Auto-fix
```

## Project Structure

```
packages/
  tools-core/  @pr-impact/tools-core  Pure tool handler functions (shared foundation)
  tools/       @pr-impact/tools       MCP server (wraps tools-core)
  action/      @pr-impact/action      GitHub Action (agentic Claude loop)
  skill/       @pr-impact/skill       Claude Code plugin (built from templates)
```

`tools-core` has no workspace dependencies. Both `tools` and `action` depend on `tools-core`. The `skill` package has no runtime dependencies.

## Code Conventions

- **ESM only** -- use `.js` extensions in all import paths (even for `.ts` files)
- **CJS exception** -- the `action` package builds to CJS for GitHub Actions compatibility
- **TypeScript strict mode** -- no `any` unless unavoidable
- **No Prettier** -- formatting is handled by `@stylistic/eslint-plugin`
- **Generated files** -- do not edit `packages/action/src/generated/templates.ts` or `packages/skill/skill.md` manually; they are built from `templates/*.md`

## Writing Tests

- Tests use **vitest** and live in `__tests__/` directories
- Write **unit tests only** -- do not depend on real git repos or filesystem state
- Mock `simple-git` calls and external dependencies where needed
- Name test files: `MODULE_NAME.test.ts`

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and add tests
4. Run the full suite: `pnpm build && pnpm test && pnpm lint`
5. Create a changeset: `pnpm changeset`
6. Commit and push to your fork
7. Open a pull request against `main`

### Changesets

We use [changesets](https://github.com/changesets/changesets) for versioning. When your PR includes user-facing changes, run:

```bash
pnpm changeset
```

This will prompt you to:
1. Select which packages are affected
2. Choose the semver bump type (patch, minor, major)
3. Write a summary of the change

The changeset file will be committed with your PR. The release workflow handles versioning and publishing automatically when PRs are merged to `main`.

### What Needs a Changeset

- Bug fixes (patch)
- New features (minor)
- Breaking changes (major)

### What Doesn't Need a Changeset

- Changes to dev-only files (tests, CI config, this file)
- Changes to docs that aren't published with packages

## Reporting Issues

Open an issue at [github.com/ducdmdev/pr-impact/issues](https://github.com/ducdmdev/pr-impact/issues) with:
- What you were trying to do
- Expected vs actual behavior
- Node.js and pnpm versions
- OS

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
