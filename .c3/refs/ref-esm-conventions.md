---
id: ref-esm-conventions
c3-version: 4
title: ESM Module Conventions
goal: Enforce ESM-only with .js extensions and CJS exception for action
scope: [c3-1, c3-2, c3-3, c3-4]
---

# ESM Module Conventions

## Goal

Enforce ESM-only with .js extensions and CJS exception for action. Ensures consistent module resolution across the monorepo.

## Choice

All packages use `"type": "module"` in package.json. Import paths use `.js` extensions even for `.ts` source files (TypeScript's `moduleResolution: "bundler"` resolves these). The single exception is the action package which outputs CJS.

## Why

- **ESM is the standard**: Modern Node.js, TypeScript, and tooling assume ESM
- **.js extensions**: Required for correct ESM resolution — TypeScript doesn't rewrite import extensions
- **CJS exception**: GitHub Actions runner expects a CommonJS entry point at `dist/index.cjs`; tsup handles the ESM→CJS conversion at build time with `noExternal: [/.*/]` to bundle all dependencies

## How

| Guideline | Example |
|-----------|---------|
| Always use .js extensions in imports | `import { gitDiff } from './tools/git-diff.js'` |
| Set `"type": "module"` in all package.json | Already configured |
| Action builds to CJS via tsup | `format: ['cjs']` in tsup.config |
| Barrel exports from index.ts | `export { gitDiff } from './tools/git-diff.js'` |

## Not This

| Alternative | Rejected Because |
|-------------|------------------|
| Extension-less imports | Breaks ESM resolution without custom loaders |
| Dual CJS+ESM builds | Unnecessary complexity; only action needs CJS |
| `moduleResolution: "node"` | Doesn't support .js→.ts resolution |

## Scope

**Applies to:**
- All 4 packages (source code conventions)
- `tsconfig.base.json` settings

**Does NOT apply to:**
- Build output format decisions (that's per-package)
- Test files (vitest handles resolution)

## Cited By

- c3-101 (tool-definitions)
- c3-210 (tool-registration)
