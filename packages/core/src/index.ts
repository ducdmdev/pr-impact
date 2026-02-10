export type {
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
} from './types.js';

export { analyzePR, resolveDefaultBaseBranch } from './analyzer.js';
export { parseDiff, detectLanguage } from './diff/diff-parser.js';
export { categorizeFile } from './diff/file-categorizer.js';
export { detectBreakingChanges } from './breaking/detector.js';
export { diffExports, parseExports } from './breaking/export-differ.js';
export { diffSignatures } from './breaking/signature-differ.js';
export { mapTestFiles } from './coverage/test-mapper.js';
export { checkTestCoverage } from './coverage/coverage-checker.js';
export { checkDocStaleness } from './docs/staleness-checker.js';
export { buildImpactGraph } from './impact/impact-graph.js';
export { calculateRisk } from './risk/risk-calculator.js';
export { formatMarkdown } from './output/markdown-reporter.js';
export { formatJSON } from './output/json-reporter.js';
export { extractImportPaths, isRelativeImport, resolveImport, findConsumers } from './imports/import-resolver.js';
