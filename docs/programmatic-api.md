# Programmatic API Guide

Use `@pr-impact/core` as a library in your own scripts, custom CI tooling, or internal platforms.

---

## Installation

```bash
npm install @pr-impact/core
```

The package is ESM-only. Make sure your project has `"type": "module"` in `package.json` or uses `.mjs` file extensions.

---

## Full Analysis

The simplest way to use the library — run the entire analysis pipeline in one call:

```typescript
import { analyzePR, formatMarkdown, formatJSON } from '@pr-impact/core';

const analysis = await analyzePR({
  repoPath: '/path/to/repo',
  baseBranch: 'main',
  headBranch: 'feature/my-branch',
});

// Access structured data
console.log(analysis.riskScore.score);      // 42
console.log(analysis.riskScore.level);      // "medium"
console.log(analysis.breakingChanges);      // BreakingChange[]
console.log(analysis.testCoverage.ratio);   // 0.75
console.log(analysis.summary);              // Human-readable summary

// Format as report
const markdown = formatMarkdown(analysis);
const json = formatJSON(analysis);
```

### Skipping Analysis Steps

Pass options to skip expensive analysis steps you don't need:

```typescript
const analysis = await analyzePR({
  repoPath: '.',
  baseBranch: 'main',
  headBranch: 'HEAD',
  skipBreaking: true,     // Skip breaking change detection
  skipCoverage: false,    // Run test coverage (default)
  skipDocs: true,         // Skip doc staleness check
});
```

When a step is skipped, its result will contain empty/default values (empty arrays, zero scores, etc.). The risk score adjusts accordingly.

---

## Individual Analysis Steps

Each step of the pipeline can be called independently. This is useful when you only need part of the analysis or want to build a custom workflow.

### Step 1: Parse the Diff

```typescript
import { parseDiff } from '@pr-impact/core';

const changedFiles = await parseDiff('/path/to/repo', 'main', 'HEAD');

for (const file of changedFiles) {
  console.log(`${file.path} — ${file.category} — +${file.additions}/-${file.deletions}`);
}
```

`parseDiff` returns `ChangedFile[]`, where each entry includes the file path, change category (`source`, `test`, `doc`, `config`, `other`), line counts, and the raw diff hunks.

### Step 2: Detect Breaking Changes

```typescript
import { parseDiff, detectBreakingChanges } from '@pr-impact/core';

const changedFiles = await parseDiff(repoPath, base, head);
const breakingChanges = await detectBreakingChanges(repoPath, base, head, changedFiles);

for (const bc of breakingChanges) {
  console.log(`[${bc.severity}] ${bc.type} in ${bc.file}: ${bc.description}`);
  console.log(`  Consumers: ${bc.consumers.join(', ')}`);
}
```

Breaking change detection requires source files (not test/doc/config files). It compares exports and function signatures between the base and head versions.

### Step 3: Check Test Coverage

```typescript
import { parseDiff, checkTestCoverage } from '@pr-impact/core';

const changedFiles = await parseDiff(repoPath, base, head);
const coverage = await checkTestCoverage(repoPath, changedFiles);

console.log(`Coverage ratio: ${coverage.ratio}`);  // 0.0 to 1.0
for (const gap of coverage.gaps) {
  console.log(`${gap.sourceFile} — missing: ${gap.expectedTestFile}`);
}
```

### Step 4: Check Documentation Staleness

```typescript
import { parseDiff, checkDocStaleness } from '@pr-impact/core';

const changedFiles = await parseDiff(repoPath, base, head);
const staleness = await checkDocStaleness(repoPath, changedFiles, base, head);

for (const ref of staleness.staleReferences) {
  console.log(`${ref.docFile}:${ref.line} references ${ref.symbol} (${ref.reason})`);
}
```

### Step 5: Build Impact Graph

```typescript
import { parseDiff, buildImpactGraph } from '@pr-impact/core';

const changedFiles = await parseDiff(repoPath, base, head);
const impact = await buildImpactGraph(repoPath, changedFiles);

console.log('Directly changed:', impact.directlyChanged);
console.log('Indirectly affected:', impact.indirectlyAffected);
for (const edge of impact.edges) {
  console.log(`${edge.from} → ${edge.to}`);
}
```

### Step 6: Calculate Risk

```typescript
import { calculateRisk } from '@pr-impact/core';

const risk = calculateRisk(
  changedFiles,
  breakingChanges,
  testCoverage,
  docStaleness,
  impactGraph,
);

console.log(`Score: ${risk.score}/100 (${risk.level})`);
for (const factor of risk.factors) {
  console.log(`  ${factor.name}: ${factor.score} × ${factor.weight}`);
}
```

---

## Lower-Level Utilities

```typescript
import {
  categorizeFile,
  parseExports,
  diffExports,
  diffSignatures,
  mapTestFiles,
} from '@pr-impact/core';

// Classify a file path
categorizeFile('src/utils/auth.ts');       // 'source'
categorizeFile('__tests__/auth.test.ts');  // 'test'
categorizeFile('README.md');               // 'doc'
categorizeFile('tsconfig.json');           // 'config'
```

---

## Key Types

All TypeScript interfaces are exported from `@pr-impact/core`:

```typescript
import type {
  PRAnalysis,          // Top-level result from analyzePR()
  AnalysisOptions,     // Input options for analyzePR()
  ChangedFile,         // A file in the diff
  BreakingChange,      // A detected breaking API change
  TestCoverageReport,  // Coverage ratio + gaps
  TestCoverageGap,     // A source file missing test changes
  DocStalenessReport,  // Stale doc references
  StaleReference,      // A single stale reference in a doc file
  ImpactGraph,         // Directly/indirectly affected files + edges
  ImpactEdge,          // A single import dependency edge
  RiskAssessment,      // Overall score, level, and factors
  RiskFactor,          // Individual factor with score, weight, description
} from '@pr-impact/core';
```

---

## Error Handling

All analysis functions throw on git or I/O errors. Wrap calls in try/catch:

```typescript
try {
  const analysis = await analyzePR({ repoPath: '.', baseBranch: 'main', headBranch: 'HEAD' });
} catch (error) {
  // Common errors:
  // - Not a git repository
  // - Branch does not exist
  // - Shallow clone (insufficient history)
  console.error('Analysis failed:', error.message);
}
```

Individual steps like `detectBreakingChanges` handle per-file errors gracefully (e.g., a file that doesn't exist at the base ref returns no breaking changes for that file), but will still throw on fundamental git errors.

---

## Example: Custom CI Script

```typescript
// scripts/check-pr.ts
import { analyzePR } from '@pr-impact/core';

const analysis = await analyzePR({
  repoPath: '.',
  baseBranch: process.env.BASE_BRANCH ?? 'main',
  headBranch: process.env.HEAD_BRANCH ?? 'HEAD',
});

// Custom logic: fail only if there are high-severity breaking changes
// AND the risk score is above 50
const hasHighBreaking = analysis.breakingChanges.some(bc => bc.severity === 'high');

if (hasHighBreaking && analysis.riskScore.score > 50) {
  console.error(`Blocked: high-severity breaking changes with risk score ${analysis.riskScore.score}`);
  process.exit(1);
}

console.log(`PR looks good. Risk: ${analysis.riskScore.score} (${analysis.riskScore.level})`);
```

---

## Next Steps

- [Risk Scoring](./risk-scoring.md) — Understand the score formula and factor weights
- [Data Flow](./data-flow.md) — Type relationships and data flow through the pipeline
- [Analysis Pipeline](./analysis-pipeline.md) — How the 6-step pipeline works internally
