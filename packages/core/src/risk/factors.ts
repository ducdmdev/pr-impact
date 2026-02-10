import {
  RiskFactor,
  ChangedFile,
  BreakingChange,
  TestCoverageReport,
  DocStalenessReport,
  ImpactGraph,
} from '../types.js';

/**
 * CI/build config file patterns that represent high-risk configuration changes.
 */
const CI_BUILD_CONFIG_PATTERNS = [
  /^\.github\//,
  /Dockerfile/i,
  /docker-compose/i,
  /webpack\.config/,
  /vite\.config/,
  /rollup\.config/,
  /esbuild\.config/,
  /turbo\.json$/,
  /\.gitlab-ci/,
  /Jenkinsfile/i,
  /\.circleci\//,
];

/**
 * Evaluate the risk factor for breaking API changes.
 *
 * Weight: 0.30
 * Score: 100 if any high-severity, 60 if medium, 30 if low-only, 0 if none.
 */
export function evaluateBreakingChangesFactor(
  breakingChanges: BreakingChange[],
): RiskFactor {
  if (breakingChanges.length === 0) {
    return {
      name: 'Breaking changes',
      score: 0,
      weight: 0.30,
      description: 'No breaking API changes detected.',
    };
  }

  const hasHigh = breakingChanges.some((bc) => bc.severity === 'high');
  const hasMedium = breakingChanges.some((bc) => bc.severity === 'medium');

  let score: number;
  if (hasHigh) {
    score = 100;
  } else if (hasMedium) {
    score = 60;
  } else {
    score = 30;
  }

  const details = breakingChanges.map(
    (bc) => `${bc.type} of "${bc.symbolName}" in ${bc.filePath} (${bc.severity})`,
  );

  return {
    name: 'Breaking changes',
    score,
    weight: 0.30,
    description: `${breakingChanges.length} breaking change(s) detected.`,
    details,
  };
}

/**
 * Evaluate the risk factor for untested source changes.
 *
 * Weight: 0.25
 * Score: (1 - coverageRatio) * 100
 */
export function evaluateUntestedChangesFactor(
  coverage: TestCoverageReport,
): RiskFactor {
  const score = coverage.changedSourceFiles === 0
    ? 0
    : (1 - coverage.coverageRatio) * 100;

  const details: string[] = [];
  if (coverage.gaps.length > 0) {
    for (const gap of coverage.gaps) {
      const testStatus = gap.testFileExists
        ? 'test exists but not updated'
        : 'no test file found';
      details.push(`${gap.sourceFile}: ${testStatus}`);
    }
  }

  const description =
    coverage.changedSourceFiles === 0
      ? 'No source files changed.'
      : `${coverage.sourceFilesWithTestChanges}/${coverage.changedSourceFiles} changed source files have corresponding test changes.`;

  return {
    name: 'Untested changes',
    score,
    weight: 0.25,
    description,
    ...(details.length > 0 ? { details } : {}),
  };
}

/**
 * Evaluate the risk factor based on the overall diff size.
 *
 * Weight: 0.15
 * Score: 0 if <100 lines, 50 if 100-500, 80 if 500-1000, 100 if >1000
 */
export function evaluateDiffSizeFactor(changedFiles: ChangedFile[]): RiskFactor {
  const totalLines = changedFiles.reduce(
    (sum, f) => sum + f.additions + f.deletions,
    0,
  );

  let score: number;
  if (totalLines > 1000) {
    score = 100;
  } else if (totalLines >= 500) {
    score = 80;
  } else if (totalLines >= 100) {
    score = 50;
  } else {
    score = 0;
  }

  return {
    name: 'Diff size',
    score,
    weight: 0.15,
    description: `${totalLines} total lines changed across ${changedFiles.length} file(s).`,
  };
}

/**
 * Evaluate the risk factor for stale documentation references.
 *
 * Weight: 0.10
 * Score: min(staleReferences.length * 20, 100)
 */
export function evaluateDocStalenessFactor(
  staleness: DocStalenessReport,
): RiskFactor {
  const score = Math.min(staleness.staleReferences.length * 20, 100);

  const details =
    staleness.staleReferences.length > 0
      ? staleness.staleReferences.map(
        (ref) => `${ref.docFile}:${ref.line} - "${ref.reference}" (${ref.reason})`,
      )
      : undefined;

  const description =
    staleness.staleReferences.length === 0
      ? 'No stale documentation references found.'
      : `${staleness.staleReferences.length} stale documentation reference(s) found.`;

  return {
    name: 'Stale documentation',
    score,
    weight: 0.10,
    description,
    ...(details ? { details } : {}),
  };
}

/**
 * Evaluate the risk factor for configuration file changes.
 *
 * Weight: 0.10
 * Score: 100 if CI/build config changed, 50 if other config, 0 if none.
 */
export function evaluateConfigChangesFactor(
  changedFiles: ChangedFile[],
): RiskFactor {
  const configFiles = changedFiles.filter((f) => f.category === 'config');

  if (configFiles.length === 0) {
    return {
      name: 'Config file changes',
      score: 0,
      weight: 0.10,
      description: 'No configuration files changed.',
    };
  }

  const hasCiBuildConfig = configFiles.some((f) =>
    CI_BUILD_CONFIG_PATTERNS.some((pattern) => pattern.test(f.path)),
  );

  const score = hasCiBuildConfig ? 100 : 50;

  const details = configFiles.map((f) => f.path);

  const description = hasCiBuildConfig
    ? `CI/build configuration changed (${configFiles.length} config file(s)).`
    : `${configFiles.length} configuration file(s) changed.`;

  return {
    name: 'Config file changes',
    score,
    weight: 0.10,
    description,
    details,
  };
}

/**
 * Evaluate the risk factor based on how many files are indirectly affected
 * through the import dependency graph.
 *
 * Weight: 0.10
 * Score: min(indirectlyAffected.length * 10, 100)
 */
export function evaluateImpactBreadthFactor(
  impact: ImpactGraph,
): RiskFactor {
  const count = impact.indirectlyAffected.length;
  const score = Math.min(count * 10, 100);

  const description =
    count === 0
      ? 'No indirectly affected files detected.'
      : `${count} file(s) indirectly affected through import dependencies.`;

  const details =
    count > 0 ? impact.indirectlyAffected.slice(0, 20) : undefined;

  return {
    name: 'Impact breadth',
    score,
    weight: 0.10,
    description,
    ...(details ? { details } : {}),
  };
}
