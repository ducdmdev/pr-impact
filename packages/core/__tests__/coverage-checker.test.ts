import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkTestCoverage } from '../src/coverage/coverage-checker.js';
import type { ChangedFile } from '../src/types.js';

// Mock the test-mapper module so we can control what mapTestFiles returns
vi.mock('../src/coverage/test-mapper.js', () => ({
  mapTestFiles: vi.fn(),
}));

import { mapTestFiles } from '../src/coverage/test-mapper.js';

const mockedMapTestFiles = vi.mocked(mapTestFiles);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeChangedFile(overrides: Partial<ChangedFile> = {}): ChangedFile {
  return {
    path: 'src/index.ts',
    status: 'modified',
    additions: 10,
    deletions: 5,
    language: 'typescript',
    category: 'source',
    ...overrides,
  };
}

function makeSourceFile(path: string): ChangedFile {
  return makeChangedFile({ path, category: 'source' });
}

function makeTestFile(path: string): ChangedFile {
  return makeChangedFile({ path, category: 'test' });
}

function makeDocFile(path: string): ChangedFile {
  return makeChangedFile({ path, category: 'doc' });
}

function makeConfigFile(path: string): ChangedFile {
  return makeChangedFile({ path, category: 'config' });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('checkTestCoverage', () => {
  // ── No source files ───────────────────────────────────────────────────

  describe('no source files', () => {
    it('should return coverageRatio 1 and no gaps when no files at all', async () => {
      const result = await checkTestCoverage('/repo', []);

      expect(result.changedSourceFiles).toBe(0);
      expect(result.sourceFilesWithTestChanges).toBe(0);
      expect(result.coverageRatio).toBe(1);
      expect(result.gaps).toEqual([]);
    });

    it('should return coverageRatio 1 when only test files are changed (test-only PR)', async () => {
      const changedFiles = [
        makeTestFile('src/utils/parser.test.ts'),
        makeTestFile('src/utils/__tests__/helper.ts'),
      ];

      const result = await checkTestCoverage('/repo', changedFiles);

      expect(result.changedSourceFiles).toBe(0);
      expect(result.sourceFilesWithTestChanges).toBe(0);
      expect(result.coverageRatio).toBe(1);
      expect(result.gaps).toEqual([]);
    });

    it('should return coverageRatio 1 when only doc files are changed', async () => {
      const changedFiles = [
        makeDocFile('README.md'),
        makeDocFile('docs/guide.md'),
      ];

      const result = await checkTestCoverage('/repo', changedFiles);

      expect(result.changedSourceFiles).toBe(0);
      expect(result.coverageRatio).toBe(1);
      expect(result.gaps).toEqual([]);
    });

    it('should return coverageRatio 1 when only config files are changed', async () => {
      const changedFiles = [
        makeConfigFile('package.json'),
        makeConfigFile('tsconfig.json'),
      ];

      const result = await checkTestCoverage('/repo', changedFiles);

      expect(result.changedSourceFiles).toBe(0);
      expect(result.coverageRatio).toBe(1);
      expect(result.gaps).toEqual([]);
    });
  });

  // ── Full coverage ─────────────────────────────────────────────────────

  describe('full coverage', () => {
    it('should return coverageRatio 1 when all source files have test changes', async () => {
      const changedFiles = [
        makeSourceFile('src/utils/parser.ts'),
        makeSourceFile('src/utils/formatter.ts'),
        makeTestFile('src/utils/parser.test.ts'),
        makeTestFile('src/utils/formatter.test.ts'),
      ];

      // mapTestFiles returns the test file for each source file
      mockedMapTestFiles
        .mockResolvedValueOnce(['src/utils/parser.test.ts'])
        .mockResolvedValueOnce(['src/utils/formatter.test.ts']);

      const result = await checkTestCoverage('/repo', changedFiles);

      expect(result.changedSourceFiles).toBe(2);
      expect(result.sourceFilesWithTestChanges).toBe(2);
      expect(result.coverageRatio).toBe(1);
      expect(result.gaps).toEqual([]);
    });

    it('should count as covered when any of multiple expected test files is changed', async () => {
      const changedFiles = [
        makeSourceFile('src/utils/parser.ts'),
        makeTestFile('test/utils/parser.test.ts'),
      ];

      // mapTestFiles returns multiple candidates, but only one is in the changed list
      mockedMapTestFiles.mockResolvedValueOnce([
        'src/utils/parser.test.ts',
        'test/utils/parser.test.ts',
      ]);

      const result = await checkTestCoverage('/repo', changedFiles);

      expect(result.coverageRatio).toBe(1);
      expect(result.gaps).toEqual([]);
    });
  });

  // ── No coverage ───────────────────────────────────────────────────────

  describe('no coverage', () => {
    it('should return coverageRatio 0 when no source files have test changes', async () => {
      const changedFiles = [
        makeSourceFile('src/utils/parser.ts'),
        makeSourceFile('src/utils/formatter.ts'),
      ];

      // mapTestFiles finds existing test files, but they are not in the changed list
      mockedMapTestFiles
        .mockResolvedValueOnce(['src/utils/parser.test.ts'])
        .mockResolvedValueOnce(['src/utils/formatter.test.ts']);

      const result = await checkTestCoverage('/repo', changedFiles);

      expect(result.changedSourceFiles).toBe(2);
      expect(result.sourceFilesWithTestChanges).toBe(0);
      expect(result.coverageRatio).toBe(0);
      expect(result.gaps).toHaveLength(2);
    });

    it('should return coverageRatio 0 when no test files exist at all', async () => {
      const changedFiles = [
        makeSourceFile('src/utils/parser.ts'),
        makeSourceFile('src/utils/formatter.ts'),
      ];

      // mapTestFiles finds no test files on disk
      mockedMapTestFiles
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await checkTestCoverage('/repo', changedFiles);

      expect(result.changedSourceFiles).toBe(2);
      expect(result.sourceFilesWithTestChanges).toBe(0);
      expect(result.coverageRatio).toBe(0);
      expect(result.gaps).toHaveLength(2);
    });
  });

  // ── Mixed coverage ────────────────────────────────────────────────────

  describe('mixed coverage', () => {
    it('should return correct ratio for partially covered source files', async () => {
      const changedFiles = [
        makeSourceFile('src/utils/parser.ts'),
        makeSourceFile('src/utils/formatter.ts'),
        makeSourceFile('src/utils/validator.ts'),
        makeTestFile('src/utils/parser.test.ts'),
      ];

      // parser has a changed test, formatter and validator do not
      mockedMapTestFiles
        .mockResolvedValueOnce(['src/utils/parser.test.ts'])   // parser -> covered
        .mockResolvedValueOnce(['src/utils/formatter.test.ts']) // formatter -> not changed
        .mockResolvedValueOnce([]);                             // validator -> no test

      const result = await checkTestCoverage('/repo', changedFiles);

      expect(result.changedSourceFiles).toBe(3);
      expect(result.sourceFilesWithTestChanges).toBe(1);
      expect(result.coverageRatio).toBeCloseTo(1 / 3);
      expect(result.gaps).toHaveLength(2);
    });

    it('should return 0.5 for 1 of 2 source files covered', async () => {
      const changedFiles = [
        makeSourceFile('src/a.ts'),
        makeSourceFile('src/b.ts'),
        makeTestFile('src/a.test.ts'),
      ];

      mockedMapTestFiles
        .mockResolvedValueOnce(['src/a.test.ts'])  // covered
        .mockResolvedValueOnce(['src/b.test.ts']); // exists but not changed

      const result = await checkTestCoverage('/repo', changedFiles);

      expect(result.changedSourceFiles).toBe(2);
      expect(result.sourceFilesWithTestChanges).toBe(1);
      expect(result.coverageRatio).toBe(0.5);
      expect(result.gaps).toHaveLength(1);
    });
  });

  // ── Gap reports ───────────────────────────────────────────────────────

  describe('gap reports', () => {
    it('should report testFileExists true when test file exists but is not changed', async () => {
      const changedFiles = [
        makeSourceFile('src/utils/parser.ts'),
      ];

      mockedMapTestFiles.mockResolvedValueOnce(['src/utils/parser.test.ts']);

      const result = await checkTestCoverage('/repo', changedFiles);

      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0]).toEqual({
        sourceFile: 'src/utils/parser.ts',
        expectedTestFiles: ['src/utils/parser.test.ts'],
        testFileExists: true,
        testFileChanged: false,
      });
    });

    it('should report testFileExists false when no test file exists on disk', async () => {
      const changedFiles = [
        makeSourceFile('src/utils/parser.ts'),
      ];

      mockedMapTestFiles.mockResolvedValueOnce([]);

      const result = await checkTestCoverage('/repo', changedFiles);

      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0]).toEqual({
        sourceFile: 'src/utils/parser.ts',
        expectedTestFiles: [],
        testFileExists: false,
        testFileChanged: false,
      });
    });

    it('should always report testFileChanged as false in gaps', async () => {
      const changedFiles = [
        makeSourceFile('src/a.ts'),
        makeSourceFile('src/b.ts'),
      ];

      mockedMapTestFiles
        .mockResolvedValueOnce(['src/a.test.ts'])
        .mockResolvedValueOnce([]);

      const result = await checkTestCoverage('/repo', changedFiles);

      for (const gap of result.gaps) {
        expect(gap.testFileChanged).toBe(false);
      }
    });

    it('should include the correct sourceFile path in each gap', async () => {
      const changedFiles = [
        makeSourceFile('src/alpha.ts'),
        makeSourceFile('src/beta.ts'),
        makeSourceFile('src/gamma.ts'),
      ];

      mockedMapTestFiles
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await checkTestCoverage('/repo', changedFiles);

      const gapPaths = result.gaps.map((g) => g.sourceFile);
      expect(gapPaths).toEqual([
        'src/alpha.ts',
        'src/beta.ts',
        'src/gamma.ts',
      ]);
    });

    it('should include multiple expected test files in the gap', async () => {
      const changedFiles = [
        makeSourceFile('src/utils/parser.ts'),
      ];

      mockedMapTestFiles.mockResolvedValueOnce([
        'src/utils/parser.test.ts',
        'src/utils/__tests__/parser.ts',
      ]);

      const result = await checkTestCoverage('/repo', changedFiles);

      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].expectedTestFiles).toEqual([
        'src/utils/parser.test.ts',
        'src/utils/__tests__/parser.ts',
      ]);
      expect(result.gaps[0].testFileExists).toBe(true);
    });
  });

  // ── Only source files are processed ───────────────────────────────────

  describe('file category filtering', () => {
    it('should only process source-category files (skip test, doc, config, other)', async () => {
      const changedFiles = [
        makeSourceFile('src/utils/parser.ts'),
        makeTestFile('src/utils/parser.test.ts'),
        makeDocFile('README.md'),
        makeConfigFile('package.json'),
        makeChangedFile({ path: 'assets/logo.png', category: 'other' }),
      ];

      // Only parser.ts is source, so mapTestFiles is called once
      mockedMapTestFiles.mockResolvedValueOnce(['src/utils/parser.test.ts']);

      const result = await checkTestCoverage('/repo', changedFiles);

      expect(mockedMapTestFiles).toHaveBeenCalledTimes(1);
      expect(mockedMapTestFiles).toHaveBeenCalledWith('/repo', 'src/utils/parser.ts');
      expect(result.changedSourceFiles).toBe(1);
    });

    it('should not call mapTestFiles for non-source files', async () => {
      const changedFiles = [
        makeTestFile('src/utils/parser.test.ts'),
        makeDocFile('docs/guide.md'),
        makeConfigFile('tsconfig.json'),
      ];

      const result = await checkTestCoverage('/repo', changedFiles);

      expect(mockedMapTestFiles).not.toHaveBeenCalled();
      expect(result.changedSourceFiles).toBe(0);
    });
  });

  // ── Counts accuracy ──────────────────────────────────────────────────

  describe('counts accuracy', () => {
    it('should count changedSourceFiles correctly', async () => {
      const changedFiles = [
        makeSourceFile('src/a.ts'),
        makeSourceFile('src/b.ts'),
        makeSourceFile('src/c.ts'),
        makeTestFile('src/a.test.ts'),
        makeDocFile('README.md'),
      ];

      mockedMapTestFiles
        .mockResolvedValueOnce(['src/a.test.ts'])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await checkTestCoverage('/repo', changedFiles);

      expect(result.changedSourceFiles).toBe(3);
    });

    it('should count sourceFilesWithTestChanges correctly', async () => {
      const changedFiles = [
        makeSourceFile('src/a.ts'),
        makeSourceFile('src/b.ts'),
        makeSourceFile('src/c.ts'),
        makeTestFile('src/a.test.ts'),
        makeTestFile('src/b.test.ts'),
      ];

      mockedMapTestFiles
        .mockResolvedValueOnce(['src/a.test.ts'])   // covered
        .mockResolvedValueOnce(['src/b.test.ts'])   // covered
        .mockResolvedValueOnce(['src/c.test.ts']);   // exists but not changed

      const result = await checkTestCoverage('/repo', changedFiles);

      expect(result.sourceFilesWithTestChanges).toBe(2);
      expect(result.changedSourceFiles).toBe(3);
      expect(result.coverageRatio).toBeCloseTo(2 / 3);
    });

    it('should pass the repoPath to mapTestFiles', async () => {
      const changedFiles = [makeSourceFile('src/a.ts')];
      mockedMapTestFiles.mockResolvedValueOnce([]);

      await checkTestCoverage('/my/special/repo', changedFiles);

      expect(mockedMapTestFiles).toHaveBeenCalledWith('/my/special/repo', 'src/a.ts');
    });
  });
});
