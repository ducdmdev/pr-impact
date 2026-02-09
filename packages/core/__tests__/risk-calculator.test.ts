import { describe, it, expect } from 'vitest';
import { calculateRisk } from '../src/risk/risk-calculator.js';
import {
  evaluateBreakingChangesFactor,
  evaluateUntestedChangesFactor,
  evaluateDiffSizeFactor,
  evaluateDocStalenessFactor,
  evaluateConfigChangesFactor,
  evaluateImpactBreadthFactor,
} from '../src/risk/factors.js';
import type {
  ChangedFile,
  BreakingChange,
  TestCoverageReport,
  DocStalenessReport,
  ImpactGraph,
} from '../src/types.js';

// ── Test helpers ────────────────────────────────────────────────────────────

function makeChangedFile(overrides: Partial<ChangedFile> = {}): ChangedFile {
  return {
    path: 'src/index.ts',
    status: 'modified',
    additions: 0,
    deletions: 0,
    language: 'typescript',
    category: 'source',
    ...overrides,
  };
}

function makeBreakingChange(
  overrides: Partial<BreakingChange> = {},
): BreakingChange {
  return {
    filePath: 'src/api.ts',
    type: 'removed_export',
    symbolName: 'foo',
    before: 'export function foo(): void',
    after: null,
    severity: 'high',
    consumers: [],
    ...overrides,
  };
}

function makeTestCoverage(
  overrides: Partial<TestCoverageReport> = {},
): TestCoverageReport {
  return {
    changedSourceFiles: 0,
    sourceFilesWithTestChanges: 0,
    coverageRatio: 1,
    gaps: [],
    ...overrides,
  };
}

function makeDocStaleness(
  overrides: Partial<DocStalenessReport> = {},
): DocStalenessReport {
  return {
    staleReferences: [],
    checkedFiles: [],
    ...overrides,
  };
}

function makeImpactGraph(
  overrides: Partial<ImpactGraph> = {},
): ImpactGraph {
  return {
    directlyChanged: [],
    indirectlyAffected: [],
    edges: [],
    ...overrides,
  };
}

// ── Factor tests ────────────────────────────────────────────────────────────

describe('evaluateBreakingChangesFactor', () => {
  it('should return score 0 with no breaking changes', () => {
    const factor = evaluateBreakingChangesFactor([]);
    expect(factor.score).toBe(0);
    expect(factor.weight).toBe(0.30);
    expect(factor.name).toBe('Breaking changes');
  });

  it('should return score 100 for high severity breaking changes', () => {
    const factor = evaluateBreakingChangesFactor([
      makeBreakingChange({ severity: 'high' }),
    ]);
    expect(factor.score).toBe(100);
  });

  it('should return score 60 for medium severity breaking changes', () => {
    const factor = evaluateBreakingChangesFactor([
      makeBreakingChange({ severity: 'medium' }),
    ]);
    expect(factor.score).toBe(60);
  });

  it('should return score 30 for low severity only', () => {
    const factor = evaluateBreakingChangesFactor([
      makeBreakingChange({ severity: 'low' }),
    ]);
    expect(factor.score).toBe(30);
  });

  it('should prioritize high over medium severity', () => {
    const factor = evaluateBreakingChangesFactor([
      makeBreakingChange({ severity: 'medium' }),
      makeBreakingChange({ severity: 'high' }),
    ]);
    expect(factor.score).toBe(100);
  });

  it('should include details about each breaking change', () => {
    const factor = evaluateBreakingChangesFactor([
      makeBreakingChange({
        symbolName: 'myFunc',
        filePath: 'src/api.ts',
        severity: 'high',
        type: 'removed_export',
      }),
    ]);
    expect(factor.details).toBeDefined();
    expect(factor.details!.length).toBe(1);
    expect(factor.details![0]).toContain('myFunc');
    expect(factor.details![0]).toContain('src/api.ts');
  });
});

describe('evaluateUntestedChangesFactor', () => {
  it('should return score 0 with full coverage', () => {
    const factor = evaluateUntestedChangesFactor(
      makeTestCoverage({ coverageRatio: 1 }),
    );
    expect(factor.score).toBe(0);
    expect(factor.weight).toBe(0.25);
  });

  it('should return score 100 with zero coverage', () => {
    const factor = evaluateUntestedChangesFactor(
      makeTestCoverage({ coverageRatio: 0, changedSourceFiles: 5 }),
    );
    expect(factor.score).toBe(100);
  });

  it('should return score 50 with 50% coverage', () => {
    const factor = evaluateUntestedChangesFactor(
      makeTestCoverage({ coverageRatio: 0.5, changedSourceFiles: 4 }),
    );
    expect(factor.score).toBe(50);
  });

  it('should include details for coverage gaps', () => {
    const factor = evaluateUntestedChangesFactor(
      makeTestCoverage({
        coverageRatio: 0.5,
        changedSourceFiles: 2,
        gaps: [
          {
            sourceFile: 'src/utils.ts',
            expectedTestFiles: [],
            testFileExists: false,
            testFileChanged: false,
          },
        ],
      }),
    );
    expect(factor.details).toBeDefined();
    expect(factor.details![0]).toContain('src/utils.ts');
    expect(factor.details![0]).toContain('no test file found');
  });

  it('should note "test exists but not updated" when test file exists', () => {
    const factor = evaluateUntestedChangesFactor(
      makeTestCoverage({
        coverageRatio: 0.5,
        changedSourceFiles: 2,
        gaps: [
          {
            sourceFile: 'src/utils.ts',
            expectedTestFiles: ['src/utils.test.ts'],
            testFileExists: true,
            testFileChanged: false,
          },
        ],
      }),
    );
    expect(factor.details![0]).toContain('test exists but not updated');
  });

  it('should say "No source files changed" when none changed', () => {
    const factor = evaluateUntestedChangesFactor(
      makeTestCoverage({ changedSourceFiles: 0, coverageRatio: 1 }),
    );
    expect(factor.description).toBe('No source files changed.');
  });
});

describe('evaluateDiffSizeFactor', () => {
  it('should return score 0 for small diffs (< 100 lines)', () => {
    const files = [makeChangedFile({ additions: 30, deletions: 20 })];
    const factor = evaluateDiffSizeFactor(files);
    expect(factor.score).toBe(0);
    expect(factor.weight).toBe(0.15);
  });

  it('should return score 50 for 100-499 lines', () => {
    const files = [makeChangedFile({ additions: 100, deletions: 50 })];
    const factor = evaluateDiffSizeFactor(files);
    expect(factor.score).toBe(50);
  });

  it('should return score 80 for 500-1000 lines', () => {
    const files = [makeChangedFile({ additions: 400, deletions: 200 })];
    const factor = evaluateDiffSizeFactor(files);
    expect(factor.score).toBe(80);
  });

  it('should return score 100 for > 1000 lines', () => {
    const files = [makeChangedFile({ additions: 800, deletions: 500 })];
    const factor = evaluateDiffSizeFactor(files);
    expect(factor.score).toBe(100);
  });

  it('should sum lines across multiple files', () => {
    const files = [
      makeChangedFile({ additions: 300, deletions: 100 }),
      makeChangedFile({ additions: 200, deletions: 100 }),
    ];
    const factor = evaluateDiffSizeFactor(files);
    // 300 + 100 + 200 + 100 = 700 -> score 80
    expect(factor.score).toBe(80);
  });

  it('should return score 0 for no files', () => {
    const factor = evaluateDiffSizeFactor([]);
    expect(factor.score).toBe(0);
  });

  it('should include file count in description', () => {
    const files = [
      makeChangedFile({ additions: 10, deletions: 5 }),
      makeChangedFile({ additions: 20, deletions: 10 }),
    ];
    const factor = evaluateDiffSizeFactor(files);
    expect(factor.description).toContain('2 file(s)');
  });
});

describe('evaluateDocStalenessFactor', () => {
  it('should return score 0 with no stale references', () => {
    const factor = evaluateDocStalenessFactor(makeDocStaleness());
    expect(factor.score).toBe(0);
    expect(factor.weight).toBe(0.10);
  });

  it('should return score 20 per stale reference', () => {
    const factor = evaluateDocStalenessFactor(
      makeDocStaleness({
        staleReferences: [
          { docFile: 'docs/api.md', line: 10, reference: 'foo', reason: 'symbol removed' },
        ],
      }),
    );
    expect(factor.score).toBe(20);
  });

  it('should cap score at 100', () => {
    const refs = Array.from({ length: 10 }, (_, i) => ({
      docFile: `docs/doc${i}.md`,
      line: i + 1,
      reference: `sym${i}`,
      reason: 'symbol removed',
    }));
    const factor = evaluateDocStalenessFactor(
      makeDocStaleness({ staleReferences: refs }),
    );
    expect(factor.score).toBe(100);
  });

  it('should include details with stale references', () => {
    const factor = evaluateDocStalenessFactor(
      makeDocStaleness({
        staleReferences: [
          {
            docFile: 'README.md',
            line: 42,
            reference: 'oldFunc',
            reason: 'function removed',
          },
        ],
      }),
    );
    expect(factor.details).toBeDefined();
    expect(factor.details![0]).toContain('README.md:42');
    expect(factor.details![0]).toContain('oldFunc');
  });
});

describe('evaluateConfigChangesFactor', () => {
  it('should return score 0 with no config files', () => {
    const files = [makeChangedFile({ category: 'source' })];
    const factor = evaluateConfigChangesFactor(files);
    expect(factor.score).toBe(0);
    expect(factor.weight).toBe(0.10);
  });

  it('should return score 100 for CI/build config changes', () => {
    const files = [
      makeChangedFile({
        path: '.github/workflows/ci.yml',
        category: 'config',
      }),
    ];
    const factor = evaluateConfigChangesFactor(files);
    expect(factor.score).toBe(100);
  });

  it('should return score 100 for Dockerfile changes', () => {
    const files = [
      makeChangedFile({
        path: 'Dockerfile',
        category: 'config',
      }),
    ];
    const factor = evaluateConfigChangesFactor(files);
    expect(factor.score).toBe(100);
  });

  it('should return score 100 for docker-compose changes', () => {
    const files = [
      makeChangedFile({
        path: 'docker-compose.yml',
        category: 'config',
      }),
    ];
    const factor = evaluateConfigChangesFactor(files);
    expect(factor.score).toBe(100);
  });

  it('should return score 100 for vite.config changes', () => {
    const files = [
      makeChangedFile({
        path: 'vite.config.ts',
        category: 'config',
      }),
    ];
    const factor = evaluateConfigChangesFactor(files);
    expect(factor.score).toBe(100);
  });

  it('should return score 100 for turbo.json changes', () => {
    const files = [
      makeChangedFile({
        path: 'turbo.json',
        category: 'config',
      }),
    ];
    const factor = evaluateConfigChangesFactor(files);
    expect(factor.score).toBe(100);
  });

  it('should return score 50 for non-CI config changes', () => {
    const files = [
      makeChangedFile({
        path: 'package.json',
        category: 'config',
      }),
    ];
    const factor = evaluateConfigChangesFactor(files);
    expect(factor.score).toBe(50);
  });

  it('should include config file paths in details', () => {
    const files = [
      makeChangedFile({
        path: '.github/workflows/ci.yml',
        category: 'config',
      }),
    ];
    const factor = evaluateConfigChangesFactor(files);
    expect(factor.details).toEqual(['.github/workflows/ci.yml']);
  });
});

describe('evaluateImpactBreadthFactor', () => {
  it('should return score 0 with no indirectly affected files', () => {
    const factor = evaluateImpactBreadthFactor(makeImpactGraph());
    expect(factor.score).toBe(0);
    expect(factor.weight).toBe(0.10);
  });

  it('should return 10 per indirectly affected file', () => {
    const factor = evaluateImpactBreadthFactor(
      makeImpactGraph({
        indirectlyAffected: ['a.ts', 'b.ts', 'c.ts'],
      }),
    );
    expect(factor.score).toBe(30);
  });

  it('should cap score at 100', () => {
    const affected = Array.from({ length: 20 }, (_, i) => `file${i}.ts`);
    const factor = evaluateImpactBreadthFactor(
      makeImpactGraph({ indirectlyAffected: affected }),
    );
    expect(factor.score).toBe(100);
  });

  it('should include up to 20 affected files in details', () => {
    const affected = Array.from({ length: 25 }, (_, i) => `file${i}.ts`);
    const factor = evaluateImpactBreadthFactor(
      makeImpactGraph({ indirectlyAffected: affected }),
    );
    expect(factor.details).toBeDefined();
    expect(factor.details!.length).toBe(20);
  });

  it('should not include details when no files are affected', () => {
    const factor = evaluateImpactBreadthFactor(makeImpactGraph());
    expect(factor.details).toBeUndefined();
  });
});

// ── calculateRisk tests ─────────────────────────────────────────────────────

describe('calculateRisk', () => {
  describe('zero-risk inputs', () => {
    it('should return low risk with all zero-risk inputs', () => {
      const result = calculateRisk(
        [],                         // no changed files
        [],                         // no breaking changes
        makeTestCoverage(),         // full coverage
        makeDocStaleness(),         // no stale docs
        makeImpactGraph(),          // no impact
      );

      expect(result.score).toBe(0);
      expect(result.level).toBe('low');
      expect(result.factors).toHaveLength(6);
    });

    it('should have all factor scores at 0 for zero-risk inputs', () => {
      const result = calculateRisk(
        [],
        [],
        makeTestCoverage(),
        makeDocStaleness(),
        makeImpactGraph(),
      );

      for (const factor of result.factors) {
        expect(factor.score).toBe(0);
      }
    });
  });

  describe('high risk due to breaking changes', () => {
    it('should be high/critical with high-severity breaking changes', () => {
      const result = calculateRisk(
        [makeChangedFile({ additions: 10, deletions: 5 })],
        [makeBreakingChange({ severity: 'high' })],
        makeTestCoverage({ coverageRatio: 1 }),
        makeDocStaleness(),
        makeImpactGraph(),
      );

      // Breaking changes factor: 100 * 0.30 = 30
      // All others ~0
      // Weighted average: 30 / 1.0 = 30
      expect(result.score).toBeGreaterThanOrEqual(25);
      expect(['medium', 'high', 'critical']).toContain(result.level);
    });
  });

  describe('weighted score calculation', () => {
    it('should compute weighted average correctly', () => {
      // Set up known conditions:
      // - Breaking changes: high severity -> score 100, weight 0.30
      // - Untested: 0% coverage -> score 100, weight 0.25
      // - Diff size: > 1000 lines -> score 100, weight 0.15
      // - Doc staleness: 5+ stale refs -> score 100, weight 0.10
      // - Config: CI config changed -> score 100, weight 0.10
      // - Impact: 10+ files -> score 100, weight 0.10
      //
      // All scores 100 -> weighted average = 100

      const changedFiles = [
        makeChangedFile({
          additions: 600,
          deletions: 600,
          category: 'source',
        }),
        makeChangedFile({
          path: '.github/workflows/ci.yml',
          category: 'config',
          additions: 10,
          deletions: 5,
        }),
      ];

      const result = calculateRisk(
        changedFiles,
        [makeBreakingChange({ severity: 'high' })],
        makeTestCoverage({
          coverageRatio: 0,
          changedSourceFiles: 5,
        }),
        makeDocStaleness({
          staleReferences: Array.from({ length: 6 }, (_, i) => ({
            docFile: `doc${i}.md`,
            line: i,
            reference: `ref${i}`,
            reason: 'removed',
          })),
        }),
        makeImpactGraph({
          indirectlyAffected: Array.from(
            { length: 15 },
            (_, i) => `affected${i}.ts`,
          ),
        }),
      );

      // All scores are 100, so the weighted average should be 100
      expect(result.score).toBe(100);
      expect(result.level).toBe('critical');
    });
  });

  describe('level thresholds', () => {
    // To get precise scores, we can use the fact that breaking changes alone
    // have weight 0.30. If only breaking changes have a non-zero score:
    // score = (breakingScore * 0.30) / totalWeight where totalWeight = 1.0
    // So breaking score of 100 -> final score 30 -> medium
    // Need to combine factors to hit the exact thresholds

    it('should return "low" for score 0-25', () => {
      // All zeros -> score 0
      const result = calculateRisk(
        [],
        [],
        makeTestCoverage(),
        makeDocStaleness(),
        makeImpactGraph(),
      );
      expect(result.level).toBe('low');
      expect(result.score).toBeLessThanOrEqual(25);
    });

    it('should return "medium" for score 26-50', () => {
      // Breaking changes (high) alone: 100 * 0.30 / 1.0 = 30 -> medium
      const result = calculateRisk(
        [],
        [makeBreakingChange({ severity: 'high' })],
        makeTestCoverage(),
        makeDocStaleness(),
        makeImpactGraph(),
      );
      expect(result.score).toBe(30);
      expect(result.level).toBe('medium');
    });

    it('should return "high" for score 51-75', () => {
      // Breaking changes high: 100 * 0.30 = 30
      // Untested (0% coverage): 100 * 0.25 = 25
      // Total = 55 / 1.0 = 55 -> high
      const result = calculateRisk(
        [],
        [makeBreakingChange({ severity: 'high' })],
        makeTestCoverage({
          coverageRatio: 0,
          changedSourceFiles: 5,
        }),
        makeDocStaleness(),
        makeImpactGraph(),
      );
      expect(result.score).toBe(55);
      expect(result.level).toBe('high');
    });

    it('should return "critical" for score 76+', () => {
      // Breaking: 100 * 0.30 = 30
      // Untested: 100 * 0.25 = 25
      // Diff size >1000: 100 * 0.15 = 15
      // Doc staleness (5 refs = 100): 100 * 0.10 = 10
      // Config (CI): 100 * 0.10 = 10
      // Impact (10 files): 100 * 0.10 = 10
      // Total = 100 / 1.0 = 100 -> critical

      const result = calculateRisk(
        [
          makeChangedFile({
            additions: 600,
            deletions: 600,
            category: 'source',
          }),
          makeChangedFile({
            path: '.github/workflows/ci.yml',
            category: 'config',
            additions: 5,
            deletions: 5,
          }),
        ],
        [makeBreakingChange({ severity: 'high' })],
        makeTestCoverage({
          coverageRatio: 0,
          changedSourceFiles: 5,
        }),
        makeDocStaleness({
          staleReferences: Array.from({ length: 5 }, (_, i) => ({
            docFile: `doc${i}.md`,
            line: i,
            reference: `ref${i}`,
            reason: 'removed',
          })),
        }),
        makeImpactGraph({
          indirectlyAffected: Array.from(
            { length: 10 },
            (_, i) => `f${i}.ts`,
          ),
        }),
      );

      expect(result.score).toBeGreaterThanOrEqual(76);
      expect(result.level).toBe('critical');
    });
  });

  describe('result structure', () => {
    it('should return all 6 factors', () => {
      const result = calculateRisk(
        [],
        [],
        makeTestCoverage(),
        makeDocStaleness(),
        makeImpactGraph(),
      );

      expect(result.factors).toHaveLength(6);
      const names = result.factors.map((f) => f.name);
      expect(names).toContain('Breaking changes');
      expect(names).toContain('Untested changes');
      expect(names).toContain('Diff size');
      expect(names).toContain('Stale documentation');
      expect(names).toContain('Config file changes');
      expect(names).toContain('Impact breadth');
    });

    it('should have score as a rounded integer', () => {
      const result = calculateRisk(
        [],
        [makeBreakingChange({ severity: 'low' })],
        makeTestCoverage({ coverageRatio: 0.7 }),
        makeDocStaleness(),
        makeImpactGraph(),
      );

      expect(Number.isInteger(result.score)).toBe(true);
    });
  });
});
