import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChangedFile, BreakingChange, TestCoverageReport, DocStalenessReport, ImpactGraph, RiskAssessment } from '../src/types.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockBranch = vi.fn();
const mockCheckIsRepo = vi.fn();
const mockRevparse = vi.fn();

vi.mock('simple-git', () => ({
  default: vi.fn(() => ({
    branch: mockBranch,
    checkIsRepo: mockCheckIsRepo,
    revparse: mockRevparse,
  })),
}));

const mockParseDiff = vi.fn();
vi.mock('../src/diff/diff-parser.js', () => ({
  parseDiff: (...args: unknown[]) => mockParseDiff(...args),
}));

const mockDetectBreakingChanges = vi.fn();
vi.mock('../src/breaking/detector.js', () => ({
  detectBreakingChanges: (...args: unknown[]) => mockDetectBreakingChanges(...args),
}));

const mockCheckTestCoverage = vi.fn();
vi.mock('../src/coverage/coverage-checker.js', () => ({
  checkTestCoverage: (...args: unknown[]) => mockCheckTestCoverage(...args),
}));

const mockCheckDocStaleness = vi.fn();
vi.mock('../src/docs/staleness-checker.js', () => ({
  checkDocStaleness: (...args: unknown[]) => mockCheckDocStaleness(...args),
}));

const mockBuildImpactGraph = vi.fn();
vi.mock('../src/impact/impact-graph.js', () => ({
  buildImpactGraph: (...args: unknown[]) => mockBuildImpactGraph(...args),
}));

const mockCalculateRisk = vi.fn();
vi.mock('../src/risk/risk-calculator.js', () => ({
  calculateRisk: (...args: unknown[]) => mockCalculateRisk(...args),
}));

const mockBuildReverseDependencyMap = vi.fn();
vi.mock('../src/imports/import-resolver.js', () => ({
  buildReverseDependencyMap: (...args: unknown[]) => mockBuildReverseDependencyMap(...args),
}));

import { resolveDefaultBaseBranch, analyzePR } from '../src/analyzer.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const fakeChangedFiles: ChangedFile[] = [
  {
    path: 'src/utils.ts',
    status: 'modified',
    additions: 10,
    deletions: 5,
    language: 'typescript',
    category: 'source',
  },
  {
    path: 'src/index.ts',
    status: 'modified',
    additions: 3,
    deletions: 1,
    language: 'typescript',
    category: 'source',
  },
];

const fakeBreakingChanges: BreakingChange[] = [
  {
    filePath: 'src/utils.ts',
    type: 'removed_export',
    symbolName: 'helperFn',
    before: 'export function helperFn(): void',
    after: null,
    severity: 'high',
    consumers: ['src/index.ts'],
  },
];

const fakeCoverage: TestCoverageReport = {
  changedSourceFiles: 2,
  sourceFilesWithTestChanges: 1,
  coverageRatio: 0.5,
  gaps: [
    {
      sourceFile: 'src/index.ts',
      expectedTestFiles: ['__tests__/index.test.ts'],
      testFileExists: false,
      testFileChanged: false,
    },
  ],
};

const fakeDocStaleness: DocStalenessReport = {
  staleReferences: [],
  checkedFiles: ['README.md'],
};

const fakeImpactGraph: ImpactGraph = {
  directlyChanged: ['src/utils.ts', 'src/index.ts'],
  indirectlyAffected: ['src/app.ts'],
  edges: [{ from: 'src/utils.ts', to: 'src/app.ts', type: 'imports' }],
};

const fakeRiskScore: RiskAssessment = {
  score: 42,
  level: 'medium',
  factors: [
    { name: 'Breaking Changes', score: 100, weight: 0.3, description: '1 breaking change found' },
    { name: 'Untested Changes', score: 50, weight: 0.25, description: '1 of 2 source files lack test changes' },
  ],
};

const fakeReverseDeps = new Map<string, string[]>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function setupDefaultMocks() {
  mockCheckIsRepo.mockResolvedValue(true);
  mockRevparse.mockResolvedValue('abc123');
  mockBranch.mockResolvedValue({ all: ['main', 'feature/test'] });
  mockParseDiff.mockResolvedValue(fakeChangedFiles);
  mockDetectBreakingChanges.mockResolvedValue(fakeBreakingChanges);
  mockCheckTestCoverage.mockResolvedValue(fakeCoverage);
  mockCheckDocStaleness.mockResolvedValue(fakeDocStaleness);
  mockBuildImpactGraph.mockResolvedValue(fakeImpactGraph);
  mockCalculateRisk.mockReturnValue(fakeRiskScore);
  mockBuildReverseDependencyMap.mockResolvedValue(fakeReverseDeps);
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveDefaultBaseBranch', () => {
  it('returns "main" when main branch exists', async () => {
    mockBranch.mockResolvedValue({ all: ['main', 'feature/test'] });

    const result = await resolveDefaultBaseBranch('/fake/repo');
    expect(result).toBe('main');
  });

  it('returns "master" when only master exists', async () => {
    mockBranch.mockResolvedValue({ all: ['master', 'develop'] });

    const result = await resolveDefaultBaseBranch('/fake/repo');
    expect(result).toBe('master');
  });

  it('prefers "main" over "master" when both exist', async () => {
    mockBranch.mockResolvedValue({ all: ['main', 'master'] });

    const result = await resolveDefaultBaseBranch('/fake/repo');
    expect(result).toBe('main');
  });

  it('falls back to "main" when neither exists', async () => {
    mockBranch.mockResolvedValue({ all: ['develop', 'feature/x'] });

    const result = await resolveDefaultBaseBranch('/fake/repo');
    expect(result).toBe('main');
  });
});

describe('analyzePR', () => {
  describe('happy path', () => {
    it('runs all analysis steps and returns complete PRAnalysis', async () => {
      setupDefaultMocks();

      const result = await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
      });

      expect(result.repoPath).toBe('/fake/repo');
      expect(result.baseBranch).toBe('main');
      expect(result.headBranch).toBe('feature/test');
      expect(result.changedFiles).toBe(fakeChangedFiles);
      expect(result.breakingChanges).toBe(fakeBreakingChanges);
      expect(result.testCoverage).toBe(fakeCoverage);
      expect(result.docStaleness).toBe(fakeDocStaleness);
      expect(result.impactGraph).toBe(fakeImpactGraph);
      expect(result.riskScore).toBe(fakeRiskScore);
      expect(typeof result.summary).toBe('string');
    });

    it('calls parseDiff with correct arguments', async () => {
      setupDefaultMocks();

      await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
      });

      expect(mockParseDiff).toHaveBeenCalledWith('/fake/repo', 'main', 'feature/test');
    });

    it('calls detectBreakingChanges with correct arguments', async () => {
      setupDefaultMocks();

      await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
      });

      expect(mockDetectBreakingChanges).toHaveBeenCalledWith(
        '/fake/repo', 'main', 'feature/test', fakeChangedFiles, fakeReverseDeps,
      );
    });

    it('calls checkTestCoverage with correct arguments', async () => {
      setupDefaultMocks();

      await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
      });

      expect(mockCheckTestCoverage).toHaveBeenCalledWith('/fake/repo', fakeChangedFiles);
    });

    it('calls checkDocStaleness with correct arguments', async () => {
      setupDefaultMocks();

      await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
      });

      expect(mockCheckDocStaleness).toHaveBeenCalledWith(
        '/fake/repo', fakeChangedFiles, 'main', 'feature/test',
      );
    });

    it('calls buildImpactGraph with correct arguments', async () => {
      setupDefaultMocks();

      await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
      });

      expect(mockBuildImpactGraph).toHaveBeenCalledWith('/fake/repo', fakeChangedFiles, 3, fakeReverseDeps);
    });

    it('calls calculateRisk with all analysis results', async () => {
      setupDefaultMocks();

      await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
      });

      expect(mockCalculateRisk).toHaveBeenCalledWith(
        fakeChangedFiles,
        fakeBreakingChanges,
        fakeCoverage,
        fakeDocStaleness,
        fakeImpactGraph,
      );
    });
  });

  describe('branch resolution', () => {
    it('resolves default base branch when baseBranch is not provided', async () => {
      setupDefaultMocks();

      const result = await analyzePR({ repoPath: '/fake/repo' });

      expect(result.baseBranch).toBe('main');
      expect(mockBranch).toHaveBeenCalled();
    });

    it('defaults headBranch to HEAD when not provided', async () => {
      setupDefaultMocks();

      const result = await analyzePR({ repoPath: '/fake/repo' });

      expect(result.headBranch).toBe('HEAD');
    });

    it('uses provided baseBranch without resolving default', async () => {
      setupDefaultMocks();

      const result = await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'develop',
        headBranch: 'feature/x',
      });

      expect(result.baseBranch).toBe('develop');
      expect(mockParseDiff).toHaveBeenCalledWith('/fake/repo', 'develop', 'feature/x');
    });
  });

  describe('skip flags', () => {
    it('skips breaking change detection when skipBreaking is true', async () => {
      setupDefaultMocks();

      const result = await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
        skipBreaking: true,
      });

      expect(mockDetectBreakingChanges).not.toHaveBeenCalled();
      expect(result.breakingChanges).toEqual([]);
    });

    it('skips test coverage analysis when skipCoverage is true', async () => {
      setupDefaultMocks();

      const result = await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
        skipCoverage: true,
      });

      expect(mockCheckTestCoverage).not.toHaveBeenCalled();
      expect(result.testCoverage).toEqual({
        changedSourceFiles: 0,
        sourceFilesWithTestChanges: 0,
        coverageRatio: 0,
        gaps: [],
      });
    });

    it('skips doc staleness checking when skipDocs is true', async () => {
      setupDefaultMocks();

      const result = await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
        skipDocs: true,
      });

      expect(mockCheckDocStaleness).not.toHaveBeenCalled();
      expect(result.docStaleness).toEqual({
        staleReferences: [],
        checkedFiles: [],
      });
    });

    it('skips all optional steps when all skip flags are true', async () => {
      setupDefaultMocks();

      const result = await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
        skipBreaking: true,
        skipCoverage: true,
        skipDocs: true,
      });

      expect(mockDetectBreakingChanges).not.toHaveBeenCalled();
      expect(mockCheckTestCoverage).not.toHaveBeenCalled();
      expect(mockCheckDocStaleness).not.toHaveBeenCalled();
      // Impact graph is always run
      expect(mockBuildImpactGraph).toHaveBeenCalled();
      expect(result.breakingChanges).toEqual([]);
      expect(result.testCoverage.gaps).toEqual([]);
      expect(result.docStaleness.staleReferences).toEqual([]);
    });

    it('always runs impact graph even when other steps are skipped', async () => {
      setupDefaultMocks();

      await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
        skipBreaking: true,
        skipCoverage: true,
        skipDocs: true,
      });

      expect(mockBuildImpactGraph).toHaveBeenCalledWith('/fake/repo', fakeChangedFiles, 3, fakeReverseDeps);
    });
  });

  describe('git verification errors', () => {
    it('throws when the path is not a git repository', async () => {
      setupDefaultMocks();
      mockCheckIsRepo.mockRejectedValue(new Error('not a git repository'));

      await expect(
        analyzePR({ repoPath: '/not/a/repo', baseBranch: 'main', headBranch: 'HEAD' }),
      ).rejects.toThrow('not a git repository');
    });

    it('throws when the base branch ref is invalid', async () => {
      setupDefaultMocks();
      mockRevparse.mockRejectedValueOnce(new Error('unknown revision'));

      await expect(
        analyzePR({ repoPath: '/fake/repo', baseBranch: 'nonexistent', headBranch: 'HEAD' }),
      ).rejects.toThrow('unknown revision');
    });

    it('throws when the head branch ref is invalid', async () => {
      setupDefaultMocks();
      // First call (baseBranch) succeeds, second call (headBranch) fails
      mockRevparse
        .mockResolvedValueOnce('abc123')
        .mockRejectedValueOnce(new Error('unknown revision'));

      await expect(
        analyzePR({ repoPath: '/fake/repo', baseBranch: 'main', headBranch: 'bad-ref' }),
      ).rejects.toThrow('unknown revision');
    });

    it('does not call any analysis steps when git verification fails', async () => {
      setupDefaultMocks();
      mockCheckIsRepo.mockRejectedValue(new Error('not a git repository'));

      await expect(
        analyzePR({ repoPath: '/not/a/repo', baseBranch: 'main', headBranch: 'HEAD' }),
      ).rejects.toThrow();

      expect(mockParseDiff).not.toHaveBeenCalled();
      expect(mockBuildReverseDependencyMap).not.toHaveBeenCalled();
      expect(mockDetectBreakingChanges).not.toHaveBeenCalled();
      expect(mockCheckTestCoverage).not.toHaveBeenCalled();
      expect(mockCheckDocStaleness).not.toHaveBeenCalled();
      expect(mockBuildImpactGraph).not.toHaveBeenCalled();
      expect(mockCalculateRisk).not.toHaveBeenCalled();
    });
  });

  describe('summary generation', () => {
    it('includes file count and risk level in summary', async () => {
      setupDefaultMocks();

      const result = await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
      });

      expect(result.summary).toContain('2 files');
      expect(result.summary).toContain('medium');
      expect(result.summary).toContain('42/100');
    });

    it('includes breaking changes count when present', async () => {
      setupDefaultMocks();

      const result = await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
      });

      expect(result.summary).toContain('1 breaking change');
    });

    it('includes test coverage gap count when present', async () => {
      setupDefaultMocks();

      const result = await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
      });

      expect(result.summary).toContain('1 source file');
      expect(result.summary).toContain('lacks');
    });

    it('uses singular "file" for 1 changed file', async () => {
      setupDefaultMocks();
      mockParseDiff.mockResolvedValue([fakeChangedFiles[0]]);

      const result = await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
      });

      expect(result.summary).toMatch(/changes 1 file\b/);
    });

    it('uses plural "files" for multiple changed files', async () => {
      setupDefaultMocks();

      const result = await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
      });

      expect(result.summary).toMatch(/changes 2 files\b/);
    });

    it('omits breaking changes sentence when there are none', async () => {
      setupDefaultMocks();
      mockDetectBreakingChanges.mockResolvedValue([]);

      const result = await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
      });

      expect(result.summary).not.toContain('breaking change');
    });

    it('omits test coverage gap sentence when there are none', async () => {
      setupDefaultMocks();
      mockCheckTestCoverage.mockResolvedValue({
        changedSourceFiles: 2,
        sourceFilesWithTestChanges: 2,
        coverageRatio: 1.0,
        gaps: [],
      });

      const result = await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
      });

      expect(result.summary).not.toContain('lack');
    });

    it('uses plural "changes" for multiple breaking changes', async () => {
      setupDefaultMocks();
      mockDetectBreakingChanges.mockResolvedValue([
        fakeBreakingChanges[0],
        { ...fakeBreakingChanges[0], symbolName: 'otherFn' },
      ]);

      const result = await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
      });

      expect(result.summary).toContain('2 breaking changes');
    });

    it('uses plural "files lack" for multiple coverage gaps', async () => {
      setupDefaultMocks();
      mockCheckTestCoverage.mockResolvedValue({
        changedSourceFiles: 3,
        sourceFilesWithTestChanges: 1,
        coverageRatio: 0.33,
        gaps: [
          { sourceFile: 'a.ts', expectedTestFiles: [], testFileExists: false, testFileChanged: false },
          { sourceFile: 'b.ts', expectedTestFiles: [], testFileExists: false, testFileChanged: false },
        ],
      });

      const result = await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
      });

      expect(result.summary).toContain('2 source files');
      expect(result.summary).toMatch(/\black\b/);
    });

    it('includes additions and deletions in summary', async () => {
      setupDefaultMocks();

      const result = await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
      });

      // 10 + 3 = 13 additions, 5 + 1 = 6 deletions
      expect(result.summary).toContain('+13/-6');
    });
  });

  describe('result structure', () => {
    it('returns all expected fields', async () => {
      setupDefaultMocks();

      const result = await analyzePR({
        repoPath: '/fake/repo',
        baseBranch: 'main',
        headBranch: 'feature/test',
      });

      expect(result).toHaveProperty('repoPath');
      expect(result).toHaveProperty('baseBranch');
      expect(result).toHaveProperty('headBranch');
      expect(result).toHaveProperty('changedFiles');
      expect(result).toHaveProperty('breakingChanges');
      expect(result).toHaveProperty('testCoverage');
      expect(result).toHaveProperty('docStaleness');
      expect(result).toHaveProperty('impactGraph');
      expect(result).toHaveProperty('riskScore');
      expect(result).toHaveProperty('summary');
    });
  });
});
