---
id: ref-build-pipeline
c3-version: 4
title: Build Pipeline & Template Embedding
goal: Ensure templates are single source of truth consumed at build time by action and skill
scope: [c3-3, c3-4]
---

# Build Pipeline & Template Embedding

## Goal

Ensure templates are single source of truth consumed at build time by action and skill. Prevents prompt/report drift between the two consumers.

## Choice

Shared markdown templates in `templates/` are consumed by two build scripts that generate package-specific outputs:

| Consumer | Script | Output | Format |
|----------|--------|--------|--------|
| action (c3-3) | `scripts/embed-templates.ts` | `src/generated/templates.ts` | TypeScript string constants |
| skill (c3-4) | `scripts/build-skill.ts` | `skill.md` | Markdown with YAML frontmatter |

Both generated files are committed to their respective packages.

## Why

- **Action** runs as a single bundled CJS file in GitHub Actions — no filesystem access to the source repo's `templates/` directory at runtime
- **Skill** needs a self-contained `skill.md` for npm publishing — can't reference files outside the package
- **Deduplication**: A single edit to `templates/system-prompt.md` updates both consumers via `pnpm build`
- **Alternatives rejected**: Runtime file reads (fragile, CJS incompatible), copy-paste (drift), git submodules (overhead)

## How

| Guideline | Example |
|-----------|---------|
| Never edit generated files directly | `src/generated/templates.ts` and `skill.md` are auto-generated |
| Run `pnpm build` after template changes | Turborepo dependency graph ensures correct order |
| Prebuild hook in action | `package.json` `prebuild` script runs embed-templates before tsup |
| Build script in skill | `package.json` `build` script runs build-skill.ts |

## Scope

**Applies to:**
- `packages/action` — template embedding via prebuild
- `packages/skill` — skill prompt assembly via build
- `templates/` — source of truth for analysis methodology

**Does NOT apply to:**
- `packages/tools-core` — no template dependency
- `packages/tools` — no template dependency

## Cited By

- c3-301 (template-embedding)
- c3-410 (skill-prompt)
