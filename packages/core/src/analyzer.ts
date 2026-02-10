import simpleGit from 'simple-git';
import { PRAnalysis, AnalysisOptions, ChangedFile, BreakingChange, TestCoverageReport, DocStalenessReport, RiskAssessment } from './types.js';
import { parseDiff } from './diff/diff-parser.js';
import { detectBreakingChanges } from './breaking/detector.js';
import { checkTestCoverage } from './coverage/coverage-checker.js';
import { checkDocStaleness } from './docs/staleness-checker.js';
import { buildImpactGraph } from './impact/impact-graph.js';
import { calculateRisk } from './risk/risk-calculator.js';

/**
 * Resolve the default base branch for the repository by checking whether
 * 'main' or 'master' exists in the local branch list.
 */
export async function resolveDefaultBaseBranch(repoPath: string): Promise<string> {
  const git = simpleGit(repoPath);
  const branchSummary = await git.branch();

  if (branchSummary.all.includes('main')) {
    return 'main';
  }

  if (branchSummary.all.includes('master')) {
    return 'master';
  }

  // If neither 'main' nor 'master' is found, fall back to 'main' and let
  // the caller deal with any resulting git error.
  return 'main';
}

/**
 * Build a human-readable summary of the PR analysis results.
 */
function generateSummary(
  changedFiles: ChangedFile[],
  breakingChanges: BreakingChange[],
  testCoverage: TestCoverageReport,
  riskScore: RiskAssessment,
): string {
  const totalAdditions = changedFiles.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = changedFiles.reduce((sum, f) => sum + f.deletions, 0);

  const parts: string[] = [];

  parts.push(
    `This PR changes ${changedFiles.length} file${changedFiles.length === 1 ? '' : 's'} ` +
    `(+${totalAdditions}/-${totalDeletions}) with a ${riskScore.level} risk score of ${riskScore.score}/100.`,
  );

  if (breakingChanges.length > 0) {
    parts.push(
      `Found ${breakingChanges.length} breaking change${breakingChanges.length === 1 ? '' : 's'} affecting exported APIs.`,
    );
  }

  if (testCoverage.gaps.length > 0) {
    parts.push(
      `${testCoverage.gaps.length} source file${testCoverage.gaps.length === 1 ? '' : 's'} lack${testCoverage.gaps.length === 1 ? 's' : ''} corresponding test changes.`,
    );
  }

  return parts.join(' ');
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
export async function analyzePR(options: AnalysisOptions): Promise<PRAnalysis> {
  const { repoPath, skipBreaking, skipCoverage, skipDocs } = options;

  // --- 1. Resolve branches --------------------------------------------------
  const baseBranch = options.baseBranch ?? await resolveDefaultBaseBranch(repoPath);
  const headBranch = options.headBranch ?? 'HEAD';

  // --- 2. Verify the repo exists and branches are valid ---------------------
  const git = simpleGit(repoPath);

  // This will throw if the path is not a git repository.
  await git.checkIsRepo();

  // Verify that the base branch ref is valid.
  await git.revparse([baseBranch]);

  // Verify that the head branch ref is valid.
  await git.revparse([headBranch]);

  // --- 3. Parse the diff ----------------------------------------------------
  const changedFiles = await parseDiff(repoPath, baseBranch, headBranch);

  // --- 4. Run parallel analysis steps ---------------------------------------
  const [breakingChanges, testCoverage, docStaleness, impactGraph] =
    await Promise.all([
      // Breaking change detection
      skipBreaking
        ? Promise.resolve<BreakingChange[]>([])
        : detectBreakingChanges(repoPath, baseBranch, headBranch, changedFiles),

      // Test coverage analysis
      skipCoverage
        ? Promise.resolve<TestCoverageReport>({
          changedSourceFiles: 0,
          sourceFilesWithTestChanges: 0,
          coverageRatio: 0,
          gaps: [],
        })
        : checkTestCoverage(repoPath, changedFiles),

      // Documentation staleness checking
      skipDocs
        ? Promise.resolve<DocStalenessReport>({
          staleReferences: [],
          checkedFiles: [],
        })
        : checkDocStaleness(repoPath, changedFiles, baseBranch, headBranch),

      // Impact graph building
      buildImpactGraph(repoPath, changedFiles),
    ]);

  // --- 5. Calculate risk score ----------------------------------------------
  const riskScore = calculateRisk(
    changedFiles,
    breakingChanges,
    testCoverage,
    docStaleness,
    impactGraph,
  );

  // --- 6. Generate summary --------------------------------------------------
  const summary = generateSummary(
    changedFiles,
    breakingChanges,
    testCoverage,
    riskScore,
  );

  // --- 7. Assemble and return the full analysis -----------------------------
  return {
    repoPath,
    baseBranch,
    headBranch,
    changedFiles,
    breakingChanges,
    testCoverage,
    docStaleness,
    impactGraph,
    riskScore,
    summary,
  };
}
