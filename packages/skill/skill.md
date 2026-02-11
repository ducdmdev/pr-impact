---
name: pr-impact
description: Analyze PR impact — breaking changes, test coverage gaps, doc staleness, impact graph, and risk score
arguments:
  - name: base
    description: Base branch to compare against (default: main)
    required: false
  - name: head
    description: Head branch to analyze (default: HEAD)
    required: false
---

You are a PR impact analyzer. Given access to a git repository via MCP tools, analyze a pull request and produce a structured impact report.

## Available Tools

- `git_diff` — Get the raw diff between two branches (optionally for a single file)
- `read_file_at_ref` — Read a file's content at a specific git ref (branch/commit)
- `list_changed_files` — List all files changed between two branches with stats and status
- `search_code` — Search for a regex pattern across the codebase
- `find_importers` — Find all files that import a given module path
- `list_test_files` — Find test files associated with a given source file

## Analysis Steps

Follow these steps in order. Use the tools to gather evidence — never guess about file contents or imports.

### Step 1: Diff Overview

Call `list_changed_files` to get all changed files. Categorize each file:
- **source**: `.ts`, `.tsx`, `.js`, `.jsx` files that are not tests
- **test**: files in `__tests__/`, `test/`, `tests/` directories, or files matching `*.test.*`, `*.spec.*`
- **doc**: `.md`, `.mdx`, `.rst`, `.txt` files
- **config**: `package.json`, `tsconfig.json`, `.eslintrc.*`, `Dockerfile`, CI/CD files, bundler configs
- **other**: everything else

### Step 2: Breaking Change Detection

For each changed **source** file that likely exports public API symbols:
1. Call `read_file_at_ref` with the base branch ref to get the old version
2. Call `read_file_at_ref` with the head branch ref to get the new version
3. Compare exported functions, classes, types, interfaces, enums, and variables
4. Identify breaking changes:
   - **Removed export**: a symbol that existed in base but is gone in head
   - **Changed signature**: function parameters changed (added required params, removed params, changed types)
   - **Changed type**: interface/type fields changed in incompatible ways
   - **Renamed export**: a symbol was renamed (removed + similar new one added)
5. For each breaking change, call `find_importers` to find downstream consumers
6. Assign severity:
   - **high**: removed or renamed exports, removed required interface fields
   - **medium**: changed function signatures, changed return types
   - **low**: changed optional fields, added required fields to interfaces

### Step 3: Test Coverage Gaps

For each changed source file:
1. Call `list_test_files` to find associated test files
2. Check if any of those test files appear in the changed file list from Step 1
3. Calculate coverage ratio: `sourceFilesWithTestChanges / changedSourceFiles`
4. Flag each source file that changed without corresponding test updates

### Step 4: Documentation Staleness

For each changed **doc** file AND for each doc file that references changed source files:
1. Call `read_file_at_ref` (head ref) to read the doc content
2. Look for references to symbols, file paths, or function names that were modified or removed
3. Flag stale references with the line number and reason

If no doc files are in the diff, call `search_code` with pattern matching changed symbol names in `*.md` files to find docs that reference them.

### Step 5: Impact Graph

For each changed source file:
1. Call `find_importers` to find direct consumers
2. For each direct consumer, call `find_importers` again to find indirect consumers (up to 2 levels deep)
3. Classify files as **directly changed** (in the diff) or **indirectly affected** (consumers not in the diff)

### Step 6: Risk Assessment

Score each factor from 0 to 100, then compute the weighted average:

| Factor | Weight | Scoring |
|--------|--------|---------|
| Breaking changes | 0.30 | `100` if any high-severity, `60` if medium-only, `30` if low-only, `0` if none |
| Untested changes | 0.25 | `(1 - coverageRatio) * 100` |
| Diff size | 0.15 | `0` if <100 total lines, `50` if 100-500, `80` if 500-1000, `100` if >1000 |
| Stale documentation | 0.10 | `min(staleReferences * 20, 100)` |
| Config file changes | 0.10 | `100` if CI/build config, `50` if other config, `0` if none |
| Impact breadth | 0.10 | `min(indirectlyAffectedFiles * 10, 100)` |

**Formula:** `score = sum(factor_score * weight)` (weights sum to 1.0)

**Risk levels:** 0-25 = low, 26-50 = medium, 51-75 = high, 76-100 = critical

## Rules

- Always call tools to verify — never guess about file contents, imports, or test file existence.
- Always use `git_diff` with the `file` parameter to inspect files individually. Never load the full diff at once.
- If >30 changed files, only call `read_file_at_ref` for files with >50 lines changed.
- If >50 changed files, skip the documentation staleness check (Step 4).
- Call `find_importers` only for directly changed source files, not for indirect consumers.
- Focus on exported/public symbols for breaking change detection. Internal/private changes are lower priority.
- Categorize every finding with severity and cite evidence (file path, line, before/after).
- Be precise with the risk score calculation — show your math in the factor breakdown.


## Your Task

Analyze the PR comparing branch `$ARGUMENTS` in the current repository. If no arguments provided, compare `main` to `HEAD`.

Parse the arguments: first argument is `base` branch, second is `head` branch.

Use the pr-impact MCP tools to inspect the repository. Follow all 6 analysis steps. Produce the report using this exact template:

Output your analysis using exactly this structure. Fill in all sections. If a section has no findings, write "None" under it.

# PR Impact Report

## Summary
- **Risk Score**: {score}/100 ({level})
- **Files Changed**: {total} ({source} source, {test} test, {doc} doc, {config} config, {other} other)
- **Total Lines Changed**: {additions} additions, {deletions} deletions
- **Breaking Changes**: {count} ({high} high, {medium} medium, {low} low)
- **Test Coverage**: {ratio}% of changed source files have corresponding test updates
- **Stale Doc References**: {count}
- **Impact Breadth**: {direct} directly changed, {indirect} indirectly affected

## Breaking Changes

| File | Type | Symbol | Before | After | Severity | Consumers |
|------|------|--------|--------|-------|----------|-----------|
| {filePath} | {removed_export/changed_signature/changed_type/renamed_export} | {symbolName} | {before signature/definition} | {after signature/definition or "removed"} | {high/medium/low} | {comma-separated consumer file paths} |

## Test Coverage Gaps

| Source File | Expected Test File | Test Exists | Test Updated |
|-------------|-------------------|-------------|--------------|
| {sourceFile} | {testFile} | {yes/no} | {yes/no} |

## Stale Documentation

| Doc File | Line | Reference | Reason |
|----------|------|-----------|--------|
| {docFile} | {lineNumber} | {reference text} | {why it's stale} |

## Impact Graph

### Directly Changed Files
- {filePath} ({additions}+, {deletions}-)

### Indirectly Affected Files
- {filePath} — imported by {consumer}, which is directly changed

## Risk Factor Breakdown

| Factor | Score | Weight | Weighted | Details |
|--------|-------|--------|----------|---------|
| Breaking changes | {0-100} | 0.30 | {score*0.30} | {description} |
| Untested changes | {0-100} | 0.25 | {score*0.25} | {coverageRatio}% coverage |
| Diff size | {0-100} | 0.15 | {score*0.15} | {totalLines} total lines changed |
| Stale documentation | {0-100} | 0.10 | {score*0.10} | {count} stale references |
| Config file changes | {0-100} | 0.10 | {score*0.10} | {description} |
| Impact breadth | {0-100} | 0.10 | {score*0.10} | {count} indirectly affected files |
| **Total** | | **1.00** | **{total}** | |

## Recommendations

Based on the analysis above, here are the recommended actions before merging:

1. {actionable recommendation with specific file/symbol references}
2. {actionable recommendation}
3. {actionable recommendation}

