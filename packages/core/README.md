# @pr-impact/core

PR analysis engine -- detect breaking changes, map blast radius, check test coverage, find stale docs, and score risk.

## Install

```bash
npm install @pr-impact/core
```

## Quick Start

```typescript
import { analyzePR, formatMarkdown, formatJSON } from '@pr-impact/core';

const analysis = await analyzePR({
  repoPath: '/path/to/repo',
  baseBranch: 'main',
  headBranch: 'feature/my-branch',
});

console.log(analysis.riskScore.score);   // 42
console.log(analysis.riskScore.level);   // "medium"
console.log(analysis.breakingChanges);   // BreakingChange[]

console.log(formatMarkdown(analysis));   // Markdown report
console.log(formatJSON(analysis));       // JSON string
```

## Individual Analysis Steps

Each step can be used independently:

```typescript
import {
  parseDiff,
  detectBreakingChanges,
  checkTestCoverage,
  checkDocStaleness,
  buildImpactGraph,
  calculateRisk,
} from '@pr-impact/core';

const repoPath = '/path/to/repo';
const base = 'main';
const head = 'HEAD';

const changedFiles = await parseDiff(repoPath, base, head);
const breakingChanges = await detectBreakingChanges(repoPath, base, head, changedFiles);
const testCoverage = await checkTestCoverage(repoPath, changedFiles);
const docStaleness = await checkDocStaleness(repoPath, changedFiles, base, head);
const impactGraph = await buildImpactGraph(repoPath, changedFiles);
const riskScore = calculateRisk(changedFiles, breakingChanges, testCoverage, docStaleness, impactGraph);
```

## Lower-Level Utilities

```typescript
import {
  categorizeFile,
  parseExports,
  diffExports,
  diffSignatures,
  mapTestFiles,
  extractImportPaths,
  findConsumers,
} from '@pr-impact/core';

categorizeFile('src/utils/auth.ts');       // 'source'
categorizeFile('__tests__/auth.test.ts');  // 'test'
categorizeFile('README.md');               // 'doc'
```

## Types

All TypeScript interfaces are exported from the package:

```typescript
import type {
  PRAnalysis,
  AnalysisOptions,
  ChangedFile,
  BreakingChange,
  TestCoverageReport,
  TestCoverageGap,
  DocStalenessReport,
  StaleReference,
  ImpactGraph,
  ImpactEdge,
  RiskAssessment,
  RiskFactor,
  ExportedSymbol,
  FileExports,
} from '@pr-impact/core';
```

## Risk Score

The risk score is a weighted average of six factors (0--100):

| Factor | Weight | Description |
|---|---|---|
| Breaking changes | 0.30 | Severity of detected breaking API changes |
| Untested changes | 0.25 | Ratio of changed source files lacking test updates |
| Diff size | 0.15 | Total lines added + deleted |
| Stale documentation | 0.10 | References to modified/removed symbols in docs |
| Config file changes | 0.10 | CI/build config modifications |
| Impact breadth | 0.10 | Number of indirectly affected files |

Risk levels: **Low** (0--25), **Medium** (26--50), **High** (51--75), **Critical** (76--100).

## Requirements

- Node.js >= 20
- Must be run inside a git repository (uses `simple-git` for git operations)

## License

[MIT](../../LICENSE)
