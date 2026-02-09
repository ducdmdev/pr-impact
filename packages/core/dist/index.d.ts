interface PRAnalysis {
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
interface AnalysisOptions {
    repoPath: string;
    baseBranch?: string;
    headBranch?: string;
    skipBreaking?: boolean;
    skipCoverage?: boolean;
    skipDocs?: boolean;
}
interface ChangedFile {
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    oldPath?: string;
    additions: number;
    deletions: number;
    language: string;
    category: 'source' | 'test' | 'doc' | 'config' | 'other';
}
interface BreakingChange {
    filePath: string;
    type: 'removed_export' | 'changed_signature' | 'changed_type' | 'renamed_export';
    symbolName: string;
    before: string;
    after: string | null;
    severity: 'high' | 'medium' | 'low';
    consumers: string[];
}
interface TestCoverageReport {
    changedSourceFiles: number;
    sourceFilesWithTestChanges: number;
    coverageRatio: number;
    gaps: TestCoverageGap[];
}
interface TestCoverageGap {
    sourceFile: string;
    expectedTestFiles: string[];
    testFileExists: boolean;
    testFileChanged: boolean;
}
interface DocStalenessReport {
    staleReferences: StaleReference[];
    checkedFiles: string[];
}
interface StaleReference {
    docFile: string;
    line: number;
    reference: string;
    reason: string;
}
interface ImpactGraph {
    directlyChanged: string[];
    indirectlyAffected: string[];
    edges: ImpactEdge[];
}
interface ImpactEdge {
    from: string;
    to: string;
    type: 'imports';
}
interface RiskAssessment {
    score: number;
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: RiskFactor[];
}
interface RiskFactor {
    name: string;
    score: number;
    weight: number;
    description: string;
    details?: string[];
}
interface ExportedSymbol {
    name: string;
    kind: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum' | 'const';
    signature?: string;
    isDefault: boolean;
}
interface FileExports {
    filePath: string;
    symbols: ExportedSymbol[];
}

/**
 * Run all analysis steps on a pull request and produce a comprehensive report.
 *
 * Steps:
 *   1. Resolve base and head branches
 *   2. Verify the repository and branches
 *   3. Parse the diff to get changed files
 *   4. Run breaking-change detection, test-coverage checking, doc-staleness
 *      checking, and impact-graph building in parallel
 *   5. Calculate the overall risk score
 *   6. Generate a human-readable summary
 */
declare function analyzePR(options: AnalysisOptions): Promise<PRAnalysis>;

declare function parseDiff(repoPath: string, base: string, head: string): Promise<ChangedFile[]>;

declare function categorizeFile(filePath: string): ChangedFile['category'];

/**
 * Detect breaking changes between two branches by analyzing export differences
 * in changed source files.
 *
 * @param repoPath     - Absolute path to the git repository
 * @param baseBranch   - The base branch/ref (e.g. "main", "origin/main")
 * @param headBranch   - The head branch/ref (e.g. "feature/xyz", "HEAD")
 * @param changedFiles - List of files changed between the two branches
 * @returns Array of detected breaking changes
 */
declare function detectBreakingChanges(repoPath: string, baseBranch: string, headBranch: string, changedFiles: ChangedFile[]): Promise<BreakingChange[]>;

/**
 * Parse a TypeScript/JavaScript file's content to extract all exported symbols.
 */
declare function parseExports(content: string, filePath: string): FileExports;
/**
 * Compare exports between the base and head version of a file.
 *
 * Returns:
 *  - removed:  symbols present in base but missing from head
 *  - added:    symbols present in head but missing from base
 *  - modified: symbols present in both but whose signature changed
 */
declare function diffExports(basePath: string, baseContent: string, headContent: string): {
    removed: ExportedSymbol[];
    added: ExportedSymbol[];
    modified: Array<{
        before: ExportedSymbol;
        after: ExportedSymbol;
    }>;
};

/**
 * Compare function/method signatures between two versions of a symbol.
 *
 * Signatures are expected in the form: `(param1: Type1, param2: Type2): ReturnType`
 * This module performs structural comparison by splitting parameters and return types.
 */
interface SignatureDiffResult {
    changed: boolean;
    details: string;
}
/**
 * Compare two function/method signatures and produce a human-readable
 * description of what changed.
 *
 * @param baseSig - The signature from the base (old) version, e.g. `(a: string): void`
 * @param headSig - The signature from the head (new) version
 * @returns An object with `changed` (boolean) and `details` (string describing the change)
 */
declare function diffSignatures(baseSig: string | undefined, headSig: string | undefined): SignatureDiffResult;

/**
 * Maps a source file to its expected test file paths using common naming
 * conventions, then returns only those that actually exist on disk.
 *
 * Conventions checked (given e.g. `src/utils/parser.ts`):
 *   1. Same directory:        src/utils/parser.test.ts, src/utils/parser.spec.ts
 *   2. __tests__ sibling dir: src/utils/__tests__/parser.ts, src/utils/__tests__/parser.test.ts
 *   3. Top-level test dirs:   test/utils/parser.ts, tests/utils/parser.test.ts
 *   4. All of the above with .js/.jsx/.tsx variants as well.
 */
declare function mapTestFiles(repoPath: string, sourceFile: string): Promise<string[]>;

/**
 * Checks whether changed source files have corresponding test changes in the
 * same PR.  Returns a report with a coverage ratio and a list of "gaps" --
 * source files whose tests were not updated.
 */
declare function checkTestCoverage(repoPath: string, changedFiles: ChangedFile[]): Promise<TestCoverageReport>;

/**
 * Checks whether documentation files in the repository reference symbols or
 * file paths that were deleted, removed, or renamed in the current change set.
 */
declare function checkDocStaleness(repoPath: string, changedFiles: ChangedFile[], baseBranch: string, headBranch: string): Promise<DocStalenessReport>;

/**
 * Build an impact graph showing which files are directly changed and which
 * are indirectly affected through import dependencies.
 *
 * Uses BFS over a reverse dependency map (dependents) to find files that
 * transitively depend on the changed files, up to `maxDepth` levels.
 */
declare function buildImpactGraph(repoPath: string, changedFiles: ChangedFile[], maxDepth?: number): Promise<ImpactGraph>;

/**
 * Calculate a weighted risk assessment from all individual risk factors.
 *
 * Formula: total_score = sum(factor_score * factor_weight) / sum(factor_weight)
 *
 * The final score is rounded to the nearest integer.
 */
declare function calculateRisk(changedFiles: ChangedFile[], breakingChanges: BreakingChange[], testCoverage: TestCoverageReport, docStaleness: DocStalenessReport, impactGraph: ImpactGraph): RiskAssessment;

/**
 * Format a PRAnalysis result as a readable Markdown report suitable for
 * posting as a PR comment or writing to a file.
 */
declare function formatMarkdown(analysis: PRAnalysis): string;

/**
 * Format a PRAnalysis result as a pretty-printed JSON string.
 */
declare function formatJSON(analysis: PRAnalysis): string;

export { type AnalysisOptions, type BreakingChange, type ChangedFile, type DocStalenessReport, type ExportedSymbol, type FileExports, type ImpactEdge, type ImpactGraph, type PRAnalysis, type RiskAssessment, type RiskFactor, type StaleReference, type TestCoverageGap, type TestCoverageReport, analyzePR, buildImpactGraph, calculateRisk, categorizeFile, checkDocStaleness, checkTestCoverage, detectBreakingChanges, diffExports, diffSignatures, formatJSON, formatMarkdown, mapTestFiles, parseDiff, parseExports };
