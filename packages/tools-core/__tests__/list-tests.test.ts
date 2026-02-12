import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fast-glob', () => ({
  default: vi.fn(),
}));

import fg from 'fast-glob';
import { listTestFiles } from '../src/tools/list-tests.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listTestFiles', () => {
  it('finds test files for a given source file', async () => {
    vi.mocked(fg).mockResolvedValue(['src/utils/__tests__/parser.test.ts']);

    const result = await listTestFiles({
      repoPath: '/repo',
      sourceFile: 'src/utils/parser.ts',
    });

    expect(result.testFiles).toContain('src/utils/__tests__/parser.test.ts');
  });

  it('returns empty array when no test files found', async () => {
    vi.mocked(fg).mockResolvedValue([]);

    const result = await listTestFiles({
      repoPath: '/repo',
      sourceFile: 'src/utils/obscure.ts',
    });

    expect(result.testFiles).toHaveLength(0);
  });

  it('generates candidates for sibling, __tests__, test, and tests directories', async () => {
    vi.mocked(fg).mockResolvedValue([]);

    await listTestFiles({
      repoPath: '/repo',
      sourceFile: 'src/utils/parser.ts',
    });

    // Verify that fg was called with candidate patterns
    const candidates = vi.mocked(fg).mock.calls[0][0] as string[];
    expect(candidates).toContain('src/utils/parser.test.ts');
    expect(candidates).toContain('src/utils/parser.spec.ts');
    expect(candidates).toContain('src/utils/__tests__/parser.ts');
    expect(candidates).toContain('src/utils/__tests__/parser.test.ts');
  });

  it('generates candidates for __tests__ at package root (sibling to src/)', async () => {
    vi.mocked(fg).mockResolvedValue([]);

    await listTestFiles({
      repoPath: '/repo',
      sourceFile: 'packages/action/src/client.ts',
    });

    const candidates = vi.mocked(fg).mock.calls[0][0] as string[];
    // Should check __tests__ at package root, not just inside src/
    expect(candidates).toContain('packages/action/__tests__/client.test.ts');
    expect(candidates).toContain('packages/action/__tests__/client.ts');
    // Should also check inside src/
    expect(candidates).toContain('packages/action/src/__tests__/client.test.ts');
  });

  it('defaults repoPath to cwd when not provided', async () => {
    vi.mocked(fg).mockResolvedValue([]);

    await listTestFiles({ sourceFile: 'src/foo.ts' });

    expect(vi.mocked(fg).mock.calls[0][1]).toEqual(
      expect.objectContaining({ cwd: process.cwd() }),
    );
  });
});
