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
