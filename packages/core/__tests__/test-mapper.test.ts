import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapTestFiles } from '../src/coverage/test-mapper.js';

// Mock fast-glob
vi.mock('fast-glob', () => ({
  default: vi.fn(),
}));

import fg from 'fast-glob';

const mockedFg = vi.mocked(fg);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Helper ──────────────────────────────────────────────────────────────────

/**
 * Calls mapTestFiles and captures the glob patterns that were passed to
 * fast-glob, so we can assert on candidate path generation without needing
 * the filesystem.
 */
async function capturePatterns(
  sourceFile: string,
): Promise<string[]> {
  mockedFg.mockResolvedValue([]);
  await mapTestFiles('/repo', sourceFile);
  if (mockedFg.mock.calls.length === 0) return [];
  return mockedFg.mock.calls[0][0] as string[];
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('mapTestFiles', () => {
  // ── Candidate path generation ───────────────────────────────────────────

  describe('candidate path generation', () => {
    it('should generate same-directory .test and .spec candidates', async () => {
      const patterns = await capturePatterns('src/utils/parser.ts');

      expect(patterns).toContain('src/utils/parser.test.ts');
      expect(patterns).toContain('src/utils/parser.spec.ts');
      expect(patterns).toContain('src/utils/parser.test.js');
      expect(patterns).toContain('src/utils/parser.spec.js');
    });

    it('should generate __tests__ sibling directory candidates', async () => {
      const patterns = await capturePatterns('src/utils/parser.ts');

      expect(patterns).toContain('src/utils/__tests__/parser.ts');
      expect(patterns).toContain('src/utils/__tests__/parser.test.ts');
      expect(patterns).toContain('src/utils/__tests__/parser.spec.ts');
      expect(patterns).toContain('src/utils/__tests__/parser.js');
      expect(patterns).toContain('src/utils/__tests__/parser.test.js');
    });

    it('should generate top-level test/ and tests/ directory candidates', async () => {
      const patterns = await capturePatterns('src/utils/parser.ts');

      // After stripping src/, subPath = utils/parser.ts, subDir = utils
      expect(patterns).toContain('test/utils/parser.ts');
      expect(patterns).toContain('test/utils/parser.test.ts');
      expect(patterns).toContain('test/utils/parser.spec.ts');
      expect(patterns).toContain('tests/utils/parser.ts');
      expect(patterns).toContain('tests/utils/parser.test.ts');
      expect(patterns).toContain('tests/utils/parser.spec.ts');
    });

    it('should check all four extensions (.ts, .tsx, .js, .jsx)', async () => {
      const patterns = await capturePatterns('src/utils/parser.ts');

      // Same-dir .test variants for all four extensions
      expect(patterns).toContain('src/utils/parser.test.ts');
      expect(patterns).toContain('src/utils/parser.test.tsx');
      expect(patterns).toContain('src/utils/parser.test.js');
      expect(patterns).toContain('src/utils/parser.test.jsx');
    });

    it('should strip src/ prefix for top-level test dir mapping', async () => {
      const patterns = await capturePatterns('src/core/index.ts');

      // src/ stripped -> core/index.ts, subDir = core
      expect(patterns).toContain('test/core/index.ts');
      expect(patterns).toContain('tests/core/index.ts');
      expect(patterns).toContain('test/core/index.test.ts');
      expect(patterns).toContain('tests/core/index.test.ts');
    });

    it('should strip lib/ prefix for top-level test dir mapping', async () => {
      const patterns = await capturePatterns('lib/helpers/format.ts');

      // lib/ stripped -> helpers/format.ts, subDir = helpers
      expect(patterns).toContain('test/helpers/format.ts');
      expect(patterns).toContain('tests/helpers/format.ts');
      expect(patterns).toContain('test/helpers/format.test.ts');
    });

    it('should strip the last src/ when path has nested src/', async () => {
      const patterns = await capturePatterns('packages/foo/src/utils.ts');

      // lastIndexOf('src/') finds the src/ in packages/foo/src/
      // Strips to utils.ts, subDir = .
      expect(patterns).toContain('test/utils.ts');
      expect(patterns).toContain('test/utils.test.ts');
      expect(patterns).toContain('tests/utils.ts');
    });

    it('should keep the full path when there is no src/ or lib/ prefix', async () => {
      const patterns = await capturePatterns('utils/parser.ts');

      // No src/ or lib/ to strip, so subDir = utils
      expect(patterns).toContain('test/utils/parser.ts');
      expect(patterns).toContain('test/utils/parser.test.ts');
      expect(patterns).toContain('tests/utils/parser.ts');
    });

    it('should handle a file in the root directory', async () => {
      const patterns = await capturePatterns('index.ts');

      expect(patterns).toContain('index.test.ts');
      expect(patterns).toContain('index.spec.ts');
      expect(patterns).toContain('__tests__/index.ts');
      expect(patterns).toContain('__tests__/index.test.ts');
      expect(patterns).toContain('test/index.ts');
      expect(patterns).toContain('tests/index.ts');
    });

    it('should handle .tsx source files', async () => {
      const patterns = await capturePatterns('src/components/Button.tsx');

      // Base name is Button (extension stripped)
      expect(patterns).toContain('src/components/Button.test.tsx');
      expect(patterns).toContain('src/components/Button.spec.tsx');
      expect(patterns).toContain('src/components/Button.test.ts');
      expect(patterns).toContain('src/components/__tests__/Button.tsx');
    });

    it('should handle .js source files', async () => {
      const patterns = await capturePatterns('src/utils/helpers.js');

      expect(patterns).toContain('src/utils/helpers.test.js');
      expect(patterns).toContain('src/utils/helpers.spec.js');
      expect(patterns).toContain('src/utils/helpers.test.ts');
    });

    it('should normalize backslash paths to forward slashes', async () => {
      const patterns = await capturePatterns('src\\utils\\parser.ts');

      // After normalization, should produce forward-slash paths
      expect(patterns).toContain('src/utils/parser.test.ts');
      expect(patterns).toContain('src/utils/__tests__/parser.ts');
    });

    it('should not produce duplicate candidate paths', async () => {
      const patterns = await capturePatterns('src/utils/parser.ts');
      const unique = new Set(patterns);
      expect(unique.size).toBe(patterns.length);
    });
  });

  // ── fast-glob integration ───────────────────────────────────────────────

  describe('fast-glob integration', () => {
    it('should call fast-glob with candidate patterns and cwd', async () => {
      mockedFg.mockResolvedValue([]);
      await mapTestFiles('/my/repo', 'src/utils/parser.ts');

      expect(mockedFg).toHaveBeenCalledTimes(1);
      const [patterns, options] = mockedFg.mock.calls[0];
      expect(Array.isArray(patterns)).toBe(true);
      expect((patterns as string[]).length).toBeGreaterThan(0);
      expect(options).toEqual({
        cwd: '/my/repo',
        dot: false,
        onlyFiles: true,
      });
    });

    it('should return matching test files found by fast-glob', async () => {
      mockedFg.mockResolvedValue([
        'src/utils/parser.test.ts',
        'src/utils/__tests__/parser.ts',
      ] as never);

      const result = await mapTestFiles('/repo', 'src/utils/parser.ts');

      expect(result).toEqual([
        'src/utils/parser.test.ts',
        'src/utils/__tests__/parser.ts',
      ]);
    });

    it('should return empty array when fast-glob finds no matches', async () => {
      mockedFg.mockResolvedValue([] as never);

      const result = await mapTestFiles('/repo', 'src/utils/parser.ts');

      expect(result).toEqual([]);
    });

    it('should return a single match when only one test file exists', async () => {
      mockedFg.mockResolvedValue(['test/utils/parser.test.ts'] as never);

      const result = await mapTestFiles('/repo', 'src/utils/parser.ts');

      expect(result).toEqual(['test/utils/parser.test.ts']);
    });
  });
});
