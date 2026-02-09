import {
  RiskAssessment,
  ChangedFile,
  BreakingChange,
  TestCoverageReport,
  DocStalenessReport,
  ImpactGraph,
} from '../types.js';
import {
  evaluateBreakingChangesFactor,
  evaluateUntestedChangesFactor,
  evaluateDiffSizeFactor,
  evaluateDocStalenessFactor,
  evaluateConfigChangesFactor,
  evaluateImpactBreadthFactor,
} from './factors.js';

/**
 * Determine the risk level label from a numeric score.
 *
 *   0-25  -> low
 *  26-50  -> medium
 *  51-75  -> high
 *  76+    -> critical
 */
function scoreToLevel(score: number): RiskAssessment['level'] {
  if (score <= 25) return 'low';
  if (score <= 50) return 'medium';
  if (score <= 75) return 'high';
  return 'critical';
}

/**
 * Calculate a weighted risk assessment from all individual risk factors.
 *
 * Formula: total_score = sum(factor_score * factor_weight) / sum(factor_weight)
 *
 * The final score is rounded to the nearest integer.
 */
export function calculateRisk(
  changedFiles: ChangedFile[],
  breakingChanges: BreakingChange[],
  testCoverage: TestCoverageReport,
  docStaleness: DocStalenessReport,
  impactGraph: ImpactGraph,
): RiskAssessment {
  const factors = [
    evaluateBreakingChangesFactor(breakingChanges),
    evaluateUntestedChangesFactor(testCoverage),
    evaluateDiffSizeFactor(changedFiles),
    evaluateDocStalenessFactor(docStaleness),
    evaluateConfigChangesFactor(changedFiles),
    evaluateImpactBreadthFactor(impactGraph),
  ];

  const weightedSum = factors.reduce(
    (sum, factor) => sum + factor.score * factor.weight,
    0,
  );

  const totalWeight = factors.reduce(
    (sum, factor) => sum + factor.weight,
    0,
  );

  const score = Math.round(weightedSum / totalWeight);
  const level = scoreToLevel(score);

  return {
    score,
    level,
    factors,
  };
}
