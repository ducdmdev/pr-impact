// ── Top-level analysis result ──
export interface PRAnalysis {
  repoPath: string;
  baseBranch: string;
  headBranch: string;
  changedFiles: ChangedFile[];
  breakingChanges: BreakingChange[];
  testCoverage: TestCoverageReport;
  docStaleness: DocStalenessReport;
  impactGraph: ImpactGraph;
  riskScore: RiskAssessment;
  summary: string;
}

// ── Analysis options ──
export interface AnalysisOptions {
  repoPath: string;
  baseBranch?: string;
  headBranch?: string;
  skipBreaking?: boolean;
  skipCoverage?: boolean;
  skipDocs?: boolean;
}

// ── Diff layer ──
export interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string;
  additions: number;
  deletions: number;
  language: string;
  category: 'source' | 'test' | 'doc' | 'config' | 'other';
}

// ── Breaking changes layer ──
export interface BreakingChange {
  filePath: string;
  type: 'removed_export' | 'changed_signature' | 'changed_type' | 'renamed_export';
  symbolName: string;
  before: string;
  after: string | null;
  severity: 'high' | 'medium' | 'low';
  consumers: string[];
}

// ── Test coverage layer ──
export interface TestCoverageReport {
  changedSourceFiles: number;
  sourceFilesWithTestChanges: number;
  coverageRatio: number;
  gaps: TestCoverageGap[];
}

export interface TestCoverageGap {
  sourceFile: string;
  expectedTestFiles: string[];
  testFileExists: boolean;
  testFileChanged: boolean;
}

// ── Doc staleness layer ──
export interface DocStalenessReport {
  staleReferences: StaleReference[];
  checkedFiles: string[];
}

export interface StaleReference {
  docFile: string;
  line: number;
  reference: string;
  reason: string;
}

// ── Impact graph layer ──
export interface ImpactGraph {
  directlyChanged: string[];
  indirectlyAffected: string[];
  edges: ImpactEdge[];
}

export interface ImpactEdge {
  from: string;
  to: string;
  type: 'imports';
}

// ── Risk assessment layer ──
export interface RiskAssessment {
  score: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
}

export interface RiskFactor {
  name: string;
  score: number;
  weight: number;
  description: string;
  details?: string[];
}

// ── Internal types ──
export interface ExportedSymbol {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum' | 'const';
  signature?: string;
  isDefault: boolean;
}

export interface FileExports {
  filePath: string;
  symbols: ExportedSymbol[];
}
