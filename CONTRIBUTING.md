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
pnpm build                             # Build all packages (Turborepo, dependency order)
pnpm build --filter=@pr-impact/core    # Build a single package
```

### Test

```bash
pnpm test                              # Run all tests
npx vitest run packages/core/__tests__/FILE.test.ts  # Run a single test file
pnpm test:watch                        # Watch mode
```

### Lint

```bash
pnpm lint                              # Check for lint errors
pnpm lint:fix                          # Auto-fix
```

## Project Structure

```
packages/
  core/        @pr-impact/core       Analysis engine (pure logic)
  cli/         @pr-impact/cli        Commander CLI (pri)
  mcp-server/  @pr-impact/mcp-server MCP server for AI assistants
```

`core` has no workspace dependencies. Both `cli` and `mcp-server` depend on `core`.

## Code Conventions

- **ESM only** -- use `.js` extensions in all import paths (even for `.ts` files)
- **TypeScript strict mode** -- no `any` unless unavoidable
- **Shared types** go in `packages/core/src/types.ts`
- **Public API** must be re-exported from `packages/core/src/index.ts`
- **No Prettier** -- formatting is handled by `@stylistic/eslint-plugin`

## Writing Tests

- Tests use **vitest** and live in `__tests__/` directories
- Write **unit tests only** -- do not depend on real git repos or filesystem state
- Mock `simple-git` calls where needed
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
- Documentation changes that affect the published package README (patch)

### What Doesn't Need a Changeset

- Changes to dev-only files (tests, CI config, this file)
- Changes to docs that aren't published with packages

## Reporting Issues

Open an issue at [github.com/ducdmdev/pr-impact/issues](https://github.com/ducdmdev/pr-impact/issues) with:
- The command you ran
- Expected vs actual behavior
- Node.js and pnpm versions
- OS

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
